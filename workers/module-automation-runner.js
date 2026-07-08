import { runModuleAutomationDryRun } from "../functions/_lib/module-automation-dry-run.js";
import { runCollectionRoutesSnapshotAutomation } from "../functions/_lib/collection-routes-automation-runner.js";

const COLLECTION_ROUTES_CRON = "*/15 * * * *";
const ABSENCE_CRON = "15 3 * * *";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      if (controller.cron === COLLECTION_ROUTES_CRON) {
        const summary = await runCollectionRoutesSnapshotAutomation(env, {
          scheduledTime: controller.scheduledTime,
          cron: controller.cron,
          triggeredBy: "cloudflare-cron"
        });

        console.log("collection_routes_snapshot_runner.completed", {
          mode: summary.mode,
          status: summary.status,
          runnerRunId: summary.runnerRunId,
          moduleKey: summary.moduleKey,
          batchId: summary.batchId,
          rowCount: summary.rowCount,
          dryRunCount: summary.dryRunCount,
          skippedCount: summary.skippedCount,
          errorCount: summary.errorCount,
          emailSms: "disabled",
          operationalRoutes: "disabled",
          vistosWrites: "disabled"
        });
        return;
      }

      if (controller.cron === ABSENCE_CRON) {
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
        return;
      }

      console.log("module_automation_runner.skipped_unknown_cron", {
        cron: controller.cron,
        emailSms: "disabled",
        operationalRoutes: "disabled"
      });
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "read-only-cloud-runner",
      manualRun: "disabled",
      emailSms: "disabled",
      operationalRoutes: "disabled",
      collectionRoutes: {
        cron: COLLECTION_ROUTES_CRON,
        mode: "read-only-vistos-snapshot"
      },
      absence: {
        cron: ABSENCE_CRON,
        mode: "dry-run"
      },
      message: "Cloud runner automaticky čte Trasy svozu jako read-only Vistos snapshot a dál eviduje původní dry-run automatizace."
    });
  }
};
