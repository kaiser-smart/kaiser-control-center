import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import worker, { runScheduledSync } from "../workers/vistos-leadhub-profile-sync-runner.js";
import { __test, buildLeadHubImportManifest, runVistosLeadHubProfileSync, withVistosLeadHubWriter, prepareVistosLeadHubHistoricalImport, executeVistosLeadHubHistoricalImport, verifyCompleteContactCapture } from "../functions/_lib/vistos-leadhub-profile-sync.js";
import { onRequestGet, onRequestPost } from "../functions/api/receivables/vistos/leadhub-sync-internal.js";

class MemoryR2 {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? null : { json: async () => JSON.parse(value), httpEtag: `"${__test.fingerprint(value)}"` };
  }
  async head(key) { return this.values.has(key) ? { key } : null; }
  async put(key, value, options = {}) {
    if (options.onlyIf?.get("If-None-Match") === "*" && this.values.has(key)) return null;
    if (options.onlyIf?.get("If-Match") && options.onlyIf.get("If-Match") !== `"${__test.fingerprint(this.values.get(key))}"`) return null;
    this.values.set(key, String(value));
    return { key };
  }
  async delete(key) { this.values.delete(key); }
  async list({ prefix, limit }) {
    const matches = [...this.values.keys()].filter(key => key.startsWith(prefix));
    return { objects: matches.slice(0, limit).map(key => ({ key })), truncated: matches.length > limit };
  }
}

const lockR2 = new MemoryR2();
let unlockFirst;
let firstAcquired;
const acquiredSignal = new Promise(resolve => { firstAcquired = resolve; });
const held = new Promise(resolve => { unlockFirst = resolve; });
const writerOne = withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async () => { firstAcquired(); await held; return "first"; });
await acquiredSignal;
await assert.rejects(() => withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async () => assert.fail("second writer entered")), error => error.code === "vistos_leadhub_writer_locked");
unlockFirst();
assert.equal(await writerOne, "first");
assert.equal(await withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async () => "next"), "next");
await assert.rejects(() => withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async () => { throw new Error("read failed"); }), /read failed/);
assert.equal(lockR2.values.size, 0, "read-only failures release the writer");
await assert.rejects(() => withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async context => { context.sideEffectsStarted = true; throw new Error("provider result unknown"); }), /provider result unknown/);
await assert.rejects(() => withVistosLeadHubWriter({ R2_ARCHIVE: lockR2 }, async () => assert.fail("uncertain write was retried")), error => error.code === "vistos_leadhub_writer_locked");

