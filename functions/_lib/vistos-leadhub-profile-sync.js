import {
  getVistosById,
  getVistosPage,
  loginVistosExecute
} from "./vistos-execute-client.js";
import {
  buildLeadHubDataOnlySelection,
  dnsMailRouteStatus,
  isSyntacticallyValidEmail,
  normalizeContactEmail
} from "./vistos-contacts-audit.js";

const AUDIT_PREFIX = "protected-audits/vistos-contact-cleanup-v4";
const AUDIT_LATEST_KEY = `${AUDIT_PREFIX}/latest.json`;
const SYNC_PREFIX = "protected-sync/vistos-leadhub-profiles";
const SYNC_STATE_KEY = `${SYNC_PREFIX}/state.json`;
const SYNC_SNAPSHOT_KEY = `${SYNC_PREFIX}/contact-snapshot.json`;
const SYNC_DNS_KEY = `${SYNC_PREFIX}/dns-state.json`;
const WRITER_LOCK_KEY = `${SYNC_PREFIX}/writer-lock.json`;
const IMPORT_STATE_KEY = `${SYNC_PREFIX}/import-state.json`;
const LEADHUB_BASE_URL = "https://api.leadhub.co";
const CONTACT_PAGE_SIZE = 1000;
const PROFILE_BATCH_LIMIT = 10;
const IMPORT_BATCH_LIMIT = 3;
const OVERLAP_MS = 10 * 60 * 1000;
const TAG_NAME = "eSMART Vistos DATA_ONLY";

function clean(value) {
  return String(value ?? "").trim();
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function vistosDateTime(value) {
  const date = validDate(value);
  return date ? date.toISOString().replace(/\.\d{3}Z$/, "Z") : "";
}

function bucket(env) {
  if (!env?.R2_ARCHIVE) {
    const error = new Error("Chybí chráněné R2 úložiště pro Vistos → LeadHub sync.");
    error.status = 503;
    error.code = "vistos_leadhub_storage_missing";
    throw error;
  }
  return env.R2_ARCHIVE;
}

async function getJson(storage, key) {
  const object = await storage.get(key);
  if (!object) return null;
  if (typeof object.json === "function") return object.json();
  return JSON.parse(await object.text());
}

async function putJson(storage, key, value) {
  await storage.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { protected: "true", integration: "vistos-leadhub-profiles" }
  });
}

function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function syncError(code, message, status = 409) {
  const error = new Error(message); error.code = code; error.status = status; return error;
}

function contactReadColumns(snapshot) {
  const available = new Set((snapshot.schemaMetadata || []).map(field => field.field));
  const required = ["Id", "Modified", "Email1", "FirstName", "LastName", "DoNotWorkCompany", "Parent_FK"];
  if (required.some(field => !available.has(field))) throw syncError("contact_columns_unverified", "Chybí potvrzené Contact sloupce pro integraci.");
  // FK decorators and lowercase client-side id are response fields, not schema columns.
  return [...new Set([...required, ...Object.keys(snapshot.rows?.[0] || {}).filter(field => available.has(field))])];
}

function importSummary(state) {
  return { mode: "prepare-import", status: state.status, phase: state.phase, importId: state.id,
    sourceRows: state.sourceRows || 0, pagesRead: state.nextPage || 0, expectedRows: state.expectedRows,
    counts: state.counts || null, manifestKey: state.manifestKey || null,
    checkpointChanged: false, profileWrites: 0, readyForImport: false, sendAllowed: false };
}

export function verifyCompleteContactCapture(pages, expectedRows) {
  if (!Number.isInteger(expectedRows) || expectedRows < 0 || !Array.isArray(pages)) throw syncError("contact_capture_incomplete", "Chybí přesný počet Contact řádků.");
  const rows = pages.flat();
  const ids = rows.map(row => clean(row?.Id));
  if (rows.length !== expectedRows || ids.some(id => !id) || new Set(ids).size !== expectedRows) {
    throw syncError("contact_capture_incomplete", "Stránkování Contact neprokázalo úplnou množinu jednoznačných ID.");
  }
  return rows;
}

