import assert from "node:assert/strict";
import worker from "../workers/orwii-fuel-sync-runner.js";
import { runOrwiiFuelSyncAutomation, verifyOrwiiFuelMirror, verifyOrwiiFuelRecoveryHistory } from "../functions/_lib/orwii-fuel-store.js";
let checkpoint = "2026-09-16", active = false, pendingTo = "", failSecondWrite = true, writes = 0, sourceCalls = 0;
const rows = new Map(), proofs = [], proofIds = new Map();
const db = {
  prepare(sql) {
    return { sql, params: [], bind(...params) { this.params = params; return this; },
      async first() { if (sql.includes("SELECT requested_to")) return { requested_to: checkpoint }; if (sql.includes("FROM audit_events")) return proofIds.has(this.params[0]) ? { id: this.params[0] } : null; throw new Error("Unexpected first query"); },
      async all() { let results = sql.includes("FROM fleet_orwii_fuel_transactions") ? [...rows.values()] : []; if (sql.includes("WHERE occurred_at >=")) results = results.filter(row => row.occurred_at >= this.params[0] && row.occurred_at < this.params[1]); return { results }; },
      async run() {
        if (sql.includes("INTO audit_events")) { const proof = JSON.parse(this.params[6]); proofs.push(proof); proofIds.set(this.params[0], proof); }
        if (sql.includes("INSERT INTO fleet_orwii_fuel_sync_runs")) {
          if (active) throw new Error("UNIQUE constraint failed: idx_fleet_orwii_fuel_single_running");
          active = true; pendingTo = this.params[3];
        }
        if (sql.includes("SET status = 'completed'")) { checkpoint = pendingTo; active = false; }
        if (sql.includes("SET status = 'error', finished_at = ?, error_code = ?")) active = false;
        return { meta: { changes: 1 } };
      }
    };
  },
  async batch(statements) {
    if (statements[0]?.sql.includes("INSERT INTO fleet_orwii_fuel_transactions")) {
      writes++;
      if (failSecondWrite && writes === 2) throw new Error("simulated interrupted D1 batch");
      for (const statement of statements) {
        const p = statement.params;
        rows.set(p[0], { external_id: p[0], occurred_at: p[1], fuel_type: p[2], liters: p[3], unit_price: p[4], total_price: p[5], odometer_km: p[6], license_plate: p[7], orwii_vehicle_id: p[8], fuel_chip_id: p[9], matched_vehicle_id: p[10], match_status: p[11], match_method: p[12] });
      }
    }
    return statements.map(() => ({ meta: { changes: 0 } }));
  }
};
const env = { DB_CORE: db, DB_AUDIT: db, DB_ARCHIVE: db, ORWII_API_USERNAME: "test-only", ORWII_API_PASSWORD: "test-only" };
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  sourceCalls++;
  const target = new URL(String(url));
  if (target.pathname === "/getShortLivedToken") return Response.json({ token: "test-token" });
  if (target.pathname === "/getFillingStations") return Response.json([{ id: "test-station" }]);
  assert.equal(target.pathname, "/getRefuellings");
  const timestamp = Date.parse("2026-09-17T12:00:00Z");
  const inWindow = timestamp >= Number(target.searchParams.get("from")) && timestamp <= Number(target.searchParams.get("to"));
  return Response.json(inWindow ? Array.from({ length: 60 }, (_, id) => ({ id: "tx-" + id, from: timestamp, volumeInLitres: 1 })) : []);
};
try {
  const scheduledTime = Date.parse("2026-10-22T13:00:00Z");
  await assert.rejects(() => runOrwiiFuelSyncAutomation(env, { scheduledTime }), /simulated interrupted/);
  assert.equal(rows.size, 50, "the first persisted chunk survives an interruption");
  assert.equal(checkpoint, "2026-09-16", "a partial batch never advances the confirmed period");
  failSecondWrite = false;
  const recovered = await runOrwiiFuelSyncAutomation(env, { scheduledTime });
  assert.equal(recovered.status, "completed");
  assert.equal(checkpoint, "2026-09-19");
  assert.equal(rows.size, 60, "retry upserts the same IDs without duplicates");
  assert.equal([...rows.values()].reduce((sum, row) => sum + row.liters, 0), 60);
  checkpoint = "2026-09-16";
  const recoveryPromises = [];
  await worker.scheduled({ cron: "*/5 * * * *", scheduledTime }, { ...env, ORWII_RECOVERY_MODE: "enabled" }, { waitUntil(promise) { recoveryPromises.push(promise); } });
  await Promise.all(recoveryPromises);
  assert.equal(checkpoint, "2026-09-28", "exactly four independent recovery batches advance twelve days");
  active = true; checkpoint = "2026-09-16";
  const concurrentCalls = sourceCalls;
  const lockedPromises = [];
  await worker.scheduled({ cron: "*/5 * * * *", scheduledTime }, { ...env, ORWII_RECOVERY_MODE: "enabled" }, { waitUntil(promise) { lockedPromises.push(promise); } });
  await Promise.all(lockedPromises);
  assert.equal(sourceCalls, concurrentCalls, "a concurrent recovery does not read or duplicate the source");
  active = false;
  checkpoint = "2026-10-22";
  const callsBefore = sourceCalls;
  const caughtUp = await runOrwiiFuelSyncAutomation(env, { scheduledTime, recoveryOnly: true });
  assert.equal(caughtUp.reason, "recovery_caught_up");
  assert.equal(sourceCalls, callsBefore, "a completed backfill stops reading ORWII");
  const promises = [];
  const ctx = { waitUntil(promise) { promises.push(promise); } };
  await worker.scheduled({ cron: "*/5 * * * *", scheduledTime }, env, ctx);
  assert.equal(promises.length, 0, "the recovery schedule is disabled by default");
  await worker.scheduled({ cron: "*/5 * * * *", scheduledTime }, { ...env, ORWII_RECOVERY_MODE: "enabled" }, ctx);
  await Promise.all(promises);
  assert.equal(promises.length, 1);
  assert.equal(sourceCalls, callsBefore);
  await worker.scheduled({ cron: "* * * * *", scheduledTime }, env, ctx);
  assert.equal(promises.length, 1, "an unknown schedule cannot start a write");
  assert.ok(proofs.some(proof => proof.matched && proof.expectedCount === 60 && proof.expectedSha256 === proof.storedSha256));
  const verificationEnv = { ...env, ORWII_VERIFY_FROM: "2026-09-16", ORWII_VERIFY_TO: "2026-10-22" };
  const history = await verifyOrwiiFuelRecoveryHistory(verificationEnv);
  assert.equal(history.status, "completed"); assert.equal(history.verifiedWindows, 6);
  const callsAfterHistory = sourceCalls;
  const repeated = await verifyOrwiiFuelRecoveryHistory(verificationEnv);
  assert.equal(repeated.reusedWindows, 6); assert.equal(sourceCalls, callsAfterHistory);
} finally { globalThis.fetch = originalFetch; }
const expected = [...rows.values()].map(row => ({ externalId: row.external_id, timestamp: row.occurred_at, liters: row.liters, unitPrice: row.unit_price, totalPrice: row.total_price }));
const verify = () => verifyOrwiiFuelMirror(db, expected, { from: "2026-09-13", to: "2026-09-19" });
const original = { ...rows.get("tx-0") };
rows.set("tx-0", { ...original, liters: 2 });
await assert.rejects(verify, error => error.code === "orwii_source_mirror_mismatch");
assert.equal(proofs.at(-1).changedCount, 1); assert.equal(proofs.at(-1).matched, false);
rows.delete("tx-0");
await assert.rejects(verify, error => error.code === "orwii_source_mirror_mismatch");
assert.equal(proofs.at(-1).missingCount, 1);
rows.set("tx-0", original); rows.set("unexpected", { ...original, external_id: "unexpected" });
await assert.rejects(verify, error => error.code === "orwii_source_mirror_mismatch");
assert.equal(proofs.at(-1).unexpectedCount, 1);
rows.delete("unexpected");
console.log("ORWII interrupted writes, retry, checkpoint and recovery schedule tests passed");