const baselineRunId = "baseline-contact-run";
const baselineSnapshot = {
  runId: baselineRunId,
  rows: [{ Id: "1", Email1: "old@example.com", FirstName: "Old", LastName: "Contact", Modified: "2026-09-10T09:00:00Z" }],
  schemaMetadata: []
};
const baselineDns = { runId: baselineRunId, domains: ["example.com"], results: { "example.com": { status: "VALID_DOMAIN", checkedAt: "2026-09-10T09:00:00Z" } } };
const r2 = new MemoryR2({
  "protected-audits/vistos-contact-cleanup-v4/latest.json": JSON.stringify({ runId: baselineRunId }),
  [`protected-audits/vistos-contact-cleanup-v4/${baselineRunId}/contact-snapshot.json`]: JSON.stringify(baselineSnapshot),
  [`protected-audits/vistos-contact-cleanup-v4/${baselineRunId}/dns-state.json`]: JSON.stringify(baselineDns)
});
const originalFetch = globalThis.fetch;
const safeRead = (states = [], suppressed = false) => __test.parseSubscriptionSafety(
  { status: 200, payload: { subscriptions: states } },
  { status: 200, payload: { is_suppressed: suppressed } }
);
assert.deepEqual(safeRead(), { subscriptions: [], suppressed: false });
for (const invalid of [
  [{ status: 404, payload: null }, { status: 200, payload: { is_suppressed: false } }],
  [{ status: 200, payload: { subscriptions: [] } }, { status: 404, payload: null }],
  [{ status: 200, payload: {} }, { status: 200, payload: { is_suppressed: false } }],
  [{ status: 200, payload: { subscriptions: [] } }, { status: 200, payload: { is_suppressed: null } }],
  [{ status: 200, payload: { subscriptions: [{ code: "news", state: "unknown" }] } }, { status: 200, payload: { is_suppressed: false } }],
  [{ status: 200, payload: { subscriptions: [{ code: "news", state: "subscribed" }, { code: "news", state: "unsubscribed" }] } }, { status: 200, payload: { is_suppressed: false } }]
]) assert.throws(() => __test.parseSubscriptionSafety(...invalid), error => error.code === "leadhub_safety_read_unverified");
const twoStates = [{ code: "news", state: "unsubscribed" }, { code: "other", state: "subscribed" }];
assert.doesNotThrow(() => __test.assertSafetyUnchanged(safeRead(twoStates), safeRead([...twoStates].reverse())));
assert.throws(() => __test.assertSafetyUnchanged(safeRead(twoStates), safeRead(twoStates, true)), error => error.code === "leadhub_subscription_or_suppression_changed");
assert.throws(() => __test.assertSafetyUnchanged(safeRead(twoStates), safeRead()), error => error.code === "leadhub_subscription_or_suppression_changed");
assert.throws(() => __test.profileUserId("9".repeat(60)), error => error.code === "leadhub_invalid_source_identity");
assert.throws(() => __test.profileUserId(""), error => error.code === "leadhub_invalid_source_identity");
const selected = { contactId: "42", normalizedEmail: "person@example.test", firstName: "Radim", lastName: "", communicationStatus: "UNKNOWN" };
const owned = {
  credentials: { user_id: "vistos-contact-42", email_address: "person@example.test", first_name: "Radim", last_name: "Existing surname" },
  tags: [__test.tagPayload(selected, true, "", { suppressed: false }).tag]
};
function plan(items = [selected], profiles = [], overrides = {}) {
  return buildLeadHubImportManifest(items, profiles, {
    workspaceId: "8d8bf07372ad4244877308cbd94c8e78", sourceRunId: "synthetic-source",
    sourceCount: items.length, exportCount: profiles.length, exportState: "done",
    exportJobId: "synthetic-export", allProfiles: true, ...overrides
  });
}
globalThis.fetch = async () => { throw new Error("manifest must never call an API"); };
try {
  assert.equal(plan().items[0].action, "CREATE");
  assert.equal(plan([selected], [owned]).items[0].action, "NO_CHANGE", "missing source surname does not clear existing surname");
  assert.equal(plan([{ ...selected, firstName: "Martin" }], [owned]).items[0].action, "UPDATE");
  assert.equal(plan().readyForImport, false);
  assert.equal(plan().sendAllowed, false);
  assert.equal(plan().items[0].requiresPreflight, true);
  assert.equal(plan([{ ...selected, normalizedEmail: "bad address@example.test" }]).items[0].reason, "INVALID_SOURCE_IDENTITY");
  assert.equal(plan([selected], [{ ...owned, credentials: { ...owned.credentials, user_id: " vistos-contact-42 " } }]).items[0].reason, "NON_CANONICAL_TARGET_USER_ID");
  for (const overrides of [{ sourceCount: 2 }, { exportCount: 1 }, { exportState: "waiting" }, { allProfiles: false }, { workspaceId: "other" }, { sourceRunId: "" }]) {
    assert.equal(plan([selected], [], overrides).status, "BLOCKED");
  }
  for (const malformed of [{}, { credentials: [] }, { credentials: {} }, { credentials: { email_address: null, user_id: 42 } }]) {
    assert.equal(plan([selected], [malformed]).reason, "MALFORMED_PROFILE_EXPORT");
  }
  assert.equal(plan([selected], [{ credentials: null, tags: null }]).items[0].action, "CREATE");
  const emailOnly = { ...owned, credentials: { ...owned.credentials, user_id: null } };
  assert.equal(plan([selected], [emailOnly]).items[0].reason, "EMAIL_MATCH_WITHOUT_OWNED_USER_ID");
  const otherEmail = { ...owned, credentials: { ...owned.credentials, email_address: "other@example.test" } };
  assert.equal(plan([selected], [otherEmail]).items[0].reason, "EMAIL_CHANGE_REQUIRES_IDENTITY_RESOLUTION");
  assert.equal(plan([selected], [emailOnly, otherEmail]).items[0].reason, "EMAIL_AND_USER_ID_MATCH_DIFFERENT_PROFILES");
  assert.equal(plan([selected], [owned, owned]).items[0].reason, "DUPLICATE_TARGET_IDENTITY");
  assert.equal(plan([selected, selected]).counts.SKIP, 2);
  assert.equal(plan([selected, { ...selected, contactId: "43", normalizedEmail: " PERSON@EXAMPLE.TEST " }]).counts.SKIP, 2);
  assert.equal(plan([{ ...selected, contactId: "9".repeat(60) }]).items[0].reason, "INVALID_SOURCE_IDENTITY", "never truncate user IDs into a collision");
  assert.equal(plan([selected], [{ ...owned, tags: null }]).items[0].reason, "TARGET_TAGS_UNKNOWN");
  assert.equal(plan([selected], [{ ...owned, tags: [...owned.tags, ...owned.tags] }]).items[0].reason, "DUPLICATE_INTEGRATION_TAG");
  const conflictingTag = structuredClone(owned);
  conflictingTag.tags[0].data.vistos_contact_id = "43";
  assert.equal(plan([selected], [conflictingTag]).items[0].reason, "INTEGRATION_TAG_IDENTITY_CONFLICT");
  const unrelated = { ...owned, credentials: { ...owned.credentials, phone: "+420123456789" }, tags: [...owned.tags, { name: "unrelated" }] };
  const beforePlanning = JSON.stringify(unrelated);
  assert.equal(plan([selected], [unrelated]).items[0].action, "NO_CHANGE");
  assert.equal(JSON.stringify(unrelated), beforePlanning, "planning must preserve all input data");
  const mixed = plan([selected, { ...selected, contactId: "43", normalizedEmail: "new@example.test" }], [emailOnly]);
  assert.deepEqual(mixed.counts, { CREATE: 1, UPDATE: 0, NO_CHANGE: 0, SKIP: 1 }, "one collision does not block independent rows");
} finally {
  globalThis.fetch = originalFetch;
}
let initializationFetches = 0;
globalThis.fetch = async () => { initializationFetches += 1; throw new Error("initialization must not call LeadHub"); };
const initialized = await runVistosLeadHubProfileSync({ R2_ARCHIVE: r2, LEADHUB_API_TOKEN: "test-api-token" }, { scheduledAt: "2026-09-10T10:00:00Z" });
globalThis.fetch = originalFetch;
assert.equal(initialized.syncStatus, "ACTIVE");
assert.equal(initialized.checkpoint, "2026-09-10T10:00:00.000Z");
assert.equal(initialized.historicalProfilesImported, 0, "initial checkpoint must not bulk-import the baseline");
assert.equal(initializationFetches, 0);
assert.equal(initialized.apiReadValidation.status, "deferred_until_first_profile_delta");
globalThis.fetch = async () => assert.fail("a late runner must not perform external reads or writes");
const priorState = r2.values.get("protected-sync/vistos-leadhub-profiles/state.json");
try {
  const stale = await runVistosLeadHubProfileSync({ R2_ARCHIVE: r2 }, { scheduledAt: "2026-09-10T09:55:00Z" });
  assert.equal(stale.status, "stale_schedule_skipped");
  assert.equal(r2.values.get("protected-sync/vistos-leadhub-profiles/state.json"), priorState, "checkpoint cannot rewind");
} finally { globalThis.fetch = originalFetch; }

