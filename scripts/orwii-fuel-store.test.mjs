import assert from "node:assert/strict";
import {
  buildOrwiiFuelAnalytics,
  getOrwiiFuelAnalytics,
  matchFuelTransactionToVehicle,
  normalizeOrwiiFuelTransaction,
  orwiiFuelStatus,
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
  if (requestUrl.includes("/getRefuellings")) return new Response(JSON.stringify([{ transactionId: "tx-1", from: 1784017800000, volumeInLitres: 20, vehicle: { registrationNumber: "1AB2345" } }]), { status: 200, headers: { "Content-Type": "application/json" } });
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
const databaseAnalytics = await getOrwiiFuelAnalytics({ SMART_ODPADY_DB: fakeDb }, { period: "7d", now: new Date("2026-07-15T12:00:00.000Z") });
assert.deepEqual(databaseAnalytics.range, { from: "2026-07-09", to: "2026-07-15" });
assert.deepEqual(d1Calls[0].params, ["2026-07-09T00:00:00.000Z", "2026-07-16T00:00:00.000Z"]);
assert.match(d1Calls[0].sql, /json_extract\(source_payload_json, '\$\.vehicle\.name'\) AS vehicle_name/);
await assert.rejects(() => getOrwiiFuelAnalytics({ SMART_ODPADY_DB: fakeDb }, { period: "invalid" }), /Neplatné období/);
console.log("orwii-fuel-store tests passed");
