import assert from "node:assert/strict";

import { dynamicVariablesWithConversationId } from "../functions/api/ai/elevenlabs/signed-url.js";
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
