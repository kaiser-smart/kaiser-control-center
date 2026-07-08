import { runDataBoxPlusSync } from "../functions/_lib/data-box-plus-store.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const summary = await runDataBoxPlusSync(env, {
        id: "cloudflare-cron",
        name: "Autopilot"
      }, {
        triggerType: "background",
        scheduledAt: new Date(controller.scheduledTime).toISOString()
      });

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
      runner: "data-box-plus-sync-runner",
      intervalMinutes: 30,
      message: "Datové schránky Plus se načítají na pozadí. Rizikové akce čekají na potvrzení."
    });
  }
};
