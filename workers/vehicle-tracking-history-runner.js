function appBaseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

function isAnalyticsDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 5 === 0;
}

function isTripJobPairingDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 15 === 0;
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
    pointsSeen: summary.pointsSeen || 0,
    fleetAliasesSeen: summary.fleetAliasesSeen || 0,
    fleetAliasesWritten: summary.fleetAliasesWritten || 0
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

async function syncTripJobPairing(env, scheduledAt) {
  const summary = await postInternal(env, "/api/vehicle-tracking/internal-trip-job-pairing-sync", {
    scheduledAt,
    days: 7,
    triggeredBy: "cloudflare-cron"
  });
  console.log("vehicle_tracking_trip_job_pairing.completed", {
    runId: summary.runId,
    status: summary.status,
    aliasesReady: summary.summary?.aliasesReady || 0,
    tripsSeen: summary.summary?.tripsSeen || 0,
    candidateTrips: summary.summary?.candidateTrips || 0,
    unclassifiedTrips: summary.summary?.unclassifiedTrips || 0,
    dashboardActivationAllowed: false
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
      ctx.waitUntil(syncAnalytics(env, scheduledAt)
        .then(() => isTripJobPairingDue(controller.scheduledTime) ? syncTripJobPairing(env, scheduledAt) : null)
        .catch((error) => {
          console.error("vehicle_tracking_analytics_or_pairing.failed", { message: error?.message || "unknown" });
        }));
    }
  },

  async fetch() {
    return Response.json({
      status: "ready",
      historyIntervalMinutes: 1,
      analyticsIntervalMinutes: 5,
      tripJobPairingIntervalMinutes: 15,
      tripJobPairingPhase: "read-only-pilot",
      fleetMasterAliasSync: "tcars-readonly-d1",
      dashboardActivationAllowed: false,
      message: "GPS historie a read-only aliasy master flotily se ukládají každou minutu, souhrny jízd se přepočítávají každých 5 minut a read-only párovací pilot běží každých 15 minut."
    });
  }
};
