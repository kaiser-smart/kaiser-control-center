import assert from "node:assert/strict";
import { __test } from "../functions/api/ai/elevenlabs/sarlota-language-sync.js";
import { __test as statusTest } from "../functions/api/ai/elevenlabs/sarlota-status.js";
import {
  SARLOTA_LANGUAGE_KB_CONTENT,
  SARLOTA_LANGUAGE_KB_NAME,
  SARLOTA_PRONUNCIATION_LISTENING_TESTS,
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
  pronunciationDictionaryAccess: { ok: true, status: 200 },
  knowledgeContent: "",
  dictionaryDetail: {}
};

const emptyPlan = __test.buildPlan(emptyContext);
assert.equal(emptyPlan.ready, true);
assert.equal(emptyPlan.knowledgeBase.action, "create");
assert.equal(emptyPlan.pronunciationDictionary.action, "create");
assert.equal(emptyPlan.agent.promptLength, "Kanonický prompt".length);
assert.equal(__test.knowledgeBaseEntriesFromAgent(emptyContext.agentConfig).length, 0, "boolean false is not a KB entry");
assert.equal(statusTest.collectKnowledgeEntriesFromAgent(baseAgent()).length, 0, "status ignores boolean KB overrides");

const dictionaryBlockedPlan = __test.buildPlan({
  ...emptyContext,
  pronunciationDictionaryAccess: { ok: false, status: 401 }
});
assert.equal(dictionaryBlockedPlan.ready, true, "KB can proceed when only dictionary permission is missing");
assert.equal(dictionaryBlockedPlan.pronunciationDictionary.action, "blocked_permission");
assert.equal(dictionaryBlockedPlan.pronunciationDictionary.accessible, false);

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
assert.equal(statusTest.collectKnowledgeEntriesFromAgent(currentAgent).length, 2, "status counts both real KB entries and no boolean override");

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

const knowledgeOnlyPatch = __test.languageAgentPatch(currentAgent, knowledge);
assert.equal(knowledgeOnlyPatch.conversation_config.tts, undefined, "KB-only patch does not touch pronunciation locators");

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
assert.equal(SARLOTA_PRONUNCIATION_RULES[0].string_to_replace, "Kaiser Smart odpady");
assert.equal(SARLOTA_PRONUNCIATION_RULES[1].string_to_replace, "Kaiser servis");
assert.equal(
  SARLOTA_PRONUNCIATION_RULES.find((rule) => rule.string_to_replace === "GPS")?.alias,
  "gé, pé, es"
);
assert.ok(SARLOTA_PRONUNCIATION_LISTENING_TESTS.length >= 18);
assert.ok(SARLOTA_PRONUNCIATION_LISTENING_TESTS.includes("Kaiser servis používá Kaiser Smart odpady."));
assert.ok(SARLOTA_PRONUNCIATION_LISTENING_TESTS.some((item) => item.includes("Radime, Mirku, Petře, Patriku, Kamile a Tomáši.")));
assert.ok(SARLOTA_PRONUNCIATION_LISTENING_TESTS.some((item) => item.includes("AI, API, KSO, GPS, SMS, RCS, IČO, DIČ, DPH, PDF a CSV.")));
assert.ok(SARLOTA_PRONUNCIATION_LISTENING_TESTS.some((item) => item.includes("SPZ jsem nerozpoznala jistě")));

console.log("sarlota language sync plan: ok");
