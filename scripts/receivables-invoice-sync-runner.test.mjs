import assert from "node:assert/strict";
import { scheduledReceivablesAction, runReceivablesInvoiceSyncAutomation } from "../functions/_lib/receivables-invoice-sync-runner.js";
import {
  assertIncrementalFilter,
  incrementalPageTotal,
  incrementalWindow
} from "../functions/_lib/receivables-vistos-invoice-snapshot.js";
import {
  onRequestGet,
  onRequestPost
} from "../functions/api/receivables/vistos/invoice-sync-internal.js";

assert.equal(
  scheduledReceivablesAction(new Date("2026-07-11T04:30:00.000Z")),
  "incremental",
  "06:30 Europe/Prague must schedule incremental sync in summer"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-07-11T08:30:00.000Z")),
  "incremental",
  "10:30 Europe/Prague must schedule incremental sync"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-07-12T00:30:00.000Z")),
  "",
  "Sunday must not restart the already imported invoice history"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-10-25T00:30:00.000Z")),
  "",
  "DST must not trigger an unsolicited full reimport"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-10-25T01:30:00.000Z")),
  "",
  "the repeated DST hour must not restart history"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-07-11T04:15:00.000Z")),
  "",
  "unscheduled quarter-hour must not start a new sync"
);

const window = incrementalWindow("2026-07-11T08:30:00.000Z", {
  periodTo: "2026-07-11T14:30:00.000Z",
  overlapHours: 6
});
assert.deepEqual(window.filter, {
  Modified_From: "2026-07-11T02:30:00Z",
  Modified_To: "2026-07-11T14:30:00Z"
});
assert.doesNotThrow(() => assertIncrementalFilter([
  { Id: "invoice-1", Modified: "2026-07-11T03:00:00Z" },
  { Id: "invoice-2", Modified: "2026-07-11T14:30:00Z" }
], window));
assert.throws(
  () => assertIncrementalFilter([{ Id: "invoice-old", Modified: "2026-07-10T23:59:59Z" }], window),
  (error) => error?.code === "receivables_vistos_modified_filter_unreliable"
);
assert.equal(
  incrementalPageTotal({ rows: [], total: 173620, filtered: 0 }),
  0,
  "recordsTotal must not turn an empty filtered result into a running 173620-row batch"
);
assert.equal(
  incrementalPageTotal({ rows: [{ Id: "1" }], total: 173620, filtered: 12 }),
  12,
  "recordsFiltered is the authoritative incremental total"
);
assert.equal(
  incrementalPageTotal({ rows: [], total: 173620, filtered: 0 }, 3000, 173620),
  3000,
  "an empty continuation page must close at the number of rows already loaded"
);
assert.throws(
  () => assertIncrementalFilter([{ Id: "invoice-no-modified" }], window),
  (error) => error?.code === "receivables_vistos_modified_filter_unreliable"
);

const unauthorized = await onRequestPost({
  request: new Request("https://example.test/api/receivables/vistos/invoice-sync-internal", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" },
    body: JSON.stringify({ action: "incremental" })
  }),
  env: { RECEIVABLES_RUNNER_TOKEN: "expected" }
});
assert.equal(unauthorized.status, 401);
assert.equal((await unauthorized.json()).code, "receivables_runner_unauthorized");

const methodNotAllowed = await onRequestGet();
assert.equal(methodNotAllowed.status, 405);
assert.equal(methodNotAllowed.headers.get("Allow"), "POST");

console.log("receivables invoice sync runner tests passed");

// Scoped opt-in must retain a fail-closed archive capacity guard using supported D1 metadata.
for (const size of [0, 8_600_000_000, 2_300_000_000]) {
  const archive = { prepare(sql) { return {
    async all() { assert.equal(sql, "SELECT 1 AS capacity_probe"); return {results: [], meta: {size_after: size}}; },
    async first() { return sql.includes("vistos_invoice_snapshot") ? {status: "snapshot", parser_summary_json: '{"syncedThrough":"2026-09-25T00:00:00Z"}'} : null; }
  }; } };
  const result = await runReceivablesInvoiceSyncAutomation({DB_ARCHIVE: archive, DB_AUDIT: archive, D1_CAPACITY_BLOCK_BULK_WRITES: "true", RECEIVABLES_INVOICE_SYNC_ENABLED: "true"}, {scheduledTime: Date.parse("2026-09-25T09:15:00Z")});
  assert.equal(result.status, size > 0 && size < 8_500_000_000 ? "not_scheduled" : "blocked");
}
