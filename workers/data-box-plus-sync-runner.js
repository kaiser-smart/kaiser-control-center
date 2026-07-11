function appBaseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const token = String(env.DATA_BOX_PLUS_SYNC_TOKEN || "").trim();
      if (!token) {
        console.error("data_box_plus_sync.missing_token");
        return;
      }

      const response = await fetch(`${appBaseUrl(env)}/api/data-box-plus/internal-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scheduledAt: new Date(controller.scheduledTime).toISOString()
        })
      });
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
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      intervalMinutes: 30,
      message: "Datové schránky Plus se načítají na pozadí. Rizikové akce čekají na potvrzení."
    });
  }
};
