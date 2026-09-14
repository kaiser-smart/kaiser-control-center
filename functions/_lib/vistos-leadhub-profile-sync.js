import {
  getVistosById,
  getVistosPage,
  getVistosSchemaEntity,
  loginVistosExecute
} from "./vistos-execute-client.js";
import {
  buildLeadHubDataOnlySelection,
  dnsMailRouteStatus,
  isSyntacticallyValidEmail,
  normalizeContactEmail,
  vistosSchemaColumnMetadata
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
// Count is only a ceiling. Dispatch is bounded by wall-time, shared provider
// rate reservations, bounded independent identities and durable journals.
const IMPORT_BATCH_LIMIT = 6;
const PACING_VERSION = "endpoint-pacing-v1";
const PROFILE_DISPATCH_BUDGET_MS = 35000;
// Reserve the write/readback window within the same HTTP request. A slow
// source catch-up must commit its queue and yield BEFORE dispatching writes.
const PROFILE_PREPARATION_BUDGET_MS = 25000;
const RATE_STATE_KEY = `${SYNC_PREFIX}/api-rate-reservations.json`;
const OVERLAP_MS = 10 * 60 * 1000;
const TAG_NAME = "eSMART Vistos DATA_ONLY";
const BUSINESS_STATE_KEY = `${SYNC_PREFIX}/business-state.json`;
const BUSINESS_CURRENT_KEY = `${SYNC_PREFIX}/business-current.json`;
const BUSINESS_DEFINITIONS = [
  { entity: "Contract", prefix: "contract", company: "Directory_FK", contacts: ["DirectoryManager_FK", "Koncovkakontakt_FK"], status: "Status_FK", activeStatus: "74" },
  { entity: "QuoteIssued", prefix: "quote", company: "Customer_FK", contacts: ["CustomerManager_FK"] },
  { entity: "OrderReceived", prefix: "order", company: "Customer_FK", contacts: ["CustomerManager_FK"] }
];

function relationId(row, field) {
  const value = row?.[`${field}_RecordId`] ?? row?.[field];
  if (value == null || clean(value) === "") return null;
  if (!/^\d+$/.test(clean(value))) throw syncError("business_fk_unverified", "Vazba neobsahuje jednoznačné číselné ID.");
  return String(BigInt(clean(value)));
}

function compactBusinessRow(row, definition) {
  const fields = ["Id", definition.company, ...definition.contacts, ...(definition.status ? [definition.status] : [])];
  if (fields.some(field => !Object.hasOwn(row, field) && !Object.hasOwn(row, `${field}_RecordId`))) {
    throw syncError("business_fields_missing", "Dokumentová projekce nevrátila požadovaná vazební pole.");
  }
  const values = fields.map(field => relationId(row, field));
  if (!values[0]) throw syncError("business_document_id_missing", "Dokument nemá potvrzené ID.");
  return values;
}

async function hydrateBusinessRow(env, session, row, definition, columns) {
  const present = (value, field) => Object.hasOwn(value, field) || Object.hasOwn(value, `${field}_RecordId`);
  if (columns.every(field => present(row, field))) return compactBusinessRow(row, definition);
  // Production evidence proves Contract.DirectoryManager_FK is omitted by
  // GetPageParam but returned by GetByIdParam. Do not invent null relations.
  const detail = await getVistosById(env, session, definition.entity, row.Id, columns);
  const values = compactBusinessRow(detail.row, definition);
  for (let index = 0; index < columns.length; index++) {
    if (present(row, columns[index]) && relationId(row, columns[index]) !== values[index]) {
      throw syncError("business_detail_changed", "Detail dokumentu nesouhlasí se stránkou; vazby nejsou ověřené.");
    }
  }
  return values;
}

// A missing projected field is not an empty relation. Collect one bounded
// page/detail comparison, privately, without changing selection or the cursor.
async function diagnoseBusinessFields(env, storage, state, definition) {
  const columns = ["Id", definition.company, ...definition.contacts, ...(definition.status ? [definition.status] : [])];
  const present = (row, field) => Object.hasOwn(row, field) || Object.hasOwn(row, `${field}_RecordId`);
  const session = await loginVistosExecute(env);
  const page = await getVistosPage(env, session, definition.entity, columns, {}, 0, 25);
  const sample = page.rows.find(row => columns.some(field => !present(row, field)));
  const detail = sample && /^\d+$/.test(clean(sample.Id))
    ? await getVistosById(env, session, definition.entity, sample.Id, columns) : null;
  const checkedAt = new Date().toISOString();
  const evidenceKey = `${SYNC_PREFIX}/business/${state.id}/${definition.entity}-field-evidence.json`;
  await putJson(storage, evidenceKey, { checkedAt, columns, page, detail });
  return { checkedAt, evidenceKey, pageRows: page.rows.length, detailStatus: detail?.status ?? null,
    fields: columns.map(field => ({ field,
      pageMissing: page.rows.filter(row => !present(row, field)).length,
      detailPresent: detail ? present(detail.row, field) : null,
      detailExplicitNull: detail && present(detail.row, field)
        ? (Object.hasOwn(detail.row, `${field}_RecordId`) ? detail.row[`${field}_RecordId`] : detail.row[field]) === null : null
    })) };
}

function verifyBusinessPasses(first, second, definition) {
  const canonical = pass => {
    if (!Number.isInteger(pass.total) || pass.rows.length !== pass.total
      || new Set(pass.rows.map(row => row[0])).size !== pass.total) {
      throw syncError("business_page_coverage_unverified", "Dokumentové stránky neprokázaly úplnost unikátních ID.");
    }
    return [...pass.rows].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const left = canonical(first), right = canonical(second);
  if (first.total !== second.total || JSON.stringify(left) !== JSON.stringify(right)) {
    throw syncError("business_passes_changed", "Dva úplné běhy se liší v ID nebo vazbách; cílení zůstává neověřené.");
  }
  const relevant = definition.status ? right.filter(row => row.at(-1) === definition.activeStatus) : right;
  return { status: "VERIFIED", documents: right.length, activeDocuments: definition.status ? relevant.length : null,
    directIds: [...new Set(relevant.flatMap(row => row.slice(2, 2 + definition.contacts.length)).filter(Boolean))],
    companyIds: [...new Set(relevant.map(row => row[1]).filter(Boolean))] };
}

// Separate short READ invocations. No invoice/service reads and no profile,
// subscription, document or checkpoint writes. The shared lock serializes
// publication of relation evidence with profile selection.
export async function refreshVistosBusinessRelations(env) {
  return withVistosLeadHubWriter(env, async () => {
    const storage = bucket(env);
    let state = await getJson(storage, BUSINESS_STATE_KEY);
    if (state && state.cursorVersion !== 2) {
      state.cursors = { [BUSINESS_DEFINITIONS[state.entityIndex]?.entity]: { pass: state.pass, offset: state.offset } };
      state.cursorVersion = 2;
      if (state.results?.Contract?.code === "business_fields_missing") {
        delete state.results.Contract;
        state.completedAt = null;
      }
    }
    if (state && !state.completedAt) {
      for (const definition of BUSINESS_DEFINITIONS) {
        const result = state.results?.[definition.entity];
        if (result?.status === "VERIFIED" && Date.now() - Date.parse(result.verifiedAt) >= 3600000) {
          delete state.results[definition.entity];
          state.cursors[definition.entity] = { pass: 0, offset: 0 };
        }
      }
    }
    const needsEvidence = BUSINESS_DEFINITIONS.find(definition =>
      state?.results?.[definition.entity]?.code === "business_fields_missing"
      && !state.results[definition.entity].fieldEvidence);
    if (needsEvidence) {
      let fieldEvidence;
      try { fieldEvidence = await diagnoseBusinessFields(env, storage, state, needsEvidence); }
      catch (error) { fieldEvidence = { checkedAt: new Date().toISOString(), code: clean(error?.code) || "business_field_evidence_failed" }; }
      state.results[needsEvidence.entity].fieldEvidence = fieldEvidence;
      await putJson(storage, BUSINESS_STATE_KEY, state);
      return { mode: "business-read", status: "UNVERIFIED", entity: needsEvidence.entity, fieldEvidence, messagesSent: 0 };
    }
    if (state?.completedAt && Date.now() - Date.parse(state.completedAt) < 3600000) {
      return { mode: "business-read", status: "CURRENT", results: state.summary, messagesSent: 0 };
    }
    if (!state || state.completedAt) state = { id: crypto.randomUUID(), startedAt: new Date().toISOString(),
      entityIndex: 0, pass: 0, offset: 0, results: {}, blocks: 0, cursorVersion: 2, cursors: {} };
    if (state.results[BUSINESS_DEFINITIONS[state.entityIndex]?.entity] || !BUSINESS_DEFINITIONS[state.entityIndex]) {
      state.entityIndex = BUSINESS_DEFINITIONS.findIndex(item => !state.results[item.entity]);
    }
    if (state.entityIndex < 0) {
      state.completedAt = new Date().toISOString();
      await putJson(storage, BUSINESS_STATE_KEY, state);
      return { mode: "business-read", status: "CAPTURED", results: state.summary, messagesSent: 0 };
    }
    const definition = BUSINESS_DEFINITIONS[state.entityIndex];
    const startingIndex = state.entityIndex;
    const savedCursor = state.cursors[definition.entity];
    if (savedCursor) { state.pass = savedCursor.pass; state.offset = savedCursor.offset; }
    const prefix = `${SYNC_PREFIX}/business/${state.id}`;
    const columns = ["Id", definition.company, ...definition.contacts, ...(definition.status ? [definition.status] : [])];
    try {
      const session = await loginVistosExecute(env);
      if (state.offset === 0 && state.pass === 0) {
        const schema = await getVistosSchemaEntity(env, session, definition.entity);
        const metadata = vistosSchemaColumnMetadata(schema);
        await putJson(storage, `${prefix}/${definition.entity}-schema.json`, schema);
        if (columns.some(field => !metadata.some(column => column.field === field))) {
          throw syncError("business_schema_fields_missing", "Schéma nepotvrdilo požadovaná vazební pole.");
        }
      }
      const passKey = `${prefix}/${definition.entity}-${state.pass}.json`;
      const pass = state.offset === 0 ? { total: null, rows: [] } : await getJson(storage, passKey);
      if (!pass || pass.rows.length < state.offset) throw syncError("business_saved_page_missing", "Uložený rozsah dokumentů chybí.");
      const blockStarted = Date.now();
      for (let page = 0; page < 3; page++) {
        if (page && Date.now() - blockStarted > 15000) break;
        const pageSize = definition.entity === "Contract" ? 100 : 1000;
        const read = await getVistosPage(env, session, definition.entity, columns, {}, state.offset, pageSize);
        const total = read.filtered;
        if (!read.countEvidence?.filteredReported || !Number.isInteger(total) || total < 0 || (pass.total != null && pass.total !== total)) {
          throw syncError("business_total_changed", "Počet dokumentů není potvrzený nebo se změnil během stránkování.");
        }
        pass.total = total;
        if (!read.rows.length && state.offset < total) throw syncError("business_page_missing", "Chybí dokumentová stránka.");
        // A detail block is short and resumable even when its HTTP invocation
        // ends early. Persist rows before the cursor; retries trim to cursor.
        pass.rows = pass.rows.slice(0, state.offset);
        for (let index = 0; index < read.rows.length; index += 4) {
          // Bounded READ concurrency only. A chunk commits in original page
          // order after every detail agrees; rejected chunks advance no cursor.
          // Wait for all reads to settle before releasing the shared lock.
          const chunk = await Promise.allSettled(read.rows.slice(index, index + 4)
            .map(row => hydrateBusinessRow(env, session, row, definition, columns)));
          const failed = chunk.find(result => result.status === "rejected");
          if (failed) throw failed.reason;
          pass.rows.push(...chunk.map(result => result.value));
          state.offset += chunk.length;
          if (Date.now() - blockStarted > 15000) break;
        }
        if (state.offset >= total) break;
      }
      await putJson(storage, passKey, pass);
      state.blocks++;
      if (state.offset >= pass.total) {
        if (state.pass === 0) { state.pass = 1; state.offset = 0; }
        else {
          const first = await getJson(storage, `${prefix}/${definition.entity}-0.json`);
          state.results[definition.entity] = { ...verifyBusinessPasses(first, pass, definition), verifiedAt: new Date().toISOString() };
          state.entityIndex++; state.pass = 0; state.offset = 0;
        }
      }
    } catch (error) {
      state.results[definition.entity] = { status: "UNVERIFIED", code: clean(error?.code) || "business_read_failed" };
      state.entityIndex++; state.pass = 0; state.offset = 0;
    }
    state.cursors[definition.entity] = { pass: state.pass, offset: state.offset };
    const unfinished = BUSINESS_DEFINITIONS.map((_, offset) => (startingIndex + offset + 1) % BUSINESS_DEFINITIONS.length)
      .find(index => !state.results[BUSINESS_DEFINITIONS[index].entity]);
    if (unfinished === undefined) state.completedAt = new Date().toISOString();
    else {
      state.entityIndex = unfinished;
      state.pass = state.cursors[BUSINESS_DEFINITIONS[unfinished].entity]?.pass || 0;
      state.offset = state.cursors[BUSINESS_DEFINITIONS[unfinished].entity]?.offset || 0;
    }
    if (state.results[definition.entity]) {
      const previous = await getJson(storage, BUSINESS_CURRENT_KEY);
      // Starting the next entity/capture must not erase still-fresh evidence
      // for other entities and oscillate all their profile flags.
      await putJson(storage, BUSINESS_CURRENT_KEY, { id: state.id, startedAt: state.startedAt,
        completedAt: new Date().toISOString(), results: { ...previous?.results, ...state.results } });
    }
    state.summary = Object.fromEntries(Object.entries(state.results).map(([entity, result]) => [entity, {
      status: result.status, code: result.code, documents: result.documents, activeDocuments: result.activeDocuments,
      directContactIds: result.directIds?.length, companyIds: result.companyIds?.length
    }]));
    await putJson(storage, BUSINESS_STATE_KEY, state);
    return { mode: "business-read", status: state.completedAt ? "CAPTURED" : "READING", entity: definition.entity,
      pass: state.pass, offset: state.offset, blocks: state.blocks, results: state.summary, messagesSent: 0 };
  });
}

function businessFlagsFor(row, evidence, now = Date.now()) {
  const fresh = evidence?.completedAt && now - Date.parse(evidence.completedAt) < 4 * 3600000;
  const flags = {};
  for (const definition of BUSINESS_DEFINITIONS) {
    const result = fresh && evidence.results?.[definition.entity];
    let direct = "UNVERIFIED", company = "UNVERIFIED";
    if (result?.status === "VERIFIED" && (!result.verifiedAt || now - Date.parse(result.verifiedAt) < 4 * 3600000)) {
      const contains = (values, id) => values instanceof Set ? values.has(id) : values.includes(id);
      direct = contains(result.directIds, clean(row.Id)) ? "YES" : "NO";
      try {
        const companyId = relationId(row, "Parent_FK");
        if (companyId !== "0") company = contains(result.companyIds, companyId) ? "YES" : "NO";
      }
      catch { /* Caption without an ID is not a confirmed company relation. */ }
    }
    flags[`${definition.prefix}_direct`] = direct;
    flags[`${definition.prefix}_company`] = company;
  }
  return flags;
}

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
  const started = Date.now();
  try {
  const object = await storage.get(key);
  if (!object) return null;
  if (typeof object.json === "function") return await object.json();
  return JSON.parse(await object.text());
  } finally { addTiming(storage.syncMetrics, "storageRead", Date.now() - started); }
}

async function putJson(storage, key, value) {
  const started = Date.now();
  try {
  await storage.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { protected: "true", integration: "vistos-leadhub-profiles" }
  });
  } finally { addTiming(storage.syncMetrics, "storageWrite", Date.now() - started); }
}

