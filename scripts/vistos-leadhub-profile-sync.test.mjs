import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { runScheduledSync } from "../workers/vistos-leadhub-profile-sync-runner.js";
import { __test, buildLeadHubImportManifest, runVistosLeadHubProfileSync } from "../functions/_lib/vistos-leadhub-profile-sync.js";
import { onRequestGet, onRequestPost } from "../functions/api/receivables/vistos/leadhub-sync-internal.js";

class MemoryR2 {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? null : { json: async () => JSON.parse(value) };
  }
  async head(key) { return this.values.has(key) ? { key } : null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

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
assert.match(config, /crons = \["\*\/5 \* \* \* \*"\]/);

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
