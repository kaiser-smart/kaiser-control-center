import assert from "node:assert/strict";
import { matchFuelTransactionToVehicle, normalizeOrwiiFuelTransaction, orwiiFuelStatus, previewOrwiiFuelTransactions } from "../functions/_lib/orwii-fuel-store.js";
const transaction = normalizeOrwiiFuelTransaction({ transactionId: 101, from: 1784017800000, volumeInLitres: "45,5", vehicleIdentifierValue: "CHIP-7", price: { value: 1800 }, pricePerUnit: { value: 39.56 }, vehicle: { id: "orwii-vehicle-1", registrationNumber: "1AB 2345", counterType: "OdometerInMeters", currentCounterState: 183400 } });
assert.equal(transaction.externalId, "101"); assert.equal(transaction.liters, 45.5);
assert.equal(transaction.odometerKm, 183.4); assert.equal(transaction.licensePlate, "1AB 2345");
const vehicle = { id: "vehicle-1", licensePlate: "1AB2345", fuelChipId: "chip-7" };
assert.deepEqual(matchFuelTransactionToVehicle(transaction, [vehicle]), { status: "matched", method: "fuel_chip_id", vehicleId: "vehicle-1" });
assert.equal(matchFuelTransactionToVehicle({ ...transaction, chipId: "", licensePlate: "9ZZ9999" }, [vehicle]).status, "unmatched");
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
console.log("orwii-fuel-store tests passed");