// Preparation never calls a profile/tag/subscription write endpoint and never
// advances the production delta checkpoint. All pages and manifests are private.
export async function prepareVistosLeadHubHistoricalImport(env) {
  return withVistosLeadHubWriter(env, async () => {
    const storage = bucket(env);
    let state = await getJson(storage, IMPORT_STATE_KEY);
    if (state?.phase === "MANIFEST_READY") return importSummary(state);
    if (!state) {
      const baseline = await getJson(storage, SYNC_SNAPSHOT_KEY);
      if (!baseline?.rows?.length || !Array.isArray(baseline.schemaMetadata)) throw syncError("historical_baseline_missing", "Chybí potvrzený zdrojový model.");
      const id = crypto.randomUUID();
      state = { id, prefix: `${SYNC_PREFIX}/imports/${id}`, status: "PREPARING", phase: "CAPTURE",
        startedAt: new Date().toISOString(), captureStartedAt: new Date().toISOString(), nextPage: 0,
        sourceRows: 0, expectedRows: null, columns: contactReadColumns(baseline), readyForImport: false, sendAllowed: false };
      await putJson(storage, `${state.prefix}/schema.json`, baseline.schemaMetadata);
      await putJson(storage, IMPORT_STATE_KEY, state);
    }
    if (state.phase === "CAPTURE") {
      const session = await loginVistosExecute(env);
      for (let count = 0; count < 5; count += 1) {
        const page = await getVistosPage(env, session, "Contact", state.columns, {}, state.nextPage * CONTACT_PAGE_SIZE, CONTACT_PAGE_SIZE);
        if (!Number.isInteger(page.total) || page.total <= 0) throw syncError("contact_total_unverified", "Vistos nepotvrdil celkový počet Contact.");
        if (state.expectedRows === null) state.expectedRows = page.total;
        if (page.total !== state.expectedRows) throw syncError("contact_capture_source_changed", "Celkový počet Contact se během snímku změnil; snímek nebude použit.");
        const expectedLength = Math.min(CONTACT_PAGE_SIZE, state.expectedRows - state.nextPage * CONTACT_PAGE_SIZE);
        if (page.rows.length !== expectedLength) throw syncError("contact_capture_page_incomplete", "Vistos vrátil neúplnou stránku Contact.");
        await putJson(storage, `${state.prefix}/pages/${state.nextPage}.json`, page.rows);
        state.nextPage += 1; state.sourceRows += page.rows.length;
        if (state.sourceRows === state.expectedRows) {
          state.captureFinishedAt = new Date().toISOString(); state.phase = "ASSEMBLE"; break;
        }
      }
      await putJson(storage, IMPORT_STATE_KEY, state);
      return importSummary(state);
    }
    if (state.phase === "ASSEMBLE") {
      const pages = [];
      for (let page = 0; page < state.nextPage; page += 1) {
        const rows = await getJson(storage, `${state.prefix}/pages/${page}.json`);
        if (!Array.isArray(rows)) throw syncError("contact_capture_page_missing", "Chybí chráněná stránka Contact.");
        pages.push(rows);
      }
      let rows = verifyCompleteContactCapture(pages, state.expectedRows);
      const catchup = await loadContactDelta(env, state.captureStartedAt, new Date().toISOString(), state.columns);
      const byId = new Map(rows.map(row => [clean(row.Id), row]));
      for (const row of catchup.rows) {
        if (!clean(row.Id)) throw syncError("contact_delta_identity_missing", "Změnový Contact řádek nemá ID.");
        byId.set(clean(row.Id), row);
      }
      rows = [...byId.values()];
      state.captureChangesRead = catchup.rows.length;
      state.captureChangesThrough = catchup.periodTo;
      state.sourceRows = rows.length;
      const schemaMetadata = await getJson(storage, `${state.prefix}/schema.json`);
      const dns = await getJson(storage, SYNC_DNS_KEY);
      if (!dns?.results) throw syncError("historical_dns_missing", "Chybí dokončená DNS mapa.");
      state.missingDomains = [...new Set(rows.map(row => normalizeContactEmail(row.Email1))
        .filter(isSyntacticallyValidEmail).map(email => email.split("@")[1]))].filter(domain => !dns.results[domain]);
      await putJson(storage, `${state.prefix}/snapshot.json`, { rows, schemaMetadata,
        captureStartedAt: state.captureStartedAt, captureFinishedAt: state.captureFinishedAt,
        sourceTotal: state.expectedRows, reconciledSourceRows: rows.length,
        changesThrough: state.captureChangesThrough, runId: state.id });
      await putJson(storage, `${state.prefix}/dns.json`, dns);
      state.phase = "DNS_NEW_DOMAINS";
      await putJson(storage, IMPORT_STATE_KEY, state);
      return importSummary(state);
    }
    if (state.phase === "DNS_NEW_DOMAINS") {
      const dns = await getJson(storage, `${state.prefix}/dns.json`);
      for (const domain of state.missingDomains.slice(0, 20)) {
        const result = await dnsMailRouteStatus(domain);
        dns.results[domain] = { status: result.status, checkedAt: new Date().toISOString() };
      }
      state.missingDomains = state.missingDomains.slice(20);
      dns.domains = Object.keys(dns.results).sort(); dns.nextDomainStart = dns.domains.length;
      await putJson(storage, `${state.prefix}/dns.json`, dns);
      if (!state.missingDomains.length) state.phase = "SELECTION";
      await putJson(storage, IMPORT_STATE_KEY, state);
      return importSummary(state);
    }
    if (state.phase === "SELECTION") {
      const snapshot = await getJson(storage, `${state.prefix}/snapshot.json`);
      const dns = await getJson(storage, `${state.prefix}/dns.json`);
      const selection = buildLeadHubDataOnlySelection(snapshot.rows, snapshot.schemaMetadata, { domainStatuses: dns.results });
      if (selection.status !== "COMPLETE") throw syncError("historical_selection_incomplete", "Nový výběr není úplný.");
      await putJson(storage, `${state.prefix}/selection.json`, selection);
      state.eligibleEmails = selection.dataOnlyUniqueEmails;
      await assertLeadHubWorkspace(env);
      // READ export job only; its query has no segment/audience restriction.
      const job = await leadHubRequest(env, "/segments/query/profiles", { method: "POST", body: { segments: [{ targetingBlocks: [] }] } });
      if (job.status !== 202 || !clean(job.payload?.job_id)) throw syncError("leadhub_export_not_accepted", "LeadHub nepotvrdil exportní úlohu.");
      state.exportJobId = job.payload.job_id; state.phase = "EXPORT_WAIT";
      await putJson(storage, IMPORT_STATE_KEY, state);
      return importSummary(state);
    }
    if (state.phase === "EXPORT_WAIT") {
      const job = await leadHubRequest(env, `/jobs/${encodeURIComponent(state.exportJobId)}`);
      if (job.payload?.job_id !== state.exportJobId || job.payload?.errors?.length) throw syncError("leadhub_export_failed", "Export profilů selhal nebo neodpovídá úloze.");
      if (!["waiting", "processing", "done"].includes(job.payload?.state)) throw syncError("leadhub_export_failed", "Export profilů nemá platný pokračovací stav.");
      if (job.payload?.state !== "done") return importSummary(state);
      await assertLeadHubWorkspace(env);
      const config = leadHubConfig(env);
      const response = await fetch(`${config.baseUrl}/jobs/${encodeURIComponent(state.exportJobId)}/result`, { headers: { Authorization: config.token } });
      if (!response.ok) throw syncError("leadhub_export_download_failed", "Výsledek exportu nelze stáhnout.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 31 || bytes[1] !== 139) throw syncError("leadhub_export_format_unverified", "Export nemá potvrzený JSONL Gzip formát.");
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      let profiles;
      try { profiles = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
      catch { throw syncError("leadhub_export_parse_failed", "Export obsahuje nevalidní JSONL."); }
      const selection = await getJson(storage, `${state.prefix}/selection.json`);
      const manifest = buildLeadHubImportManifest(selection.dataOnly, profiles, {
        workspaceId: "8d8bf07372ad4244877308cbd94c8e78", sourceRunId: state.id,
        sourceCount: selection.dataOnly.length, exportCount: profiles.length, exportState: "done",
        exportJobId: state.exportJobId, allProfiles: true, snapshotCaptureStartedAt: state.captureStartedAt,
        snapshotCaptureFinishedAt: state.captureFinishedAt, exportCreatedAt: job.payload.created_date
      });
      if (manifest.status !== "PLANNED") throw syncError("historical_manifest_blocked", "Manifest neprošel kontrolou úplnosti a identit.");
      await putJson(storage, `${state.prefix}/leadhub-export.json`, profiles);
      state.manifestKey = `${state.prefix}/manifest.json`;
      await putJson(storage, state.manifestKey, manifest);
      state.exportProfiles = profiles.length; state.counts = manifest.counts; state.phase = "MANIFEST_READY";
      state.status = "PREPARED_NOT_IMPORTED"; state.preparedAt = new Date().toISOString();
      await putJson(storage, IMPORT_STATE_KEY, state);
      return importSummary(state);
    }
    throw syncError("historical_stage_unknown", "Neznámá fáze přípravy importu.");
  });
}

function modifiedDate(row) {
  return validDate(row?.Modified || row?.modified || row?.Updated || row?.updated);
}

function assertModifiedWindow(rows, from, to) {
  const lower = validDate(from);
  const upper = validDate(to);
  const invalid = rows.filter((row) => {
    const modified = modifiedDate(row);
    return !modified || modified < lower || modified > new Date(upper.getTime() + 60 * 1000);
  });
  if (invalid.length) {
    const error = new Error("Vistos nepotvrdil Modified filtr pro Contact; checkpoint nebyl posunut.");
    error.status = 502;
    error.code = "vistos_contact_modified_filter_unreliable";
    throw error;
  }
}

async function loadContactDelta(env, checkpoint, periodTo, columns) {
  const session = await loginVistosExecute(env);
  const from = new Date(validDate(checkpoint).getTime() - OVERLAP_MS);
  const to = validDate(periodTo) || new Date();
  const filter = { Modified_From: vistosDateTime(from), Modified_To: vistosDateTime(to) };
  const first = await getVistosPage(env, session, "Contact", columns, filter, 0, CONTACT_PAGE_SIZE);
  const expected = first.filtered;
  if (!Number.isInteger(expected) || expected < 0) throw syncError("vistos_delta_total_unverified", "Vistos nepotvrdil počet změnových řádků.");
  const pages = Math.max(1, Math.ceil(expected / CONTACT_PAGE_SIZE));
  const rows = [...first.rows];
  for (let page = 1; page < pages; page += 1) {
    const result = await getVistosPage(env, session, "Contact", columns, filter, page * CONTACT_PAGE_SIZE, CONTACT_PAGE_SIZE);
    rows.push(...result.rows);
  }
  assertModifiedWindow(rows, from, to);
  if (rows.length !== expected || rows.some(row => !clean(row.Id)) || new Set(rows.map(row => clean(row.Id))).size !== rows.length) {
    throw syncError("vistos_delta_incomplete", "Změnové stránky neprokázaly úplnost jednoznačných Contact ID.");
  }
  return { rows, pages, filter, periodFrom: from.toISOString(), periodTo: to.toISOString() };
}

function leadHubConfig(env) {
  const token = clean(env?.LEADHUB_API_TOKEN);
  if (!token) {
    const error = new Error("Chybí secret LEADHUB_API_TOKEN.");
    error.status = 503;
    error.code = "leadhub_api_token_missing";
    throw error;
  }
  return { token, baseUrl: clean(env?.LEADHUB_API_BASE_URL) || LEADHUB_BASE_URL };
}

async function leadHubRequest(env, path, options = {}) {
  const config = leadHubConfig(env);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: config.token,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !(options.allow404 && response.status === 404)) {
    const error = new Error(`LeadHub API request selhal (${response.status}).`);
    error.status = 502;
    error.code = "leadhub_api_request_failed";
    error.upstreamStatus = response.status;
    throw error;
  }
  return { status: response.status, payload };
}

async function assertLeadHubWorkspace(env) {
  const read = await leadHubRequest(env, "/segments");
  if (!Array.isArray(read.payload) || !read.payload.some(segment => segment.id === "b17444f7663241a0adb31b9a47dcf1a0")) {
    throw syncError("leadhub_workspace_unverified", "Klíč nepotvrdil známé publikum workspace kaiserservis.cz.");
  }
  return { httpStatus: read.status, workspaceAnchorFound: true };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readbackProfile(env, email, predicate) {
  const path = `/profiles/email-address/${encodeURIComponent(email)}`;
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await leadHubRequest(env, path, { allow404: true });
    if (last.status === 200 && predicate(last.payload)) return last.payload;
    if (attempt < 3) await delay(500 * (attempt + 1));
  }
  return null;
}

function profileUserId(contactId) {
  const id = clean(contactId);
  if (!id || `vistos-contact-${id}`.length > 50) {
    const error = new Error("Identifikátor kontaktu nelze bezpečně použít v LeadHubu.");
    error.code = "leadhub_invalid_source_identity";
    error.status = 409;
    throw error;
  }
  return `vistos-contact-${id}`;
}

async function acceptedProfileWrite(env, path, options, safety, record, stage) {
  const accepted = await leadHubRequest(env, path, options);
  // Public OpenAPI promises 202 but no job_id for these write endpoints.
  // Acceptance is journalled, never confused with the subsequent GET readback.
  if (accepted.status !== 202) throw syncError("leadhub_write_acceptance_unverified", "LeadHub nepotvrdil přijetí zápisu.");
  await record(safety, { stage, httpStatus: accepted.status });
}

// Uses the deployed secrets and READ operations only. A missing profile is not
// treated as proof of an empty subscription/suppression state.
export async function verifyVistosLeadHubReadAccess(env) {
  const result = { mode: "read-preflight", checkedAt: new Date().toISOString(), checks: {}, writes: 0, messagesSent: 0 };
  const check = async (name, operation) => {
    const start = Date.now();
    try { result.checks[name] = { status: "PASS", ...await operation() }; }
    catch (error) {
      result.checks[name] = { status: "FAIL", code: clean(error?.code) || "read_preflight_failed", upstreamStatus: Number(error?.upstreamStatus) || 0 };
    }
    result.checks[name].durationMs = Date.now() - start;
  };
  await check("checkpoint", async () => {
    const state = await getJson(bucket(env), SYNC_STATE_KEY);
    if (!state?.checkpoint) throw new Error("missing checkpoint");
    return { checkpoint: state.checkpoint, pending: state.pending?.length || 0, trackedProfiles: Object.keys(state.profiles || {}).length };
  });
  await check("vistosConfiguration", async () => {
    // Compare configuration without exposing any secret-store value.
    const configured = new URL(clean(env.VISTOS_API_BASE_URL));
    const matches = configured.origin.toLowerCase() === "https://kaiserservis.myvistos.com"
      && ["", "/", "/api/vistosapi"].includes(configured.pathname.toLowerCase().replace(/\/$/, ""));
    return { status: matches ? "PASS" : "FAIL", documentedEndpointMatches: matches };
  });
  await check("vistosOriginReachable", async () => {
    try {
      const response = await fetch("https://KaiserServis.myvistos.com/", { method: "HEAD", signal: AbortSignal.timeout(10000), redirect: "manual" });
      return { status: response.ok ? "PASS" : "FAIL", httpStatus: response.status };
    } catch (error) {
      return { status: "FAIL", code: "vistos_origin_unavailable", timeout: ["TimeoutError", "AbortError"].includes(error?.name) };
    }
  });
  let session;
  if (result.checks.vistosConfiguration.status === "PASS") await check("vistosLogin", async () => {
    session = await loginVistosExecute(env);
    return {};
  });
  if (session) await check("vistosContactRead", async () => {
    const page = await getVistosPage(env, session, "Contact", ["Id", "Modified"], {}, 0, 1);
    return { rows: page.rows.length, total: page.total };
  });
  await check("leadHubSegmentsRead", async () => {
    const read = await leadHubRequest(env, "/segments");
    const workspaceAnchorFound = Array.isArray(read.payload)
      && read.payload.some(segment => segment.id === "b17444f7663241a0adb31b9a47dcf1a0");
    return { status: workspaceAnchorFound ? "PASS" : "FAIL", httpStatus: read.status, workspaceAnchorFound };
  });
  await check("leadHubJobsRead", async () => {
    const read = await leadHubRequest(env, "/jobs");
    return { httpStatus: read.status };
  });
  await check("leadHubCampaignSafety", async () => await readCampaignSafety(env));
  // Reserved non-routable address; no profile, subscription or message is created.
  const absentEmail = `read-preflight-${crypto.randomUUID()}@example.invalid`;
  await check("leadHubAbsentProfileRead", async () => {
    const read = await leadHubRequest(env, `/profiles/email-address/${encodeURIComponent(absentEmail)}`, { allow404: true });
    return { httpStatus: read.status };
  });
  await check("leadHubAbsentSafetyRead", async () => {
    const encoded = encodeURIComponent(absentEmail);
    const subscriptions = await leadHubRequest(env, `/subscriptions/email-address/${encoded}`, { allow404: true });
    const suppression = await leadHubRequest(env, `/subscriptions/email-address/${encoded}/suppressed`, { allow404: true });
    const statuses = { subscriptionsHttpStatus: subscriptions.status, suppressionHttpStatus: suppression.status };
    try { parseSubscriptionSafety(subscriptions, suppression); return statuses; }
    catch (error) { return { ...statuses, status: "FAIL", code: error.code }; }
  });
  result.status = Object.values(result.checks).every(check => check.status === "PASS") ? "READ_ACCESS_VERIFIED" : "BLOCKED";
  result.readyForImport = false;
  result.sendAllowed = false;
  return result;
}

// A plan over completed protected exports, never an authorization to write.
// The executor must revalidate identities, source versions, automation triggers
// and subscription/suppression state under the shared writer before each write.
export function buildLeadHubImportManifest(items, profiles, evidence = {}) {
  const blocked = (reason) => ({ status: "BLOCKED", reason, items: [], readyForImport: false, sendAllowed: false });
  if (!Array.isArray(items) || !Array.isArray(profiles)
    || evidence.workspaceId !== "8d8bf07372ad4244877308cbd94c8e78"
    || !clean(evidence.sourceRunId) || evidence.sourceCount !== items.length
    || evidence.exportState !== "done" || !clean(evidence.exportJobId)
    || evidence.exportCount !== profiles.length || evidence.allProfiles !== true) {
    return blocked("INCOMPLETE_SOURCE_OR_PROFILE_EXPORT");
  }
  // Null credentials are legitimate anonymous visitors; malformed credentials
  // must not silently disappear from the collision index.
  if (profiles.some((p) => !p || typeof p !== "object" || Array.isArray(p)
    || !("credentials" in p)
    || (p.credentials !== null && (typeof p.credentials !== "object" || Array.isArray(p.credentials)
      || ["user_id", "email_address"].some((key) => !(key in p.credentials)
        || (p.credentials[key] !== null && typeof p.credentials[key] !== "string")))))) {
    return blocked("MALFORMED_PROFILE_EXPORT");
  }
  const index = (rows, keyOf) => {
    const result = new Map();
    rows.forEach((row, position) => {
      const key = keyOf(row);
      if (key) result.set(key, [...(result.get(key) || []), position]);
    });
    return result;
  };
  const sourceIds = index(items, (p) => clean(p?.contactId));
  const sourceEmails = index(items, (p) => normalizeContactEmail(p?.normalizedEmail));
  const targetIds = index(profiles, (p) => clean(p.credentials?.user_id));
  const targetEmails = index(profiles, (p) => normalizeContactEmail(p.credentials?.email_address));
  const manifest = items.map((item) => {
    const contactId = clean(item?.contactId);
    const normalizedEmail = normalizeContactEmail(item?.normalizedEmail);
    const userId = `vistos-contact-${contactId}`;
    const entry = { contactId, normalizedEmail, userId, action: "SKIP", reason: "", requiresPreflight: true };
    const skip = (reason) => ({ ...entry, reason });
    if (!contactId || !isSyntacticallyValidEmail(normalizedEmail) || userId.length > 50) return skip("INVALID_SOURCE_IDENTITY");
    if ((sourceIds.get(contactId) || []).length !== 1) return skip("DUPLICATE_SOURCE_CONTACT_ID");
    if ((sourceEmails.get(normalizedEmail) || []).length !== 1) return skip("DUPLICATE_SOURCE_EMAIL");
    const byEmail = targetEmails.get(normalizedEmail) || [];
    const byId = targetIds.get(userId) || [];
    if (byEmail.length > 1 || byId.length > 1) return skip("DUPLICATE_TARGET_IDENTITY");
    if (!byEmail.length && !byId.length) return { ...entry, action: "CREATE", reason: "NO_MATCH_IN_COMPLETE_EXPORT" };
    if (!byEmail.length) return skip("EMAIL_CHANGE_REQUIRES_IDENTITY_RESOLUTION");
    if (!byId.length) return skip("EMAIL_MATCH_WITHOUT_OWNED_USER_ID");
    if (byEmail[0] !== byId[0]) return skip("EMAIL_AND_USER_ID_MATCH_DIFFERENT_PROFILES");
    const profile = profiles[byId[0]];
    const credentials = profile.credentials;
    if (credentials.user_id !== userId) return skip("NON_CANONICAL_TARGET_USER_ID");
    if (!Array.isArray(profile.tags)) return skip("TARGET_TAGS_UNKNOWN");
    const ownedTags = profile.tags.filter((tag) => tag?.name === TAG_NAME);
    if (ownedTags.length > 1) return skip("DUPLICATE_INTEGRATION_TAG");
    const tag = ownedTags[0];
    if (tag && clean(tag.data?.vistos_contact_id) !== contactId) return skip("INTEGRATION_TAG_IDENTITY_CONFLICT");
    // Missing source names do not authorize clearing an existing target name.
    const firstName = clean(item.firstName), lastName = clean(item.lastName);
    const namesEqual = (!firstName || firstName === clean(credentials.first_name))
      && (!lastName || lastName === clean(credentials.last_name));
    const tagEqual = tag?.data?.source === "Vistos Contact"
      && tag.data.data_only === 1 && tag.data.targeting_enabled === 1
      && tag.data.newsletter_permission === "UNKNOWN"
      && tag.data.communication_status === (clean(item.communicationStatus) || "UNKNOWN");
    return { ...entry, action: namesEqual && tagEqual ? "NO_CHANGE" : "UPDATE", reason: "EMAIL_AND_OWNED_USER_ID_MATCH" };
  });
  const counts = { CREATE: 0, UPDATE: 0, NO_CHANGE: 0, SKIP: 0 };
  manifest.forEach((item) => { counts[item.action] += 1; });
  return { status: "PLANNED", evidence: { ...evidence }, counts, items: manifest, readyForImport: false, sendAllowed: false };
}

function tagPayload(item, active, reason, checked) {
  return {
    profile_identification: { user_id: profileUserId(item.contactId) },
    tag: {
      name: TAG_NAME,
      data: {
        source: "Vistos Contact",
        vistos_contact_id: clean(item.contactId),
        data_only: active ? 1 : 0,
        targeting_enabled: active ? 1 : 0,
        communication_status: clean(item.communicationStatus) || "UNKNOWN",
        newsletter_permission: "UNKNOWN",
        suppression_checked: checked.suppressed ? 1 : 0,
        exclusion_reason: clean(reason) || "NONE"
      }
    }
  };
}

async function subscriptionRead(env, email) {
  const encoded = encodeURIComponent(email);
  const [subscriptions, suppressed] = await Promise.all([
    leadHubRequest(env, `/subscriptions/email-address/${encoded}`, { allow404: true }),
    leadHubRequest(env, `/subscriptions/email-address/${encoded}/suppressed`, { allow404: true })
  ]);
  return parseSubscriptionSafety(subscriptions, suppressed);
}

function parseSubscriptionSafety(subscriptions, suppressed) {
  const states = subscriptions.payload?.subscriptions;
  if (subscriptions.status !== 200 || suppressed.status !== 200
    || !Array.isArray(states) || typeof suppressed.payload?.is_suppressed !== "boolean"
    || states.some((row) => !clean(row?.code) || !["subscribed", "unsubscribed"].includes(row?.state))
    || new Set(states.map(row => clean(row.code))).size !== states.length) {
    const error = new Error("LeadHub nepotvrdil úplný stav odběrů a blokací; zápis není bezpečný.");
    error.status = 502;
    error.code = "leadhub_safety_read_unverified";
    throw error;
  }
  return {
    subscriptions: states.map((row) => ({ code: clean(row.code), state: row.state })).sort((a, b) => a.code.localeCompare(b.code)),
    suppressed: suppressed.payload?.is_suppressed === true
  };
}

function assertSafetyUnchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const error = new Error("Po zápisu se změnily odběry nebo blokace. Další zápisy jsou zastavené.");
    error.status = 409;
    error.code = "leadhub_subscription_or_suppression_changed";
    throw error;
  }
}

