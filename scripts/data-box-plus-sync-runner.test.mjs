import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { isArchiveDue, isDataBoxDue } from "../workers/data-box-plus-sync-runner.js";

const wranglerSource = readFileSync(new URL("../wrangler.data-box-plus-sync-runner.toml", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");

assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:00:00.000Z")), true);
assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:30:00.000Z")), true);
assert.equal(isDataBoxDue(Date.parse("2026-07-23T08:59:59.000Z")), false);
assert.equal(isArchiveDue(Date.parse("2026-07-23T08:00:00.000Z")), true);
assert.equal(isArchiveDue(Date.parse("2026-07-23T08:05:00.000Z")), true);
assert.equal(isArchiveDue(Date.parse("2026-07-23T08:03:00.000Z")), false);
assert.match(wranglerSource, /crons = \["\*\/5 \* \* \* \*"\]/);
assert.match(storeSource, /intervalMinutes: 30/);
assert.match(storeSource, /Automatické načítání běží serverově každých 30 minut/);
assert.match(storeSource, /const fullyStored = storedAttachments\.length > 0/);
assert.match(storeSource, /cleanString\(attachment\.storage_key\)/);
assert.match(storeSource, /data_box_plus_sync_stale/);
assert.match(storeSource, /45 \* 60 \* 1000/);

const originalFetch = globalThis.fetch;
const calls = [];
const mailboxIds = ["healthy", "http-failure", "network-failure", "after-failure"];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push({ url, options, body });
  assert.equal(options.headers.Authorization, "Bearer test-token");
  if (body.mode === "plan") return Response.json({ mailboxIds });
  if (body.mailboxId === "http-failure") return new Response("timeout", { status: 524 });
  if (body.mailboxId === "network-failure") throw new Error("network lost");
  if (body.mailboxId) return Response.json({ syncRunId: `run-${body.mailboxId}` });
  return Response.json({ status: "partial", mailboxCount: 4, errors: [{}, {}] });
};

try {
  const env = { APP_BASE_URL: "https://smart-odpady.ai", DATA_BOX_PLUS_SYNC_TOKEN: "test-token" };
  async function tick(time) {
    const pending = [];
    await worker.scheduled({ scheduledTime: Date.parse(time) }, env, { waitUntil(p) { pending.push(p); } });
    await Promise.all(pending);
    return pending.length;
  }
  assert.equal(await tick("2026-09-25T09:33:00Z"), 0);
  assert.equal(calls.length, 0);
  for (const time of ["2026-09-25T09:00:00Z", "2026-09-25T09:30:00Z"]) {
    calls.length = 0;
    assert.equal(await tick(time), 2);
    const sync = calls.filter(call => call.url.endsWith("/internal-sync"));
    assert.equal(sync[0].body.mode, "plan");
    assert.deepEqual(sync.slice(1, -1).map(call => call.body.mailboxId), mailboxIds);
    assert.equal(sync.at(-1).body.mode, "complete");
    assert.deepEqual(sync.at(-1).body.results, [
      { mailboxId: "healthy", syncRunId: "run-healthy" },
      { mailboxId: "http-failure" },
      { mailboxId: "network-failure" },
      { mailboxId: "after-failure", syncRunId: "run-after-failure" }
    ], "HTTP and network failures must not prevent later mailboxes or the aggregate audit");
    assert.equal(calls.filter(call => call.url.endsWith("/internal-archive")).length, 1);
  }
  calls.length = 0;
  assert.equal(await tick("2026-09-25T09:05:00Z"), 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/internal-archive"));
  for (let minute = 0; minute < 60; minute++) {
    assert.equal(isDataBoxDue(Date.UTC(2026, 8, 25, 9, minute)), minute === 0 || minute === 30);
  }
  const payload = await (await worker.fetch()).json();
  assert.equal(payload.dataBoxPlusIntervalMinutes, 30);
  assert.equal(payload.archiveBatchIntervalMinutes, 5);
  assert.equal(payload.mailboxScope, "all-current-and-future");
} finally {
  globalThis.fetch = originalFetch;
}
console.log("DZ runner: half-hourly isolated mailbox batches, failure continuation and audit verified");