// A matching address alone is never permission to attach/replace user_id.
const identityCalls = [];
globalThis.fetch = async (url, options) => {
  identityCalls.push({ url, method: options.method });
  assert.equal(options.method, "GET");
  return Response.json({ credentials: { email_address: selected.normalizedEmail, user_id: "foreign-id" } });
};
try {
  await assert.rejects(() => __test.upsertActiveProfile({ LEADHUB_API_TOKEN: "test" }, selected), error => error.code === "leadhub_profile_identity_conflict");
  assert.equal(identityCalls.length, 1);
} finally { globalThis.fetch = originalFetch; }

const safetyCalls = [];
globalThis.fetch = async (url, options) => {
  safetyCalls.push(options.method);
  assert.equal(options.method, "GET");
  return new Response(null, { status: 404 });
};
try {
  await assert.rejects(() => __test.upsertActiveProfile({ LEADHUB_API_TOKEN: "test" }, selected), error => error.code === "leadhub_safety_read_unverified");
  assert.equal(safetyCalls.length, 3, "unknown pre-write safety stops before profile creation");
} finally { globalThis.fetch = originalFetch; }

const preparedR2 = new MemoryR2({
  "protected-audits/vistos-contact-cleanup-v4/latest.json": JSON.stringify({ runId: baselineRunId }),
  "protected-sync/vistos-leadhub-profiles/contact-snapshot.json": JSON.stringify(baselineSnapshot),
  "protected-sync/vistos-leadhub-profiles/dns-state.json": JSON.stringify(baselineDns)
});
globalThis.fetch = async () => { throw new Error("prepared initialization must not call LeadHub"); };
const preparedInitialization = await runVistosLeadHubProfileSync({ R2_ARCHIVE: preparedR2, LEADHUB_API_TOKEN: "test-api-token" }, { scheduledAt: "2026-09-10T10:01:00Z" });
globalThis.fetch = originalFetch;
assert.equal(preparedInitialization.historicalProfilesImported, 0);
assert.ok(preparedR2.values.has("protected-sync/vistos-leadhub-profiles/state.json"));

assert.doesNotThrow(() => __test.assertModifiedWindow(
  [{ Id: "2", Modified: "2026-09-10T10:01:00Z" }],
  new Date("2026-09-10T09:50:00Z"),
  new Date("2026-09-10T10:05:00Z")
));
assert.throws(
  () => __test.assertModifiedWindow([{ Id: "2", Modified: "2026-09-09T10:01:00Z" }], new Date("2026-09-10T09:50:00Z"), new Date("2026-09-10T10:05:00Z")),
  (error) => error?.code === "vistos_contact_modified_filter_unreliable"
);

const activeTag = __test.tagPayload({ contactId: "117428", communicationStatus: "UNKNOWN" }, true, "", { suppressed: false });
assert.equal(activeTag.tag.name, "eSMART Vistos DATA_ONLY");
assert.equal(activeTag.tag.data.data_only, 1);
assert.equal(activeTag.tag.data.targeting_enabled, 1);
assert.equal(activeTag.tag.data.newsletter_permission, "UNKNOWN");
const inactiveTag = __test.tagPayload({ contactId: "117428", communicationStatus: "UNKNOWN" }, false, "LEFT_COMPANY_TRUE", { suppressed: true });
assert.equal(inactiveTag.tag.data.data_only, 0);
assert.equal(inactiveTag.tag.data.targeting_enabled, 0);
assert.equal(inactiveTag.tag.data.exclusion_reason, "LEFT_COMPANY_TRUE");

const source = readFileSync(new URL("../functions/_lib/vistos-leadhub-profile-sync.js", import.meta.url), "utf8");
const config = readFileSync(new URL("../wrangler.vistos-leadhub-profile-sync-runner.toml", import.meta.url), "utf8");
assert.match(source, /method: "PUT"/);
assert.match(source, /\/subscriptions\/email-address\//);
assert.doesNotMatch(source, /subscriptions[^\n]+method: "POST"/);
assert.match(config, /crons = \["\* \* \* \* \*"\]/);
assert.match(config, /RUN_MODE = "execute-import"/);

const unauthorized = await onRequestPost({
  request: new Request("https://example.test/api/receivables/vistos/leadhub-sync-internal", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" },
    body: "{}"
  }),
  env: { VISTOS_LEADHUB_SYNC_TOKEN: "expected" }
});
assert.equal(unauthorized.status, 401);
assert.equal((await unauthorized.json()).code, "vistos_leadhub_sync_unauthorized");
const method = await onRequestGet();
assert.equal(method.status, 405);

