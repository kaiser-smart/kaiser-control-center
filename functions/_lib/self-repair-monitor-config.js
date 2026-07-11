export const SELF_REPAIR_MONITOR_MODULE_KEY = "self-repair";
export const SELF_REPAIR_MONITOR_RULE_ID = "self-repair-hourly-monitor-proposal";
export const SELF_REPAIR_MONITOR_RUNNER_NAME = "self-repair-phase2a-hourly-monitor";
export const SELF_REPAIR_MONITOR_CRON = "7 * * * *";
export const SELF_REPAIR_MONITOR_TIME_ZONE = "Europe/Prague";
export const SELF_REPAIR_MONITOR_TARGET_URL = "https://kaiser-control-center.pages.dev/";
export const SELF_REPAIR_MONITOR_PROMPT_VERSION = "self-repair-prompt-draft-v1";
// Route manifest + 48 route fetches stay below the 50 external-subrequest ceiling.
export const SELF_REPAIR_MONITOR_MAX_ROUTES = 48;
export const SELF_REPAIR_MONITOR_CONCURRENCY = 6;

export function isSelfRepairMonitorRule(moduleKey, ruleId) {
  return String(moduleKey || "").trim() === SELF_REPAIR_MONITOR_MODULE_KEY &&
    String(ruleId || "").trim() === SELF_REPAIR_MONITOR_RULE_ID;
}
