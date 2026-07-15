function appBaseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

function isAnalyticsDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 5 === 0;
}

async function postInternal(env, path, body) {
  const token = String(env.VEHICLE_TRACKING_HISTORY_SYNC_TOKEN || "").trim();
  const response = await fetch(`${appBaseUrl(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const summary = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(summary.error || `HTTP ${response.status}`);
  }
  return summary;
}

async function syncHistory(env, scheduledAt) {
  const summary = await postInternal(env, "/api/vehicle-tracking/internal-history-sync", { scheduledAt });
  console.log("vehicle_tracking_history.completed", {
    runId: summary.runId,
    pointsWritten: summary.pointsWritten || 0,
    pointsSeen: summary.pointsSeen || 0
  });
}

async function syncAnalytics(env, scheduledAt) {
  const summary = await postInternal(env, "/api/vehicle-tracking/internal-history-analytics-sync", {
    scheduledAt,
    days: 2
  });
  console.log("vehicle_tracking_analytics.completed", {
    runId: summary.runId,
    vehiclesProcessed: summary.vehiclesProcessed || 0,
    pointsProcessed: summary.pointsProcessed || 0,
    tripsWritten: summary.tripsWritten || 0,
    dailyRowsWritten: summary.dailyRowsWritten || 0
  });
}

export default {
  async scheduled(controller, env, ctx) {
    if (!String(env.VEHICLE_TRACKING_HISTORY_SYNC_TOKEN || "").trim()) {
      console.error("vehicle_tracking_runner.missing_token");
      return;
    }
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(syncHistory(env, scheduledAt).catch((error) => {
      console.error("vehicle_tracking_history.failed", { message: error?.message || "unknown" });
    }));
    if (isAnalyticsDue(controller.scheduledTime)) {
      ctx.waitUntil(syncAnalytics(env, scheduledAt).catch((error) => {
        console.error("vehicle_tracking_analytics.failed", { message: error?.message || "unknown" });
      }));
    }
  },

  async fetch() {
    return Response.json({
      status: "ready",
      historyIntervalMinutes: 1,
      analyticsIntervalMinutes: 5,
      message: "GPS historie se ukládá každou minutu a bezpečné souhrny jízd se přepočítávají každých 5 minut."
    });
  }
};