function addTiming(metrics, name, milliseconds) {
  if (!metrics) return;
  const entry = metrics.calls[name] ||= { count: 0, milliseconds: 0 };
  entry.count++; entry.milliseconds += milliseconds;
  entry.maxMs = Math.max(entry.maxMs || 0, milliseconds);
}

async function measured(env, name, operation) {
  const started = Date.now();
  try { return await operation(); }
  finally { addTiming(env.syncMetrics, name, Date.now() - started); }
}

function serialExecutor() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}

async function readTogether(promises) {
  const results = await Promise.allSettled(promises);
  const failed = results.find(result => result.status === "rejected");
  if (failed) throw failed.reason;
  return results.map(result => result.value);
}

function apiFamily(path) {
  return path.startsWith("/profiles/email-address/") ? "profileRead"
    : path.startsWith("/subscriptions/") ? (path.endsWith("/suppressed") ? "suppressionRead" : "subscriptionsRead")
    : path.startsWith("/campaigns") ? "campaignRead"
    : path === "/profiles/tags" ? "tagWrite" : path === "/profiles" ? "profileWrite"
    : path === "/segments" ? "segmentsRead" : path === "/segments/query/profiles" ? "exportWrite"
    : path === "/jobs" ? "jobsRead" : /^\/jobs\/[^/]+$/.test(path) ? "jobRead" : "otherLeadHub";
}

// Verified https://api.leadhub.co/openapi.json, 2026-09-13. These are local
// smooth pacing intervals, NOT provider-prescribed sleeps. 2.1s stays below
// BOTH 10/s and 30/min; no burst credit is invented on a new invocation.
const API_SPACING_MS = Object.freeze({ profileRead: 2100, subscriptionsRead: 2100,
  suppressionRead: 2100, profileWrite: 2100, tagWrite: 2100,
  campaignRead: 1200, jobRead: 1200, jobsRead: 10200, segmentsRead: 60200, exportWrite: 60200 });

// The durable workspace writer lock already excludes overlapping invocations.
// Pace actual dispatch in memory, persist handoff once per drained batch, and
// wait a full endpoint interval on EVERY fresh instance (including restart).
// A crash cannot spend capacity immediately: uncertain writes retain the lock,
// and even without a final rate handoff the next writer waits from its own start.
function createApiLimiter(storage, reservations = {}, now = Date.now, sleep = delay) {
  const startedAt = now();
  const families = new Map();
  const campaignGate = serialExecutor();
  const blocked = new Map();
  const limiter = (family, env) => {
    const spacing = API_SPACING_MS[family];
    if (!spacing) throw syncError("leadhub_rate_policy_missing", "Endpoint nemá ověřený limit API.");
    if (!families.has(family)) {
      families.set(family, serialExecutor());
      // Restart never spends capacity immediately after an earlier writer.
      // The prior writer has already drained before this limiter exists.
      // Source/ledger reads count toward restart cooldown; do not restart the
      // clock on the FIRST USE of each endpoint several seconds into a batch.
      reservations[family] = Math.max(Number(reservations[family]) || 0, startedAt + spacing);
    }
    return families.get(family)(async () => {
      if (blocked.has(family)) throw blocked.get(family);
      if (reservations[family] > now()) await sleep(reservations[family] - now(), env, "apiRateWait");
      if (blocked.has(family)) throw blocked.get(family);
      reservations[family] = now() + spacing;
    });
  };
  limiter.persist = () => putJson(storage, RATE_STATE_KEY, reservations);
  limiter.pause = (family, error) => {
    reservations[family] = Math.max(reservations[family] || 0, now() + error.retryAfterSeconds * 1000);
    const cancelled = syncError("leadhub_rate_paused", "Další požadavky endpointu čekají na další běh.", 503);
    Object.assign(cancelled, { requestNotDispatched: true, endpointFamily: family, retryAfterSeconds: error.retryAfterSeconds });
    blocked.set(family, cancelled);
  };
  // The campaign endpoint permits only 1/s. Serialize through response arrival
  // as well as dispatch: variable upstream latency must not bunch arrivals.
  limiter.runCampaign = (operation, env) => campaignGate(async () => {
    try { return await operation(); }
    // Reserve cooldown for the NEXT dispatch, not the caller returning this
    // response. The normal limiter consumes it once, including after restart.
    finally { reservations.campaignRead = Math.max(reservations.campaignRead || 0, now() + API_SPACING_MS.campaignRead); }
  });
  return limiter;
}

function retryAfterSeconds(value, now = Date.now()) {
  const text = String(value ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(1, Math.ceil(Number(text)));
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - now) / 1000)) : 60;
}

// Small, persisted ramp under the SAME writer. API pacing remains independent
// of lane count: success without 429 is not evidence of extra API quota.
function profileConcurrency(state, now = Date.now()) {
  const control = state.throughputControl;
  if (control?.version !== PACING_VERSION) return 3; // measured previous baseline: 2
  if (now < (control.cooldownUntil || 0)) return Math.max(1, Math.min(4, control.concurrency || 1));
  return Math.max(1, Math.min(4, control.concurrency || 3));
}

