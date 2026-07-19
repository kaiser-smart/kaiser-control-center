import assert from "node:assert/strict";
import { __test } from "../functions/api/ai/elevenlabs/sarlota-language-sync.js";
import {
  SARLOTA_LANGUAGE_KB_CONTENT,
  SARLOTA_LANGUAGE_KB_NAME,
  SARLOTA_PRONUNCIATION_DICTIONARY_NAME,
  SARLOTA_PRONUNCIATION_RULES
} from "../src/sarlota/sarlotaLanguagePackage.js";

const assistantConfig = {
  assistantKey: "sarlota",
  displayName: "Šarlota – Smart odpady",
  expectedAgentNames: ["Šarlota – Smart odpady"],
  isProduction: true,
  agentId: "agent-production-test"
};

const baseAgent = ({ knowledgeBase = false, locators = [] } = {}) => ({
  name: "Šarlota – Smart odpady",
  conversation_config: {
    agent: {
      first_message: "{{intro_announcement}}",
      prompt: {
        prompt: "Kanonický prompt",
        llm: "Qwen3.5-397B-A17B",
        tool_ids: ["tool-2", "tool-1"],
        knowledge_base: knowledgeBase
      }
    },
    tts: { pronunciation_dictionary_locators: locators }
  }
});

const emptyContext = {
  ok: true,
  assistantConfig,
  agentConfig: baseAgent(),
  matchingKnowledge: [],
  matchingDictionaries: [],
  knowledgeContent: "",
  dictionaryDetail: {}
};

const emptyPlan = __test.buildPlan(emptyContext);
assert.equal(emptyPlan.ready, true);
assert.equal(emptyPlan.knowledgeBase.action, "create");
assert.equal(emptyPlan.pronunciationDictionary.action, "create");
assert.equal(emptyPlan.agent.promptLength, "Kanonický prompt".length);
assert.equal(__test.knowledgeBaseEntriesFromAgent(emptyContext.agentConfig).length, 0, "boolean false is not a KB entry");

const knowledge = { id: "kb-managed", name: SARLOTA_LANGUAGE_KB_NAME };
const dictionary = {
  id: "dict-managed",
  name: SARLOTA_PRONUNCIATION_DICTIONARY_NAME,
  version_id: "version-managed"
};
const currentAgent = baseAgent({
  knowledgeBase: [
    { type: "text", id: "kb-unrelated", name: "Jiná KB", usage_mode: "auto" },
    { type: "text", id: "kb-managed", name: SARLOTA_LANGUAGE_KB_NAME, usage_mode: "auto" }
  ],
  locators: [
    { pronunciation_dictionary_id: "dict-unrelated", version_id: "version-unrelated" },
    { pronunciation_dictionary_id: "dict-managed", version_id: "version-managed" }
  ]
});
const currentContext = {
  ok: true,
  assistantConfig,
  agentConfig: currentAgent,
  matchingKnowledge: [knowledge],
  matchingDictionaries: [dictionary],
  knowledgeContent: SARLOTA_LANGUAGE_KB_CONTENT,
  dictionaryDetail: { ...dictionary, rules: SARLOTA_PRONUNCIATION_RULES }
};
const currentPlan = __test.buildPlan(currentContext);
assert.equal(currentPlan.alreadyApplied, true);
assert.equal(currentPlan.ready, false);
assert.equal(currentPlan.knowledgeBase.current, true);
assert.equal(currentPlan.pronunciationDictionary.current, true);

const patch = __test.languageAgentPatch(currentAgent, knowledge, dictionary);
assert.deepEqual(
  patch.conversation_config.agent.prompt.knowledge_base.map((entry) => entry.id),
  ["kb-unrelated", "kb-managed"],
  "managed KB replacement preserves unrelated entries"
);
assert.deepEqual(
  patch.conversation_config.tts.pronunciation_dictionary_locators.map((entry) => entry.pronunciation_dictionary_id),
  ["dict-unrelated", "dict-managed"],
  "managed dictionary replacement preserves unrelated locators"
);
assert.equal(patch.conversation_config.tts.pronunciation_dictionary_locators[1].version_id, "version-managed");

const before = __test.agentInvariants(currentAgent);
const simulatedAfter = structuredClone(currentAgent);
simulatedAfter.conversation_config.agent.prompt.knowledge_base = patch.conversation_config.agent.prompt.knowledge_base;
simulatedAfter.conversation_config.tts.pronunciation_dictionary_locators = patch.conversation_config.tts.pronunciation_dictionary_locators;
const after = __test.agentInvariants(simulatedAfter);
assert.equal(after.promptFingerprint, before.promptFingerprint);
assert.equal(after.firstMessageFingerprint, before.firstMessageFingerprint);
assert.equal(after.model, before.model);
assert.equal(after.toolsFingerprint, before.toolsFingerprint);

const duplicatePlan = __test.buildPlan({
  ...emptyContext,
  matchingKnowledge: [knowledge, { ...knowledge, id: "kb-duplicate" }]
});
assert.equal(duplicatePlan.ready, false);
assert.equal(duplicatePlan.safety.duplicateResources, true);

const normalizedRules = __test.canonicalRules(SARLOTA_PRONUNCIATION_RULES);
assert.equal(normalizedRules.length, SARLOTA_PRONUNCIATION_RULES.length);
assert.ok(normalizedRules.every((rule) => rule.type === "alias"));

console.log("sarlota language sync plan: ok");
