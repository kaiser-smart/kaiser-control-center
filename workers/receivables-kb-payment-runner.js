import { RECEIVABLES_KB_PAYMENT_CRON } from "../functions/_lib/receivables-kb-payment-sync.js";
import {
  receivablesKbPaymentRunnerStatus,
  runReceivablesKbPaymentSyncRemote
} from "../functions/_lib/receivables-kb-payment-runner.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await runReceivablesKbPaymentSyncRemote(env, {
        scheduledTime: controller.scheduledTime,
        cron: controller.cron,
        triggeredBy: "cloudflare-cron"
      });
      console.log("receivables_kb_payment_sync.completed", {
        mode: result.mode,
        status: result.status,
        runId: result.runId,
        batchId: result.batchId,
        insertedCount: result.summary?.insertedCount || 0,
        updatedCount: result.summary?.updatedCount || 0,
        ignoredCount: result.summary?.ignoredCount || 0,
        errorCode: result.errorCode || "",
        createsPaymentOrders: false,
        reconcilesInvoicesAutomatically: false,
        customerCommunication: "disabled"
      });
    })());
  },

  async fetch(_request, env) {
    return Response.json(receivablesKbPaymentRunnerStatus(env, RECEIVABLES_KB_PAYMENT_CRON));
  }
};