function recordThroughputControl(state, concurrency, metrics, run, durationMs, error, now = Date.now()) {
  const previous = state.throughputControl?.version === PACING_VERSION ? state.throughputControl : {};
  const reads = metrics.calls.profileRead;
  const slow = durationMs > 85000 || (reads?.maxMs || 0) > 15000
    || (reads?.count > 0 && reads.milliseconds / reads.count > 6000);
  if (error || metrics.rateLimits || slow) {
    state.throughputControl = { version: PACING_VERSION, concurrency: Math.max(1, concurrency - 1),
      healthyRuns: 0, confirmedProfiles: 0, windowStartedAt: now,
      cooldownUntil: now + Math.max(600000, (error?.retryAfterSeconds || 0) * 1000),
      reason: error?.code || (metrics.rateLimits ? "rate_limit" : "latency_budget") };
    return;
  }
  const control = { ...previous, version: PACING_VERSION, concurrency,
    windowStartedAt: previous.windowStartedAt || now, healthyRuns: (previous.healthyRuns || 0) + 1,
    confirmedProfiles: (previous.confirmedProfiles || 0) + run.readbackConfirmed, reason: "measuring" };
  if (now >= (control.cooldownUntil || 0) && now - control.windowStartedAt >= 180000
    && control.healthyRuns >= 3 && control.confirmedProfiles >= 6 && concurrency < 4) {
    Object.assign(control, { concurrency: concurrency + 1, windowStartedAt: now,
      healthyRuns: 0, confirmedProfiles: 0, reason: "bounded_step_after_confirmed_readbacks" });
  }
  state.throughputControl = control;
}

async function processBoundedProfiles(items, options, operation) {
  const started = Date.now();
  const ids = new Set(), emails = new Set();
  for (const item of items) {
    const email = normalizeContactEmail(item.normalizedEmail);
    if (ids.has(item.contactId) || (email && emails.has(email))) throw syncError("batch_identity_collision", "Dávka obsahuje kolidující identity.");
    ids.add(item.contactId); if (email) emails.add(email);
  }
  let next = 0, failure;
  const lane = async () => {
    while (!failure && next < items.length) {
      if (next && Date.now() - started >= options.budgetMs) return;
      const item = items[next++];
      options.onDispatch?.(item);
      try { await operation(item); }
      catch (error) { failure ||= error; options.onFailure?.(error); }
    }
  };
  // All started work settles before releasing the common lock. No floating
  // Promise or cancellation of an accepted provider write.
  await Promise.all(Array.from({ length: options.concurrency }, lane));
  if (failure) throw failure;
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
  return { rows, pages, filter, periodFrom: from.toISOString(), periodTo: to.toISOString(), session };
}

async function verifyModifiedPositiveControl(env, snapshot) {
  const known = snapshot.rows.find(row => clean(row.Id) && validDate(row.Modified));
  if (!known) throw syncError("vistos_modified_positive_control_missing", "Chybí známý Contact pro pozitivní kontrolu změnového filtru.");
  const timestamp = validDate(known.Modified).getTime();
  const from = new Date(timestamp - 1000), to = new Date(timestamp + 1000);
  const session = await loginVistosExecute(env);
  const page = await getVistosPage(env, session, "Contact", ["Id", "Modified"], {
    Modified_From: vistosDateTime(from), Modified_To: vistosDateTime(to)
  }, 0, CONTACT_PAGE_SIZE);
  if (!page.rows.length || !Number.isInteger(page.filtered) || page.filtered < 1) {
    throw syncError("vistos_modified_positive_control_failed", "Změnový filtr nevrátil řádky pro známý existující čas změny.");
  }
  assertModifiedWindow(page.rows, from, to);
  if (!page.rows.some(row => clean(row.Id) === clean(known.Id))) {
    throw syncError("vistos_modified_positive_identity_unverified", "Pozitivní kontrola filtru nepotvrdila známé Contact ID.");
  }
  return { status: "PASS", testedAt: new Date().toISOString(), knownIdFound: true, rowsRead: page.rows.length, filtered: page.filtered };
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
  const family = apiFamily(path);
  if (family === "campaignRead" && env.syncApiLimiter?.runCampaign && !env.syncCampaignGated) {
    return env.syncApiLimiter.runCampaign(() => leadHubRequest({ ...env, syncCampaignGated: true }, path, options), env);
  }
  if (env.syncApiLimiter) await env.syncApiLimiter(family, env);
  if (env.syncWriter?.halted && options.method && options.method !== "GET") {
    const error = syncError("coordinator_halted", "Zapisovatel zastavil zahajování dalších zápisů.");
    error.requestNotDispatched = true;
    throw error;
  }
  const startedAt = Date.now();
  const config = leadHubConfig(env);
  const response = await fetch(`${config.baseUrl}${path}`, {
    signal: AbortSignal.timeout(20000),
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: config.token,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const payload = await response.json().catch(() => null);
  // Only operation families and timings, never email paths, bodies or secrets.
  addTiming(env.syncMetrics, family, Date.now() - startedAt);
  if (env.syncMetrics && response.status === 429) env.syncMetrics.rateLimits++;
  if (!response.ok && !(options.allow404 && response.status === 404)) {
    const error = new Error(`LeadHub API request selhal (${response.status}).`);
    error.status = 502;
    error.code = "leadhub_api_request_failed";
    error.upstreamStatus = response.status;
    error.endpointFamily = family;
    error.retryAfterSeconds = response.status === 429 ? retryAfterSeconds(response.headers.get("retry-after")) : 0;
    if (response.status === 429) {
      env.syncApiLimiter?.pause?.(family, error);
      if (env.syncWriter) env.syncWriter.halted = true;
    }
    throw error;
  }
  return { status: response.status, payload, durationMs: Date.now() - startedAt };
}

async function assertLeadHubWorkspace(env) {
  const read = await leadHubRequest(env, "/segments");
  if (!Array.isArray(read.payload) || !read.payload.some(segment => segment.id === "b17444f7663241a0adb31b9a47dcf1a0")) {
    throw syncError("leadhub_workspace_unverified", "Klíč nepotvrdil známé publikum workspace kaiserservis.cz.");
  }
  return { httpStatus: read.status, workspaceAnchorFound: true };
}

async function delay(milliseconds, env, reason = "fixedWait") {
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  addTiming(env?.syncMetrics, reason, Date.now() - started);
}

async function readbackProfile(env, email, predicate) {
  const path = `/profiles/email-address/${encodeURIComponent(email)}`;
  let last = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    last = await leadHubRequest(env, path, { allow404: true });
    if (last.status === 200 && predicate(last.payload)) return last.payload;
    // This observation wait already overlaps the limiter's absolute permit.
    // Keep it outside its serial gate so other ready identities are not held.
    if (attempt < 7) await delay(Math.min(1500 * (attempt + 1), 3000), env, "readbackPollWait");
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
  let accepted;
  try { accepted = await leadHubRequest(env, path, options); }
  catch (error) {
    // 429 explicitly rejected this request. Preserve an earlier accepted
    // stage, if any; never retry an ambiguous timeout/5xx as a fresh write.
    if (error.upstreamStatus === 429 || error.requestNotDispatched === true) {
      await record(safety, { rejected: true, httpStatus: error.upstreamStatus || null, notDispatched: error.requestNotDispatched === true });
    }
    throw error;
  }
  // Public OpenAPI promises 202 but no job_id for these write endpoints.
  // Acceptance is journalled, never confused with the subsequent GET readback.
  if (accepted.status !== 202) throw syncError("leadhub_write_acceptance_unverified", "LeadHub nepotvrdil přijetí zápisu.");
  await record(safety, { stage, httpStatus: accepted.status, providerDurationMs: accepted.durationMs });
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
    if (!byId.length) {
      const candidate = profiles[byEmail[0]];
      if (candidate.credentials.user_id !== null) return skip("FOREIGN_USER_ID_PRESERVED");
      const normalizeName = value => clean(value).normalize("NFC").toLocaleLowerCase("cs");
      if (!clean(item.firstName) || !clean(item.lastName)
        || normalizeName(item.firstName) !== normalizeName(candidate.credentials.first_name)
        || normalizeName(item.lastName) !== normalizeName(candidate.credentials.last_name)) {
        return skip("UNOWNED_PROFILE_NAME_EVIDENCE_INSUFFICIENT");
      }
      // Official Profile schema permits an explicit null tag collection.
      // Omitted/malformed collections are still unknown, not empty.
      if (candidate.tags !== null && !Array.isArray(candidate.tags)) return skip("TARGET_TAGS_UNKNOWN");
      const tags = (candidate.tags || []).filter(tag => tag?.name === TAG_NAME);
      if (tags.length > 1 || (tags.length && clean(tags[0].data?.vistos_contact_id) !== contactId)) {
        return skip("INTEGRATION_TAG_IDENTITY_CONFLICT");
      }
      // Link only through the owned tag and protected ledger. NEVER PUT a
      // user_id onto an existing unowned profile (the API may merge identities).
      return { ...entry, action: "UPDATE", reason: "UNIQUE_EMAIL_AND_FULL_NAME_TAG_ONLY_LINK",
        identityBinding: { mode: "EXISTING_EMAIL_TAG_ONLY", credentials: candidate.credentials,
          exportJobId: evidence.exportJobId } };
    }
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
    const tagEqual = tagDataMatches(tag?.data, { source: "Vistos Contact", data_only: 1, targeting_enabled: 1,
      newsletter_permission: "UNKNOWN", communication_status: clean(item.communicationStatus) || "UNKNOWN" });
    return { ...entry, action: namesEqual && tagEqual ? "NO_CHANGE" : "UPDATE", reason: "EMAIL_AND_OWNED_USER_ID_MATCH" };
  });
  const counts = { CREATE: 0, UPDATE: 0, NO_CHANGE: 0, SKIP: 0 };
  manifest.forEach((item) => { counts[item.action] += 1; });
  return { status: "PLANNED", evidence: { ...evidence }, counts, items: manifest, readyForImport: false, sendAllowed: false };
}

function tagDataMatches(actual, expected) {
  // Production GET evidence: LeadHub stores these sent numeric flags as
  // strings. Accept exactly 0/1 or "0"/"1", not blanks, truthiness or "01".
  const numericFlags = new Set(["data_only", "targeting_enabled", "suppression_checked"]);
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value
    || (numericFlags.has(key) && (value === 0 || value === 1) && actual?.[key] === String(value)));
}

function tagPayload(item, active, reason, checked) {
  return {
    profile_identification: item.identityBinding?.mode === "EXISTING_EMAIL_TAG_ONLY"
      ? { email_address: item.normalizedEmail } : { user_id: profileUserId(item.contactId) },
    tag: {
      name: TAG_NAME,
      data: {
        source: "Vistos Contact",
        vistos_contact_id: clean(item.contactId),
        data_only: active ? 1 : 0,
        targeting_enabled: active ? 1 : 0,
        communication_status: clean(item.communicationStatus) || "UNKNOWN",
        newsletter_permission: "UNKNOWN",
        ...(item.businessFlags ? Object.fromEntries(Object.entries(item.businessFlags).map(([key, value]) => [key, active ? value : "NO"])) : {}),
        suppression_checked: checked.suppressed ? 1 : 0,
        exclusion_reason: clean(reason) || "NONE"
      }
    }
  };
}

