import assert from "node:assert/strict";

import { __test as promptSyncTest } from "../functions/api/ai/elevenlabs/sarlota-prompt-sync.js";
import {
  SARLOTA_COLLECTION_ROUTES_DRIVER_ACTION_PROMPT_RULE,
  SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE,
  SARLOTA_COLLECTION_ROUTES_INCIDENT_PROMPT_RULE,
  SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE
} from "../src/sarlota/sarlotaSystemPrompt.js";

{
  assert.equal(promptSyncTest.PROMPT_RULE_MARKER, "HLÁŠENÍ ŘIDIČŮ / SERVIS VOZIDEL");
  assert.equal(promptSyncTest.LEGACY_PROMPT_RULE_MARKERS.includes(promptSyncTest.PROMPT_RULE_MARKER), false);
  assert.equal(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE.includes(promptSyncTest.PROMPT_RULE_REQUIRED_PHRASE), true);
  assert.equal(promptSyncTest.COLLECTION_ROUTES_GPS_RULE_MARKER, "SVOZOVÉ TRASY / GPS STANOVIŠTĚ");
  assert.equal(
    SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE.includes(promptSyncTest.COLLECTION_ROUTES_GPS_RULE_REQUIRED_PHRASE),
    true
  );
  assert.equal(promptSyncTest.COLLECTION_ROUTES_INCIDENT_RULE_MARKER, "SVOZOVÉ TRASY / TEST HLÁŠENÍ STANOVIŠTĚ");
  assert.equal(
    SARLOTA_COLLECTION_ROUTES_INCIDENT_PROMPT_RULE.includes(promptSyncTest.COLLECTION_ROUTES_INCIDENT_RULE_REQUIRED_PHRASE),
    true
  );
  assert.equal(promptSyncTest.COLLECTION_ROUTES_DRIVER_ACTION_RULE_MARKER, "SVOZOVÉ TRASY / PRACOVNÍ KROKY ŘIDIČE");
  assert.equal(
    SARLOTA_COLLECTION_ROUTES_DRIVER_ACTION_PROMPT_RULE.includes(promptSyncTest.COLLECTION_ROUTES_DRIVER_ACTION_RULE_REQUIRED_PHRASE),
    true
  );
}

{
  const prompt = [
    "Jsi Šarlota.",
    promptSyncTest.COLLECTION_ROUTES_INCIDENT_RULE_BLOCK,
    "Bezpečný zbytek promptu."
  ].join("\n");
  const stripped = promptSyncTest.stripCollectionRoutesIncidentPromptBlocks(prompt);

  assert.equal(promptSyncTest.promptHasCollectionRoutesIncidentRule(prompt), true);
  assert.equal(stripped.includes(promptSyncTest.COLLECTION_ROUTES_INCIDENT_RULE_MARKER), false);
  assert.equal(stripped.includes("Bezpečný zbytek promptu."), true);
}

{
  const prompt = [
    "Jsi Šarlota.",
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE
  ].join("\n");

  assert.equal(promptSyncTest.promptHasCurrentRule(prompt), true);
  assert.equal(promptSyncTest.promptHasDataBoxContextRule(prompt), false);
  assert.equal(promptSyncTest.promptHasCollectionRoutesGpsRule(prompt), false);
  assert.deepEqual(promptSyncTest.forbiddenPromptPhrases(prompt), []);
  assert.equal(promptSyncTest.promptHasLegacyRule(prompt), false);
  assert.equal(promptSyncTest.stripDriverReportPromptBlocks(prompt), prompt);
}

{
  const prompt = [
    "Jsi Šarlota.",
    promptSyncTest.COLLECTION_ROUTES_GPS_RULE_BLOCK,
    "Bezpečný zbytek promptu."
  ].join("\n");
  const stripped = promptSyncTest.stripCollectionRoutesGpsPromptBlocks(prompt);

  assert.equal(promptSyncTest.promptHasCollectionRoutesGpsRule(prompt), true);
  assert.equal(stripped.includes(promptSyncTest.COLLECTION_ROUTES_GPS_RULE_MARKER), false);
  assert.equal(stripped.includes("Bezpečný zbytek promptu."), true);
}

{
  const unrelatedLine = `Bezpečný starší text pouze zmiňuje ${promptSyncTest.COLLECTION_ROUTES_GPS_RULE_MARKER}, ale není synchronizovaným blokem.`;
  const stripped = promptSyncTest.stripCollectionRoutesGpsPromptBlocks(unrelatedLine);

  assert.equal(stripped, unrelatedLine);
}

{
  const prompt = [
    "Jsi Šarlota.",
    promptSyncTest.DATA_BOX_CONTEXT_RULE_BLOCK,
    "Bezpečný zbytek promptu."
  ].join("\n");
  const stripped = promptSyncTest.stripDataBoxContextPromptBlocks(prompt);

  assert.equal(promptSyncTest.promptHasDataBoxContextRule(prompt), true);
  assert.equal(stripped.includes(promptSyncTest.DATA_BOX_CONTEXT_RULE_MARKER), false);
  assert.equal(stripped.includes("Bezpečný zbytek promptu."), true);
}

{
  const legacyPrompt = [
    "Jsi Šarlota.",
    "HLÁŠENÍ ŘIDIČŮ / VOZIDLA",
    "V hlasovém flow nikdy neříkej konkrétní vozidlo.",
    "Vidím u tebe Ford Transit, SPZ 1A2 3456.",
    "Další pravidla."
  ].join("\n");
  const stripped = promptSyncTest.stripDriverReportPromptBlocks(legacyPrompt);

  assert.equal(promptSyncTest.promptHasLegacyRule(legacyPrompt), true);
  assert.equal(stripped.includes("HLÁŠENÍ ŘIDIČŮ / VOZIDLA"), false);
  assert.equal(stripped.includes("V hlasovém flow nikdy neříkej konkrétní vozidlo"), false);
  assert.equal(stripped.includes("Ford Transit"), false);
  assert.equal(stripped.includes("1A2 3456"), false);
  assert.equal(stripped.includes("Další pravidla."), true);
  assert.deepEqual(promptSyncTest.forbiddenPromptPhrases(stripped), []);
}

