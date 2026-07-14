import assert from "node:assert/strict";
import { matchFuelTransactionToVehicle, normalizeOrwiiFuelTransaction } from "../functions/_lib/orwii-fuel-store.js";
const transaction = normalizeOrwiiFuelTransaction({ id: "TX-1", dateTime: "2026-07-14T08:30:00Z", liters: "45,5", licensePlate: "1AB 2345", chipId: "CHIP-7" });
assert.equal(transaction.externalId, "TX-1"); assert.equal(transaction.liters, 45.5);
const vehicle = { id: "vehicle-1", licensePlate: "1AB2345", fuelChipId: "chip-7" };
assert.deepEqual(matchFuelTransactionToVehicle(transaction, [vehicle]), { status: "matched", method: "fuel_chip_id", vehicleId: "vehicle-1" });
assert.equal(matchFuelTransactionToVehicle({ ...transaction, chipId: "", licensePlate: "9ZZ9999" }, [vehicle]).status, "unmatched");
assert.throws(() => normalizeOrwiiFuelTransaction({ liters: 10 }), /unikátní ID/);
console.log("orwii-fuel-store tests passed");