async function readCampaignSafety(env) {
  const inertStates = new Set(["draft", "archived", "paused", "sent", "finished", "canceled", "terminated", "deleted"]);
  const types = new Set(["targeted-emailing", "targeted-emailing-ab", "incremental-emailing", "targeted-sms", "incremental-sms", "popup"]);
  let rows = 0;
  for (let page = 0; page < 20; page += 1) {
    if (page) await delay(1100); // Official campaign read limit: 1 request/second.
    const read = await leadHubRequest(env, `/campaigns?page=${page}`);
    if (!Array.isArray(read.payload)) {
      const error = new Error("Neověřený formát seznamu kampaní; zápis zastaven.");
      error.code = "leadhub_campaign_safety_unverified"; error.status = 409; throw error;
    }
    for (const campaign of read.payload) {
      if (!types.has(campaign.campaign_type) || (campaign.campaign_type !== "popup" && !inertStates.has(campaign.state))) {
        const error = new Error("Aktivní, naplánovaná nebo neověřená zprávová kampaň blokuje zápis profilů.");
        error.code = "leadhub_message_campaign_blocks_write"; error.status = 409; throw error;
      }
    }
    rows += read.payload.length;
    if (read.payload.length < 20) return { rows, pages: page + 1, activeMessageCampaigns: 0 };
  }
  const error = new Error("Seznam kampaní není úplný; zápis zastaven.");
  error.code = "leadhub_campaign_safety_incomplete"; error.status = 409; throw error;
}

