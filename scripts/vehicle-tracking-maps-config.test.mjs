import assert from "node:assert/strict";

import { vehicleTrackingMapsConfigPayload } from "../functions/api/vehicle-tracking/maps-config.js";
import {
  VEHICLE_TRACKING_KAISER_SITE,
  normalizeVehicleTrackingLicensePlate,
  vehicleTrackingCustomIconForVehicle,
  vehicleTrackingHeadingOffsetForVehicle,
  vehicleTrackingVisualHeading
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
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "2BD 8835" }), "/vehicles/icons/mercedes-abroll-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "3BH 5548" }), "/vehicles/icons/mercedes-ramenac-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "2BC 1984" }), "/vehicles/icons/skoda-citigo-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ vehicle: { licensePlate: "3BN 3558" } }), "/vehicles/icons/mercedes-popelarske.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "6B9 3840" }), "/vehicles/icons/man-popelarske.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "3BI 2007" }), "/vehicles/icons/daf-abroll.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "2BJ 7654" }), "/vehicles/icons/iveco-rioned-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "9B4 6276" }), "/vehicles/icons/fuso-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "9C8 3570" }), "/vehicles/icons/mercedes-cisterna-milanek-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ name: "JCM Manitou MLT 630" }), "/vehicles/icons/manitou-mlt-630-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ name: "JCB Manitou MT 625H" }), "/vehicles/icons/manitou-mt-625h-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ name: "Ford Tranzit dodávka" }), "/vehicles/icons/ford-transit-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ name: "Mercedes Citan" }), "/vehicles/icons/mercedes-citan-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ model: "Škoda Karoq" }), "/vehicles/icons/skoda-karoq-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ model: "Opel Grandland" }), "/vehicles/icons/opel-grandland-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ model: "Audi A1" }), "/vehicles/icons/audi-a1-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ licensePlate: "Hyundai VZV" }), "/vehicles/icons/hyundai-vzv.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ vehicle: { description: "Mercedes Vito servis" } }), "/vehicles/icons/mercedes-vito.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ name: "MAN cisterna 3 m3" }), "/vehicles/icons/man-cisterna-v2.png");
  assert.equal(vehicleTrackingCustomIconForVehicle({ model: "Toyota Proace" }), "/vehicles/icons/toyota-proace-v2.png");
}

{
  assert.equal(vehicleTrackingVisualHeading(215, 0), 0);
  assert.equal(vehicleTrackingVisualHeading(215, 2), 0);
  assert.equal(vehicleTrackingVisualHeading(215, 3), 215);
  assert.equal(vehicleTrackingVisualHeading(-90, 24), 270);
  assert.equal(vehicleTrackingVisualHeading(215, 24, 135), 350);
  assert.equal(vehicleTrackingVisualHeading("neplatné", 24), 0);
  assert.equal(vehicleTrackingHeadingOffsetForVehicle({ iconType: "collection_truck" }), 135);
  assert.equal(vehicleTrackingHeadingOffsetForVehicle({ iconType: "car" }), 135);
}

{
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.address, "Trnkova 3052/137, 628 00 Brno");
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.latitude, 49.19121);
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.longitude, 16.67013);
  assert.equal(VEHICLE_TRACKING_KAISER_SITE.logoSrc, "/logo-kaiser.png");
  assert.equal("mapsUrl" in VEHICLE_TRACKING_KAISER_SITE, false);
}

console.log("vehicle-tracking maps config tests: ok");
