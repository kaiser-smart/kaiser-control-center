import assert from "node:assert/strict";

import {
  driverPartAiCandidateFromMatch,
  identifyProbablePartFromDescription
} from "../functions/_lib/driver-parts-catalog.js";
import { __test as driverPartRequestInternals } from "../functions/_lib/driver-part-requests-store.js";
import {
  sendDriverPartOrderNotification,
  __test as notificationInternals
} from "../functions/_lib/notification-service.js";
import { partslink24EligibilityForVehicle } from "../functions/_lib/partslink24-search-store.js";
import {
  driverPartPriceSearchEligibility,
  runDriverPartPriceSearch
} from "../functions/_lib/driver-part-price-search.js";

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
  assert.equal(payload.vehicleName, "Mercedes CLS 400 d 4matic");
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Prasklý výfuk",
      licensePlate: "2BB 8251",
      vehicleName: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.vehicleName, "Mercedes CLS 400 d 4matic");
  assert.equal(driverPartRequestInternals.driverPartVehicleNameLooksLikePlate("2BB 8251", "2BB8251"), true);
  assert.equal(driverPartRequestInternals.driverPartVehicleDisplayName({ vehicleName: "2BB 8251" }, passengerVehicle(), "2BB8251"), "Mercedes CLS 400 d 4matic");
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
  const source = driverPartRequestInternals.driverPartRequestConfirmVehicleSource("voice_manual_vehicle_review");
  assert.equal(source, "voice_vehicle_confirmed");
  assert.equal(driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source), false);
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: !source.includes("unverified_plate"),
    manualVehicleReview: driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source),
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, true);
}

{
  assert.equal(
    driverPartRequestInternals.driverPartRequestHasTrustedKsoVehicleSelection({
      source: "voice",
      vehicleId: "vehicle-passenger-1",
      vehicleSelectionSource: "backend_ui_picker"
    }),
    true
  );
  assert.equal(
    driverPartRequestInternals.driverPartRequestHasTrustedKsoVehicleSelection({
      source: "voice",
      vehicleId: "vehicle-passenger-1",
      vehicleSelectionSource: "voice-explicit"
    }),
    false
  );
}

