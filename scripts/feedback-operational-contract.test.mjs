import assert from "node:assert/strict";
import { FEEDBACK_MANTRA } from "../src/data/feedbackMantra.js";
import { FEEDBACK_OPERATIONAL_CONTRACT } from "../src/data/feedbackOperationalContract.js";

assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.sourceOfTruth, "FEEDBACK_MANTRA");
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.detailRoute, "/pripominky/:caseId");
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.visibility.authenticatedUsersSeeAllCases, true);
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.visibility.ownCasesFilter, true);
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.creation.exactlyOneCase, true);
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.creation.codexAutomatic, false);
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.notifications.readyForVerificationEmail, true);
assert.equal(FEEDBACK_OPERATIONAL_CONTRACT.codex.configuredRunnerRequired, true);
assert.ok(FEEDBACK_MANTRA.rules.some((rule) => rule.includes("konkrétní caseId")));

console.log("feedback operational contract: ok");
