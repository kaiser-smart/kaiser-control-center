import assert from "node:assert/strict";
import { matchFuelTransactionToVehicle, normalizeOrwiiFuelTransaction, orwiiFuelStatus } from "../functions/_lib/orwii-fuel-store.js";
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
console.log("orwii-fuel-store tests passed");