async function upsertActiveProfile(env, item, beforeWrite = async () => {}) {
  const email = item.normalizedEmail;
  const encoded = encodeURIComponent(email);
  const before = await leadHubRequest(env, `/profiles/email-address/${encoded}`, { allow404: true });
  if (before.status === 200 && (before.payload?.credentials?.user_id !== profileUserId(item.contactId)
    || normalizeContactEmail(before.payload?.credentials?.email_address) !== email)) {
    const error = new Error("Profil stejného e-mailu nemá potvrzenou integrační identitu.");
    error.code = "leadhub_profile_identity_conflict";
    error.status = 409;
    throw error;
  }
  const safety = await subscriptionRead(env, email);
  await readCampaignSafety(env);
  if (before.status === 200 && item.manifestAction === "NO_CHANGE") {
    const tags = (before.payload.tags || []).filter(tag => tag?.name === TAG_NAME);
    const expected = tagPayload(item, true, "", safety).tag.data;
    if ((!item.firstName || before.payload.credentials.first_name === item.firstName)
      && (!item.lastName || before.payload.credentials.last_name === item.lastName)
      && tags.length === 1 && Object.entries(expected).every(([key, value]) => tags[0].data?.[key] === value)) {
      return { action: "no_change", ...safety, readback: true };
    }
  }
  await beforeWrite(safety);
  await acceptedProfileWrite(env, "/profiles", {
    method: "PUT",
    body: {
      user_id: profileUserId(item.contactId),
      email_address: email,
      ...(item.firstName ? { first_name: item.firstName } : {}),
      ...(item.lastName ? { last_name: item.lastName } : {})
    }
  }, safety, beforeWrite, "PROFILE_ACCEPTED");
  const profileReadback = await readbackProfile(env, email, payload =>
    payload?.credentials?.user_id === profileUserId(item.contactId)
    && normalizeContactEmail(payload?.credentials?.email_address) === email
    && (!item.firstName || payload.credentials.first_name === item.firstName)
    && (!item.lastName || payload.credentials.last_name === item.lastName));
  if (!profileReadback) {
    const error = new Error("Identita nebo atributy profilu nebyly po zápisu potvrzené.");
    error.code = "leadhub_profile_identity_readback_failed";
    error.status = 502;
    throw error;
  }
  assertSafetyUnchanged(safety, await subscriptionRead(env, email));
  await acceptedProfileWrite(env, "/profiles/tags", {
    method: "POST",
    body: tagPayload(item, true, "", safety)
  }, safety, beforeWrite, "TAG_ACCEPTED");
  const readback = await readbackProfile(env, email, (payload) => {
    const tags = Array.isArray(payload?.tags) ? payload.tags : [];
    const tag = tags.find((row) => clean(row?.name) === TAG_NAME);
    return payload?.credentials?.user_id === profileUserId(item.contactId)
      && clean(payload?.credentials?.email_address).toLowerCase() === email
      && clean(tag?.data?.vistos_contact_id) === clean(item.contactId)
      && Number(tag?.data?.targeting_enabled) === 1;
  });
  if (!readback) {
    const error = new Error("LeadHub profil nebyl po zápisu potvrzen zpětným čtením.");
    error.status = 502;
    error.code = "leadhub_profile_readback_failed";
    throw error;
  }
  assertSafetyUnchanged(safety, await subscriptionRead(env, email));
  return {
    action: before.status === 404 ? "created" : "updated",
    subscriptions: safety.subscriptions,
    suppressed: safety.suppressed,
    readback: true
  };
}

