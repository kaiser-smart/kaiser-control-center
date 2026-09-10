const CRON = "*/5 * * * *";

function baseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

export async function runScheduledSync(env, scheduledTime) {
  const token = String(env.VISTOS_LEADHUB_SYNC_TOKEN || "").trim();
  if (!token) throw new Error("VISTOS_LEADHUB_SYNC_TOKEN není nastavený.");
  const response = await fetch(`${baseUrl(env)}/api/receivables/vistos/leadhub-sync-internal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      scheduledAt: new Date(scheduledTime).toISOString(),
      runner: "kaiser-vistos-leadhub-profile-sync"
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Sync endpoint odpověděl ${response.status}.`);
  return payload;
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron !== CRON) return;
    ctx.waitUntil(runScheduledSync(env, controller.scheduledTime).then((summary) => {
      console.log("vistos_leadhub_profile_sync.completed", {
        checkpoint: summary.checkpoint,
        sourceRows: summary.sourceRows || 0,
        changedContacts: summary.changedContacts || 0,
        created: summary.created || 0,
        updated: summary.updated || 0,
        deactivated: summary.deactivated || 0,
        pending: summary.pending || 0,
        readbackConfirmed: summary.readbackConfirmed || 0,
        subscriptionsChanged: 0,
        messagesSent: 0
      });
    }).catch((error) => {
      console.error("vistos_leadhub_profile_sync.failed", { message: String(error?.message || error) });
    }));
  },

  async fetch() {
    return Response.json({
      status: "ready",
      trigger: "cloudflare-cron",
      cron: CRON,
      intervalMinutes: 5,
      historicalBulkImport: false,
      subscriptionsWrite: false,
      messages: false
    });
  }
};
