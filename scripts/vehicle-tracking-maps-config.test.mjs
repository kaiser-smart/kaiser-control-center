import assert from "node:assert/strict";

import { vehicleTrackingMapsConfigPayload } from "../functions/api/vehicle-tracking/maps-config.js";
import {
  VEHICLE_TRACKING_KAISER_SITE,
  normalizeVehicleTrackingLicensePlate,
  vehicleTrackingCustomIconForVehicle
} from "../src/data/vehicleTracking.js";

{
  const payload = vehicleTrackingMapsConfigPayload({});
  assert.deepEqual(payload, {
    apiStatus: "waiting",
    configured: false,
    provider: "google-maps-javascript",
    browserApiKey: "",
    message: "Google Maps klíč zatím není nastavený."
  });
}

{
  const payload = vehicleTrackingMapsConfigPayload({
    GOOGLE_MAPS_BROWSER_API_KEY: "  browser-key  "
  });
  assert.equal(payload.apiStatus, "ready");
  assert.equal(payload.configured, true);
  assert.equal(payload.browserApiKey, "browser-key");
  assert.equal(payload.provider, "google-maps-javascript");
}

{
  const payload = vehicleTrackingMapsConfigPayload({
    VITE_GOOGLE_MAPS_API_KEY: "legacy-preview-key"
  });
  assert.equal(payload.configured, true);
  assert.equal(payload.browserApiKey, "legacy-preview-key");
}

{
  assert.equal(normalizeVehicleTrackingLicensePlate(" 3BN 3558 "), "3BN3558");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "8B4 3007" }), "/vehicles/icons/man-abroll.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "2BD 8835" }), "/vehicles/icons/mercedes-abroll.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "3BH 5548" }), "/vehicles/icons/mercedes-ramenac.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "2BC 1984" }), "/vehicles/icons/skoda-citigo.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ vehicle: { licensePlate: "3BN 3558" } }), "/vehicles/icons/mercedes-popelarske.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "6B9 3840" }), "/vehicles/icons/man-popelarske.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "3BI 2007" }), "");
}

{
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.address, "Trnkova 3052/137, 628 00 Brno");
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.latitude, 49.19121);
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.longitude, 16.67013);
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.logoSrc, "/logo-kaiser.png");
  assert.equal("mapsUrl" in VEHICLE_TRACKING_KAISER_SITE, false);
}

console.log("vehicle-tracking maps config tests: ok");