{
  const staleMultiLinePrompt = [
    "Jsi Šarlota.",
    "HLÁŠENÍ ŘIDIČŮ / VOZIDLA / OVĚŘENÁ VOZIDLA ONLY",
    "SPZ chtěj až jako poslední možnost.",
    "- Mám u tebe ověřené tyto vozy: Fiat Ducato, SPZ 3A4 5678.",
    "- Vyjmenuj možnosti bez ptaní na SPZ.",
    "- typ, značku nebo interní název použij jen jako nápovědu.",
    "Novější bezpečný text zůstává."
  ].join("\n");
  const stripped = promptSyncTest.stripDriverReportPromptBlocks(staleMultiLinePrompt);

  assert.equal(stripped.includes("HLÁŠENÍ ŘIDIČŮ / VOZIDLA / OVĚŘENÁ VOZIDLA ONLY"), false);
  assert.equal(stripped.includes("SPZ chtěj až jako poslední možnost"), false);
  assert.equal(stripped.includes("Mám u tebe ověřené tyto vozy"), false);
  assert.equal(stripped.includes("Fiat Ducato"), false);
  assert.equal(stripped.includes("3A4 5678"), false);
  assert.equal(stripped.includes("Vyjmenuj možnosti"), false);
  assert.equal(stripped.includes("typ, značku nebo interní název"), false);
  assert.equal(stripped.includes("Novější bezpečný text zůstává."), true);
  assert.deepEqual(promptSyncTest.forbiddenPromptPhrases(stripped), []);
}

{
  const promptWithCurrentRuleAndStalePhrase = [
    "Jsi Šarlota.",
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
    "Starý zbytek: Ford Transit, SPZ 1A2 3456."
  ].join("\n");
  const plan = promptSyncTest.buildPlan({
    ok: true,
    assistantConfig: {
      assistantKey: "sarlota",
      displayName: "Šarlota – Smart odpady",
      expectedAgentNames: ["Šarlota – Smart odpady"]
    },
    agentConfig: {
      name: "Šarlota – Smart odpady",
      conversation_config: {
        agent: {
          first_message: "{{intro_announcement}}",
          prompt: {
            prompt: promptWithCurrentRuleAndStalePhrase
          }
        }
      }
    }
  });

  assert.equal(plan.prompt.currentRulePresent, true);
  assert.deepEqual(plan.prompt.forbiddenPhrasesPresent, ["Ford Transit", "1A2 3456"]);
  assert.equal(plan.alreadyApplied, false);
  assert.equal(plan.ready, true);
  assert.equal(plan.prompt.willAppendDriverReportVehicleRule, true);
  assert.equal(plan.prompt.willAppendDataBoxContextRule, true);
  assert.equal(plan.prompt.willAppendCollectionRoutesGpsRule, true);
  assert.equal(plan.prompt.willAppendCollectionRoutesIncidentRule, true);
  assert.equal(plan.prompt.willRemoveForbiddenDriverReportPhrases, true);
}

{
  const completePrompt = [
    "Jsi Šarlota.",
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
    promptSyncTest.DATA_BOX_CONTEXT_RULE_BLOCK,
    promptSyncTest.COLLECTION_ROUTES_GPS_RULE_BLOCK,
    promptSyncTest.COLLECTION_ROUTES_INCIDENT_RULE_BLOCK,
    promptSyncTest.COLLECTION_ROUTES_DRIVER_ACTION_RULE_BLOCK
  ].join("\n");
  const plan = promptSyncTest.buildPlan({
    ok: true,
    assistantConfig: {
      assistantKey: "sarlota",
      displayName: "Šarlota – Smart odpady",
      expectedAgentNames: ["Šarlota – Smart odpady"]
    },
    agentConfig: {
      name: "Šarlota – Smart odpady",
      conversation_config: {
        agent: {
          first_message: "{{intro_announcement}}",
          prompt: { prompt: completePrompt }
        }
      }
    }
  });

  assert.equal(plan.prompt.currentRulePresent, true);
  assert.equal(plan.prompt.dataBoxContextRulePresent, true);
  assert.equal(plan.prompt.collectionRoutesGpsRulePresent, true);
  assert.equal(plan.prompt.collectionRoutesIncidentRulePresent, true);
  assert.equal(plan.prompt.collectionRoutesDriverActionRulePresent, true);
  assert.equal(plan.alreadyApplied, true);
  assert.equal(plan.ready, false);
}

{
  const duplicatedCurrentRulePrompt = [
    "Jsi Šarlota.",
    promptSyncTest.PROMPT_RULE_MARKER,
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
    "Bezpečný zbytek promptu."
  ].join("\n");
  const stripped = promptSyncTest.stripDriverReportPromptBlocks(duplicatedCurrentRulePrompt);

  assert.equal(stripped.includes(promptSyncTest.PROMPT_RULE_MARKER), false);
  assert.equal(stripped.includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE), false);
  assert.equal(stripped.includes("Bezpečný zbytek promptu."), true);
  assert.equal(promptSyncTest.promptHasCurrentRule(stripped), false);
}

{
  assert.equal(
    promptSyncTest.upstreamErrorSummary({ code: "ELEVENLABS_REQUEST_TIMEOUT" }),
    "ElevenLabs API neodpovědělo včas."
  );
}

console.log("sarlota prompt sync plan tests passed");
