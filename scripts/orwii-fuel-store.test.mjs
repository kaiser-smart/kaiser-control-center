import assert from "node:assert/strict";
import {
  buildOrwiiFuelAnalytics,
  expireAbandonedOrwiiRuns,
  getOrwiiFuelAnalytics,
  matchFuelTransactionToVehicle,
  normalizeOrwiiFuelTransaction,
  orwiiFuelStatus,
  orwiiFuelSyncRange,
  previewOrwiiFuelTransactions
} from "../functions/_lib/orwii-fuel-store.js";
const transaction = normalizeOrwiiFuelTransaction({ transactionId: 101, from: 1784017800000, volumeInLitres: "45,5", vehicleIdentifierValue: "CHIP-7", price: { value: 1800 }, pricePerUnit: { value: 39.56 }, vehicle: { id: "orwii-vehicle-1", registrationNumber: "1AB 2345", counterType: "OdometerInMeters", currentCounterState: 183400 } });
assert.equal(transaction.externalId, "101"); assert.equal(transaction.liters, 45.5);
assert.equal(transaction.odometerKm, 183.4); assert.equal(transaction.licensePlate, "1AB 2345");
const vehicle = { id: "vehicle-1", licensePlate: "1AB2345", fuelChipId: "chip-7" };
assert.deepEqual(matchFuelTransactionToVehicle(transaction, [vehicle]), { status: "matched", method: "fuel_chip_id", vehicleId: "vehicle-1" });
assert.equal(matchFuelTransactionToVehicle({ ...transaction, chipId: "", licensePlate: "9ZZ9999" }, [vehicle]).status, "unmatched");
assert.equal(matchFuelTransactionToVehicle(transaction, [
  vehicle,
  { id: "vehicle-2", licensePlate: "1AB2345", orwiiVehicleId: "different" }
]).status, "ambiguous");
assert.throws(() => normalizeOrwiiFuelTransaction({ liters: 10 }), /unikátní ID/);
assert.deepEqual(
  { mode: orwiiFuelStatus({ ORWII_API_USERNAME: "user", ORWII_API_PASSWORD: "secret" }).mode, automation: orwiiFuelStatus({ ORWII_API_USERNAME: "user", ORWII_API_PASSWORD: "secret" }).automation },
  { mode: "cloud-scheduled-sync", automation: "scheduled" }
);
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  requests.push({ url: requestUrl, init });
  if (requestUrl.endsWith("/getShortLivedToken")) return new Response(JSON.stringify({ token: "short-lived-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (requestUrl.includes("/getFillingStations")) return new Response(JSON.stringify([{ id: "station-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
  if (requestUrl.includes("/getRefuellings")) return new Response(JSON.stringify([{ transactionId: "tx-1", from: Date.parse("2026-07-01T08:00:00.000Z"), volumeInLitres: 20, vehicle: { registrationNumber: "1AB2345" } }]), { status: 200, headers: { "Content-Type": "application/json" } });
  throw new Error(`Unexpected request ${requestUrl}`);
};
try {
  const preview = await previewOrwiiFuelTransactions({
    APP_ENV: "test",
    ORWII_API_USERNAME: "user@example.test",
    ORWII_API_PASSWORD: "secret",
    SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({ vehicles: [{ id: "vehicle-1", licensePlate: "1AB2345" }] })
  }, {}, { from: "2026-07-01", to: "2026-07-01" });
  assert.equal(preview.summary.matched, 1);
  assert.equal(requests[0].init.method, "POST");
  assert.match(requests[0].init.body, /email=user%40example.test/);
  assert.equal(requests[1].init.headers.Authorization, "Bearer short-lived-token");
  assert.equal(requests[2].init.headers.Authorization, "Bearer short-lived-token");
} finally {
  globalThis.fetch = originalFetch;
}

const analyticsRows = [
  { external_id: "a", occurred_at: "2026-07-14T08:00:00.000Z", fuel_type: "Nafta", liters: 40, unit_price: 38, total_price: 1520, license_plate: "1AB 2345", vehicle_name: "Lis 101", matched_vehicle_id: "vehicle-1", match_status: "matched", match_method: "license_plate" },
  { external_id: "b", occurred_at: "2026-07-14T12:00:00.000Z", fuel_type: "Nafta", liters: 20, unit_price: 40, total_price: null, license_plate: "9ZZ 9999", matched_vehicle_id: null, match_status: "unmatched", match_method: null },
  { external_id: "c", occurred_at: "2026-07-15T07:00:00.000Z", fuel_type: "AdBlue", liters: 10, unit_price: null, total_price: null, license_plate: "", matched_vehicle_id: null, match_status: "ambiguous", match_method: null }
];
const analytics = buildOrwiiFuelAnalytics(analyticsRows, { period: "30d", range: { from: "2026-06-16", to: "2026-07-15" } });
assert.equal(analytics.summary.transactionCount, 3);
assert.equal(analytics.summary.liters, 70);
assert.equal(analytics.summary.totalCost, 2320);
assert.equal(analytics.summary.averageUnitPrice, 38.667);
assert.equal(analytics.summary.priceCoverage, 0.6667);
assert.equal(analytics.summary.matchedCount, 1);
assert.equal(analytics.summary.unmatchedCount, 1);
assert.equal(analytics.summary.ambiguousCount, 1);
assert.equal(analytics.summary.matchCoverage, 0.3333);
assert.equal(analytics.byVehicle.length, 1);
assert.equal(analytics.byVehicle[0].key, "vehicle-1");
assert.equal(analytics.byVehicle[0].totalCost, 1520);
assert.equal(analytics.byDay.length, 2);
assert.equal(analytics.recentTransactions[0].externalId, "a");
assert.equal(analytics.recentTransactions[0].vehicleName, "Lis 101");
assert.equal(Object.hasOwn(analytics.recentTransactions[0], "sourcePayloadJson"), false);

const d1Calls = [];
const fakeDb = {
  prepare(sql) {
    const call = { sql, params: [] };
    d1Calls.push(call);
    return {
      bind(...params) { call.params = params; return this; },
      async all() { return { results: analyticsRows }; }
    };
  }
};
const modularEnv = { DB_CORE: fakeDb, DB_AUDIT: fakeDb, DB_ARCHIVE: fakeDb };
const databaseAnalytics = await getOrwiiFuelAnalytics(modularEnv, { period: "7d", now: new Date("2026-07-15T12:00:00.000Z") });
assert.deepEqual(databaseAnalytics.range, { from: "2026-07-09", to: "2026-07-15" });
assert.deepEqual(d1Calls[0].params, ["2026-07-09T00:00:00.000Z", "2026-07-16T00:00:00.000Z"]);
assert.match(d1Calls[0].sql, /json_extract\(source_payload_json, '\$\.vehicle\.name'\) AS vehicle_name/);
await assert.rejects(() => getOrwiiFuelAnalytics(modularEnv, { period: "invalid" }), /Neplatné období/);
console.log("orwii-fuel-store tests passed");

// Recovery must advance from the persisted checkpoint, not from today's date.
const recoveryNow = new Date("2026-10-22T12:00:00.000Z");
assert.deepEqual(orwiiFuelSyncRange({ requested_to: "2026-09-16" }, recoveryNow), { from: "2026-09-13", to: "2026-09-19" });
assert.deepEqual(orwiiFuelSyncRange(null, recoveryNow, "2026-09-16"), { from: "2026-09-16", to: "2026-09-22" });
let checkpoint = { requested_to: "2026-09-16" };
const covered = new Set();
for (let attempt = 0; attempt < 20; attempt++) {
  const window = orwiiFuelSyncRange(checkpoint, recoveryNow);
  for (let date = Date.parse(window.from); date <= Date.parse(window.to); date += 86400000) covered.add(new Date(date).toISOString().slice(0, 10));
  checkpoint = { requested_to: window.to };
  if (window.to === "2026-10-22") break;
}
assert.equal(checkpoint.requested_to, "2026-10-22");
for (let day = Date.parse("2026-09-16"); day <= Date.parse("2026-10-22"); day += 86400000) assert.ok(covered.has(new Date(day).toISOString().slice(0, 10)));
assert.throws(() => orwiiFuelSyncRange(null, recoveryNow, "2026-12-01"), /začátek obnovy/);
const testEnv = { APP_ENV: "test", ORWII_API_USERNAME: "test@example.invalid", ORWII_API_PASSWORD: "test-only", SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({ vehicles: [] }) };
const sourceStart = Date.parse("2026-10-01T00:00:00.000Z");
const sourceRows = Array.from({ length: 4201 }, (_, i) => ({ transactionId: "recovery-" + i, from: sourceStart + i * 10000, volumeInLitres: 1 }));
let stationCount = 1;
let corruptFilter = false;
let saturated = false;
let failSecondStation = false;
let sourceRequests = 0;
globalThis.fetch = async (url) => {
  const target = new URL(String(url));
  if (target.pathname === "/getShortLivedToken") return Response.json({ token: "test-token" });
  if (target.pathname === "/getFillingStations") return Response.json(Array.from({ length: stationCount }, (_, i) => ({ id: "station-" + i })));
  if (target.pathname !== "/getRefuellings") throw new Error("unexpected source request");
  sourceRequests++;
  if (failSecondStation && target.searchParams.get("fillingStationId") === "station-1") return new Response("source unavailable", { status: 503 });
  if (saturated) return Response.json({ items: [], hasMore: true });
  if (corruptFilter) return Response.json([{ transactionId: "wrong-window", from: sourceStart - 1, volumeInLitres: 1 }]);
  const from = Number(target.searchParams.get("from"));
  const to = Number(target.searchParams.get("to"));
  return Response.json(sourceRows.filter(row => row.from >= from && row.from <= to).slice(0, 2000));
};
try {
  const result = await previewOrwiiFuelTransactions(testEnv, {}, { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(result.summary.total, sourceRows.length, "all 4201 IDs survive a source cap of 2000");
  assert.equal(new Set(result.transactions.map(row => row.externalId)).size, sourceRows.length);
  assert.equal(result.transactions.reduce((sum, row) => sum + row.liters, 0), 4201);
  assert.ok(sourceRequests > 1, "saturated windows are subdivided");
  stationCount = 2;
  const duplicated = await previewOrwiiFuelTransactions(testEnv, {}, { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(duplicated.summary.total, 4201, "the same source ID is not counted twice across stations");
  failSecondStation = true;
  await assert.rejects(() => previewOrwiiFuelTransactions(testEnv, {}, { from: "2026-10-01", to: "2026-10-01" }), error => error.code === "orwii_http_error");
  stationCount = 1; failSecondStation = false; corruptFilter = true;
  await assert.rejects(() => previewOrwiiFuelTransactions(testEnv, {}, { from: "2026-10-01", to: "2026-10-01" }), error => error.code === "orwii_window_filter_not_applied");
  corruptFilter = false; saturated = true;
  await assert.rejects(() => previewOrwiiFuelTransactions(testEnv, {}, { from: "2026-10-01", to: "2026-10-01" }), error => error.code === "orwii_window_incomplete");
} finally { globalThis.fetch = originalFetch; }
console.log("ORWII bounded recovery and completeness regressions passed");

// Expiry preserves audit history and never marks an incomplete window completed.
let abandonedSql = "";
let abandonedParams = [];
await expireAbandonedOrwiiRuns({ prepare(sql) { abandonedSql = sql; return { bind(...params) { abandonedParams = params; return this; }, async run() { return { meta: { changes: 1 } }; } }; } }, recoveryNow);
assert.match(abandonedSql, /status = 'error'/);
assert.match(abandonedSql, /WHERE status = 'running' AND julianday\(started_at\) < julianday\(\?\)/);
assert.doesNotMatch(abandonedSql, /requested_to\s*=/);
assert.deepEqual(abandonedParams, ["2026-10-22T12:00:00.000Z", "2026-10-22T11:30:00.000Z"]);
console.log("ORWII abandoned-run lease regression passed");
