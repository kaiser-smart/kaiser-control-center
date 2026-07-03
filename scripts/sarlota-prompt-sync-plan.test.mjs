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
    "Další pravidla."
  ].join("\n");
  const stripped = promptSyncTest.stripDriverReportPromptBlocks(legacyPrompt);

  assert.equal(promptSyncTest.promptHasLegacyRule(legacyPrompt), true);
  assert.equal(stripped.includes("HLÁŠENÍ ŘIDIČŮ / VOZIDLA"), false);
  assert.equal(stripped.includes("V hlasovém flow nikdy neříkej konkrétní vozidlo"), false);
  assert.equal(stripped.includes("Další pravidla."), true);
}

console.log("sarlota prompt sync plan tests passed");
