export const SELF_REPAIR_UI_SCAN_MODULE_KEY = "self-repair";
export const SELF_REPAIR_UI_SCAN_RULE_ID = "self-repair-daily-ui-interaction-scan";
export const SELF_REPAIR_UI_SCAN_RUNNER_NAME = "self-repair-phase2b-daily-ui-interaction-scan";
export const SELF_REPAIR_UI_SCAN_CRON = "37 2 * * *";
export const SELF_REPAIR_UI_SCAN_TIME_ZONE = "Europe/Prague";
export const SELF_REPAIR_UI_SCAN_TARGET_URL = "https://smart-odpady.ai/";

export function selfRepairUiScanDayKey(value) {
  const date = value instanceof Date ? value : new Date(Number(value || Date.now()));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().slice(0, 10);
}

export function nextSelfRepairUiScanRun(value) {
  const date = value instanceof Date ? new Date(value) : new Date(Number(value || Date.now()));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const [minute, hour] = SELF_REPAIR_UI_SCAN_CRON.split(" ").map(Number);
  const next = new Date(safeDate);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= safeDate.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