async function deactivateProfile(env, item, reason, beforeWrite = async () => {}) {
  const email = clean(item.normalizedEmail);
  if (!email) {
    const error = new Error("Chybí adresa pro bezpečné ověření vyřazovaného profilu.");
    error.code = "leadhub_deactivation_identity_missing";
    error.status = 409;
    throw error;
  }
  const safety = await subscriptionRead(env, email);
  if (email) {
    const existing = await leadHubRequest(env, `/profiles/email-address/${encodeURIComponent(email)}`, { allow404: true });
    if (existing.status === 404) {
      return { action: "deactivated", subscriptions: safety.subscriptions, suppressed: safety.suppressed, readback: true, profileAlreadyAbsent: true };
    }
    if (existing.payload?.credentials?.user_id !== profileUserId(item.contactId)) {
      const error = new Error("Vyřazení by zasáhlo neověřenou identitu profilu.");
      error.code = "leadhub_deactivation_identity_conflict";
      error.status = 409;
      throw error;
    }
  }
  await readCampaignSafety(env);
  await beforeWrite(safety);
  await acceptedProfileWrite(env, "/profiles/tags", {
    method: "POST",
    body: tagPayload(item, false, reason || "FILTERED_OUT", safety)
  }, safety, beforeWrite, "TAG_ACCEPTED");
  if (email) {
    const readback = await readbackProfile(env, email, (payload) => {
      const tags = Array.isArray(payload?.tags) ? payload.tags : [];
      const tag = tags.find((row) => clean(row?.name) === TAG_NAME);
      return payload?.credentials?.user_id === profileUserId(item.contactId)
        && normalizeContactEmail(payload?.credentials?.email_address) === email
        && clean(tag?.data?.vistos_contact_id) === clean(item.contactId)
        && Number(tag?.data?.targeting_enabled) === 0;
    });
    if (!readback) {
      const error = new Error("Vyřazení LeadHub profilu nebylo potvrzeno zpětným čtením.");
      error.status = 502;
      error.code = "leadhub_profile_deactivation_readback_failed";
      throw error;
    }
  }
  assertSafetyUnchanged(safety, await subscriptionRead(env, email));
  return { action: "deactivated", subscriptions: safety.subscriptions, suppressed: safety.suppressed, readback: true };
}

function exclusionReasons(cleanup, contactId, email) {
  return (cleanup.exclusionsByReason || [])
    .filter((row) => (row.contactRecordIds || []).includes(contactId) || (email && (row.normalizedEmails || []).includes(email)))
    .map((row) => row.reason);
}

