import assert from "node:assert/strict";

import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../src/sarlota/sarlotaSystemPrompt.js";
import {
  driverReportPromptForbiddenPhrases,
  driverReportPromptSafetyAnalysis
} from "../src/sarlota/sarlotaPromptSafety.js";

const canonical = driverReportPromptSafetyAnalysis(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE);
assert.equal(canonical.safeRulePresent, true);
assert.equal(canonical.canonicalRulePresent, true);
assert.equal(canonical.manuallyAdjusted, false);
assert.deepEqual(canonical.missingRequirements, []);

const manuallyAdjustedPrompt = SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE
  .replace("## HLÁŠENÍ ŘIDIČŮ / SERVIS VOZIDEL", "## BEZPEČNÝ SERVIS ŘIDIČE")
  .replace("Potom vždy nejdřív zavolej", "Poté jako první bezpečný krok zavolej");
const manuallyAdjusted = driverReportPromptSafetyAnalysis(manuallyAdjustedPrompt);
assert.equal(manuallyAdjusted.safeRulePresent, true);
assert.equal(manuallyAdjusted.canonicalRulePresent, false);
assert.equal(manuallyAdjusted.manuallyAdjusted, true);
assert.deepEqual(manuallyAdjusted.missingRequirements, []);

const missingContextPrompt = manuallyAdjustedPrompt.replaceAll("get_driver_report_context", "ověřený backendový kontext");
const missingContext = driverReportPromptSafetyAnalysis(missingContextPrompt);
assert.equal(missingContext.safeRulePresent, false);
assert.equal(missingContext.manuallyAdjusted, false);
assert.deepEqual(missingContext.missingRequirements.map((item) => item.id), ["verified_context"]);

const unsafeLegacyPrompt = `${manuallyAdjustedPrompt}\nHotovo, závada je zapsaná.`;
assert.deepEqual(driverReportPromptForbiddenPhrases(unsafeLegacyPrompt), ["Hotovo, závada je zapsaná"]);

console.log("sarlota prompt safety tests: OK");
