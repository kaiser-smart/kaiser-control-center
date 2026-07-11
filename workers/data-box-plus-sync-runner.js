function appBaseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

function isDataBoxDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 30 === 0;
}

async function postInternal(env, path, token, body = undefined) {
  return fetch(`${appBaseUrl(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function syncVehicleTrackingHistory(env, token, scheduledAt) {
  const response = await postInternal(env, "/api/vehicle-tracking/internal-history-sync", token, { scheduledAt });
  const summary = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("vehicle_tracking_history.failed", { status: response.status, error: summary.error || "Sběr GPS historie se nepodařil." });
    return;
  }
  console.log("vehicle_tracking_history.completed", {
    status: summary.status,
    runId: summary.runId,
    pointsWritten: summary.pointsWritten || 0,
    pointsSeen: summary.pointsSeen || 0
  });
}

async function syncDataBoxPlus(env, token, scheduledAt) {
  const response = await postInternal(env, "/api/data-box-plus/internal-sync", token, { scheduledAt });
  const summary = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("data_box_plus_sync.failed", {
      status: response.status,
      error: summary.error || "Načtení Datových schránek Plus se nepodařilo."
    });
    return;
  }
  console.log("data_box_plus_sync.completed", {
    status: summary.status,
    syncRunId: summary.syncRunId,
    mailboxCount: summary.mailboxCount,
    messagesFound: summary.messagesFound,
    messagesDownloaded: summary.messagesDownloaded,
    attachmentsDownloaded: summary.attachmentsDownloaded,
    errors: summary.errors?.length || 0
  });
}

export default {
  async scheduled(controller, env, ctx) {
    const token = String(env.DATA_BOX_PLUS_SYNC_TOKEN || "").trim();
    if (!token) {
      console.error("cloud_sync_runner.missing_token");
      return;
    }
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(syncVehicleTrackingHistory(env, token, scheduledAt));
    if (isDataBoxDue(controller.scheduledTime)) {
      ctx.waitUntil(syncDataBoxPlus(env, token, scheduledAt));
    }
  },

  async fetch() {
    return Response.json({
      status: "ready",
      vehicleTrackingIntervalMinutes: 1,
      dataBoxPlusIntervalMinutes: 30,
      message: "GPS historie se ukládá každou minutu. Datové schránky Plus se načítají každých 30 minut. Rizikové akce čekají na potvrzení."
    });
  }
};
