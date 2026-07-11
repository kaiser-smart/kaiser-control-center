import assert from "node:assert/strict";

import { vehicleTrackingMapsConfigPayload } from "../functions/api/vehicle-tracking/maps-config.js";

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

console.log("vehicle-tracking maps config tests: ok");
