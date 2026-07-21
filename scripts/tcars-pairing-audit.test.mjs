import assert from "node:assert/strict";
import { buildTcarsPairingAuditPayload } from "../functions/_lib/tcars-pairing-audit.js";

const payload = buildTcarsPairingAuditPayload([
  { vistosVehicleId: "1", name: "MAN svoz", registrationPlate: "3BN 3558", vinMasked: "…ABC123", category: "Svozové" },
  { vistosVehicleId: "2", name: "Bez VIN", registrationPlate: "1AB 2345", vinMasked: "" },
  { vistosVehicleId: "3", name: "Duplicita", registrationPlate: "2BC 3456", vinMasked: "…DUP456" },
  { vistosVehicleId: "4", name: "Konflikt", registrationPlate: "4DE 5678", vinMasked: "…BAD999" },
  { vistosVehicleId: "5", name: "Bez kandidáta", registrationPlate: "5EF 6789", vinMasked: "…NONE00" }
], [
  { tcarsVehicleId: "42", licensePlate: "3BN3558", vin: "WMA00000000ABC123", active: true, model: "MAN" },
  { tcarsVehicleId: "43", licensePlate: "1AB 2345", vin: "", active: true },
  { tcarsVehicleId: "44", licensePlate: "2BC 3456", vin: "WMA00000000DUP456", active: true },
  { tcarsVehicleId: "45", licensePlate: "2BC3456", vin: "WMA00000001DUP456", active: true },
  { tcarsVehicleId: "46", licensePlate: "4DE 5678", vin: "WMA00000000GOOD88", active: true }
], { generatedAt: "2026-07-21T12:00:00.000Z" });

assert.equal(payload.readOnly, true);
assert.equal(payload.writesData, false);
assert.equal(payload.createsLinks, false);
assert.equal(payload.requiresManualConfirmation, true);
assert.deepEqual(payload.summary, {
  total: 5,
  candidateRows: 4,
  unmatched: 1,
  ambiguous: 1,
  conflict: 1,
  readyToVerify: 2
});
assert.equal(payload.rows[0].status, "ready_to_verify");
assert.equal(payload.rows[0].candidates[0].vinEvidence.status, "match");
assert.equal(payload.rows[1].candidates[0].vinEvidence.status, "unknown");
assert.equal(payload.rows[2].status, "ambiguous");
assert.equal(payload.rows[3].status, "conflict");
assert.equal(payload.rows[4].status, "unmatched");
assert.equal("vin" in payload.rows[0].candidates[0], false);

console.log("T-Cars pairing audit tests: ok");
