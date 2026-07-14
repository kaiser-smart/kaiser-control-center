import assert from "node:assert/strict";

import {
  ELEVENLABS_CLIENT_TOOL_SCHEMAS,
  createElevenLabsClientTools
} from "../src/elevenLabsClientTools.js";

const originalWindow = globalThis.window;
globalThis.window = { location: { pathname: "/trasy-svozu" } };

let captureCalls = 0;
let requestCalls = 0;
const tools = createElevenLabsClientTools({
  prepareCollectionRouteGpsCapture: async (parameters) => {
    captureCalls += 1;
    assert.equal(parameters.currentModuleRoute, "/trasy-svozu");
    assert.match(parameters.transcriptIntent, /GPS stanoviště/);
    return {
      ok: true,
      status: "measurement_ready",
      measurementPrepared: true,
      saved: false,
      finalTapRequired: true,
      vehicleSelectionRequired: false,
      answerText: "Měření je připravené."
    };
  },
  requestJson: async () => {
    requestCalls += 1;
    throw new Error("Výběr vozidla se pro GPS stanoviště nesmí načíst.");
  }
});

{
  const schema = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((tool) => tool.name === "prepare_collection_route_gps_capture");
  assert.ok(schema);
  assert.match(schema.description, /Nástroj nic neukládá/);
  assert.match(schema.description, /fyzické klepnutí člověka/);
}

{
  const result = await tools.prepare_collection_route_gps_capture({
    transcriptIntent: "Šarloto, potvrď GPS stanoviště"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "measurement_ready");
  assert.equal(result.measurementPrepared, true);
  assert.equal(result.saved, false);
  assert.equal(result.finalTapRequired, true);
  assert.equal(result.vehicleSelectionRequired, false);
  assert.equal(captureCalls, 1);
}

{
  const result = await tools.show_driver_vehicle_picker({
    transcriptIntent: "Šarloto, potvrď GPS stanoviště",
    currentModuleRoute: "/trasy-svozu"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "wrong_tool_for_collection_gps");
  assert.equal(result.pickerOpened, false);
  assert.equal(result.nextTool, "prepare_collection_route_gps_capture");
  assert.equal(requestCalls, 0);
}

{
  globalThis.window.location.pathname = "/hlaseni-ridicu";
  const result = await tools.prepare_collection_route_gps_capture({
    transcriptIntent: "Potvrď GPS stanoviště"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "wrong_module");
  assert.equal(result.saved, false);
  assert.equal(captureCalls, 1);
}

if (originalWindow === undefined) {
  delete globalThis.window;
} else {
  globalThis.window = originalWindow;
}

console.log("sarlota collection-route GPS tests passed");