const preflightCalls = [];
const preflightR2 = new MemoryR2({ "protected-sync/vistos-leadhub-profiles/state.json": priorState });
preflightR2.put = async () => assert.fail("read preflight cannot change a checkpoint or lock");
globalThis.fetch = async (url, options) => {
  preflightCalls.push({ url, method: options.method });
  if (new URL(url).hostname.toLowerCase() === "kaiserservis.myvistos.com") {
    if (options.method === "HEAD") return new Response(null, { status: 200 });
    const payload = JSON.parse(options.body);
    if (payload.LoginParam) return Response.json({ status: "OK" }, { headers: { "Set-Cookie": "VistosAccessToken=synthetic; Secure; HttpOnly" } });
    assert.equal(payload.GetPageParam.EntityName, "Contact");
    assert.equal(payload.GetPageParam.Length, 1);
    return Response.json({ status: "OK", data: { recordsTotal: 1, recordsFiltered: 1, data: [{ Id: "synthetic" }] } });
  }
  assert.equal(options.method, "GET");
  if (url.includes("/email-address/")) return new Response(null, { status: 404 });
  return Response.json([]);
};
try {
  const preflight = await onRequestPost({ request: new Request("https://example.test/internal", {
    method: "POST", headers: { Authorization: "Bearer expected" }, body: JSON.stringify({ mode: "read-preflight" })
  }), env: { VISTOS_LEADHUB_SYNC_TOKEN: "expected", LEADHUB_API_TOKEN: "synthetic", R2_ARCHIVE: preflightR2,
    VISTOS_API_BASE_URL: "https://KaiserServis.myvistos.com/API/VistosAPI", VISTOS_API_USERNAME: "synthetic", VISTOS_API_PASSWORD: "synthetic" } });
  const payload = await preflight.json();
  assert.equal(payload.status, "BLOCKED");
  assert.equal(payload.checks.vistosContactRead.status, "PASS");
  assert.equal(payload.checks.leadHubAbsentSafetyRead.subscriptionsHttpStatus, 404);
  assert.equal(payload.checks.leadHubAbsentSafetyRead.suppressionHttpStatus, 404);
  assert.equal(payload.readyForImport, false);
  assert.equal(payload.sendAllowed, false);
  assert.equal(payload.writes, 0);
  assert.ok(!JSON.stringify(payload).includes("synthetic"), "no credentials or contact values in readback");
  assert.equal(preflightCalls.length, 9);
  assert.equal(payload.checks.vistosConfiguration.documentedEndpointMatches, true);
  assert.equal(payload.checks.vistosOriginReachable.httpStatus, 200);
} finally { globalThis.fetch = originalFetch; }

