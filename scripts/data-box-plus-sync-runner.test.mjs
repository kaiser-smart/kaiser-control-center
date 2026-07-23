import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { isDataBoxDue } from "../workers/data-box-plus-sync-runner.js";

const wranglerSource = readFileSync(new URL("../wrangler.data-box-plus-sync-runner.toml", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");

assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:00:00.000Z")), true);
assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:30:00.000Z")), false);
assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:59:59.000Z")), false);
assert.match(wranglerSource, /crons = \["0 \* \* \* \*"\]/);
assert.match(storeSource, /intervalMinutes: 60/);
assert.match(storeSource, /Automatické načítání běží serverově každou celou hodinu/);

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return Response.json({
    status: "completed",
    syncRunId: "sync-test",
    mailboxCount: 7,
    messagesFound: 0,
    messagesDownloaded: 0,
    attachmentsDownloaded: 0,
    errors: []
  });
};

try {
  const pending = [];
  const env = {
    APP_BASE_URL: "https://smart-odpady.ai",
    DATA_BOX_PLUS_SYNC_TOKEN: "test-token"
  };
  const ctx = {
    waitUntil(promise) {
      pending.push(promise);
    }
  };

  await worker.scheduled({ scheduledTime: Date.parse("2026-07-23T08:30:00.000Z") }, env, ctx);
  assert.equal(pending.length, 0);
  assert.equal(calls.length, 0);

  await worker.scheduled({ scheduledTime: Date.parse("2026-07-23T09:00:00.000Z") }, env, ctx);
  assert.equal(pending.length, 1);
  await Promise.all(pending);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://smart-odpady.ai/api/data-box-plus/internal-sync");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    scheduledAt: "2026-07-23T09:00:00.000Z"
  });

  const readiness = await worker.fetch();
  const payload = await readiness.json();
  assert.equal(payload.status, "ready");
  assert.equal(payload.dataBoxPlusIntervalMinutes, 60);
  assert.match(payload.message, /automaticky každou celou hodinu/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("data-box-plus sync runner hourly corridor ok");
