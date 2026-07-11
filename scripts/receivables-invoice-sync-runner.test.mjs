import assert from "node:assert/strict";
import { scheduledReceivablesAction } from "../functions/_lib/receivables-invoice-sync-runner.js";
import {
  assertIncrementalFilter,
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
  "full",
  "Sunday 02:30 Europe/Prague must schedule full reconciliation"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-10-25T00:30:00.000Z")),
  "full",
  "the first repeated 02:30 during DST fallback must select the weekly full action"
);
assert.equal(
  scheduledReceivablesAction(new Date("2026-10-25T01:30:00.000Z")),
  "full",
  "the repeated 02:30 is handled by the runner dedupe key"
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