for (const campaign of [
  { campaign_type: "incremental-emailing", state: "active" },
  { campaign_type: "targeted-emailing", state: "scheduled" },
  { campaign_type: "incremental-sms", state: "unknown" },
  { campaign_type: "unrecognized", state: "draft" }
]) {
  globalThis.fetch = async (_url, options) => { assert.equal(options.method, "GET"); return Response.json([campaign]); };
  try { await assert.rejects(() => __test.readCampaignSafety({ LEADHUB_API_TOKEN: "synthetic" }), error => error.code === "leadhub_message_campaign_blocks_write"); }
  finally { globalThis.fetch = originalFetch; }
}
globalThis.fetch = async () => Response.json([{ campaign_type: "popup", state: "active" }, { campaign_type: "incremental-emailing", state: "archived" }]);
try { assert.equal((await __test.readCampaignSafety({ LEADHUB_API_TOKEN: "synthetic" })).activeMessageCampaigns, 0); }
finally { globalThis.fetch = originalFetch; }
globalThis.fetch = async () => Response.json({ error: "missing scope" }, { status: 403 });
try { await assert.rejects(() => __test.readCampaignSafety({ LEADHUB_API_TOKEN: "synthetic" }), error => error.upstreamStatus === 403); }
finally { globalThis.fetch = originalFetch; }
const guardedWrites = [];
globalThis.fetch = async (url, options) => {
  guardedWrites.push(options.method);
  assert.equal(options.method, "GET");
  if (url.includes("/campaigns?")) return Response.json({ error: "missing scope" }, { status: 403 });
  if (url.includes("/suppressed")) return Response.json({ is_suppressed: false });
  if (url.includes("/subscriptions/")) return Response.json({ subscriptions: [] });
  return new Response(null, { status: 404 });
};
try {
  await assert.rejects(() => __test.upsertActiveProfile({ LEADHUB_API_TOKEN: "synthetic" }, selected,
    async () => assert.fail("write intent cannot start without campaign safety")), error => error.upstreamStatus === 403);
  assert.equal(guardedWrites.length, 4);
} finally { globalThis.fetch = originalFetch; }

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return Response.json({ syncStatus: "ACTIVE", checkpoint: "2026-09-10T10:05:00Z", created: 0, updated: 0, deactivated: 0 });
};
try {
  const summary = await runScheduledSync({ APP_BASE_URL: "https://smart-odpady.ai", VISTOS_LEADHUB_SYNC_TOKEN: "runner-secret" }, Date.parse("2026-09-10T10:05:00Z"));
  assert.equal(summary.syncStatus, "ACTIVE");
  assert.equal(calls[0].options.headers.Authorization, "Bearer runner-secret");
  const pending = [];
  await worker.scheduled({ cron: "*/5 * * * *", scheduledTime: Date.parse("2026-09-10T10:10:00Z") }, { APP_BASE_URL: "https://smart-odpady.ai", VISTOS_LEADHUB_SYNC_TOKEN: "runner-secret" }, { waitUntil(promise) { pending.push(promise); } });
  assert.equal(pending.length, 1);
  await Promise.all(pending);
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async () => new Response("upstream unavailable", {
  status: 502,
  headers: { "content-type": "text/plain", "cf-ray": "test-ray" }
});
try {
  await assert.rejects(
    () => runScheduledSync({ APP_BASE_URL: "https://smart-odpady.ai", VISTOS_LEADHUB_SYNC_TOKEN: "runner-secret" }, Date.parse("2026-09-10T10:15:00Z")),
    (error) => error?.status === 502 && error?.responseType === "text/plain" && error?.responseSnippet === "upstream unavailable"
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Vistos → LeadHub profile sync tests passed");

assert.equal(verifyCompleteContactCapture([[{ Id: "1" }], [{ Id: "2" }]], 2).length, 2);
for (const pages of [[[{ Id: "1" }], [{ Id: "1" }]], [[{ Id: "1" }]], [[{ Id: "1" }], [{}]]]) {
  assert.throws(() => verifyCompleteContactCapture(pages, 2), error => error.code === "contact_capture_incomplete");
}
const preparationRow = { Id: "101", Email1: "synthetic-person@example.test", FirstName: "Radim", LastName: "", DoNotWorkCompany: false, Parent_FK: null, Modified: "2026-09-11T00:00:00Z" };
const preparationSchema = Object.keys(preparationRow).map(field => ({ field, caption: field === "DoNotWorkCompany" ? "Už nepracuje ve firmě" : field, datatype: field === "DoNotWorkCompany" ? "Boolean" : "String" }));
const preparationR2 = new MemoryR2({
  "protected-sync/vistos-leadhub-profiles/state.json": priorState,
  "protected-sync/vistos-leadhub-profiles/contact-snapshot.json": JSON.stringify({ rows: [preparationRow], schemaMetadata: preparationSchema }),
  "protected-sync/vistos-leadhub-profiles/dns-state.json": JSON.stringify({ results: { "example.test": { status: "VALID_DOMAIN", checkedAt: "2026-09-10T00:00:00Z" } } })
});
let exportJobsCreated = 0;
const preparationEnv = { R2_ARCHIVE: preparationR2, LEADHUB_API_TOKEN: "synthetic", VISTOS_API_BASE_URL: "https://vistos.example.test", VISTOS_API_USERNAME: "synthetic", VISTOS_API_PASSWORD: "synthetic" };
assert.ok(!__test.contactReadColumns({ rows: [{ ...preparationRow, id: "101", Parent_FK_RecordId: 1 }], schemaMetadata: preparationSchema }).includes("id"));
assert.ok(!__test.contactReadColumns({ rows: [{ ...preparationRow, id: "101", Parent_FK_RecordId: 1 }], schemaMetadata: preparationSchema }).includes("Parent_FK_RecordId"));
globalThis.fetch = async (url, options) => {
  if (url.startsWith("https://vistos.example.test")) {
    const payload = JSON.parse(options.body);
    if (payload.LoginParam) return Response.json({ status: "OK" }, { headers: { "Set-Cookie": "VistosAccessToken=synthetic; Secure" } });
    assert.ok(payload.GetPageParam);
    if (payload.GetPageParam.Filter) return Response.json({ status: "OK", data: { recordsTotal: 1, recordsFiltered: 0, data: [] } });
    return Response.json({ status: "OK", data: { recordsTotal: 1, recordsFiltered: 1, data: [preparationRow] } });
  }
  if (url.endsWith("/segments/query/profiles")) {
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { segments: [{ targetingBlocks: [] }] });
    exportJobsCreated += 1; return Response.json({ job_id: "synthetic-export-job" }, { status: 202 });
  }
  assert.ok(!options.method || options.method === "GET", "preparation cannot mutate LeadHub profiles or subscriptions");
  if (url.endsWith("/segments")) return Response.json([{ id: "b17444f7663241a0adb31b9a47dcf1a0" }]);
  if (url.endsWith("/result")) return new Response(gzipSync(""));
  return Response.json({ job_id: "synthetic-export-job", state: "done", errors: null, created_date: "2026-09-11T00:00:00Z" });
};
try {
  let prepared;
  for (let step = 0; step < 5; step += 1) prepared = await prepareVistosLeadHubHistoricalImport(preparationEnv);
  assert.equal(prepared.phase, "MANIFEST_READY");
  assert.deepEqual(prepared.counts, { CREATE: 1, UPDATE: 0, NO_CHANGE: 0, SKIP: 0 });
  assert.equal(prepared.profileWrites, 0);
  assert.equal(prepared.readyForImport, false);
  assert.equal(preparationR2.values.get("protected-sync/vistos-leadhub-profiles/state.json"), priorState);
  await prepareVistosLeadHubHistoricalImport(preparationEnv);
  assert.equal(exportJobsCreated, 1, "completed preparation is repeatable without another export job");
} finally { globalThis.fetch = originalFetch; }
console.log("Vistos → LeadHub historical preparation tests passed");

const syncStateKey = "protected-sync/vistos-leadhub-profiles/state.json";
assert.equal(__test.sourceValues({ Parent_FK: "Synthetic company", Parent_FK_RecordId: 20 }, ["Parent_FK"]),
  __test.sourceValues({ Parent_FK: 20, Parent_FK_Caption: "Synthetic company" }, ["Parent_FK"]));
assert.notEqual(__test.sourceValues({ Parent_FK: "Synthetic company", Parent_FK_RecordId: 20 }, ["Parent_FK"]),
  __test.sourceValues({ Parent_FK: 21, Parent_FK_Caption: "Synthetic company" }, ["Parent_FK"]), "equal captions do not hide a changed company ID");
assert.notEqual(__test.sourceValues({ Parent_FK: "Synthetic company" }, ["Parent_FK"]),
  __test.sourceValues({ Parent_FK: 20 }, ["Parent_FK"]), "missing FK identity is not inferred from its caption");
assert.notEqual(__test.sourceValues({ DoNotWorkCompany: false }, ["DoNotWorkCompany"]),
  __test.sourceValues({}, ["DoNotWorkCompany"]), "FK normalization must not change UNKNOWN to false");
const importedProfiles = new Map();
let providerWrites = 0, currentSourceRow = preparationRow;
let deltaSourceRows = [];
let existingStates = [{ code: "newsletters", state: "unsubscribed" }];
let changeSafetyAfterWrite = false;
let standaloneSafetyTest = false, safetyChangeThreshold = Infinity;
globalThis.fetch = async (url, options) => {
  if (url.startsWith("https://vistos.example.test")) {
    const payload = JSON.parse(options.body);
    if (payload.LoginParam) return Response.json({ status: "OK" }, { headers: { "Set-Cookie": "VistosAccessToken=synthetic; Secure" } });
    if (payload.GetByIdParam) return Response.json({ status: "OK", data: currentSourceRow });
    assert.ok(payload.GetPageParam.Filter);
    if (payload.GetPageParam.Columns.length === 2) return Response.json({ status: "OK", data: {
      recordsTotal: 1, recordsFiltered: 1, data: [{ Id: preparationRow.Id, Modified: preparationRow.Modified }]
    } });
    return Response.json({ status: "OK", data: { recordsTotal: 1, recordsFiltered: deltaSourceRows.length, data: deltaSourceRows } });
  }
  if (url.endsWith("/segments")) return Response.json([{ id: "b17444f7663241a0adb31b9a47dcf1a0" }]);
  if (url.includes("/campaigns?")) return Response.json([{ campaign_type: "popup", state: "active" }]);
  if (url.includes("/subscriptions/")) {
    assert.equal(options.method, "GET", "subscriptions and suppression are never written");
    if (url.endsWith("/suppressed")) return Response.json({ is_suppressed: changeSafetyAfterWrite && providerWrites > safetyChangeThreshold });
    return Response.json({ subscriptions: existingStates });
  }
  if (url.includes("/jobs/")) return Response.json({ job_id: url.split("/").at(-1), state: "done", errors: null });
  if (url.endsWith("/profiles") && options.method === "PUT") {
    if (!standaloneSafetyTest) {
      assert.ok(preparationR2.values.has("protected-sync/vistos-leadhub-profiles/writer-lock.json"));
      assert.ok([...preparationR2.values.entries()].some(([key, value]) => key.includes("/operations/") && JSON.parse(value).status === "WRITE_INTENT"));
    }
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ["email_address", "first_name", "user_id"]);
    assert.equal(body.first_name, "Radim");
    importedProfiles.set(body.email_address, { credentials: body, tags: [] });
    providerWrites += 1; return new Response(null, { status: 202 });
  }
  if (url.endsWith("/profiles/tags") && options.method === "POST") {
    const body = JSON.parse(options.body);
    const profile = [...importedProfiles.values()].find(item => item.credentials.user_id === body.profile_identification.user_id);
    assert.ok(profile, "tag writes must not create profiles implicitly");
    profile.tags = [body.tag];
    providerWrites += 1; return new Response(null, { status: 202 });
  }
  assert.equal(options.method, "GET");
  const profile = importedProfiles.get(decodeURIComponent(url.split("/").at(-1)));
  return profile ? Response.json(profile) : new Response(null, { status: 404 });
};
try {
  const adoption = await executeVistosLeadHubHistoricalImport(preparationEnv);
  assert.equal(adoption.status, "IMPORT_CANARY_PENDING");
  assert.equal(providerWrites, 0, "adoption is not a profile write");
  const adopted = JSON.parse(preparationR2.values.get(syncStateKey));
  assert.equal(adopted.historicalImport.planned.CREATE, 1);
  assert.equal(adopted.historicalImport.remaining, 1);
  assert.ok(new Date(adopted.checkpoint) > new Date(JSON.parse(priorState).checkpoint));
  assert.ok(adopted.snapshotKey.includes("/imports/"));
  const runAt = new Date(Date.parse(adopted.checkpoint) + 60000).toISOString();
  currentSourceRow = { ...preparationRow, FirstName: "Changed" };
  await assert.rejects(() => executeVistosLeadHubHistoricalImport(preparationEnv, { scheduledAt: runAt }), error => error.code === "contact_changed_before_write");
  assert.equal(providerWrites, 0, "current source change cannot be overwritten by the old manifest");
  assert.equal(JSON.parse(preparationR2.values.get(syncStateKey)).pending.length, 1, "rejected source read retains the queue");
  assert.equal(preparationR2.values.has("protected-sync/vistos-leadhub-profiles/writer-lock.json"), false);
  currentSourceRow = preparationRow;
  const canary = await executeVistosLeadHubHistoricalImport(preparationEnv, { scheduledAt: new Date(Date.parse(runAt) + 60000).toISOString() });
  assert.equal(canary.created, 1);
  assert.equal(canary.historicalImport.readbackConfirmed, 1);
  assert.equal(canary.historicalImport.remaining, 0);
  assert.equal(providerWrites, 2, "one profile and one integration tag, no subscription write");
  const confirmed = JSON.parse(preparationR2.values.get(syncStateKey));
  assert.equal(confirmed.profiles[preparationRow.Id].synced, true, "imported identities enter the same delta registry");
  assert.deepEqual(confirmed.profiles[preparationRow.Id].subscriptions, existingStates);
  assert.equal(confirmed.totals.created, 1);
  await executeVistosLeadHubHistoricalImport(preparationEnv, { scheduledAt: new Date(Date.parse(runAt) + 120000).toISOString() });
  assert.equal(providerWrites, 2, "repeat with no source changes performs no writes and creates no duplicates");
  assert.equal(JSON.parse(preparationR2.values.get(syncStateKey)).totals.created, 1);

  const departureAt = new Date(Date.parse(runAt) + 180000).toISOString();
  deltaSourceRows = [{ ...preparationRow, DoNotWorkCompany: true, Modified: departureAt }];
  const departure = await executeVistosLeadHubHistoricalImport(preparationEnv, { scheduledAt: departureAt });
  assert.equal(departure.deactivated, 1, "delta excludes an already imported departed employee");
  assert.equal(importedProfiles.get(preparationRow.Email1).tags[0].data.targeting_enabled, 0);
  assert.equal(importedProfiles.size, 1, "deactivation preserves the profile and its history");
  assert.deepEqual(JSON.parse(preparationR2.values.get(syncStateKey)).profiles[preparationRow.Id].subscriptions, existingStates);

  const emailChangeAt = new Date(Date.parse(runAt) + 240000).toISOString();
  deltaSourceRows = [{ ...preparationRow, Email1: "changed@example.test", Modified: emailChangeAt }];
  await executeVistosLeadHubHistoricalImport(preparationEnv, { scheduledAt: emailChangeAt });
  assert.equal(importedProfiles.size, 1, "email changes do not merge a new identity into an old profile");
  assert.equal(importedProfiles.has("changed@example.test"), false);
  assert.equal(JSON.parse(preparationR2.values.get(syncStateKey)).profiles[preparationRow.Id].email, preparationRow.Email1);

  const pointerBefore = preparationR2.values.get(syncStateKey);
  const originalPut = preparationR2.put.bind(preparationR2);
  preparationR2.put = async (key, value, options) => {
    if (key.endsWith("/dns.json")) throw new Error("synthetic object write failed");
    return originalPut(key, value, options);
  };
  await assert.rejects(() => __test.commitSourceVersion(preparationR2, confirmed, {}, {}, "failed-commit"), /synthetic object write failed/);
  assert.equal(preparationR2.values.get(syncStateKey), pointerBefore, "a partially written version never becomes the live pointer");
  preparationR2.put = originalPut;
  changeSafetyAfterWrite = true;
  standaloneSafetyTest = true; safetyChangeThreshold = providerWrites;
  const writesBeforeSafetyChange = providerWrites;
  await assert.rejects(() => __test.upsertActiveProfile(preparationEnv, { ...selected, contactId: "102", normalizedEmail: "new-person@example.test" }), error => error.code === "leadhub_subscription_or_suppression_changed");
  assert.equal(providerWrites, writesBeforeSafetyChange + 1, "unexpected safety change stops before tag writes");
} finally { globalThis.fetch = originalFetch; }
console.log("Vistos → LeadHub coordinated import and adoption tests passed");

const retainedLockKey = "protected-sync/vistos-leadhub-profiles/writer-lock.json";
const retainedLock = { owner: "synthetic-retained", startedAt: "2026-01-01T00:00:00Z" };
const retainedState = { checkpoint: "2026-01-01T00:00:00Z", pending: [{ ...selected, manifestAction: "CREATE" }] };
const retainedR2 = new MemoryR2({
  [retainedLockKey]: JSON.stringify(retainedLock), [syncStateKey]: JSON.stringify(retainedState),
  "protected-sync/vistos-leadhub-profiles/operations/synthetic-retained/42.json": JSON.stringify({
    contactId: "42", normalizedEmail: selected.normalizedEmail, desired: "active", status: "PROFILE_ACCEPTED",
    beforeSafety: { subscriptions: [], suppressed: false }
  })
});
const retainedPut = retainedR2.put.bind(retainedR2);
retainedR2.put = async (key, value, options) => {
  assert.ok(key.includes("/reconciliation/"), "read reconciliation may only store protected evidence");
  return retainedPut(key, value, options);
};
retainedR2.delete = async () => assert.fail("read reconciliation must never release a retained lock");
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, "GET", "accepted writes cannot be retried by read reconciliation");
  if (url.includes("/subscriptions/")) return Response.json(url.endsWith("/suppressed") ? { is_suppressed: false } : { subscriptions: [] });
  return Response.json({ ...owned, tags: [] });
};
try {
  const read = await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: retainedR2, LEADHUB_API_TOKEN: "synthetic" });
  assert.equal(read.status, "RECONCILIATION_REQUIRED");
  assert.equal(read.profileWrites, 0);
  assert.equal(read.checks[0].identityMatches, true);
  assert.equal(read.checks[0].namesMatch, true);
  assert.equal(read.checks[0].tagMatches, false);
  assert.equal(read.checks[0].safetyUnchanged, true);
  assert.equal(retainedR2.values.get(retainedLockKey), JSON.stringify(retainedLock));
  assert.equal(retainedR2.values.get(syncStateKey), JSON.stringify(retainedState));
  assert.ok(!JSON.stringify(read).includes(selected.normalizedEmail));
  assert.ok(!JSON.stringify(read).includes(selected.firstName));
  retainedR2.put = retainedPut;
  retainedR2.delete = MemoryR2.prototype.delete.bind(retainedR2);
  const settled = await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: retainedR2, LEADHUB_API_TOKEN: "synthetic" }, { recoveryOwner: retainedLock.owner });
  assert.equal(settled.status, "READBACK_ADOPTED");
  assert.equal(settled.profileWrites, 0);
  assert.equal(settled.lockReleased, true);
  const adoptedProfile = JSON.parse(retainedR2.values.get(syncStateKey));
  assert.equal(adoptedProfile.totals.created, 1);
  assert.equal(adoptedProfile.profiles["42"].active, false, "a profile without a verified tag is not enabled for targeting");
  assert.equal(adoptedProfile.pending.length, 1, "the missing tag remains queued for fresh source checks");
  assert.equal(adoptedProfile.pending[0].manifestAction, "UPDATE");
  assert.equal(adoptedProfile.checkpoint, retainedState.checkpoint);
  // Simulate failure after the state commit but before lock deletion.
  retainedR2.values.set(retainedLockKey, JSON.stringify(retainedLock));
  await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: retainedR2, LEADHUB_API_TOKEN: "synthetic" }, { recoveryOwner: retainedLock.owner });
  assert.equal(JSON.parse(retainedR2.values.get(syncStateKey)).totals.created, 1, "retrying settlement cannot count or create a second profile");
} finally { globalThis.fetch = originalFetch; }
console.log("Vistos → LeadHub retained-writer READ reconciliation tests passed");

