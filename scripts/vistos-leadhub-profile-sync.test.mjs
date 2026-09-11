import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import worker, { runScheduledSync } from "../workers/vistos-leadhub-profile-sync-runner.js";
import { __test, buildLeadHubImportManifest, runVistosLeadHubProfileSync, withVistosLeadHubWriter, prepareVistosLeadHubHistoricalImport, verifyCompleteContactCapture } from "../functions/_lib/vistos-leadhub-profile-sync.js";
import { onRequestGet, onRequestPost } from "../functions/api/receivables/vistos/leadhub-sync-internal.js";

class MemoryR2 {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? null : { json: async () => JSON.parse(value) };
  }
  async head(key) { return this.values.has(key) ? { key } : null; }
  async put(key, value, options = {}) {
    if (options.onlyIf?.get("If-None-Match") === "*" && this.values.has(key)) return null;
    this.values.set(key, String(value));
    return { key };
  }
  async delete(key) { this.values.delete(key); }
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
assert.match(config, /RUN_MODE = "prepare-import"/);

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