async function initializeState(env, scheduledAt) {
  const storage = bucket(env);
  const latest = await getJson(storage, AUDIT_LATEST_KEY);
  if (!latest?.runId) {
    const error = new Error("Chybí dokončený chráněný Contact/DNS snapshot.");
    error.status = 409;
    error.code = "vistos_leadhub_baseline_missing";
    throw error;
  }
  const [preparedSnapshot, preparedDns] = await Promise.all([
    storage.head(SYNC_SNAPSHOT_KEY),
    storage.head(SYNC_DNS_KEY)
  ]);
  if (Boolean(preparedSnapshot) !== Boolean(preparedDns)) {
    const error = new Error("Připravený synchronizační Contact snapshot a DNS mapa nejsou konzistentní.");
    error.status = 409;
    error.code = "vistos_leadhub_prepared_baseline_incomplete";
    throw error;
  }
  const checkpoint = (validDate(scheduledAt) || new Date()).toISOString();
  const state = {
    version: 1,
    status: "ACTIVE",
    initializedAt: checkpoint,
    checkpoint,
    baselineRunId: latest.runId,
    pending: [],
    profiles: {},
    totals: { created: 0, updated: 0, deactivated: 0, subscriptionChanges: 0, messagesSent: 0 },
    apiReadValidation: {
      profilesRead: null,
      subscriptionsRead: null,
      validatedAt: null,
      status: "deferred_until_first_profile_delta"
    },
    lastRun: { status: "checkpoint_initialized", finishedAt: checkpoint, sourceRows: 0, created: 0, updated: 0, deactivated: 0, readbackConfirmed: 0 }
  };
  if (preparedSnapshot && preparedDns) {
    await putJson(storage, SYNC_STATE_KEY, state);
  } else {
    const sourceSnapshot = await getJson(storage, `${AUDIT_PREFIX}/${latest.runId}/contact-snapshot.json`);
    const sourceDns = await getJson(storage, `${AUDIT_PREFIX}/${latest.runId}/dns-state.json`);
    if (!sourceSnapshot || !sourceDns) {
      const error = new Error("Chráněný Contact snapshot nebo DNS mapa nejsou dostupné.");
      error.status = 409;
      error.code = "vistos_leadhub_baseline_incomplete";
      throw error;
    }
    await Promise.all([
      putJson(storage, SYNC_SNAPSHOT_KEY, sourceSnapshot),
      putJson(storage, SYNC_DNS_KEY, sourceDns),
      putJson(storage, SYNC_STATE_KEY, state)
    ]);
  }
  return { ...state.lastRun, syncStatus: "ACTIVE", checkpoint, historicalProfilesImported: 0, apiReadValidation: state.apiReadValidation };
}

// No TTL takeover: a timed-out writer may still have an accepted provider job.
// An unresolved write retains the lock until its journal is reconciled.
export async function withVistosLeadHubWriter(env, operation) {
  const storage = bucket(env);
  const owner = crypto.randomUUID();
  const acquired = await storage.put(WRITER_LOCK_KEY, JSON.stringify({ owner, startedAt: new Date().toISOString() }), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
    customMetadata: { protected: "true", integration: "vistos-leadhub-profiles" }
  });
  if (!acquired) {
    const error = new Error("Integrační zapisovatel je obsazený nebo čeká na ověření předchozí operace.");
    error.status = 409;
    error.code = "vistos_leadhub_writer_locked";
    throw error;
  }
  const context = { owner, sideEffectsStarted: false };
  let completed = false;
  try {
    const result = await operation(context);
    completed = true;
    return result;
  } finally {
    if (completed || !context.sideEffectsStarted) {
      const lock = await getJson(storage, WRITER_LOCK_KEY);
      if (lock?.owner === owner) await storage.delete(WRITER_LOCK_KEY);
    }
  }
}

export async function runVistosLeadHubProfileSync(env, options = {}) {
  return withVistosLeadHubWriter(env, (writer) => runProfileSyncUnlocked(env, options, writer));
}

// The import and delta share the lock, queue, identity ownership and commit.
// This is not a rewind: the new observed capture replaces an obsolete baseline
// only after its complete ID set and the capture-time changes were verified.
export async function executeVistosLeadHubHistoricalImport(env, options = {}) {
  return withVistosLeadHubWriter(env, async writer => {
    const storage = bucket(env);
    const prepared = await getJson(storage, IMPORT_STATE_KEY);
    if (prepared?.phase !== "MANIFEST_READY") throw syncError("historical_manifest_not_ready", "Úplný manifest zatím není připraven.");
    let state = await getJson(storage, SYNC_STATE_KEY);
    if (!state || !validDate(state.checkpoint)) throw syncError("historical_checkpoint_missing", "Chybí platný produkční checkpoint.");
    if (!state.historicalImport) {
      const [manifest, selection, snapshot, dns] = await Promise.all([
        getJson(storage, prepared.manifestKey), getJson(storage, `${prepared.prefix}/selection.json`),
        getJson(storage, `${prepared.prefix}/snapshot.json`), getJson(storage, `${prepared.prefix}/dns.json`)
      ]);
      if (manifest?.status !== "PLANNED" || selection?.status !== "COMPLETE"
        || !validDate(snapshot?.captureStartedAt) || !validDate(snapshot?.changesThrough)
        || new Date(snapshot.changesThrough) < new Date(state.checkpoint)
        || !dns?.results || Object.keys(state.profiles || {}).length || state.pending?.length) {
        throw syncError("historical_adoption_conflict", "Výchozí stav nelze bezpečně převzít; není dovoleno přepsat rozpracované operace.");
      }
      await assertLeadHubWorkspace(env);
      await readCampaignSafety(env);
      const byId = new Map(selection.dataOnly.map(item => [clean(item.contactId), item]));
      const rows = new Map(snapshot.rows.map(row => [clean(row.Id), row]));
      state.pending = manifest.items.filter(item => item.action !== "SKIP").map(entry => {
        const selected = byId.get(entry.contactId), row = rows.get(entry.contactId);
        if (!selected || !row || selected.normalizedEmail !== entry.normalizedEmail) throw syncError("historical_manifest_source_mismatch", "Manifest neodpovídá chráněnému výběru.");
        return { ...selected, desired: "active", sourceModified: clean(row.Modified), rowHash: fingerprint(row),
          historical: true, manifestAction: entry.action, manifestExportId: prepared.exportJobId };
      });
      state.historicalImport = { id: prepared.id, status: "CANARY_PENDING", planned: manifest.counts,
        sourceRows: snapshot.rows.length, eligibleEmails: selection.dataOnly.length,
        checkpointBeforeAdoption: state.checkpoint, captureStartedAt: snapshot.captureStartedAt,
        captureFinishedAt: snapshot.captureFinishedAt, changesThrough: snapshot.changesThrough,
        historicalEventsRecovered: false, created: 0, updated: 0, skipped: 0, readbackConfirmed: 0,
        remaining: state.pending.length, startedAt: new Date().toISOString(), sendAllowed: false };
      state.manifestIdentityChecks = Object.fromEntries(manifest.items.map(item => [item.contactId,
        { action: item.action, email: item.normalizedEmail, reason: item.reason, exportJobId: prepared.exportJobId }]));
      state.checkpoint = snapshot.changesThrough;
      state.snapshotKey = `${prepared.prefix}/snapshot.json`; state.dnsKey = `${prepared.prefix}/dns.json`;
      state.baselineRunId = prepared.id;
      state.status = "IMPORT_CANARY_PENDING";
      await putJson(storage, SYNC_STATE_KEY, state);
      return { mode: "execute-import", status: state.status, historicalImport: state.historicalImport, profileWrites: 0, sendAllowed: false };
    }
    if (state.historicalImport.id !== prepared.id) throw syncError("historical_import_identity_conflict", "Evidence importu patří jinému manifestu.");
    const summary = await runProfileSyncUnlocked(env, { ...options,
      batchLimit: state.historicalImport.readbackConfirmed ? IMPORT_BATCH_LIMIT : 1 }, writer);
    const confirmed = await getJson(storage, SYNC_STATE_KEY);
    return { ...summary, mode: "execute-import", historicalImport: confirmed.historicalImport, sendAllowed: false };
  });
}