// An interrupted batch can contain fully committed operations followed by an
// accepted write. Every operation needs a live readback; only the latter is
// newly adopted/counted. No writes to LeadHub are allowed during settlement.
const mixedOwner = "synthetic-mixed-batch";
const mixedSafety = { subscriptions: [{ code: "news", state: "unsubscribed" }], suppressed: true };
const committedItem = { ...selected, contactId: "41", normalizedEmail: "committed@example.test" };
const mixedProfiles = [committedItem, selected].map(item => ({ credentials: {
  user_id: __test.profileUserId(item.contactId), email_address: item.normalizedEmail, first_name: item.firstName
}, tags: [__test.tagPayload(item, true, "", mixedSafety).tag] }));
const mixedState = { checkpoint: "2026-01-01T00:00:00Z", totals: { created: 1 },
  pending: [{ ...selected, historical: true, manifestAction: "CREATE" }],
  historicalImport: { created: 1, readbackConfirmed: 1 }, profiles: { "41": {
    synced: true, active: true, email: committedItem.normalizedEmail, rowHash: "hash-41",
    sourceModified: "2026-01-01T00:00:00Z", ...mixedSafety
  } } };
const mixedLock = { owner: mixedOwner, startedAt: "2026-01-01T00:00:00Z", terminal: true };
const mixedSeed = { [retainedLockKey]: JSON.stringify(mixedLock), [syncStateKey]: JSON.stringify(mixedState) };
for (const item of [committedItem, selected]) mixedSeed[`protected-sync/vistos-leadhub-profiles/operations/${mixedOwner}/${item.contactId}.json`] = JSON.stringify({
  contactId: item.contactId, normalizedEmail: item.normalizedEmail, desired: "active", action: "created",
  rowHash: `hash-${item.contactId}`, sourceModified: "2026-01-01T00:00:00Z",
  status: item.contactId === "41" ? "READBACK_CONFIRMED" : "TAG_ACCEPTED",
  beforeSafety: mixedSafety, afterSafety: mixedSafety
});
const mixedR2 = new MemoryR2(mixedSeed);
let changedCommittedSafety = false;
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, "GET", "settlement is provider READ-only");
  if (url.includes("/subscriptions/")) return Response.json(url.endsWith("/suppressed")
    ? { is_suppressed: !(changedCommittedSafety && url.includes("committed")) }
    : { subscriptions: mixedSafety.subscriptions });
  return Response.json(mixedProfiles.find(profile => url.endsWith(encodeURIComponent(profile.credentials.email_address))));
};
try {
  changedCommittedSafety = true;
  const rejected = await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: mixedR2, LEADHUB_API_TOKEN: "synthetic" });
  assert.equal(rejected.lockReleased, false, "previously committed operations still require unchanged live safety");
  assert.equal(mixedR2.values.get(syncStateKey), mixedSeed[syncStateKey]);
  changedCommittedSafety = false;
  const settled = await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: mixedR2, LEADHUB_API_TOKEN: "synthetic" });
  assert.equal(settled.status, "READBACK_ADOPTED");
  assert.equal(settled.profileWrites, 0);
  assert.equal(settled.checks.filter(check => check.alreadyCommitted).length, 1);
  const state = JSON.parse(mixedR2.values.get(syncStateKey));
  assert.equal(state.totals.created, 2, "committed profiles must not be counted twice");
  assert.equal(state.historicalImport.created, 2);
  assert.equal(state.historicalImport.readbackConfirmed, 2);
  assert.equal(state.pending.length, 0);
  assert.deepEqual(state.profiles["41"], mixedState.profiles["41"], "do not rewrite committed profile evidence");
  assert.equal(state.checkpoint, mixedState.checkpoint, "settlement never moves the checkpoint");
} finally { globalThis.fetch = originalFetch; }
console.log("Vistos → LeadHub partially committed batch recovery tests passed");