function profileIdentityMatches(payload, item) {
  const credentials = payload?.credentials;
  if (normalizeContactEmail(credentials?.email_address) !== item.normalizedEmail) return false;
  if (item.identityBinding?.mode !== "EXISTING_EMAIL_TAG_ONLY") return credentials?.user_id === profileUserId(item.contactId);
  const expected = item.identityBinding.credentials;
  return expected?.user_id === null && credentials?.user_id === null
    && Object.keys(expected).every(key => JSON.stringify(credentials[key]) === JSON.stringify(expected[key]));
}

async function subscriptionRead(env, email) {
  const encoded = encodeURIComponent(email);
  const [subscriptions, suppressed] = await readTogether([
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
    if (page && !env.syncApiLimiter) await delay(1100, env, "campaignRateWait"); // Official campaign read limit: 1 request/second.
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
  if ([item.firstName, item.lastName].some(value => [...clean(value)].length > 50)) {
    throw syncError("leadhub_profile_attributes_invalid", "Jméno přesahuje doložený limit API; nebude zkráceno odhadem.");
  }
  const email = item.normalizedEmail;
  const encoded = encodeURIComponent(email);
  const [before, safety] = await readTogether([
    leadHubRequest(env, `/profiles/email-address/${encoded}`, { allow404: true }),
    subscriptionRead(env, email)
  ]);
  const linked = item.identityBinding?.mode === "EXISTING_EMAIL_TAG_ONLY";
  if ((linked && before.status !== 200) || (before.status === 200 && !profileIdentityMatches(before.payload, item))) {
    const error = new Error("Profil stejného e-mailu nemá potvrzenou integrační identitu.");
    error.code = "leadhub_profile_identity_conflict";
    error.status = 409;
    throw error;
  }
  if (before.status === 200) {
    const tags = before.payload.tags;
    const owned = (Array.isArray(tags) ? tags : []).filter(tag => tag?.name === TAG_NAME);
    if ((tags !== null && !Array.isArray(tags)) || owned.length > 1
      || owned.some(tag => clean(tag.data?.vistos_contact_id) !== clean(item.contactId))) {
      throw syncError("leadhub_profile_identity_conflict", "Aktuální integrační tag nepotvrdil jednoznačnou vazbu.");
    }
  }
  if (before.status === 200) {
    const tags = (before.payload.tags || []).filter(tag => tag?.name === TAG_NAME);
    const expected = tagPayload(item, true, "", safety).tag.data;
    if ((linked || ((!item.firstName || before.payload.credentials.first_name === item.firstName)
      && (!item.lastName || before.payload.credentials.last_name === item.lastName)))
      && tags.length === 1 && tagDataMatches(tags[0].data, expected)) {
      return { action: "no_change", ...safety, readback: true };
    }
  }
  // Identity, subscriptions, suppression and exact resulting data were read
  // above. A proven NO_CHANGE performs no mutation and needs no write gate.
  // Every actual profile/tag write still requires the campaign safety check.
  await readCampaignSafety(env);
  const action = before.status === 404 ? "created" : "updated";
  const profileNeedsWrite = !linked && (before.status === 404 || (item.firstName && before.payload.credentials.first_name !== item.firstName)
    || (item.lastName && before.payload.credentials.last_name !== item.lastName));
  if (profileNeedsWrite) {
    await beforeWrite(safety, { action });
    await acceptedProfileWrite(env, "/profiles", {
    method: "PUT",
    body: {
      user_id: profileUserId(item.contactId),
      email_address: email,
      ...(item.firstName ? { first_name: item.firstName } : {}),
      ...(item.lastName ? { last_name: item.lastName } : {})
    }
    }, safety, beforeWrite, "PROFILE_ACCEPTED");
  // This intermediate readback/safety check belongs to a credentials WRITE.
  // With tag-only work no intervening mutation occurred: the initial identity
  // and safety reads already are the before-write evidence.
  const profileReadback = await readbackProfile(env, email, payload =>
    profileIdentityMatches(payload, item)
    && (linked || ((!item.firstName || payload.credentials.first_name === item.firstName)
      && (!item.lastName || payload.credentials.last_name === item.lastName))));
  if (!profileReadback) {
    const error = new Error("Identita nebo atributy profilu nebyly po zápisu potvrzené.");
    error.code = "leadhub_profile_identity_readback_failed";
    error.status = 502;
    throw error;
  }
  assertSafetyUnchanged(safety, await subscriptionRead(env, email));
  if (!env.syncApiLimiter) await delay(1100, env, "campaignRateWait");
  await readCampaignSafety(env);
  }
  await beforeWrite(safety, { action });
  await acceptedProfileWrite(env, "/profiles/tags", {
    method: "POST",
    body: tagPayload(item, true, "", safety)
  }, safety, beforeWrite, "TAG_ACCEPTED");
  const readback = await readbackProfile(env, email, (payload) => {
    const tags = Array.isArray(payload?.tags) ? payload.tags.filter(row => clean(row?.name) === TAG_NAME) : [];
    const tag = tags[0];
    const expected = tagPayload(item, true, "", safety).tag.data;
    return profileIdentityMatches(payload, item)
      && tags.length === 1 && tagDataMatches(tag?.data, expected);
  });
  if (!readback) {
    const error = new Error("LeadHub profil nebyl po zápisu potvrzen zpětným čtením.");
    error.status = 502;
    error.code = "leadhub_profile_readback_failed";
    throw error;
  }
  assertSafetyUnchanged(safety, await subscriptionRead(env, email));
  return {
    action,
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
    if (!profileIdentityMatches(existing.payload, item)) {
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
      return profileIdentityMatches(payload, item)
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
  const startedAt = new Date().toISOString();
  const acquired = await storage.put(WRITER_LOCK_KEY, JSON.stringify({ owner, startedAt }), {
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
  const context = { owner, startedAt, sideEffectsStarted: false, unsettled: new Set(), halted: false };
  let completed = false;
  try {
    const result = await operation(context);
    completed = true;
    return result;
  } finally {
    if (completed || !context.sideEffectsStarted) {
      const lock = await getJson(storage, WRITER_LOCK_KEY);
      if (lock?.owner === owner && !lock.phase) await storage.delete(WRITER_LOCK_KEY);
    } else {
      const lock = await getJson(storage, WRITER_LOCK_KEY);
      if (lock?.owner === owner && !lock.phase) await putJson(storage, WRITER_LOCK_KEY, {
        ...lock, terminal: true, terminalAt: new Date().toISOString()
      });
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
  const heldLock = await getJson(bucket(env), WRITER_LOCK_KEY);
  if (heldLock && Date.now() - Date.parse(heldLock.startedAt) > 120000) {
    return inspectRetainedWriter(env, heldLock, { recoveryOwner: options.recoveryOwner });
  }
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
      batchLimit: state.historicalImport.readbackConfirmed ? IMPORT_BATCH_LIMIT : 1 }, writer, state);
    // The same exclusive writer already committed this exact in-memory state.
    // Do not download the large ledger again before releasing its lock.
    return { ...summary, mode: "execute-import", historicalImport: state.historicalImport, sendAllowed: false };
  });
}

// A complete committed batch may lose its final lock cleanup. Prove the whole
// batch, not just one accepted operation or elapsed time, before releasing it.
async function committedBatchReceipt(storage, state, lock, verified, listedCount) {
  const run = state.lastRun;
  if (state.safetyIncident || run?.status !== "completed" || !verified.length
    || verified.length !== listedCount || state.checkpoint !== run.sourceThrough
    || !(Date.parse(lock.startedAt) <= Date.parse(run.startedAt))
    || !(Date.parse(run.startedAt) <= Date.parse(run.finishedAt))
    || !(Date.parse(run.finishedAt) < Date.now() - 120000)
    || verified.length !== run.readbackConfirmed
    || new Set(verified.map(entry => entry.operation.contactId)).size !== verified.length
    || !verified.every(({ operation, alreadyCommitted, result }) => alreadyCommitted
      && operation.writer === lock.owner && operation.status === "READBACK_CONFIRMED"
      && Date.parse(operation.timings?.startedAt) >= Date.parse(run.startedAt)
      && Date.parse(operation.finishedAt) >= Date.parse(operation.timings?.startedAt)
      && Date.parse(operation.finishedAt) <= Date.parse(run.finishedAt)
      && result.identityMatches && result.namesMatch && result.tagMatches && result.safetyUnchanged)) return null;
  for (const action of ["created", "updated", "deactivated", "no_change"]) {
    if (verified.filter(entry => entry.operation.action === action).length !== run[action]) return null;
  }
  if (verified.some(entry => !["created", "updated", "deactivated", "no_change"].includes(entry.operation.action))) return null;
  if (run.writerOwner !== undefined) {
    if (run.writerOwner !== lock.owner || !Array.isArray(run.committedContactIds)
      || JSON.stringify([...run.committedContactIds].sort()) !== JSON.stringify(verified.map(entry => entry.operation.contactId).sort())) return null;
  }
  // Older runs have no owner receipt. Require their independently persisted
  // complete run record as well as owner-scoped journals and exact ledger match.
  const recorded = await getJson(storage, `${SYNC_PREFIX}/runs/${run.sourceThrough.replace(/[:.]/g, "-")}.json`);
  // Storage timing metrics continue accumulating while these two records are
  // persisted. Compare the immutable completion receipt, not those timings.
  const fields = ["status", "writerOwner", "committedContactIds", "startedAt", "finishedAt", "sourceThrough",
    "created", "updated", "deactivated", "no_change", "skipped", "readbackConfirmed"];
  return recorded && fields.every(field => JSON.stringify(recorded[field]) === JSON.stringify(run[field])) ? run : null;
}

// READ reconciliation never retries provider writes. A fully committed batch
// only needs a fenced audit receipt and lock cleanup, not another ledger write.
async function inspectRetainedWriter(env, lock, options = {}) {
  const storage = bucket(env);
  const state = await getJson(storage, SYNC_STATE_KEY);
  const listed = await storage.list({ prefix: `${SYNC_PREFIX}/operations/${lock.owner}/`, limit: 100 });
  if (listed.truncated) throw syncError("writer_journal_incomplete", "Neuzavřený deník není úplný.");
  const checks = [];
  const verified = [];
  let noWriteJournals = 0;
  for (const object of listed.objects) {
    const operation = await getJson(storage, object.key);
    // WRITE_INTENT is durably recorded before any provider request. These
    // earlier/explicitly rejected stages therefore cannot contain an accepted
    // mutation and must not obstruct recovery of another independent profile.
    if (["INTENT", "SKIP", "REQUEST_REJECTED"].includes(operation.status)) {
      noWriteJournals++;
      checks.push({ stage: "NO_PROVIDER_WRITE", status: operation.status });
      continue;
    }
    const tracked = state.profiles?.[operation.contactId];
    const alreadyCommitted = operation.status === "READBACK_CONFIRMED" && tracked?.synced === true
      && tracked.email === operation.normalizedEmail && tracked.rowHash === operation.rowHash
      && tracked.sourceModified === operation.sourceModified
      && tracked.active === (operation.desired === "active")
      && JSON.stringify(tracked.businessFlags || null) === JSON.stringify(operation.businessFlags || null)
      && JSON.stringify({ subscriptions: tracked.subscriptions, suppressed: tracked.suppressed }) === JSON.stringify(operation.afterSafety);
    const item = (state.pending || []).find(entry => entry.contactId === operation.contactId)
      || (alreadyCommitted ? { contactId: operation.contactId, normalizedEmail: operation.normalizedEmail } : null);
    if (!item || !operation.normalizedEmail) {
      checks.push({ stage: "NO_WRITE_READBACK_AVAILABLE" }); continue;
    }
    const profile = await leadHubRequest(env, `/profiles/email-address/${encodeURIComponent(operation.normalizedEmail)}`, { allow404: true });
    const safety = await subscriptionRead(env, operation.normalizedEmail);
    const safetyUnchanged = Boolean(operation.beforeSafety) && JSON.stringify(operation.beforeSafety) === JSON.stringify(safety);
    const credentials = profile.payload?.credentials;
    item.identityBinding ||= operation.identityBinding || tracked?.identityBinding;
    const identityMatches = profile.status === 200 && profileIdentityMatches(profile.payload, item);
    const namesMatch = identityMatches && (Boolean(item.identityBinding) || ((!item.firstName || credentials.first_name === item.firstName)
      && (!item.lastName || credentials.last_name === item.lastName)));
    const tags = Array.isArray(profile.payload?.tags) ? profile.payload.tags.filter(tag => tag.name === TAG_NAME) : [];
    const expectedBusiness = operation.businessFlags || item.businessFlags || tracked?.businessFlags;
    const tagMatches = tags.length === 1 && clean(tags[0].data?.vistos_contact_id) === item.contactId
      && tags[0].data?.source === "Vistos Contact" && tags[0].data?.newsletter_permission === "UNKNOWN"
      && Number(tags[0].data?.data_only) === (operation.desired === "active" ? 1 : 0)
      && Number(tags[0].data?.targeting_enabled) === (operation.desired === "active" ? 1 : 0)
      && (!expectedBusiness || Object.entries(expectedBusiness).every(([key, value]) =>
        tags[0].data?.[key] === (operation.desired === "active" ? value : "NO")));
    const allowedFields = new Set(["credentials", "tags", "first_name", "last_name", "user_id", "email_address", "profile", "data"]);
    const result = { profileHttpStatus: profile.status, identityMatches, namesMatch, tagMatches, alreadyCommitted,
      safetyUnchanged, integrationTagCount: tags.length,
      knownRootFields: Object.keys(profile.payload || {}).filter(key => allowedFields.has(key)),
      knownCredentialFields: Object.keys(credentials || {}).filter(key => allowedFields.has(key)),
      profileAccepted: operation.status === "PROFILE_ACCEPTED", tagAccepted: operation.status === "TAG_ACCEPTED",
      readbackConfirmed: operation.status === "READBACK_CONFIRMED" };
    // Legacy WRITE_INTENT does not prove dispatch or acceptance. Never replay
    // it. For a terminated writer, a still-unowned tag-only identity with no
    // integration tag and unchanged safety can be isolated permanently as SKIP.
    // This is not a successful operation or permission to mutate that profile.
    result.quarantinable = lock.terminal === true && operation.status === "WRITE_INTENT"
      && item.identityBinding?.mode === "EXISTING_EMAIL_TAG_ONLY"
      && identityMatches && namesMatch && safetyUnchanged && tags.length === 0;
    await putJson(storage, `${SYNC_PREFIX}/reconciliation/${lock.owner}/${operation.contactId}.json`, {
      checkedAt: new Date().toISOString(), operation, expected: item, profile: profile.payload, safety, result
    });
    checks.push(result);
    verified.push({ operationKey: object.key, operation, item, result, safety, alreadyCommitted });
  }
  const committed = await committedBatchReceipt(storage, state, lock, verified, listed.objects.length);
  if (committed && (!lock.phase || lock.phase === "COMMITTED_RELEASING")) {
    const liveObject = await storage.get(WRITER_LOCK_KEY);
    const live = liveObject ? await liveObject.json() : null;
    if (!live || live.owner !== lock.owner || !liveObject.httpEtag
      || (live.phase && live.phase !== "COMMITTED_RELEASING")
      || (live.phase === "COMMITTED_RELEASING" && !(Date.parse(live.claimedAt) < Date.now() - 120000))) {
      throw syncError("writer_reconciliation_changed", "Dokončenou dávku již uzavírá jiný běh.");
    }
    const claimId = crypto.randomUUID();
    const claimed = await storage.put(WRITER_LOCK_KEY, JSON.stringify({ ...live,
      phase: "COMMITTED_RELEASING", claimId, claimedAt: new Date().toISOString() }), {
      onlyIf: new Headers({ "If-Match": liveObject.httpEtag }),
      httpMetadata: { contentType: "application/json" }, customMetadata: { protected: "true" }
    });
    if (!claimed) throw syncError("writer_reconciliation_changed", "Vlastník dokončené dávky se změnil.");
    await putJson(storage, `${SYNC_PREFIX}/reconciliation/${lock.owner}/settled.json`, {
      settledAt: new Date().toISOString(), reason: "COMMITTED_BATCH_RECOVERED",
      profilesConfirmed: verified.length, profileWrites: 0, ledgerWrites: 0,
      safetyUnchanged: true, checkpointChanged: false, committedRunFinishedAt: committed.finishedAt
    });
    const current = await getJson(storage, WRITER_LOCK_KEY);
    if (current?.owner !== lock.owner || current.claimId !== claimId) {
      throw syncError("writer_reconciliation_changed", "Zámek dokončené dávky se během uzavírání změnil.");
    }
    await storage.delete(WRITER_LOCK_KEY);
    return { mode: "execute-import", status: "COMMITTED_BATCH_RECOVERED", checks,
      profilesConfirmed: verified.length, profileWrites: 0, ledgerWrites: 0,
      lockReleased: true, checkpointChanged: false, sendAllowed: false };
  }
  const explicitlyObservedLegacyFailure = clean(options.recoveryOwner) === lock.owner;
  if (!lock.phase && (lock.terminal === true || explicitlyObservedLegacyFailure)
    && verified.length + noWriteJournals === listed.objects.length && verified.length > 0
    && verified.every(entry => entry.result.identityMatches && entry.result.namesMatch && entry.result.safetyUnchanged
      && (entry.result.quarantinable || ((entry.result.profileAccepted || entry.result.tagAccepted || entry.result.readbackConfirmed)
      && (entry.result.tagMatches || (entry.result.profileAccepted && entry.result.integrationTagCount === 0)))))) {
    const liveObject = await storage.get(WRITER_LOCK_KEY);
    const live = liveObject ? await liveObject.json() : null;
    if (!live || live.owner !== lock.owner || live.phase || !liveObject.httpEtag) {
      throw syncError("writer_reconciliation_changed", "Vlastník neuzavřené operace se změnil.");
    }
    // CAS, not a TTL takeover: only the observed terminal operation can be
    // adopted, after its exact profile and unchanged safety state were read.
    const claimed = await storage.put(WRITER_LOCK_KEY, JSON.stringify({ ...live, phase: "RECONCILING" }), {
      onlyIf: new Headers({ "If-Match": liveObject.httpEtag }),
      httpMetadata: { contentType: "application/json" }, customMetadata: { protected: "true" }
    });
    if (!claimed) throw syncError("writer_reconciliation_changed", "Zpětné ověření už převzal jiný běh.");
    state.reconciledOperations ||= {};
    for (const entry of verified) {
      // The operation was committed before the interrupted batch ended. Its
      // live safety/identity/tag readback is still mandatory, but it must not
      // increment counters, recreate a queue item or rewrite a tracked profile.
      if (entry.alreadyCommitted) continue;
      if (state.reconciledOperations[entry.operationKey]) continue;
      const { item, operation, result, safety } = entry;
      if (result.quarantinable) {
        state.quarantinedIdentities ||= {};
        state.quarantinedIdentities[item.contactId] = { email: item.normalizedEmail,
          reason: "UNACKNOWLEDGED_TAG_INTENT", journalKey: entry.operationKey,
          quarantinedAt: new Date().toISOString(), operationOutcome: "UNVERIFIED" };
        state.pending = state.pending.filter(pending => pending.contactId !== item.contactId && pending.normalizedEmail !== item.normalizedEmail);
        state.manifestIdentityChecks ||= {};
        state.manifestIdentityChecks[item.contactId] = { ...state.manifestIdentityChecks[item.contactId],
          email: item.normalizedEmail, action: "SKIP", reason: "UNACKNOWLEDGED_TAG_INTENT" };
        if (item.historical && state.historicalImport) state.historicalImport.skipped++;
        state.reconciledOperations[entry.operationKey] = { quarantined: true, confirmedAt: new Date().toISOString() };
        continue;
      }
      const action = operation.action || (item.manifestAction === "CREATE" && !state.profiles?.[item.contactId]?.synced ? "created" : "updated");
      if (!["created", "updated", "deactivated", "no_change"].includes(action)) throw syncError("writer_action_unverified", "Neznámý typ již provedené operace.");
      state.profiles ||= {}; state.totals ||= {};
      state.profiles[item.contactId] = { synced: true, active: result.tagMatches && operation.desired === "active",
        email: item.normalizedEmail, rowHash: item.rowHash, sourceModified: item.sourceModified,
        businessFlags: operation.businessFlags || item.businessFlags || null,
        identityBinding: item.identityBinding || null,
        ...safety, lastSyncedAt: new Date().toISOString() };
      state.totals[action] = (state.totals[action] || 0) + 1;
      if (item.historical && state.historicalImport) {
        state.historicalImport[action] = (state.historicalImport[action] || 0) + 1;
        if (result.tagMatches) state.historicalImport.readbackConfirmed += 1;
      }
      if (result.tagMatches) state.pending = state.pending.filter(pending => pending.contactId !== item.contactId);
      else {
        const pending = state.pending.find(pending => pending.contactId === item.contactId);
        pending.manifestAction = "UPDATE";
        pending.profileAlreadyCreated = true;
      }
      state.reconciledOperations[entry.operationKey] = { confirmedAt: new Date().toISOString(), profileOnly: !result.tagMatches };
    }
    // One state commit makes retrying adoption idempotent. Accepted profile-only
    // work stays queued for fresh source validation and the missing tag only.
    if (state.historicalImport) state.historicalImport.remaining = state.pending.filter(item => item.historical).length;
    await putJson(storage, SYNC_STATE_KEY, state);
    await putJson(storage, `${SYNC_PREFIX}/reconciliation/${lock.owner}/settled.json`, {
      settledAt: new Date().toISOString(), profilesConfirmed: verified.filter(entry => !entry.result.quarantinable).length,
      profilesQuarantined: verified.filter(entry => entry.result.quarantinable).length,
      profileOnly: verified.filter(entry => !entry.result.quarantinable && !entry.result.tagMatches).length,
      profileWrites: 0, safetyUnchanged: true, legacyTerminalResponseObserved: explicitlyObservedLegacyFailure
    });
    await storage.delete(WRITER_LOCK_KEY);
    return { mode: "execute-import", status: verified.some(entry => entry.result.quarantinable) ? "AMBIGUOUS_INTENT_SKIPPED" : "READBACK_ADOPTED", checks,
      profilesConfirmed: verified.filter(entry => !entry.result.quarantinable).length,
      profilesQuarantined: verified.filter(entry => entry.result.quarantinable).length,
      profileWrites: 0, lockReleased: true, checkpointChanged: false, sendAllowed: false };
  }
  return { mode: "execute-import", status: "RECONCILIATION_REQUIRED", checks,
    profileWrites: 0, lockReleased: false, checkpointChanged: false, sendAllowed: false };
}

function sourceValues(row, columns) {
  return JSON.stringify(columns.map(field => {
    // Production READ evidence: GetPage returns the company caption in
    // Parent_FK and its ID in Parent_FK_RecordId; GetById returns that same ID
    // directly in Parent_FK (and the caption in Parent_FK_Caption).
    if (field === "Parent_FK") {
      const id = row?.Parent_FK_RecordId ?? row?.Parent_FK;
      if (/^[0-9]+$/.test(clean(id))) return [field, { recordId: clean(id) }];
    }
    return [field, row?.[field] ?? null];
  }));
}

async function commitSourceVersion(storage, state, snapshot, dnsState, owner) {
  const prefix = `${SYNC_PREFIX}/versions/${owner}`;
  // Immutable objects first; one small, strongly consistent R2 pointer last.
  await putJson(storage, `${prefix}/snapshot.json`, snapshot);
  await putJson(storage, `${prefix}/dns.json`, dnsState);
  state.snapshotKey = `${prefix}/snapshot.json`; state.dnsKey = `${prefix}/dns.json`;
  await putJson(storage, SYNC_STATE_KEY, state);
}

// New delta identities need the same complete email AND user-id collision
// check as the historical manifest. Waiting export jobs survive invocations;
// they never grant profile/subscription write permission by themselves.
async function refreshDeltaIdentities(env, state, selectedById) {
  const storage = bucket(env);
  const pendingIds = Object.keys(state.identityPending || {});
  if (!pendingIds.length) return [];
  if (!state.identityExport) {
    await assertLeadHubWorkspace(env);
    const accepted = await leadHubRequest(env, "/segments/query/profiles", {
      method: "POST", body: { segments: [{ targetingBlocks: [] }] }
    });
    if (accepted.status !== 202 || !clean(accepted.payload?.job_id)) {
      throw syncError("delta_identity_export_not_accepted", "Úplný export pro nové identity nebyl potvrzen.");
    }
    state.identityExport = { jobId: accepted.payload.job_id, requestedAt: new Date().toISOString(),
      contactIds: pendingIds, status: "WAITING" };
    await putJson(storage, SYNC_STATE_KEY, state);
    return [];
  }
  const jobId = state.identityExport.jobId;
  const job = await leadHubRequest(env, `/jobs/${encodeURIComponent(jobId)}`);
  if (job.payload?.job_id !== jobId || job.payload?.errors?.length
    || !["waiting", "processing", "done"].includes(job.payload?.state)) {
    throw syncError("delta_identity_export_failed", "Export identit neprošel ověřením úlohy.");
  }
  if (job.payload.state !== "done") return [];
  const config = leadHubConfig(env);
  const response = await fetch(`${config.baseUrl}/jobs/${encodeURIComponent(jobId)}/result`, {
    headers: { Authorization: config.token }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw syncError("delta_identity_export_download_failed", "Úplný export identit nelze načíst.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 31 || bytes[1] !== 139) throw syncError("delta_identity_export_format_unverified", "Export identit nemá potvrzený gzip formát.");
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  let profiles;
  try { profiles = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
  catch { throw syncError("delta_identity_export_parse_failed", "Export identit obsahuje nevalidní JSONL."); }
  const ids = state.identityExport.contactIds;
  const selected = ids.map(id => selectedById.get(id)).filter(Boolean);
  const manifest = buildLeadHubImportManifest(selected, profiles, {
    workspaceId: "8d8bf07372ad4244877308cbd94c8e78", sourceRunId: state.baselineRunId,
    sourceCount: selected.length, exportCount: profiles.length, exportState: "done",
    exportJobId: jobId, allProfiles: true
  });
  if (manifest.status !== "PLANNED") throw syncError("delta_identity_manifest_blocked", "Nové identity neprošly kontrolou úplného exportu.");
  const prefix = `${SYNC_PREFIX}/identity-exports/${encodeURIComponent(jobId)}`;
  await putJson(storage, `${prefix}/profiles.json`, profiles);
  await putJson(storage, `${prefix}/manifest.json`, manifest);
  state.manifestIdentityChecks ||= {};
  for (const item of manifest.items) state.manifestIdentityChecks[item.contactId] = {
    action: item.action, email: item.normalizedEmail, reason: item.reason, exportJobId: jobId,
    identityBinding: item.identityBinding || null
  };
  for (const id of ids) delete state.identityPending[id];
  state.lastIdentityExport = { jobId, completedAt: new Date().toISOString(), profiles: profiles.length,
    counts: manifest.counts, manifestKey: `${prefix}/manifest.json` };
  state.identityExport = null;
  await putJson(storage, SYNC_STATE_KEY, state);
  return ids;
}

const FAIR_QUEUE_CYCLE = ["delta", "historical", "business", "historical"];

function pendingClass(item, profiles = {}) {
  if (item.desired === "inactive") return "urgent";
  if (item.desired === "skip") return "skip";
  const tracked = profiles[item.contactId];
  if (!tracked?.synced) return item.historical ? "historical" : "delta";
  return tracked.rowHash !== item.rowHash || tracked.email !== item.normalizedEmail ? "delta" : "business";
}

function prioritizePending(items, profiles = {}, cursor = 0, historicalCursor = 0) {
  const queues = { urgent: [], delta: [], historical: [], business: [], skip: [] };
  for (const item of items) queues[pendingClass(item, profiles)].push(item);
  const positions = { delta: 0, historical: 0, business: 0 };
  const history = [queues.historical.filter(item => item.historicalKind !== "link"),
    queues.historical.filter(item => item.historicalKind === "link")];
  const historyPositions = [0, 0];
  const result = queues.urgent.map(item => ({ ...item, queueClass: "urgent", queueCursorAfter: cursor, historicalCursorAfter: historicalCursor }));
  let left = queues.delta.length + queues.historical.length + queues.business.length;
  while (left) {
    const kind = FAIR_QUEUE_CYCLE[cursor % FAIR_QUEUE_CYCLE.length];
    cursor = (cursor + 1) % FAIR_QUEUE_CYCLE.length;
    let item;
    if (kind === "historical") {
      for (let attempt = 0; attempt < 2 && !item; attempt++) {
        const lane = historicalCursor % 2; historicalCursor = (historicalCursor + 1) % 2;
        item = history[lane][historyPositions[lane]];
        if (item) historyPositions[lane]++;
      }
    } else item = queues[kind][positions[kind]];
    if (!item) continue;
    positions[kind]++; left--;
    result.push({ ...item, queueClass: kind, queueCursorAfter: cursor, historicalCursorAfter: historicalCursor });
  }
  return [...result, ...queues.skip.map(item => ({ ...item, queueClass: "skip", queueCursorAfter: cursor, historicalCursorAfter: historicalCursor }))];
}

function queueStats(items, profiles, now = Date.now()) {
  const result = Object.fromEntries(["urgent", "delta", "historical", "business", "skip"].map(kind =>
    [kind, { pending: 0, oldestObservedAt: null, oldestObservedAgeSeconds: null, exactEnqueueTimeUnknown: 0 }]));
  for (const item of items) {
    const entry = result[pendingClass(item, profiles)]; entry.pending++;
    if (item.enqueuedAtEvidence !== "ENQUEUED") entry.exactEnqueueTimeUnknown++;
    if (item.enqueuedAt && (!entry.oldestObservedAt || item.enqueuedAt < entry.oldestObservedAt)) entry.oldestObservedAt = item.enqueuedAt;
  }
  for (const entry of Object.values(result)) if (entry.oldestObservedAt) entry.oldestObservedAgeSeconds = Math.max(0, Math.floor((now - Date.parse(entry.oldestObservedAt)) / 1000));
  return result;
}

function refreshPendingIntent(item, selected, row, tracked) {
  if (item.desired !== "active") return item;
  if (!selected || selected.normalizedEmail !== item.normalizedEmail) {
    return { ...item, desired: tracked?.synced && tracked.active ? "inactive" : "skip",
      normalizedEmail: tracked?.synced ? tracked.email : item.normalizedEmail, reason: "SOURCE_CHANGED_OR_FILTERED" };
  }
  const current = { ...item, ...selected, rowHash: fingerprint(row), sourceModified: clean(row.Modified) };
  if (tracked?.synced && tracked.active && tracked.email === current.normalizedEmail
    && tracked.rowHash === current.rowHash && JSON.stringify(tracked.businessFlags) === JSON.stringify(current.businessFlags)) return null;
  return current;
}

function classifyHistoricalOrigins(state, originalItems) {
  const ids = new Set(originalItems.map(item => clean(item.contactId)));
  state.historicalContactIds = [...ids];
  for (const item of state.pending || []) {
    if (ids.has(item.contactId) && !state.profiles?.[item.contactId]?.synced) item.historical = true;
  }
  if (state.historicalImport) {
    state.historicalImport.initialPlanned ||= state.historicalImport.planned;
    const counts = { CREATE: 0, UPDATE: 0, NO_CHANGE: 0, SKIP: 0 };
    for (const id of ids) counts[state.manifestIdentityChecks?.[id]?.action || "SKIP"]++;
    state.historicalImport.planned = counts;
    state.historicalImport.processedUniqueProfiles = [...ids].filter(id => state.profiles?.[id]?.synced).length;
  }
  return ids;
}

async function runProfileSyncUnlocked(env, options, writer, initialState) {
  // Include import-state/ledger reads performed by the outer coordinator.
  const runStartedAt = writer.startedAt;
  const metrics = { calls: {}, phases: {}, rateLimits: 0 };
  const originalStorage = bucket(env);
  env = { ...env, syncMetrics: metrics, R2_ARCHIVE: new Proxy(originalStorage, { get(target, key) {
    if (key === "syncMetrics") return metrics;
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) };
  let phaseStarted = Date.now();
  const phase = name => { metrics.phases[name] = Date.now() - phaseStarted; phaseStarted = Date.now(); };
  const storage = bucket(env);
  env.syncWriter = writer;
  env.syncApiLimiter = createApiLimiter(storage, await getJson(storage, RATE_STATE_KEY) || {});
  const scheduledAt = (validDate(options.scheduledAt) || new Date()).toISOString();
  let state = initialState || await getJson(storage, SYNC_STATE_KEY);
  if (!state) return initializeState(env, scheduledAt);
  const concurrency = profileConcurrency(state);
  if (state.safetyIncident) throw syncError("safety_incident_unresolved", "Nevyřešený bezpečnostní incident blokuje další zápisy.");
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
  phase("snapshotLoad");
  let historicalIds = new Set(state.historicalContactIds || []);
  if (state.historicalImport && !historicalIds.size) {
    const prepared = await getJson(storage, IMPORT_STATE_KEY);
    const original = prepared?.id === state.historicalImport.id && await getJson(storage, prepared.manifestKey);
    if (!Array.isArray(original?.items)) throw syncError("historical_origin_missing", "Chybí původní manifest pro odlišení historie a delty.");
    historicalIds = classifyHistoricalOrigins(state, original.items);
  }
  if (!state.modifiedFilterVerification || Date.now() - Date.parse(state.modifiedFilterVerification.testedAt) > 86400000) {
    state.modifiedFilterVerification = await verifyModifiedPositiveControl(env, snapshot);
  }
  const delta = await loadContactDelta(env, state.checkpoint, scheduledAt, contactReadColumns(snapshot));
  phase("vistosDeltaAndPositiveControl");
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
  phase("deltaMergeAndDns");
  const domainStatuses = Object.fromEntries(Object.entries(dnsState.results || {}).map(([domain, value]) => [domain, value]));
  const cleanup = buildLeadHubDataOnlySelection(snapshot.rows, snapshot.schemaMetadata, { domainStatuses });
  phase("cleanupSelection");
  const businessEvidence = await getJson(storage, BUSINESS_CURRENT_KEY);
  if (businessEvidence) for (const result of Object.values(businessEvidence.results || {})) {
    if (result.status === "VERIFIED") { result.directIds = new Set(result.directIds); result.companyIds = new Set(result.companyIds); }
  }
  const selectedById = new Map((cleanup.dataOnly || []).map((item) => [clean(item.contactId), {
    ...item, businessFlags: businessFlagsFor(oldRowsById.get(clean(item.contactId)), businessEvidence)
  }]));
  for (const [id, profile] of Object.entries(state.profiles || {})) {
    const selected = selectedById.get(id);
    if (businessEvidence && profile.synced && profile.active && selected && profile.email === selected.normalizedEmail
      && JSON.stringify(profile.businessFlags) !== JSON.stringify(selected.businessFlags)) changedIds.add(id);
  }
  const pendingById = new Map((state.pending || []).map((item) => [clean(item.contactId), item]));
  const previousQueueTimes = new Map((state.pending || []).map(item => [item.contactId, {
    enqueuedAt: item.enqueuedAt || runStartedAt,
    enqueuedAtEvidence: item.enqueuedAtEvidence || "FIRST_OBSERVED"
  }]));
  state.identityPending ||= {};
  if (state.historicalImport && !state.unownedIdentityRecheckRequestedAt) {
    for (const [id, checked] of Object.entries(state.manifestIdentityChecks || {})) {
      if (checked.reason === "EMAIL_MATCH_WITHOUT_OWNED_USER_ID" && !state.profiles?.[id]?.synced) state.identityPending[id] = true;
    }
    state.unownedIdentityRecheckRequestedAt = new Date().toISOString();
  }
  for (const id of changedIds) {
    const selected = selectedById.get(id), checked = state.manifestIdentityChecks?.[id];
    if (selected && state.historicalImport && !state.profiles?.[id]?.synced
      && (!checked || checked.email !== selected.normalizedEmail)) state.identityPending[id] = true;
  }
  for (const id of await refreshDeltaIdentities(env, state, selectedById)) changedIds.add(id);
  for (const [id, quarantined] of Object.entries(state.quarantinedIdentities || {})) {
    state.manifestIdentityChecks ||= {};
    state.manifestIdentityChecks[id] = { ...state.manifestIdentityChecks[id],
      email: state.manifestIdentityChecks[id]?.email || quarantined.email,
      action: "SKIP", reason: quarantined.reason };
  }
  if (state.historicalImport) classifyHistoricalOrigins(state, [...historicalIds].map(contactId => ({ contactId })));

  // Rebuild ALL intents, including business refreshes queued by an older
  // capture. Stale flags must never overwrite a more recent committed state.
  let coalescedPending = 0;
  for (const [id, pendingItem] of pendingById) {
    const current = refreshPendingIntent(pendingItem, selectedById.get(id), oldRowsById.get(id), state.profiles?.[id]);
    if (current) pendingById.set(id, current);
    else { pendingById.delete(id); coalescedPending++; }
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
          historical: historicalIds.has(id),
          reason: checked?.reason || "TARGET_IDENTITY_EXPORT_REQUIRED" });
        continue;
      }
    }
    if (selected) {
      pendingById.set(id, { ...selected, desired: "active", sourceModified: clean(row?.Modified), rowHash: fingerprint(row),
        historical: historicalIds.has(id) && !previousProfile?.synced });
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

  for (const item of pendingById.values()) Object.assign(item, previousQueueTimes.get(item.contactId)
    || { enqueuedAt: runStartedAt, enqueuedAtEvidence: "ENQUEUED" });
  const quarantinedEmails = new Set(Object.values(state.quarantinedIdentities || {}).map(item => item.email));
  for (const [id, item] of pendingById) {
    if (state.quarantinedIdentities?.[id] || quarantinedEmails.has(item.normalizedEmail)) pendingById.delete(id);
  }
  for (const item of pendingById.values()) if (item.historical && !state.profiles?.[item.contactId]?.synced) {
    item.historicalKind = state.manifestIdentityChecks?.[item.contactId]?.action === "CREATE" ? "create" : "link";
  }
  const pending = prioritizePending([...pendingById.values()], state.profiles, state.queueCursor || 0, state.historicalQueueCursor || 0);
  phase("businessIdentityAndQueue");
  const batchLimit = Math.min(Number(options.batchLimit) || PROFILE_BATCH_LIMIT, PROFILE_BATCH_LIMIT);
  const current = pending.slice(0, batchLimit);
  const run = { created: 0, updated: 0, deactivated: 0, no_change: 0, skipped: 0, readbackConfirmed: 0,
    newlyCompletedProfiles: 0, newlyCreatedProfiles: 0, newlyLinkedProfiles: 0, repeatedUpdates: 0,
    restoredSubscriptions: 0, messagesSent: 0 };
  state.profiles ||= {};
  const sourceSession = delta.session;
  const columns = contactReadColumns(snapshot);
  // Persist the reconciled source and queue before any provider write.
  state.pending = pending;
  state.checkpoint = scheduledAt;
  if (delta.rows.length || !state.snapshotKey || !state.dnsKey) await commitSourceVersion(storage, state, snapshot, dnsState, writer.owner);
  else await putJson(storage, SYNC_STATE_KEY, state);
  phase("prepareAndPersist");
  const preparationElapsedMs = Date.now() - Date.parse(runStartedAt);
  console.log("vistos_leadhub_profile_sync.prepared", { version: "whole-request-budget-v1",
    elapsedMs: preparationElapsedMs, budgetMs: PROFILE_PREPARATION_BUDGET_MS, phases: metrics.phases });
  if (preparationElapsedMs >= PROFILE_PREPARATION_BUDGET_MS) {
    await env.syncApiLimiter.persist();
    return { syncStatus: "PENDING", status: "SOURCE_PREPARED", checkpoint: state.checkpoint,
      pending: state.pending.length, sourceRows: delta.rows.length, metrics,
      profileWrites: 0, readbackConfirmed: 0, messagesSent: 0, sendAllowed: false };
  }
  const commit = serialExecutor();
  const readbackCompleted = new Set();
  const releaseCommittedOperations = () => {
    for (const id of readbackCompleted) writer.unsettled.delete(id);
    writer.sideEffectsStarted = writer.unsettled.size > 0;
  };
  let dispatchedCursor = state.queueCursor || 0;
  try {
  await processBoundedProfiles(current, {
    concurrency, budgetMs: PROFILE_DISPATCH_BUDGET_MS,
    onDispatch: item => { dispatchedCursor = item.queueCursorAfter; state.historicalQueueCursor = item.historicalCursorAfter; },
    onFailure: error => {
      writer.halted = true;
      if (error.code === "leadhub_subscription_or_suppression_changed") state.safetyIncident = { code: error.code, at: new Date().toISOString() };
    }
  }, async item => {
    const wasSynced = Boolean(state.profiles?.[item.contactId]?.synced);
    item.identityBinding ||= state.profiles?.[item.contactId]?.identityBinding || state.manifestIdentityChecks?.[item.contactId]?.identityBinding;
    const operationStartedAt = new Date().toISOString();
    const timings = { startedAt: operationStartedAt, stages: [] };
    const operationKey = `${SYNC_PREFIX}/operations/${writer.owner}/${encodeURIComponent(item.contactId)}.json`;
    if (item.desired === "active") {
      const latest = await measured(env, "vistosCurrentContact", () => getVistosById(env, sourceSession, "Contact", item.contactId, columns));
      if (clean(latest.row?.Id) !== item.contactId) throw syncError("contact_current_identity_unverified", "Aktuální Contact detail nepotvrdil požadované ID.");
      if (sourceValues(latest.row, columns) !== sourceValues(oldRowsById.get(item.contactId), columns)) {
        const previous = oldRowsById.get(item.contactId);
        const differences = columns.filter(field => sourceValues(latest.row, [field]) !== sourceValues(previous, [field]))
          .map(field => ({ field, snapshotType: typeof previous?.[field], detailType: typeof latest.row?.[field],
            snapshotMissing: previous?.[field] == null, detailMissing: latest.row?.[field] == null,
            trimmedStringsEqual: clean(previous?.[field]) === clean(latest.row?.[field]),
            snapshotRecordIdPresent: previous?.[`${field}_RecordId`] != null,
            detailRecordIdPresent: latest.row?.[`${field}_RecordId`] != null,
            recordIdsEqual: previous?.[`${field}_RecordId`] != null && latest.row?.[`${field}_RecordId`] != null
              && clean(previous[`${field}_RecordId`]) === clean(latest.row[`${field}_RecordId`]) }));
        await putJson(storage, `${SYNC_PREFIX}/last-source-readback-mismatch.json`, {
          checkedAt: new Date().toISOString(), differences, snapshot: previous, detail: latest.row,
          diagnostics: latest.diagnostics, contactId: item.contactId
        });
        // Keep the item queued; the next source reconciliation must re-evaluate
        // the entire email group. Never overwrite with an old snapshot.
        throw syncError("contact_changed_before_write", "Contact detail se neshoduje se snímkem; zápis nebyl proveden.");
      }
    }
    if (item.desired === "skip") {
      await putJson(storage, operationKey, { status: "SKIP", contactId: item.contactId, reason: item.reason, finishedAt: new Date().toISOString() });
      await commit(async () => {
      state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
      if (item.historical) state.historicalImport.skipped += 1;
      run.skipped += 1;
      state.queueCursor = dispatchedCursor;
      });
      return;
    }
    await putJson(storage, operationKey, {
      status: "INTENT", contactId: item.contactId, desired: item.desired,
      sourceModified: item.sourceModified || null, rowHash: item.rowHash,
      startedAt: new Date().toISOString(), writer: writer.owner
    });
    let operationAction = item.desired === "inactive" ? "deactivated" : "updated";
    let operationSafety;
    let lastAcceptedStage;
    const beforeWrite = async (safety, progress = {}) => {
      if (!progress.stage && !progress.rejected && writer.halted) throw syncError("coordinator_halted", "Koordinátor zastavil zahajování dalších zápisů.");
      if (progress.stage === "PROFILE_ACCEPTED" || progress.stage === "TAG_ACCEPTED") lastAcceptedStage = progress.stage;
      const stage = progress.rejected ? lastAcceptedStage || "REQUEST_REJECTED" : progress.stage || "WRITE_INTENT";
      timings.stages.push({ stage, elapsedMs: Date.now() - Date.parse(operationStartedAt), providerDurationMs: progress.providerDurationMs });
      operationSafety = safety;
      if (progress.action) operationAction = progress.action;
      await putJson(storage, operationKey, {
        status: stage, httpStatus: progress.httpStatus || null, action: operationAction,
        contactId: item.contactId, normalizedEmail: item.normalizedEmail, desired: item.desired,
        businessFlags: item.businessFlags || null,
        identityBinding: item.identityBinding || null, timings,
        sourceModified: item.sourceModified || null, rowHash: item.rowHash,
        beforeSafety: safety, startedAt: new Date().toISOString(), writer: writer.owner
      });
      if (!progress.rejected || lastAcceptedStage) writer.unsettled.add(item.contactId);
      else writer.unsettled.delete(item.contactId);
      writer.sideEffectsStarted = writer.unsettled.size > 0;
    };
    let result;
    try {
      result = item.desired === "active"
        ? await upsertActiveProfile(env, item, beforeWrite)
        : await deactivateProfile(env, item, item.reason, beforeWrite);
    } catch (error) {
      if (!["leadhub_profile_identity_conflict", "leadhub_deactivation_identity_conflict", "leadhub_invalid_source_identity", "leadhub_profile_attributes_invalid"].includes(error?.code)) throw error;
      await putJson(storage, operationKey, { status: "SKIP", contactId: item.contactId, reason: error.code, finishedAt: new Date().toISOString() });
      await commit(async () => {
      state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
      if (item.historical) state.historicalImport.skipped += 1;
      state.queueCursor = dispatchedCursor;
      run.skipped += 1;
      });
      return;
    }
    operationSafety ||= { subscriptions: result.subscriptions, suppressed: result.suppressed };
    await putJson(storage, operationKey, {
      status: "READBACK_CONFIRMED", contactId: item.contactId, desired: item.desired,
      normalizedEmail: item.normalizedEmail, beforeSafety: operationSafety,
      businessFlags: item.businessFlags || null,
      identityBinding: item.identityBinding || null,
      timings: { ...timings, completedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(operationStartedAt) },
      sourceModified: item.sourceModified || null, rowHash: item.rowHash,
      finishedAt: new Date().toISOString(), writer: writer.owner, action: result.action,
      afterSafety: { subscriptions: result.subscriptions, suppressed: result.suppressed }
    });
    await commit(async () => {
    run[result.action] += 1;
    if (!wasSynced && item.desired === "active") {
      run.newlyCompletedProfiles++;
      if (item.identityBinding) run.newlyLinkedProfiles++; else run.newlyCreatedProfiles++;
    } else if (result.action === "updated") run.repeatedUpdates++;
    if (result.readback) run.readbackConfirmed += 1;
    state.profiles[item.contactId] = {
      synced: true,
      active: item.desired === "active",
      email: item.normalizedEmail,
      rowHash: item.rowHash,
      businessFlags: item.businessFlags || null,
      identityBinding: item.identityBinding || null,
      sourceModified: item.sourceModified || null,
      subscriptions: result.subscriptions,
      suppressed: result.suppressed,
      lastSyncedAt: new Date().toISOString(),
      firstCompletedAt: state.profiles[item.contactId]?.firstCompletedAt || (!wasSynced ? new Date().toISOString() : null)
    };
    state.pending = state.pending.filter(pendingItem => pendingItem.contactId !== item.contactId);
    if (item.historical) {
      state.historicalImport[result.action] = (state.historicalImport[result.action] || 0) + 1;
      state.historicalImport.readbackConfirmed += 1;
      state.historicalImport.lastReadbackAt = new Date().toISOString();
    }
    state.totals ||= { created: 0, updated: 0, deactivated: 0, subscriptionChanges: 0, messagesSent: 0 };
    state.totals[result.action] = (state.totals[result.action] || 0) + 1;
    state.queueCursor = dispatchedCursor;
    // The small READBACK_CONFIRMED journal is already durable. Keep the global
    // lock until one coherent ledger commit covers the drained bounded batch;
    // do not retransmit the entire 16 MB pending queue for every profile.
    readbackCompleted.add(item.contactId);
    });
  });
  } catch (error) {
    // Every dispatched lane has settled here. Preserve both completed ledger
    // commits and all remaining intents; never discard the undispatched tail.
    recordThroughputControl(state, concurrency, metrics, run, Date.now() - Date.parse(runStartedAt), error);
    state.lastFailure = { code: error.code || "unknown", endpointFamily: error.endpointFamily || null,
      upstreamStatus: error.upstreamStatus || null, retryAfterSeconds: error.retryAfterSeconds || 0,
      at: new Date().toISOString(), metrics, ...run };
    await putJson(storage, SYNC_STATE_KEY, state);
    releaseCommittedOperations();
    await env.syncApiLimiter.persist();
    throw error;
  }
  phase("profileOperations");
  recordThroughputControl(state, concurrency, metrics, run, Date.now() - Date.parse(runStartedAt));
  if (run.readbackConfirmed > 0) {
    state.apiReadValidation = {
      profilesRead: true,
      subscriptionsRead: true,
      validatedAt: scheduledAt,
      status: "validated_by_profile_readback"
    };
  }
  const remaining = state.pending;
  state.checkpoint = scheduledAt;
  state.status = "ACTIVE";
  state.totals ||= { created: 0, updated: 0, deactivated: 0, subscriptionChanges: 0, messagesSent: 0 };
  if (state.historicalImport) {
    state.historicalImport.remaining = remaining.filter(item => item.historical).length;
    state.historicalImport.processedUniqueProfiles = [...historicalIds].filter(id => state.profiles[id]?.synced).length;
    state.historicalImport.status = state.historicalImport.remaining ? "IMPORTING" : "COMPLETED_WITH_SKIPS";
  }
  state.lastRun = {
    status: "completed",
    writerOwner: writer.owner,
    committedContactIds: [...readbackCompleted].sort(),
    startedFrom: delta.periodFrom,
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(runStartedAt),
    pacingVersion: PACING_VERSION,
    concurrency,
    sourceThrough: scheduledAt,
    sourceRows: delta.rows.length,
    changedContacts: changedIds.size,
    coalescedPending,
    pagesRead: delta.pages,
    created: run.created,
    updated: run.updated,
    deactivated: run.deactivated,
    no_change: run.no_change,
    skipped: run.skipped,
    pending: remaining.length,
    readbackConfirmed: run.readbackConfirmed,
    newlyCompletedProfiles: run.newlyCompletedProfiles,
    newlyCreatedProfiles: run.newlyCreatedProfiles,
    newlyLinkedProfiles: run.newlyLinkedProfiles,
    repeatedUpdates: run.repeatedUpdates,
    queue: queueStats(remaining, state.profiles),
    metrics,
    restoredSubscriptions: 0,
    messagesSent: 0
  };
  state.throughputRuns = [...(state.throughputRuns || []), state.lastRun].slice(-120);
  await putJson(storage, `${SYNC_PREFIX}/runs/${scheduledAt.replace(/[:.]/g, "-")}.json`, state.lastRun);
  await putJson(storage, SYNC_STATE_KEY, state);
  releaseCommittedOperations();
  await env.syncApiLimiter.persist();
  return { syncStatus: "ACTIVE", checkpoint: state.checkpoint, ...state.lastRun, totals: state.totals };
}

export async function readVistosLeadHubProfileSyncStatus(env) {
  const state = await getJson(bucket(env), SYNC_STATE_KEY);
  if (!state) return { syncStatus: "BLOCKED", reason: "not_initialized" };
  const lock = await getJson(bucket(env), WRITER_LOCK_KEY);
  const business = await getJson(bucket(env), BUSINESS_STATE_KEY);
  const lastRun = validDate(state.lastRun?.finishedAt);
  const failureAfterSuccess = state.lastFailure && (!lastRun || Date.parse(state.lastFailure.at) > lastRun.getTime());
  const current = !state.safetyIncident && !failureAfterSuccess && lastRun && Date.now() - lastRun.getTime() < 15 * 60 * 1000 && state.lastRun?.status === "completed";
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
    lastFailure: state.lastFailure || null,
    safetyIncident: state.safetyIncident || null,
    quarantinedProfiles: Object.keys(state.quarantinedIdentities || {}).length,
    historicalImport: state.historicalImport || null,
    identityChecksPending: Object.keys(state.identityPending || {}).length,
    identityExport: state.identityExport ? { status: state.identityExport.status, requestedAt: state.identityExport.requestedAt } : null,
    lastIdentityExport: state.lastIdentityExport || null,
    businessRelations: business ? { startedAt: business.startedAt, completedAt: business.completedAt || null,
      blocks: business.blocks, results: business.summary } : null,
    subscriptionsWriteEnabled: false,
    historicalBulkImportEnabled: Boolean(state.historicalImport),
    messagesEnabled: false
  };
}

export const __test = {
  API_SPACING_MS,
  retryAfterSeconds,
  profileConcurrency,
  recordThroughputControl,
  leadHubRequest,
  readbackProfile,
  createApiLimiter,
  processBoundedProfiles,
  serialExecutor,
  queueStats,
  pendingClass,
  classifyHistoricalOrigins,
  refreshPendingIntent,
  hydrateBusinessRow,
  profileIdentityMatches,
  tagDataMatches,
  businessFlagsFor,
  compactBusinessRow,
  verifyBusinessPasses,
  BUSINESS_DEFINITIONS,
  refreshDeltaIdentities,
  prioritizePending,
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