function sourceValues(row, columns) {
  return JSON.stringify(columns.map(field => [field, row?.[field] ?? null]));
}

async function commitSourceVersion(storage, state, snapshot, dnsState, owner) {
  const prefix = `${SYNC_PREFIX}/versions/${owner}`;
  // Immutable objects first; one small, strongly consistent R2 pointer last.
  await putJson(storage, `${prefix}/snapshot.json`, snapshot);
  await putJson(storage, `${prefix}/dns.json`, dnsState);
  state.snapshotKey = `${prefix}/snapshot.json`; state.dnsKey = `${prefix}/dns.json`;
  await putJson(storage, SYNC_STATE_KEY, state);
}

async function runProfileSyncUnlocked(env, options, writer) {
  const storage = bucket(env);
  const scheduledAt = (validDate(options.scheduledAt) || new Date()).toISOString();
  let state = await getJson(storage, SYNC_STATE_KEY);
  if (!state) return initializeState(env, scheduledAt);
  if (!validDate(state.checkpoint)) {
    const error = new Error("Neplatný checkpoint synchronizace.");
    error.code = "vistos_leadhub_checkpoint_invalid";
    error.status = 409;
    throw error;
  }
  if (new Date(scheduledAt) <= new Date(state.checkpoint)) {
    return { syncStatus: state.status, status: "stale_schedule_skipped", checkpoint: state.checkpoint, messagesSent: 0 };
  }
  const [snapshot, dnsState] = await Promise.all([
    getJson(storage, state.snapshotKey || SYNC_SNAPSHOT_KEY),
    getJson(storage, state.dnsKey || SYNC_DNS_KEY)
  ]);
  if (!snapshot || !dnsState) {
    const error = new Error("Synchronizační Contact snapshot nebo DNS stav chybí.");
    error.status = 409;
    error.code = "vistos_leadhub_sync_state_incomplete";
    throw error;
  }

  const oldRowsById = new Map(snapshot.rows.map((row) => [clean(row?.Id), row]));
  const delta = await loadContactDelta(env, state.checkpoint, scheduledAt, contactReadColumns(snapshot));
  const changedIds = new Set();
  const impactedEmails = new Set();
  for (const row of delta.rows) {
    const id = clean(row?.Id);
    if (!id) continue;
    const previous = oldRowsById.get(id);
    if (fingerprint(previous || null) === fingerprint(row)) continue;
    const previousEmail = normalizeContactEmail(previous?.Email1);
    const nextEmail = normalizeContactEmail(row?.Email1);
    if (previousEmail) impactedEmails.add(previousEmail);
    if (nextEmail) impactedEmails.add(nextEmail);
    oldRowsById.set(id, row);
    changedIds.add(id);
  }
  snapshot.rows = [...oldRowsById.values()];
  snapshot.updatedAt = scheduledAt;

  const requiredDomains = new Set(dnsState.domains || []);
  for (const row of delta.rows) {
    const email = normalizeContactEmail(row?.Email1);
    const domain = email.includes("@") ? email.split("@")[1] : "";
    if (!domain || requiredDomains.has(domain)) continue;
    const result = await dnsMailRouteStatus(domain);
    dnsState.results[domain] = { status: result.status, checkedAt: scheduledAt };
    requiredDomains.add(domain);
  }
  dnsState.domains = [...requiredDomains].sort();
  dnsState.nextDomainStart = dnsState.domains.length;
  dnsState.updatedAt = scheduledAt;
  const domainStatuses = Object.fromEntries(Object.entries(dnsState.results || {}).map(([domain, value]) => [domain, value]));
  const cleanup = buildLeadHubDataOnlySelection(snapshot.rows, snapshot.schemaMetadata, { domainStatuses });
  const selectedById = new Map((cleanup.dataOnly || []).map((item) => [clean(item.contactId), item]));
  const pendingById = new Map((state.pending || []).map((item) => [clean(item.contactId), item]));

  // Rebuild historical queue entries from the current selection, never from
  // the old manifest's names or eligibility. A new exclusion cancels the item.
  for (const [id, pendingItem] of pendingById) {
    if (!pendingItem.historical) continue;
    const selected = selectedById.get(id), row = oldRowsById.get(id);
    if (!selected || selected.normalizedEmail !== pendingItem.normalizedEmail) {
      pendingById.set(id, { ...pendingItem, desired: "skip", reason: "SOURCE_CHANGED_OR_FILTERED" });
    } else pendingById.set(id, { ...pendingItem, ...selected, rowHash: fingerprint(row), sourceModified: clean(row.Modified) });
  }

  for (const id of changedIds) {
    const row = oldRowsById.get(id);
    const email = normalizeContactEmail(row?.Email1);
    const selected = selectedById.get(id);
    const previousProfile = state.profiles?.[id];
    if (previousProfile?.synced && previousProfile.email !== email) {
      pendingById.set(id, { contactId: id, normalizedEmail: previousProfile.email, desired: "inactive",
        reason: "EMAIL_CHANGED_IDENTITY_NOT_MERGED", sourceModified: clean(row.Modified), rowHash: fingerprint(row) });
      continue;
    }
    if (pendingById.get(id)?.historical) continue;
    if (selected && state.historicalImport && !previousProfile?.synced) {
      const checked = state.manifestIdentityChecks?.[id];
      if (!checked || checked.action === "SKIP" || checked.email !== email) {
        pendingById.set(id, { contactId: id, normalizedEmail: email, desired: "skip",
          reason: checked?.reason || "TARGET_IDENTITY_EXPORT_REQUIRED" });
        continue;
      }
    }
    if (selected) {
      pendingById.set(id, { ...selected, desired: "active", sourceModified: clean(row?.Modified), rowHash: fingerprint(row) });
    } else if (previousProfile?.synced) {
      pendingById.set(id, {
        contactId: id,
        normalizedEmail: previousProfile.email,
        communicationStatus: "UNKNOWN",
        desired: "inactive",
        reason: exclusionReasons(cleanup, id, email).join(",") || "FILTERED_OUT",
        sourceModified: clean(row?.Modified),
        rowHash: fingerprint(row)
      });
    }
  }
  for (const [id, profile] of Object.entries(state.profiles || {})) {
    if (!profile?.synced || !impactedEmails.has(clean(profile.email))) continue;
    if (changedIds.has(id)) continue;
    const selected = selectedById.get(id);
    if (!selected && profile.active) {
      pendingById.set(id, {
        contactId: id,
        normalizedEmail: profile.email,
        communicationStatus: "UNKNOWN",
        desired: "inactive",
        reason: "DUPLICATE_OR_CONFLICT_EMAIL",
        rowHash: profile.rowHash || ""
      });
    }
  }

  const pending = [...pendingById.values()];
  const batchLimit = Math.min(Number(options.batchLimit) || PROFILE_BATCH_LIMIT, PROFILE_BATCH_LIMIT);
  const current = pending.slice(0, batchLimit);
  const remaining = pending.slice(batchLimit);
  const run = { created: 0, updated: 0, deactivated: 0, no_change: 0, skipped: 0, readbackConfirmed: 0, restoredSubscriptions: 0, messagesSent: 0 };
  state.profiles ||= {};
  const sourceSession = current.some(item => item.desired === "active") ? await loginVistosExecute(env) : null;
  const columns = contactReadColumns(snapshot);
  // Persist the reconciled source and queue before any provider write.
  state.pending = pending;
  state.checkpoint = scheduledAt;
  if (delta.rows.length || !state.snapshotKey || !state.dnsKey) await commitSourceVersion(storage, state, snapshot, dnsState, writer.owner);
  else await putJson(storage, SYNC_STATE_KEY, state);
  for (const item of current) {
    const operationKey = `${SYNC_PREFIX}/operations/${writer.owner}/${encodeURIComponent(item.contactId)}.json`;
    if (item.desired === "active") {
      const latest = await getVistosById(env, sourceSession, "Contact", item.contactId, columns);
      if (clean(latest.row?.Id) !== item.contactId) throw syncError("contact_current_identity_unverified", "Aktuální Contact detail nepotvrdil požadované ID.");
      if (sourceValues(latest.row, columns) !== sourceValues(oldRowsById.get(item.contactId), columns)) {
        // Keep the item queued; the next source reconciliation must re-evaluate
        // the entire email group. Never overwrite with an old snapshot.
        throw syncError("contact_changed_before_write", "Kontakt se od posledního čtení změnil; zápis nebyl proveden.");
      }
    }
    if (item.desired === "skip") {
      await putJson(storage, operationKey, { status: "SKIP", contactId: item.contactId, reason: item.reason, finishedAt: new Date().toISOString() });
      state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
      if (item.historical) state.historicalImport.skipped += 1;
      run.skipped += 1;
      await putJson(storage, SYNC_STATE_KEY, state);
      continue;
    }
    await putJson(storage, operationKey, {
      status: "INTENT", contactId: item.contactId, desired: item.desired,
      sourceModified: item.sourceModified || null, rowHash: item.rowHash,
      startedAt: new Date().toISOString(), writer: writer.owner
    });
    const beforeWrite = async (safety, progress = {}) => {
      await putJson(storage, operationKey, {
        status: progress.stage || "WRITE_INTENT", httpStatus: progress.httpStatus || null,
        contactId: item.contactId, normalizedEmail: item.normalizedEmail, desired: item.desired,
        sourceModified: item.sourceModified || null, rowHash: item.rowHash,
        beforeSafety: safety, startedAt: new Date().toISOString(), writer: writer.owner
      });
      writer.sideEffectsStarted = true;
    };
    let result;
    try {
      result = item.desired === "active"
        ? await upsertActiveProfile(env, item, beforeWrite)
        : await deactivateProfile(env, item, item.reason, beforeWrite);
    } catch (error) {
      if (!["leadhub_profile_identity_conflict", "leadhub_deactivation_identity_conflict", "leadhub_invalid_source_identity"].includes(error?.code)) throw error;
      await putJson(storage, operationKey, { status: "SKIP", contactId: item.contactId, reason: error.code, finishedAt: new Date().toISOString() });
      state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
      if (item.historical) state.historicalImport.skipped += 1;
      await putJson(storage, SYNC_STATE_KEY, state);
      run.skipped += 1;
      continue;
    }
    await putJson(storage, operationKey, {
      status: "READBACK_CONFIRMED", contactId: item.contactId, desired: item.desired,
      sourceModified: item.sourceModified || null, rowHash: item.rowHash,
      finishedAt: new Date().toISOString(), writer: writer.owner, action: result.action,
      afterSafety: { subscriptions: result.subscriptions, suppressed: result.suppressed }
    });
    run[result.action] += 1;
    if (result.readback) run.readbackConfirmed += 1;
    state.profiles[item.contactId] = {
      synced: true,
      active: item.desired === "active",
      email: item.normalizedEmail,
      rowHash: item.rowHash,
      sourceModified: item.sourceModified || null,
      subscriptions: result.subscriptions,
      suppressed: result.suppressed,
      lastSyncedAt: scheduledAt
    };
    state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
    if (item.historical) {
      state.historicalImport[result.action] = (state.historicalImport[result.action] || 0) + 1;
      state.historicalImport.readbackConfirmed += 1;
      state.historicalImport.lastReadbackAt = new Date().toISOString();
    }
    state.totals ||= { created: 0, updated: 0, deactivated: 0, subscriptionChanges: 0, messagesSent: 0 };
    state.totals[result.action] = (state.totals[result.action] || 0) + 1;
    await putJson(storage, SYNC_STATE_KEY, state);
    // Only a fully read-back and committed operation may release its lock.
    writer.sideEffectsStarted = false;
    if (current.indexOf(item) < current.length - 1) await delay(7000);
  }
  if (current.length) {
    state.apiReadValidation = {
      profilesRead: true,
      subscriptionsRead: true,
      validatedAt: scheduledAt,
      status: "validated_by_profile_readback"
    };
  }
  state.pending = remaining;
  state.checkpoint = scheduledAt;
  state.status = "ACTIVE";
  state.totals ||= { created: 0, updated: 0, deactivated: 0, subscriptionChanges: 0, messagesSent: 0 };
  if (state.historicalImport) {
    state.historicalImport.remaining = remaining.filter(item => item.historical).length;
    state.historicalImport.status = state.historicalImport.remaining ? "IMPORTING" : "COMPLETED_WITH_SKIPS";
  }
  state.lastRun = {
    status: "completed",
    startedFrom: delta.periodFrom,
    finishedAt: scheduledAt,
    sourceRows: delta.rows.length,
    changedContacts: changedIds.size,
    pagesRead: delta.pages,
    created: run.created,
    updated: run.updated,
    deactivated: run.deactivated,
    skipped: run.skipped,
    pending: remaining.length,
    readbackConfirmed: run.readbackConfirmed,
    restoredSubscriptions: 0,
    messagesSent: 0
  };
  await putJson(storage, `${SYNC_PREFIX}/runs/${scheduledAt.replace(/[:.]/g, "-")}.json`, state.lastRun);
  await putJson(storage, SYNC_STATE_KEY, state);
  return { syncStatus: "ACTIVE", checkpoint: state.checkpoint, ...state.lastRun, totals: state.totals };
}

