import { runModuleAutomationDryRun } from "../functions/_lib/module-automation-dry-run.js";
import { runCollectionRoutesSnapshotAutomation } from "../functions/_lib/collection-routes-automation-runner.js";
import { runReceivablesInvoiceSyncAutomation } from "../functions/_lib/receivables-invoice-sync-runner.js";
import { runSelfRepairHourlyMonitor } from "../functions/_lib/self-repair-monitor-runner.js";
import { SELF_REPAIR_MONITOR_CRON } from "../functions/_lib/self-repair-monitor-config.js";
import { runCollectionRouteIncidentReminderAutomation } from "../functions/_lib/collection-routes-incident-reminder-runner.js";

const COLLECTION_ROUTES_CRON = "*/15 * * * *";
const COLLECTION_ROUTE_INCIDENT_REMINDER_CRON = "*/5 * * * *";
const ABSENCE_CRON = "15 3 * * *";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      if (controller.cron === COLLECTION_ROUTE_INCIDENT_REMINDER_CRON) {
        const summary = await runCollectionRouteIncidentReminderAutomation(env, {
          scheduledTime: controller.scheduledTime,
          cron: controller.cron,
          triggeredBy: "cloudflare-cron"
        });
        console.log("collection_route_incident_test_reminder.completed", {
          status: summary.status,
          checked: summary.checked || 0,
          sent: summary.sent || 0,
          failed: summary.failed || 0,
          skipped: summary.skipped || 0,
          protectedTestOnly: true,
          realCustomerCommunication: "disabled",
          realDispatcherCommunication: "disabled",
          sms: "disabled",
          rcs: "disabled"
        });
        return;
      }

      if (controller.cron === COLLECTION_ROUTES_CRON) {
        const [summary, receivables] = await Promise.all([
          runCollectionRoutesSnapshotAutomation(env, {
            scheduledTime: controller.scheduledTime,
            cron: controller.cron,
            triggeredBy: "cloudflare-cron"
          }),
          runReceivablesInvoiceSyncAutomation(env, {
            scheduledTime: controller.scheduledTime,
            cron: controller.cron,
            triggeredBy: "cloudflare-cron"
          })
        ]);

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
        console.log("receivables_invoice_sync_runner.completed", {
          mode: receivables.mode,
          status: receivables.status,
          runnerRunId: receivables.runnerRunId,
          moduleKey: receivables.moduleKey,
          action: receivables.action,
          batchId: receivables.batchId,
          rowCount: receivables.rowCount,
          totalRows: receivables.totalRows,
          ledgerWrites: "disabled",
          ratingCalculation: "disabled",
          isir: "disabled",
          customerCommunication: "disabled",
          kbPayments: "disabled"
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
      mode: "safe-cloud-runner",
      manualRun: "disabled",
      operationalEmailSms: "disabled",
      operationalRoutes: "disabled",
      collectionRouteIncidentTestReminders: {
        cron: COLLECTION_ROUTE_INCIDENT_REMINDER_CRON,
        mode: "protected-test-email-only",
        actualRecipient: "COLLECTION_ROUTES_TEST_EMAIL_TO",
        maxEmailAttempts: 6,
        realCustomerCommunication: "disabled",
        realDispatcherCommunication: "disabled",
        sms: "disabled",
        rcs: "disabled"
      },
      collectionRoutes: {
        cron: COLLECTION_ROUTES_CRON,
        mode: "read-only-vistos-snapshot"
      },
      receivables: {
        cron: COLLECTION_ROUTES_CRON,
        timeZone: "Europe/Prague",
        incrementalTimes: ["06:30", "10:30", "14:30", "18:30"],
        weeklyFull: "Sunday 02:30 Europe/Prague",
        mode: "staging-only-vistos-invoices",
        ledgerWrites: "disabled",
        ratingCalculation: "disabled",
        customerCommunication: "disabled",
        kbPayments: "disabled"
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
      message: "Cloud runner čte Trasy svozu, hlídá chráněné TEST připomínky incidentů, ukládá staging-only Vistos faktury Pohledávek, eviduje dry-run automatizace a provádí read-only kontrolu Samooprav."
    });
  }
};
