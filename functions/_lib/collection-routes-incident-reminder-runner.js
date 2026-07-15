const DEFAULT_APP_BASE_URL = "https://smart-odpady.ai";
const DEFAULT_TIMEOUT_MS = 20000;

function cleanString(value) {
  return String(value ?? "").trim();
}

export async function runCollectionRouteIncidentReminderAutomation(env = {}, input = {}, options = {}) {
  const token = cleanString(env.COLLECTION_ROUTES_RUNNER_TOKEN);
  if (!token) {
    return {
      status: "skipped",
      reason: "missing-runner-token",
      protectedTestOnly: true,
      customerCommunication: "disabled"
    };
  }
  const baseUrl = cleanString(env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
  const timeoutMs = Math.min(Math.max(Number(env.COLLECTION_ROUTE_INCIDENT_RUNNER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 5000), 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(`${baseUrl}/api/internal/collection-routes/test-incident-reminders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scheduledTime: Number(input.scheduledTime) || Date.now(),
        cron: cleanString(input.cron),
        triggeredBy: cleanString(input.triggeredBy || "cloudflare-cron"),
        limit: 10
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: "failed",
        reason: cleanString(payload.error || `http-${response.status}`),
        httpStatus: response.status,
        protectedTestOnly: true
      };
    }
    return {
      status: "completed",
      checked: Number(payload.checked) || 0,
      sent: Number(payload.sent) || 0,
      failed: Number(payload.failed) || 0,
      skipped: Number(payload.skipped) || 0,
      protectedTestOnly: true,
      sms: "disabled",
      rcs: "disabled"
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error?.name === "AbortError" ? "timeout" : cleanString(error?.message || "runner-failed"),
      protectedTestOnly: true
    };
  } finally {
    clearTimeout(timeout);
  }
}
