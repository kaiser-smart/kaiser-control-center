const MODULE_KEY = "rcs-sms-autopilot";

const IMMUTABLE_RULE_IDS = new Set([
  "rcs-sms-autopilot-twilio-signature",
  "rcs-sms-autopilot-fixed-rules"
]);

const TOGGLEABLE_AUTOMATION_IDS = new Set([
  "rcs-sms-autopilot-async-processing",
  "rcs-sms-autopilot-retry-runner"
]);

export function isImmutableRcsSmsAutopilotRule(moduleKey, ruleId) {
  return String(moduleKey || "").trim() === MODULE_KEY
    && IMMUTABLE_RULE_IDS.has(String(ruleId || "").trim());
}

export function isToggleableRcsSmsAutopilotAutomation(moduleKey, ruleId) {
  return String(moduleKey || "").trim() === MODULE_KEY
    && TOGGLEABLE_AUTOMATION_IDS.has(String(ruleId || "").trim());
}

export const __test = {
  IMMUTABLE_RULE_IDS,
  MODULE_KEY,
  TOGGLEABLE_AUTOMATION_IDS
};
