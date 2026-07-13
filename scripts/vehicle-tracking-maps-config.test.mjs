import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { vehicleTrackingMapsConfigPayload } from "../functions/api/vehicle-tracking/maps-config.js";
import {
  VEHICLE_TRACKING_KAISER_SITE,
  normalizeVehicleTrackingLicensePlate,
  vehicleTrackingCustomIconForVehicle,
  vehicleTrackingHeadingOffsetForVehicle,
  vehicleTrackingVisualHeading
} from "../src/data/vehicleTracking.js";
import {
  DEFAULT_VEHICLE_TRACKING_PREFERENCES,
  VEHICLE_TRACKING_INFO_STYLES,
  normalizeVehicleTrackingInfoStyle,
  normalizeVehicleTrackingPreferences
} from "../src/data/vehicleTrackingPreferences.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tcarsClientSource = readFileSync(new URL("../functions/_lib/tcars-client.js", import.meta.url), "utf8");

{
  assert.equal(DEFAULT_VEHICLE_TRACKING_PREFERENCES.infoStyle, "compact");
  assert.deepEqual(VEHICLE_TRACKING_INFO_STYLES.map((item) => item.id), ["compact", "plate", "speedometer", "telemetry"]);
  assert.equal(normalizeVehicleTrackingInfoStyle(" speedometer "), "speedometer");
  assert.equal(normalizeVehicleTrackingInfoStyle("unknown"), "compact");
  assert.equal(normalizeVehicleTrackingPreferences({ infoStyle: "telemetry" }).infoStyle, "telemetry");
}

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

{
  const markerContent = appSource.slice(
    appSource.indexOf("function vehicleTrackingTcarsInfoPanel"),
    appSource.indexOf("function vehicleTrackingTcarsInvalidSection")
  );
  const markerOverlay = appSource.slice(
    appSource.indexOf("function createVehicleTrackingTcarsGoogleMarker"),
    appSource.indexOf("function clearVehicleTrackingTcarsGoogleMap")
  );

  assert.match(markerContent, /tracking-tcars-google-pin__position/);
  assert.match(markerContent, /tracking-position-arrow__body/);
  assert.match(markerContent, /tracking-tcars-google-pin__label--speedometer/);
  assert.match(markerContent, /tracking-tcars-google-pin__label--telemetry/);
  assert.doesNotMatch(markerOverlay, /setProperty\("--heading"/);
  assert.match(styleSource, /\.tracking-tcars-google-marker\s*\{[\s\S]*?transform:\s*translate\(-50%, -100%\)/);
  assert.match(styleSource, /\.tracking-tcars-google-pin__icon img\s*\{[\s\S]*?transform:\s*translateY\(-8px\);/);
  assert.doesNotMatch(styleSource, /tracking-tcars-google-pin__icon img[\s\S]{0,420}rotate\(var\(--heading/);
  assert.doesNotMatch(styleSource, /\.tracking-tcars-google-pin__position\s*\{[\s\S]{0,360}?clip-path:\s*polygon\(/);
  assert.match(styleSource, /\.tracking-position-arrow__body\s*\{[\s\S]*?stroke-linejoin:\s*round/);
  assert.match(appSource, /data-tracking-info-style/);
  assert.match(tcarsClientSource, /voltage:\s*gps\.voltage/);
  assert.match(tcarsClientSource, /emergency:\s*gps\.emergency/);
}

console.log("vehicle-tracking maps config tests: ok");
