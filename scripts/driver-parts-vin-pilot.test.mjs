import assert from "node:assert/strict";

import {
  driverPartAiCandidateFromMatch,
  identifyProbablePartFromDescription
} from "../functions/_lib/driver-parts-catalog.js";
import { __test as driverPartRequestInternals } from "../functions/_lib/driver-part-requests-store.js";
import { __test as notificationInternals } from "../functions/_lib/notification-service.js";
import { partslink24EligibilityForVehicle } from "../functions/_lib/partslink24-search-store.js";

const adminUser = {
  id: "radim-oplustil",
  name: "Radim Oplustil",
  role: "admin"
};

function passengerVehicle(overrides = {}) {
  return {
    id: "vehicle-passenger-1",
    vehicleId: "vehicle-passenger-1",
    internalNumber: "Mercedes CLS 400 d 4matic",
    licensePlate: "2BB 8251",
    vin: "WDD2573211A123456",
    vehicleType: "osobní",
    bodyType: "M1",
    brand: "Mercedes",
    model: "CLS",
    ...overrides
  };
}

{
  const match = identifyProbablePartFromDescription("Prasklé přední sklo");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "přední sklo");
  assert.equal(match.confidence, "high");
}

{
  const match = identifyProbablePartFromDescription("Pravé vnější zpětné zrcátko");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "pravé vnější zpětné zrcátko");
  assert.equal(match.probablePartSide, "right");
}

{
  const match = identifyProbablePartFromDescription("Něco píská na podvozku");
  assert.equal(driverPartAiCandidateFromMatch(match), false);
  assert.equal(match.aiSkipReason, "ambiguous_fault");
}

{
  const match = identifyProbablePartFromDescription("Výměna oleje");
  assert.equal(driverPartAiCandidateFromMatch(match), false);
  assert.equal(match.aiSkipReason, "maintenance_or_consumable");
}

{
  const match = identifyProbablePartFromDescription("Prasklý výfuk");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "výfuk / díl výfuku");
  assert.equal(match.confidence, "high");
}

{
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle({
    vehicleType: "nákladní vozidlo",
    bodyType: "N3"
  }));
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_ONLY_PASSENGER_VEHICLES");
}

{
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle({ vin: "" }));
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_VIN_MISSING");
}

{
  const item = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    probablePart: "přední sklo",
    partsProviderStatus: "not_configured",
    patrikEmailStatus: "not_sent"
  };
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle());
  const state = driverPartRequestInternals.driverPartVinPilotState(item, eligibility, null);
  assert.equal(state.status, "provider_not_configured");
  assert.match(state.message, /Partslink24 není nastaven/);
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Prasklé přední sklo",
      licensePlate: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.probablePart, "přední sklo");
  assert.equal(payload.partVerificationStatus, "probable_part");
  assert.equal(payload.partsProviderId, "partslink24");
  assert.equal(payload.partsProviderStatus, "waiting_vin_pilot");
  assert.equal(payload.priceBoostStatus, "waiting_verified_part");
  assert.match(payload.partLookupQuery, /přední sklo/);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_vin_required");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_verified_part_required");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: false,
    manualVehicleReview: true,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_vehicle_not_verified");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, true);
  assert.equal(driverPartRequestInternals.driverPartRequestHasVerifiedPartForHandoff(item), true);
}

{
  assert.deepEqual(
    notificationInternals.emailRecipients("oplustil@kaiserservis.cz; invalid; patrik@example.test,oplustil@kaiserservis.cz"),
    ["oplustil@kaiserservis.cz", "patrik@example.test"]
  );
  assert.deepEqual(
    notificationInternals.parseDriverPartOffers(JSON.stringify({
      offers: [
        { title: "Výfuk", price: "1 990 Kč", seller: "Dodavatel", url: "https://example.test", availability: "skladem" },
        { title: "Druhá nabídka", priceText: "2 200 Kč" },
        { title: "Třetí nabídka", priceText: "2 500 Kč" },
        { title: "Čtvrtá nabídka", priceText: "3 000 Kč" }
      ]
    })).length,
    3
  );
  assert.equal(
    driverPartRequestInternals.pilotCcStatus({ PARTS_PILOT_CC_EMAIL: "oplustil@kaiserservis.cz" }, { patrikEmailStatus: "sent" }),
    "sent_or_included_by_backend"
  );
}

console.log("driver parts VIN pilot tests passed");
