const CRON = "*/5 * * * *";
const PREPARATION_CRON = "* * * * *";

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
      mode: env.RUN_MODE || (env.READ_PREFLIGHT_ONLY === "true" ? "read-preflight" : "sync"),
      runner: "kaiser-vistos-leadhub-profile-sync"
    })
  });
  const rawBody = await response.text();
  const payload = (() => {
    try { return JSON.parse(rawBody); } catch { return {}; }
  })();
  if (!response.ok) {
    const error = new Error(payload.error || `Sync endpoint odpověděl ${response.status}.`);
    error.code = payload.code || "vistos_leadhub_sync_endpoint_failed";
    error.status = response.status;
    error.upstreamStatus = Number(payload.upstreamStatus) || 0;
    error.responseType = String(response.headers.get("content-type") || "unknown");
    error.responseRay = String(response.headers.get("cf-ray") || "unknown");
    error.responseSnippet = rawBody.replace(/\s+/g, " ").slice(0, 300);
    throw error;
  }
  return payload;
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron !== CRON && !(controller.cron === PREPARATION_CRON && ["prepare-import", "execute-import"].includes(env.RUN_MODE))) return;
    ctx.waitUntil(runScheduledSync(env, controller.scheduledTime).then((summary) => {
      if (summary.mode === "read-preflight") {
        console.log("vistos_leadhub_profile_sync.read_preflight", summary);
        return;
      }
      if (summary.mode === "prepare-import") {
        console.log("vistos_leadhub_profile_sync.prepare_import", summary);
        return;
      }
      if (summary.mode === "execute-import") {
        console.log("vistos_leadhub_profile_sync.import", summary);
        return;
      }
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
      console.error("vistos_leadhub_profile_sync.failed", {
        message: String(error?.message || error),
        code: String(error?.code || "vistos_leadhub_sync_failed"),
        status: Number(error?.status) || 0,
        upstreamStatus: Number(error?.upstreamStatus) || 0,
        responseType: String(error?.responseType || "unknown"),
        responseRay: String(error?.responseRay || "unknown"),
        responseSnippet: String(error?.responseSnippet || "")
      });
    }));
  },

  async fetch(request, env = {}) {
    return Response.json({
      status: "ready",
      trigger: "cloudflare-cron",
      cron: ["prepare-import", "execute-import"].includes(env.RUN_MODE) ? PREPARATION_CRON : CRON,
      intervalMinutes: ["prepare-import", "execute-import"].includes(env.RUN_MODE) ? 1 : 5,
      runMode: env.RUN_MODE || "sync",
      historicalBulkImport: env.RUN_MODE === "execute-import",
      subscriptionsWrite: false,
      messages: false
    });
  }
};
