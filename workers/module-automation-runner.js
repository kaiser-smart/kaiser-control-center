import { runModuleAutomationDryRun } from "../functions/_lib/module-automation-dry-run.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const summary = await runModuleAutomationDryRun(env, {
        scheduledTime: controller.scheduledTime,
        cron: controller.cron,
        triggeredBy: "cloudflare-cron"
      });

      console.log("module_automation_dry_run.completed", {
        mode: summary.mode,
        status: summary.status,
        runnerRunId: summary.runnerRunId,
        moduleKey: summary.moduleKey,
        ruleCount: summary.ruleCount,
        dryRunCount: summary.dryRunCount,
        skippedCount: summary.skippedCount,
        errorCount: summary.errorCount,
        emailSms: "disabled"
      });
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "dry-run",
      manualRun: "disabled",
      emailSms: "disabled",
      message: "Cloud runner Fáze 2A pouze eviduje dry-run běhy automatizací."
    });
  }
};