export async function readVistosLeadHubProfileSyncStatus(env) {
  const state = await getJson(bucket(env), SYNC_STATE_KEY);
  if (!state) return { syncStatus: "BLOCKED", reason: "not_initialized" };
  const lock = await getJson(bucket(env), WRITER_LOCK_KEY);
  const lastRun = validDate(state.lastRun?.finishedAt);
  const current = lastRun && Date.now() - lastRun.getTime() < 15 * 60 * 1000 && state.lastRun?.status === "completed";
  return {
    syncStatus: lock ? "WRITER_BUSY_OR_RECONCILIATION_REQUIRED" : current ? state.status : "BLOCKED",
    storedStatus: state.status,
    lastRunCurrent: Boolean(current),
    trigger: "Cloudflare Cron",
    intervalMinutes: 5,
    checkpoint: state.checkpoint,
    initializedAt: state.initializedAt,
    baselineRunId: state.baselineRunId,
    apiReadValidation: state.apiReadValidation,
    pending: state.pending?.length || 0,
    totals: state.totals,
    lastRun: state.lastRun,
    historicalImport: state.historicalImport || null,
    subscriptionsWriteEnabled: false,
    historicalBulkImportEnabled: Boolean(state.historicalImport),
    messagesEnabled: false
  };
}

export const __test = {
  contactReadColumns,
  sourceValues,
  commitSourceVersion,
  readCampaignSafety,
  upsertActiveProfile,
  parseSubscriptionSafety,
  assertSafetyUnchanged,
  assertModifiedWindow,
  profileUserId,
  tagPayload,
  fingerprint,
  PROFILE_BATCH_LIMIT,
  TAG_NAME
};
