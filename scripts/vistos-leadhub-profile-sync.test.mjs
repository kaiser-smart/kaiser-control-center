import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { runScheduledSync } from "../workers/vistos-leadhub-profile-sync-runner.js";
import { __test, runVistosLeadHubProfileSync } from "../functions/_lib/vistos-leadhub-profile-sync.js";
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
globalThis.fetch = async (url) => {
  if (String(url).includes("/profiles/email-address/")) return Response.json({ error_code: "profile_not_found" }, { status: 404 });
  if (String(url).includes("/subscriptions/email-address/")) return Response.json({ error_code: "profile_not_found" }, { status: 404 });
  if (String(url).endsWith("/interest-lists")) return Response.json([]);
  throw new Error(`unexpected init URL ${url}`);
};
const initialized = await runVistosLeadHubProfileSync({ R2_ARCHIVE: r2, LEADHUB_API_TOKEN: "test-api-token" }, { scheduledAt: "2026-09-10T10:00:00Z" });
globalThis.fetch = originalFetch;
assert.equal(initialized.syncStatus, "ACTIVE");
assert.equal(initialized.checkpoint, "2026-09-10T10:00:00.000Z");
assert.equal(initialized.historicalProfilesImported, 0, "initial checkpoint must not bulk-import the baseline");
assert.deepEqual(initialized.apiReadValidation, {
  profilesRead: true,
  subscriptionsRead: true,
  interestListsRead: true
}, "missing profiles must still prove the read scopes without creating a profile");

const preparedR2 = new MemoryR2({
  "protected-audits/vistos-contact-cleanup-v4/latest.json": JSON.stringify({ runId: baselineRunId }),
  "protected-sync/vistos-leadhub-profiles/contact-snapshot.json": JSON.stringify(baselineSnapshot),
  "protected-sync/vistos-leadhub-profiles/dns-state.json": JSON.stringify(baselineDns)
});
globalThis.fetch = async (url) => {
  if (String(url).includes("/profiles/email-address/") || String(url).includes("/subscriptions/email-address/")) {
    return Response.json({ error_code: "profile_not_found" }, { status: 404 });
  }
  if (String(url).endsWith("/interest-lists")) return Response.json([]);
  throw new Error(`unexpected prepared init URL ${url}`);
};
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
