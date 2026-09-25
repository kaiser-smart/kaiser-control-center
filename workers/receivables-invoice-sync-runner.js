import { runReceivablesInvoiceSyncAutomation } from "../functions/_lib/receivables-invoice-sync-runner.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReceivablesInvoiceSyncAutomation(env, {
      scheduledTime: controller.scheduledTime,
      cron: controller.cron,
      triggeredBy: "invoice-cloudflare-cron"
    }).then(result => {
      console.log("receivables_invoice_sync.completed", {
        status: result.status, action: result.action, batchId: result.batchId,
        rowCount: result.rowCount, totalRows: result.totalRows, errorCode: result.errorCode
      });
    }));
  },
  async fetch() {
    return new Response("Invoice synchronization runs on its server schedule.", {
      status: 404, headers: { "Cache-Control": "no-store" }
    });
  }
};
