import assert from "node:assert/strict";

import {
  ELEVENLABS_CLIENT_TOOL_SCHEMAS,
  createElevenLabsClientTools
} from "../src/elevenLabsClientTools.js";
import {
  SARLOTA_COLLECTION_ROUTES_CONTEXT_PROMPT_RULE,
  SARLOTA_COLLECTION_ROUTES_INCIDENT_PROMPT_RULE
} from "../src/sarlota/sarlotaSystemPrompt.js";

const originalWindow = globalThis.window;
globalThis.window = { location: { pathname: "/trasy-svozu" } };

let captureCalls = 0;
let incidentCalls = 0;
let driverActionCalls = 0;
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
  prepareCollectionRouteTestIncident: async (parameters) => {
    incidentCalls += 1;
    assert.equal(parameters.currentModuleRoute, "/trasy-svozu");
    assert.ok(["overfilled_container", "damaged_container"].includes(parameters.incidentType));
    return {
      ok: true,
      status: "incident_ready_for_photo",
      incidentPrepared: true,
      saved: false,
      finalTapRequired: true,
      photoRequired: true,
      sendsNotifications: false,
      changesRoute: false,
      answerText: "Otevřela jsem TEST hlášení."
    };
  },
  prepareCollectionRouteDriverAction: async (parameters) => {
    driverActionCalls += 1;
    assert.equal(parameters.currentModuleRoute, "/trasy-svozu/test");
    assert.equal(parameters.action, "break");
    return {
      ok: true,
      status: "driver_action_ready_for_tap",
      prepared: true,
      saved: false,
      finalTapRequired: true,
      answerText: "Přestávka je připravená k potvrzení."
    };
  },
  requestJson: async () => {
    requestCalls += 1;
    throw new Error("Výběr vozidla se pro GPS stanoviště nesmí načíst.");
  }
});

assert.match(SARLOTA_COLLECTION_ROUTES_CONTEXT_PROMPT_RULE, /currentStop\.address/);
assert.match(SARLOTA_COLLECTION_ROUTES_CONTEXT_PROMPT_RULE, /collection_route_current_address/);
assert.match(SARLOTA_COLLECTION_ROUTES_CONTEXT_PROMPT_RULE, /nesmíš tvrdit, že ji nevidíš/);
assert.match(SARLOTA_COLLECTION_ROUTES_CONTEXT_PROMPT_RULE, /neslibuj pozdější dohledání/);
assert.match(SARLOTA_COLLECTION_ROUTES_INCIDENT_PROMPT_RULE, /Nástroj zavolej dřív/);
assert.match(SARLOTA_COLLECTION_ROUTES_INCIDENT_PROMPT_RULE, /Bez skutečného výsledku Toolu nesmíš říct/);

{
  const schema = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((tool) => tool.name === "prepare_collection_route_gps_capture");
  assert.ok(schema);
  assert.match(schema.description, /Nástroj nic neukládá/);
  assert.match(schema.description, /fyzické klepnutí člověka/);
}

{
  const schema = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((tool) => tool.name === "prepare_collection_route_test_incident");
  assert.ok(schema);
  assert.match(schema.description, /POVINNĚ VOLEJ OKAMŽITĚ/);
  assert.match(schema.description, /poškozenou/);
  assert.match(schema.description, /Teprve skutečný výsledek tohoto Toolu/);
  assert.match(schema.description, /nic neukládá ani neodesílá/);
  assert.match(schema.description, /velké fyzické klepnutí člověka/);
}

{
  const schema = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((tool) => tool.name === "prepare_collection_route_driver_action");
  assert.ok(schema);
  assert.match(schema.description, /nikdy sám nezapisuje stav/i);
  assert.match(schema.description, /fyzické klepnutí řidiče/i);
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
  const result = await tools.prepare_collection_route_test_incident({
    incidentType: "overfilled_container",
    transcriptIntent: "Šarloto, přeplněná nádoba"
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "incident_ready_for_photo");
  assert.equal(result.incidentPrepared, true);
  assert.equal(result.saved, false);
  assert.equal(result.finalTapRequired, true);
  assert.equal(result.photoRequired, true);
  assert.equal(result.sendsNotifications, false);
  assert.equal(result.changesRoute, false);
  assert.equal(incidentCalls, 1);
}

{
  const result = await tools.prepare_collection_route_test_incident({
    incidentType: "damaged_container",
    transcriptIntent: "Potřebuju nahlásit poškozenou nádobu"
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "incident_ready_for_photo");
  assert.equal(result.incidentPrepared, true);
  assert.equal(result.saved, false);
  assert.equal(result.finalTapRequired, true);
  assert.equal(result.photoRequired, true);
  assert.equal(result.sendsNotifications, false);
  assert.equal(result.changesRoute, false);
  assert.equal(incidentCalls, 2);
}

{
  const result = await tools.show_driver_vehicle_picker({
    transcriptIntent: "Šarloto, přeplněná nádoba",
    currentModuleRoute: "/trasy-svozu"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "wrong_tool_for_collection_incident");
  assert.equal(result.pickerOpened, false);
  assert.equal(result.nextTool, "prepare_collection_route_test_incident");
  assert.equal(requestCalls, 0);
}

{
  globalThis.window.location.pathname = "/trasy-svozu/test";
  const result = await tools.prepare_collection_route_driver_action({
    action: "break",
    transcriptIntent: "Dávám si přestávku"
  });
  assert.equal(result.ok, true);
  assert.equal(result.prepared, true);
  assert.equal(result.saved, false);
  assert.equal(result.finalTapRequired, true);
  assert.equal(driverActionCalls, 1);
  globalThis.window.location.pathname = "/trasy-svozu";
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

{
  const result = await tools.prepare_collection_route_test_incident({
    incidentType: "overfilled_container",
    transcriptIntent: "Přeplněná nádoba"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "wrong_module");
  assert.equal(result.saved, false);
  assert.equal(incidentCalls, 2);
}

if (originalWindow === undefined) {
  delete globalThis.window;
} else {
  globalThis.window = originalWindow;
}

console.log("sarlota collection-route GPS tests passed");
