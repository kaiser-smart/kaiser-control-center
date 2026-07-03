import assert from "node:assert/strict";

import { __test as promptSyncTest } from "../functions/api/ai/elevenlabs/sarlota-prompt-sync.js";
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../src/sarlota/sarlotaSystemPrompt.js";

{
  assert.equal(promptSyncTest.PROMPT_RULE_MARKER, "HLÁŠENÍ ŘIDIČŮ / SERVIS VOZIDEL");
  assert.equal(promptSyncTest.LEGACY_PROMPT_RULE_MARKERS.includes(promptSyncTest.PROMPT_RULE_MARKER), false);
  assert.equal(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE.includes(promptSyncTest.PROMPT_RULE_REQUIRED_PHRASE), true);
}

{
  const prompt = [
    "Jsi Šarlota.",
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE
  ].join("\n");

  assert.equal(promptSyncTest.promptHasCurrentRule(prompt), true);
  assert.deepEqual(promptSyncTest.forbiddenPromptPhrases(prompt), []);
  assert.equal(promptSyncTest.promptHasLegacyRule(prompt), false);
  assert.equal(promptSyncTest.stripDriverReportPromptBlocks(prompt), prompt);
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

console.log("sarlota prompt sync plan tests passed");
