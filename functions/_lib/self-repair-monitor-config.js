export const SELF_REPAIR_MONITOR_MODULE_KEY = "self-repair";
export const SELF_REPAIR_MONITOR_RULE_ID = "self-repair-hourly-monitor-proposal";
export const SELF_REPAIR_MONITOR_RUNNER_NAME = "self-repair-phase2a-hourly-monitor";
export const SELF_REPAIR_MONITOR_CRON = "7 * * * *";
export const SELF_REPAIR_MONITOR_TIME_ZONE = "Europe/Prague";
export const SELF_REPAIR_MONITOR_TARGET_URL = "https://smart-odpady.ai/";
export const SELF_REPAIR_MONITOR_PROMPT_VERSION = "self-repair-prompt-draft-v1";
// One manifest fetch + 49 route fetches use the Workers Free limit of 50 external subrequests.
export const SELF_REPAIR_MONITOR_MAX_ROUTES = 49;
export const SELF_REPAIR_MONITOR_CONCURRENCY = 6;

export function selfRepairMonitorRouteCapacity(routeCount) {
  const normalizedRouteCount = Number.isInteger(routeCount) && routeCount >= 0 ? routeCount : 0;
  return {
    routeCount: normalizedRouteCount,
    maxRoutes: SELF_REPAIR_MONITOR_MAX_ROUTES,
    externalSubrequests: normalizedRouteCount + 1,
    ok: normalizedRouteCount > 0 && normalizedRouteCount <= SELF_REPAIR_MONITOR_MAX_ROUTES
  };
}

export function isSelfRepairMonitorRule(moduleKey, ruleId) {
  return String(moduleKey || "").trim() === SELF_REPAIR_MONITOR_MODULE_KEY &&
    String(ruleId || "").trim() === SELF_REPAIR_MONITOR_RULE_ID;
}
