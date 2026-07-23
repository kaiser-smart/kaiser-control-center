import { runDataBoxAutomation } from "../functions/_lib/data-box-automation-runner.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const mode = String(env.DATA_BOX_AUTOMATION_MODE || "live").trim() === "dry-run" ? "dry-run" : "live";
      const summary = await runDataBoxAutomation(env, {
        mode,
        confirmed: mode === "live",
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        triggeredBy: "cloudflare-cron"
      });

      console.log("data_box_automation_runner.completed", {
        mode: summary.mode,
        status: summary.status,
        runnerRunId: summary.runnerRunId,
        rulesTotal: summary.rulesTotal,
        dryRunCount: summary.dryRunCount,
        skippedCount: summary.skippedCount,
        failedCount: summary.failedCount,
        emailSending: "manual_confirmation_only",
        dataBoxSending: "manual_confirmation_only",
        sentMessageAiProcessing: "disabled",
        automaticArchive: "explicit_informational_allowlist_only"
      });
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      runner: "data-box-cloud-runner",
      mode: "live",
      cron: "*/30 * * * *",
      emailSending: "manual_confirmation_only",
      dataBoxSending: "manual_confirmation_only",
      sentMessageAiProcessing: "disabled",
      automaticArchive: "explicit_informational_allowlist_only",
      message: "DS cloud runner vyhodnocuje pouze přijaté zprávy. E-maily a DS odpovědi připravuje k ručnímu potvrzení; sám je neodesílá."
    });
  }
};
