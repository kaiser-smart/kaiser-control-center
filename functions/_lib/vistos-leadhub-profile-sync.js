import {
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
const LEADHUB_BASE_URL = "https://api.leadhub.co";
const CONTACT_PAGE_SIZE = 1000;
const PROFILE_BATCH_LIMIT = 10;
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
  const expected = Number(first.filtered) || first.rows.length;
  const pages = Math.max(1, Math.ceil(expected / CONTACT_PAGE_SIZE));
  const rows = [...first.rows];
  for (let page = 1; page < pages; page += 1) {
    const result = await getVistosPage(env, session, "Contact", columns, filter, page * CONTACT_PAGE_SIZE, CONTACT_PAGE_SIZE);
    rows.push(...result.rows);
  }
  assertModifiedWindow(rows, from, to);
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
  return `vistos-contact-${clean(contactId)}`.slice(0, 50);
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
  const states = Array.isArray(subscriptions.payload?.subscriptions) ? subscriptions.payload.subscriptions : [];
  return {
    subscriptions: states.map((row) => ({ code: clean(row?.code), state: clean(row?.state) })),
    suppressed: suppressed.payload?.is_suppressed === true
  };
}

async function upsertActiveProfile(env, item) {
  const email = item.normalizedEmail;
  const encoded = encodeURIComponent(email);
  const before = await leadHubRequest(env, `/profiles/email-address/${encoded}`, { allow404: true });
  const safety = await subscriptionRead(env, email);
  await leadHubRequest(env, "/profiles", {
    method: "PUT",
    body: {
      user_id: profileUserId(item.contactId),
      email_address: email,
      first_name: item.firstName || null,
      last_name: item.lastName || null
    }
  });
  await leadHubRequest(env, "/profiles/tags", {
    method: "POST",
    body: tagPayload(item, true, "", safety)
  });
  const readback = await readbackProfile(env, email, (payload) => {
    const tags = Array.isArray(payload?.tags) ? payload.tags : [];
    const tag = tags.find((row) => clean(row?.name) === TAG_NAME);
    return clean(payload?.credentials?.email_address).toLowerCase() === email
      && Number(tag?.data?.targeting_enabled) === 1;
  });
  if (!readback) {
    const error = new Error("LeadHub profil nebyl po zápisu potvrzen zpětným čtením.");
    error.status = 502;
    error.code = "leadhub_profile_readback_failed";
    throw error;
  }
  return {
    action: before.status === 404 ? "created" : "updated",
    subscriptions: safety.subscriptions,
    suppressed: safety.suppressed,
    readback: true
  };
}

async function deactivateProfile(env, item, reason) {
  const email = clean(item.normalizedEmail);
  const safety = email ? await subscriptionRead(env, email) : { subscriptions: [], suppressed: false };
  if (email) {
    const existing = await leadHubRequest(env, `/profiles/email-address/${encodeURIComponent(email)}`, { allow404: true });
    if (existing.status === 404) {
      return { action: "deactivated", subscriptions: safety.subscriptions, suppressed: safety.suppressed, readback: true, profileAlreadyAbsent: true };
    }
  }
  await leadHubRequest(env, "/profiles/tags", {
    method: "POST",
    body: tagPayload(item, false, reason || "FILTERED_OUT", safety)
  });
  if (email) {
    const readback = await readbackProfile(env, email, (payload) => {
      const tags = Array.isArray(payload?.tags) ? payload.tags : [];
      const tag = tags.find((row) => clean(row?.name) === TAG_NAME);
      return Number(tag?.data?.targeting_enabled) === 0;
    });
    if (!readback) {
      const error = new Error("Vyřazení LeadHub profilu nebylo potvrzeno zpětným čtením.");
      error.status = 502;
      error.code = "leadhub_profile_deactivation_readback_failed";
      throw error;
    }
  }
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

export async function runVistosLeadHubProfileSync(env, options = {}) {
  const storage = bucket(env);
  const scheduledAt = (validDate(options.scheduledAt) || new Date()).toISOString();
  let state = await getJson(storage, SYNC_STATE_KEY);
  if (!state) return initializeState(env, scheduledAt);
  const [snapshot, dnsState] = await Promise.all([
    getJson(storage, SYNC_SNAPSHOT_KEY),
    getJson(storage, SYNC_DNS_KEY)
  ]);
  if (!snapshot || !dnsState) {
    const error = new Error("Synchronizační Contact snapshot nebo DNS stav chybí.");
    error.status = 409;
    error.code = "vistos_leadhub_sync_state_incomplete";
    throw error;
  }

  const oldRowsById = new Map(snapshot.rows.map((row) => [clean(row?.Id), row]));
  const delta = await loadContactDelta(env, state.checkpoint, scheduledAt, snapshot.rows.length ? Object.keys(snapshot.rows[0]) : ["Id", "Modified"]);
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

  for (const id of changedIds) {
    const row = oldRowsById.get(id);
    const email = normalizeContactEmail(row?.Email1);
    const selected = selectedById.get(id);
    const previousProfile = state.profiles?.[id];
    if (selected) {
      pendingById.set(id, { ...selected, desired: "active", sourceModified: clean(row?.Modified), rowHash: fingerprint(row) });
    } else if (previousProfile?.synced) {
      pendingById.set(id, {
        contactId: id,
        normalizedEmail: email || previousProfile.email,
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
  const current = pending.slice(0, PROFILE_BATCH_LIMIT);
  const remaining = pending.slice(PROFILE_BATCH_LIMIT);
  const run = { created: 0, updated: 0, deactivated: 0, readbackConfirmed: 0, restoredSubscriptions: 0, messagesSent: 0 };
  state.profiles ||= {};
  for (const item of current) {
    const result = item.desired === "active"
      ? await upsertActiveProfile(env, item)
      : await deactivateProfile(env, item, item.reason);
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
  state.totals.created += run.created;
  state.totals.updated += run.updated;
  state.totals.deactivated += run.deactivated;
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
    pending: remaining.length,
    readbackConfirmed: run.readbackConfirmed,
    restoredSubscriptions: 0,
    messagesSent: 0
  };
  await Promise.all([
    putJson(storage, SYNC_SNAPSHOT_KEY, snapshot),
    putJson(storage, SYNC_DNS_KEY, dnsState),
    putJson(storage, SYNC_STATE_KEY, state),
    putJson(storage, `${SYNC_PREFIX}/runs/${scheduledAt.replace(/[:.]/g, "-")}.json`, state.lastRun)
  ]);
  return { syncStatus: "ACTIVE", checkpoint: state.checkpoint, ...state.lastRun, totals: state.totals };
}

export async function readVistosLeadHubProfileSyncStatus(env) {
  const state = await getJson(bucket(env), SYNC_STATE_KEY);
  if (!state) return { syncStatus: "BLOCKED", reason: "not_initialized" };
  return {
    syncStatus: state.status,
    trigger: "Cloudflare Cron",
    intervalMinutes: 5,
    checkpoint: state.checkpoint,
    initializedAt: state.initializedAt,
    baselineRunId: state.baselineRunId,
    apiReadValidation: state.apiReadValidation,
    pending: state.pending?.length || 0,
    totals: state.totals,
    lastRun: state.lastRun,
    subscriptionsWriteEnabled: false,
    historicalBulkImportEnabled: false,
    messagesEnabled: false
  };
}

export const __test = {
  assertModifiedWindow,
  profileUserId,
  tagPayload,
  fingerprint,
  PROFILE_BATCH_LIMIT,
  TAG_NAME
};
