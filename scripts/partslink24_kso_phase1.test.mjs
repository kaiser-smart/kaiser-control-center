import assert from "node:assert/strict";

import {
  Partslink24SearchStoreError,
  canUsePartslink24VinSearch,
  createPartslink24VinSearchAudit,
  isPartslink24PassengerVehicle,
  maskPartslink24Vin,
  normalizePartslink24VehicleKind,
  partslink24EligibilityForVehicle,
  partslink24VehicleKind
} from "../functions/_lib/partslink24-search-store.js";

const adminUser = { id: "user-admin", name: "Admin", role: "admin", status: "active" };
const dispatcherUser = { id: "user-dispecer", name: "Dispečer", role: "dispecer", status: "active" };
const driverUser = { id: "user-ridic", name: "Řidič", role: "ridic", status: "active" };

assert.equal(maskPartslink24Vin("WBA5K91050D895073"), "WBA**********5073");
assert.equal(maskPartslink24Vin("ABC1234"), "*******");
assert.equal(normalizePartslink24VehicleKind("Osobní vozidlo"), "osobni_vozidlo");
assert.equal(isPartslink24PassengerVehicle("osobní"), true);
assert.equal(isPartslink24PassengerVehicle("M1"), true);
assert.equal(isPartslink24PassengerVehicle("nákladní"), false);

assert.equal(canUsePartslink24VinSearch(adminUser), true);
assert.equal(canUsePartslink24VinSearch(dispatcherUser), true);
assert.equal(canUsePartslink24VinSearch(driverUser), false);

{
  const vehicle = {
    id: "vehicle-bmw",
    vehicleType: "Osobní vozidlo",
    vin: "WBA5K91050D895073"
  };
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, vehicle);
  assert.equal(partslink24VehicleKind(vehicle), "osobni_vozidlo");
  assert.equal(eligibility.allowed, true);
  assert.equal(eligibility.vehicleKind, "osobni");
  assert.equal(eligibility.vinMasked, "WBA**********5073");
}

{
  const clsVehicle = {
    id: "vehicle-cls",
    internalNumber: "Mercedes CLS 400 d 4matic",
    vin: "WDD2573211A012438"
  };
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, clsVehicle);
  assert.equal(partslink24VehicleKind(clsVehicle), "osobni");
  assert.equal(eligibility.allowed, true);
  assert.equal(eligibility.vehicleKind, "osobni");
}

{
  const eqsVehicle = {
    id: "vehicle-eqs",
    model: "Mercedes EQS SUV",
    vin: "WDD29712345678901"
  };
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, eqsVehicle);
  assert.equal(partslink24VehicleKind(eqsVehicle), "osobni");
  assert.equal(eligibility.allowed, true);
}

{
  const explicitTruck = {
    id: "vehicle-truck-cls-text",
    vehicleType: "nákladní",
    internalNumber: "Mercedes CLS 400 d 4matic",
    vin: "WDD2573211A012438"
  };
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, explicitTruck);
  assert.equal(partslink24VehicleKind(explicitTruck), "nakladni");
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_ONLY_PASSENGER_VEHICLES");
}

{
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, {
    id: "vehicle-truck",
    vehicleType: "nákladní",
    vin: "WDB12345678901234"
  });
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_ONLY_PASSENGER_VEHICLES");
}

{
  const eligibility = partslink24EligibilityForVehicle(dispatcherUser, {
    id: "vehicle-without-vin",
    vehicleType: "osobní"
  });
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_VIN_MISSING");
}

{
  const eligibility = partslink24EligibilityForVehicle(driverUser, {
    id: "vehicle-bmw",
    vehicleType: "osobní",
    vin: "WBA5K91050D895073"
  });
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_FORBIDDEN");
}

{
  await assert.rejects(
    () => createPartslink24VinSearchAudit({}, driverUser, {}),
    (error) => error instanceof Partslink24SearchStoreError && error.code === "partslink24_search_forbidden"
  );
}

{
  await assert.rejects(
    () => createPartslink24VinSearchAudit({}, adminUser, {}),
    (error) => error instanceof Partslink24SearchStoreError && error.code === "partslink24_database_missing"
  );
}

console.log("partslink24 KSO phase1 tests passed");
