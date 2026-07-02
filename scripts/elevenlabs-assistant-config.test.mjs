import assert from "node:assert/strict";

import {
  assistantPublicMetadata,
  elevenLabsAgentNameMatchesExpected,
  isValidElevenLabsAssistantKey,
  resolveElevenLabsAssistantConfig
} from "../src/elevenLabsAssistants.js";

const env = {
  ELEVENLABS_AGENT_ID_SARLOTA: "agent-prod",
  ELEVENLABS_AGENT_ID_SARLOTA_SMART_2: "agent-smart-2",
  ELEVENLABS_AGENT_ID_MAREK: "agent-marek"
};

const sarlota = resolveElevenLabsAssistantConfig("sarlota", env);
assert.equal(sarlota.assistantKey, "sarlota");
assert.equal(sarlota.agentId, "agent-prod");
assert.equal(sarlota.envVariableName, "ELEVENLABS_AGENT_ID_SARLOTA");
assert.equal(sarlota.isProduction, true);
assert.equal(sarlota.promptSyncAllowed, true);

const smart2 = resolveElevenLabsAssistantConfig("sarlota-smart-2", env);
assert.equal(smart2.assistantKey, "sarlota-smart-2");
assert.equal(smart2.agentId, "agent-smart-2");
assert.equal(smart2.envVariableName, "ELEVENLABS_AGENT_ID_SARLOTA_SMART_2");
assert.equal(smart2.isTest, true);
assert.equal(smart2.promptSyncAllowed, true);
assert.equal(elevenLabsAgentNameMatchesExpected("Šarlota Smart 2 - test", smart2), true);
assert.equal(elevenLabsAgentNameMatchesExpected("Sarlota Smart 2 – test", smart2), true);
assert.equal(elevenLabsAgentNameMatchesExpected("Nanolab production", smart2), false);

const marek = resolveElevenLabsAssistantConfig("marek", env);
assert.equal(marek.assistantKey, "marek");
assert.equal(marek.agentId, "agent-marek");
assert.equal(marek.envVariableName, "ELEVENLABS_AGENT_ID_MAREK");
assert.equal(marek.promptSyncAllowed, false);
assert.equal(marek.toolsSyncAllowed, true);

assert.equal(isValidElevenLabsAssistantKey("sarlota"), true);
assert.equal(isValidElevenLabsAssistantKey("sarlota-smart-2"), true);
assert.equal(isValidElevenLabsAssistantKey("marek"), true);
assert.equal(isValidElevenLabsAssistantKey("unknown"), false);
assert.equal(resolveElevenLabsAssistantConfig("unknown", env), null);

const smart2Metadata = assistantPublicMetadata(smart2);
assert.equal(smart2Metadata.assistantKey, "sarlota-smart-2");
assert.equal(smart2Metadata.assistantDisplayName, "Šarlota Smart 2 – test");
assert.equal(smart2Metadata.assistantEnvVariableName, "ELEVENLABS_AGENT_ID_SARLOTA_SMART_2");
assert.equal(smart2Metadata.assistantAgentIdPresent, true);
assert.equal(smart2Metadata.assistantAgentIdMasked, "agent-smar…rt-2");
assert.equal(smart2Metadata.assistantIsProduction, false);
assert.equal(smart2Metadata.assistantIsTest, true);

console.log("elevenlabs assistant config tests passed");
