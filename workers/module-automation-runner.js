import { runModuleAutomationDryRun } from "../functions/_lib/module-automation-dry-run.js";
import { runCollectionRoutesSnapshotAutomation } from "../functions/_lib/collection-routes-automation-runner.js";
import { runSelfRepairHourlyMonitor } from "../functions/_lib/self-repair-monitor-runner.js";
import { SELF_REPAIR_MONITOR_CRON } from "../functions/_lib/self-repair-monitor-config.js";

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

      if (controller.cron === SELF_REPAIR_MONITOR_CRON) {
        const summary = await runSelfRepairHourlyMonitor(env, {
          scheduledTime: controller.scheduledTime,
          triggeredBy: "cloudflare-cron"
        });

        console.log("self_repair_hourly_monitor.completed", {
          mode: summary.mode,
          status: summary.status,
          runnerRunId: summary.runnerRunId,
          routesChecked: summary.routesChecked,
          findingsTotal: summary.findingsTotal,
          newCases: summary.newCases,
          deduplicatedCases: summary.deduplicatedCases,
          failedCount: summary.failedCount,
          codexExecuted: false,
          repoWrite: false,
          pullRequestCreated: false,
          deploymentStarted: false,
          notificationSent: false
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
      selfRepair: {
        cron: SELF_REPAIR_MONITOR_CRON,
        mode: "hourly-read-only-monitor",
        codexExecution: "disabled",
        repoWrite: "disabled",
        deployment: "disabled",
        notification: "disabled"
      },
      message: "Cloud runner čte Trasy svozu, eviduje původní dry-run automatizace a každou hodinu provádí read-only kontrolu Samooprav."
    });
  }
};
