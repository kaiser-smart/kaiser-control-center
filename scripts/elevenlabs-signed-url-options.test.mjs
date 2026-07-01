import assert from "node:assert/strict";

import { useElevenLabsAssistant } from "../src/useElevenLabsAssistant.js";

const requestedPaths = [];
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

console.log("elevenlabs signed-url option tests passed");
