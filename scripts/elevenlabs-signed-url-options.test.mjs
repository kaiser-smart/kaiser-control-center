import assert from "node:assert/strict";

import {
  collectionRoutesContextVariables,
  dynamicVariablesWithConversationId
} from "../functions/api/ai/elevenlabs/signed-url.js";
import { useElevenLabsAssistant } from "../src/useElevenLabsAssistant.js";

{
  const variables = dynamicVariablesWithConversationId({ user_id: "radim-oplustil" }, "conv_123");
  assert.equal(variables.user_id, "radim-oplustil");
  assert.equal(variables.conversation_id, "conv_123");
}

{
  const variables = dynamicVariablesWithConversationId({ user_id: "radim-oplustil" }, "", "kso-session-fallback");
  assert.equal(variables.conversation_id, "kso-session-fallback");
}

{
  const variables = await collectionRoutesContextVariables(
    {},
    { id: "pneumatiky-miroslav-vasek", name: "Miroslav Vašek" },
    "/trasy-svozu/test",
    {
      run: {
        id: "test-run",
        status: "active",
        scope: "test",
        vehicleLabel: "TEST vůz",
        summary: { plannedCount: 1, doneCount: 2, problemCount: 0 },
        metadata: { physicalTesterName: "Tomáš Gaží" }
      },
      stops: [{
        id: "test-stop",
        status: "planned",
        routeOrder: 3,
        customerName: "Firma test 501",
        stationName: "Dvůr",
        addressText: "Trnkova 3052/137, 628 00 Brno",
        wasteType: "SKO"
      }]
    }
  );
  const context = JSON.parse(variables.current_module_context);
  assert.equal(variables.current_module, "Svozové trasy");
  assert.equal(variables.current_module_route, "/trasy-svozu/test");
  assert.equal(context.mode, "driver-tablet");
  assert.equal(context.dataScope, "test");
  assert.equal(context.actorName, "Miroslav Vašek");
  assert.equal(context.physicalTesterName, "Tomáš Gaží");
  assert.equal(context.currentStop.customerName, "Firma test 501");
  assert.match(context.safety, /fyzické klepnutí/);
  assert.match(context.safety, /Vistosu/);
}

const requestedPaths = [];
globalThis.window = { location: { pathname: "/datove-schranky-plus" } };
const assistant = useElevenLabsAssistant({
  signedUrlOptions: (assistantId, sessionContext = {}) => ({
    omitDriverReportVehicleContext: ["sarlota", "sarlota-smart-2"].includes(assistantId) && sessionContext.interfaceMode === "voice"
  }),
  fetchJson: async (path) => {
    requestedPaths.push(path);
    return {
      signedUrl: "wss://example.invalid",
      assistantId: "sarlota",
      assistantName: "Šarlota",
      configured: true
    };
  }
});

await assistant.prepareSignedUrl("sarlota", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /assistant=sarlota/);
assert.match(requestedPaths.at(-1), /diagnosticMode=identity_no_driver_vehicles/);
assert.match(requestedPaths.at(-1), /currentRoute=%2Fdatove-schranky-plus/);

globalThis.window.location.pathname = "/trasy-svozu";
const collectionAssistant = useElevenLabsAssistant({
  signedUrlOptions: (assistantId, sessionContext = {}) => ({
    omitDriverReportVehicleContext: ["sarlota", "sarlota-smart-2"].includes(assistantId) && sessionContext.interfaceMode === "voice"
  }),
  fetchJson: async (path) => {
    requestedPaths.push(path);
    return {
      signedUrl: "wss://example.invalid/collection-routes",
      assistantId: "sarlota",
      assistantName: "Šarlota",
      configured: true
    };
  }
});
await collectionAssistant.prepareSignedUrl("sarlota", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /currentRoute=%2Ftrasy-svozu/);

globalThis.window.location.pathname = "/trasy-svozu/test";
await collectionAssistant.prepareSignedUrl("sarlota", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /currentRoute=%2Ftrasy-svozu%2Ftest/);

await assistant.prepareSignedUrl("sarlota-smart-2", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /assistant=sarlota-smart-2/);
assert.match(requestedPaths.at(-1), /diagnosticMode=identity_no_driver_vehicles/);

await assistant.prepareSignedUrl("marek", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /assistant=marek/);
assert.doesNotMatch(requestedPaths.at(-1), /diagnosticMode=/);

await assistant.prepareSignedUrl("sarlota", { interfaceMode: "text" });
assert.match(requestedPaths.at(-1), /assistant=sarlota/);
assert.doesNotMatch(requestedPaths.at(-1), /diagnosticMode=/);

const standardAssistant = useElevenLabsAssistant({
  signedUrlOptions: {
    omitDriverReportVehicleContext: false
  },
  fetchJson: async (path) => {
    requestedPaths.push(path);
    return {
      signedUrl: "wss://example.invalid",
      assistantId: "sarlota",
      assistantName: "Šarlota",
      configured: true
    };
  }
});

await standardAssistant.prepareSignedUrl("sarlota", { interfaceMode: "voice" });
assert.match(requestedPaths.at(-1), /assistant=sarlota/);
assert.doesNotMatch(requestedPaths.at(-1), /diagnosticMode=/);

delete globalThis.window;

console.log("elevenlabs signed-url option tests passed");
