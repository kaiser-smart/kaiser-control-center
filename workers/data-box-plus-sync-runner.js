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
    if (isDataBoxDue(controller.scheduledTime)) {
      ctx.waitUntil(syncDataBoxPlus(env, token, scheduledAt));
    }
  },

  async fetch() {
    return Response.json({
      status: "ready",
      dataBoxPlusIntervalMinutes: 30,
      message: "Datové schránky Plus se načítají každých 30 minut. GPS historie má vlastní oddělený cloudový Worker. Rizikové akce čekají na potvrzení."
    });
  }
};