{
  const source = driverPartRequestInternals.driverPartRequestConfirmVehicleSource("manual_unverified_plate");
  assert.equal(source, "manual_unverified_plate_vehicle_confirmed");
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: !source.includes("unverified_plate"),
    manualVehicleReview: driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source),
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00"
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
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    partAiCandidate: true,
    probablePart: "výfuk / díl výfuku"
  };
  const eligibility = driverPartPriceSearchEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_price_verified_part_required");

  const voicePilotPriceEligibility = driverPartPriceSearchEligibility(item, { allowProbablePartSeed: true });
  assert.equal(voicePilotPriceEligibility.allowed, true);

  const handoffEligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(handoffEligibility.allowed, false);
  assert.equal(handoffEligibility.code, "driver_part_verified_part_required");

  const voicePilotHandoffEligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item, {
    allowProbablePartHandoff: true
  });
  assert.equal(voicePilotHandoffEligibility.allowed, true);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    partAiCandidate: true,
    probablePart: "výfuk / díl výfuku"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Nový výfuk díl výfuku Mercedes CLS", price: "5 900 Kč", seller: "Dodavatel C", url: "https://example.test/c" },
        { title: "Použitý výfuk díl výfuku Mercedes CLS bazar", price: "1 200 Kč", seller: "Bazoš", url: "https://bazos.test/a" },
        { title: "Výfuk díl výfuku Mercedes CLS", price: "4 800 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Díl výfuku výfuk Mercedes CLS skladem", price: "5 100 Kč", seller: "Dodavatel B", url: "https://example.test/b" }
      ]
    })
  }, item, { allowProbablePartSeed: true });
  assert.equal(result.status, "candidates_found");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B", "Dodavatel C"]);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", price: "12 900 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", price: "13 500 Kč", seller: "Dodavatel B", url: "https://example.test/b" }
      ]
    })
  }, item);
  assert.equal(result.status, "partial_results");
  assert.equal(result.ok, false);
  assert.equal(result.offers.length, 2);
  assert.match(result.message, /jen 2 z 3/);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  const result = await runDriverPartPriceSearch({}, item);
  assert.equal(result.status, "provider_not_configured");
  assert.match(result.message, /AI Boost web-search není nastavený/);
  assert.deepEqual(result.offers, []);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Tlumič výfuku A 257 490 12 00", price: "4 900 Kč", seller: "Dodavatel C", url: "https://example.test/c" },
        { title: "Použitý tlumič výfuku A 257 490 12 00 bazar", price: "900 Kč", seller: "Bazoš", url: "https://bazos.test/a" },
        { title: "Tlumič výfuku A 257 490 12 00", price: "3 800 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Tlumič výfuku A 257 490 12 00 skladem", price: "4 100 Kč", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Nerelevantní koberečky", price: "100 Kč", seller: "Dodavatel X", url: "https://example.test/x" },
        { title: "Tlumič výfuku A 257 490 12 00", price: "5 200 Kč", seller: "Dodavatel D", url: "https://example.test/d" }
      ]
    })
  }, item);
  assert.equal(result.status, "candidates_found");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B", "Dodavatel C"]);
  assert.equal(result.offers.some((offer) => /bazo/i.test(offer.seller)), false);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  let requestSnapshot = null;
  const result = await runDriverPartPriceSearch({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_PRICE_SEARCH_OPENAI_MODEL: "gpt-test"
  }, item, {
    fetchImpl: async (url, options) => {
      requestSnapshot = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            output_text: JSON.stringify({
              offers: [
                { title: "Tlumič výfuku A 257 490 12 00", price: "3 700 Kč", seller: "AI Dodavatel A", url: "https://example.test/ai-a", availability: "skladem" },
                { title: "Tlumič výfuku A 257 490 12 00", price: "3 950 Kč", seller: "AI Dodavatel B", url: "https://example.test/ai-b" },
                { title: "Tlumič výfuku A 257 490 12 00", price: "4 250 Kč", seller: "AI Dodavatel C", url: "https://example.test/ai-c" }
              ]
            })
          });
        }
      };
    }
  });
  assert.equal(requestSnapshot.url, "https://api.openai.com/v1/responses");
  assert.equal(requestSnapshot.body.tools[0].type, "web_search");
  assert.equal(requestSnapshot.body.tool_choice, "required");
  assert.equal(requestSnapshot.body.model, "gpt-test");
  assert.match(requestSnapshot.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(requestSnapshot.body.input, /WDD2573211A123456|2BB 8251/);
  assert.equal(result.status, "candidates_found");
  assert.equal(result.provider, "openai_web_search");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["AI Dodavatel A", "AI Dodavatel B", "AI Dodavatel C"]);
}

{
  const itemWithoutOffers = {
    priceBoostStatus: "failed",
    priceBoostNote: "AI Boost cenový průzkum selhal: The operation was aborted. Pokračuj ručně.",
    priceBoostResultJson: JSON.stringify({
      ok: false,
      offers: []
    })
  };
  const priceEligibility = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithoutOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(priceEligibility.allowed, false);
  assert.equal(priceEligibility.code, "driver_part_price_offers_required");
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithoutOffers), false);

  const itemWithTwoOffers = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo",
    priceBoostStatus: "partial_results",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" }
      ]
    })
  };
  const vinPilotWaitingLinks = driverPartRequestInternals.driverPartVinPilotState(itemWithTwoOffers, { allowed: true });
  assert.equal(vinPilotWaitingLinks.status, "waiting_price_links");
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithTwoOffers), false);

  const itemWithOffers = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo",
    priceBoostStatus: "candidates_found",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c" }
      ]
    })
  };
  const priceEligibilityWithOffers = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(priceEligibilityWithOffers.allowed, true);
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithOffers), true);
  assert.equal(driverPartRequestInternals.driverPartRequestPriceOffers(itemWithOffers).length, 3);
  const vinPilotEmailReady = driverPartRequestInternals.driverPartVinPilotState(itemWithOffers, { allowed: true });
  assert.equal(vinPilotEmailReady.status, "email_ready");

  const readinessWithTwoOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    ...itemWithTwoOffers,
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    vin: "WDD2573211A123456"
  }, { allowProbablePartHandoff: true });
  assert.equal(readinessWithTwoOffers.canSendEmail, false);
  assert.equal(readinessWithTwoOffers.canRunPriceBoost, true);
  assert.equal(readinessWithTwoOffers.status, "price_search_ready");
  assert.equal(readinessWithTwoOffers.priceOfferCount, 2);
  assert.equal(readinessWithTwoOffers.missingPriceOfferCount, 1);
  assert.equal(readinessWithTwoOffers.blockers.some((blocker) => blocker.code === "driver_part_price_offers_required"), true);

  const readinessWithThreeOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    ...itemWithOffers,
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    vin: "WDD2573211A123456"
  }, { allowProbablePartHandoff: true });
  assert.equal(readinessWithThreeOffers.ok, true);
  assert.equal(readinessWithThreeOffers.canSendEmail, true);
  assert.equal(readinessWithThreeOffers.status, "email_ready");
  assert.equal(readinessWithThreeOffers.priceOfferCount, 3);
  assert.equal(readinessWithThreeOffers.blockers.length, 0);

  const probablePartWithThreeOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    partAiCandidate: true,
    probablePart: "přední sklo",
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    priceBoostStatus: "candidates_found",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c" }
      ]
    })
  }, { allowProbablePartHandoff: true });
  assert.equal(probablePartWithThreeOffers.canSendEmail, true);
  assert.equal(probablePartWithThreeOffers.partVerified, false);
  assert.equal(probablePartWithThreeOffers.probablePartAllowed, true);
  assert.equal(probablePartWithThreeOffers.priceOfferCount, 3);

  const preview = await driverPartRequestInternals.driverPartRequestPriceSearchPreviewForItem({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c" }
      ]
    }),
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    partAiCandidate: true,
    probablePart: "přední sklo",
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456"
  }, { allowProbablePartSeed: true });
  assert.equal(preview.ok, true);
  assert.equal(preview.persisted, false);
  assert.equal(preview.emailSent, false);
  assert.equal(preview.offers.length, 3);
  assert.equal(preview.readiness.canSendEmail, true);
}

{
  const skippedEmail = await sendDriverPartOrderNotification({}, {
    id: "driver-report-no-links",
    licensePlate: "2BB 8251",
    probablePart: "přední sklo",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "" }
      ]
    })
  }, {
    recipientEmail: "patrik@example.test",
    ccEmail: "oplustil@kaiserservis.cz"
  });
  assert.equal(skippedEmail.status, "skipped");
  assert.equal(skippedEmail.offerCount, 0);
  assert.equal(skippedEmail.requiredOfferCount, 3);
  assert.match(skippedEmail.errorMessage, /chybí 3 cenové nabídky s odkazy/);

  const emailReady = notificationInternals.driverPartOrderEmailReadiness({
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c" }
      ]
    })
  });
  assert.equal(emailReady.allowed, true);
  assert.equal(emailReady.offerCount, 3);

  const emailHtml = notificationInternals.renderDriverPartOrderEmail({
    request: {
      id: "driver-report-email-preview",
      driverName: "Radim Opluštil",
      driverPhone: "604 542 004",
      vehicleName: "Mercedes CLS 400 d 4matic",
      licensePlate: "2BB 8251",
      vin: "WDD2573211A123456",
      defectDescription: "prasklé přední sklo",
      probablePart: "přední sklo",
      partVerificationStatus: "probable_part",
      priceBoostResultJson: JSON.stringify({
        offers: [
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
          { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" },
          { title: "Sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c" }
        ]
      })
    },
    ctaUrl: "https://kaiser-control-center.pages.dev/hlaseni-ridicu?request=driver-report-email-preview",
    patrikUrl: "https://kaiser-control-center.pages.dev/dovolena-nemoc/zamestnanci/patrik-istvanek"
  });
  assert.match(emailHtml, /3 nejlevnější nabídky/);
  assert.match(emailHtml, /https:\/\/example\.test\/a/);
  assert.match(emailHtml, /https:\/\/example\.test\/b/);
  assert.match(emailHtml, /https:\/\/example\.test\/c/);
  assert.equal(emailHtml.includes("probable_part"), false);
  assert.ok(emailHtml.indexOf("3 nejlevnější nabídky") < emailHtml.indexOf("Řidič:"));

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
