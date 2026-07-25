import { runModuleAutomationDryRun } from "../functions/_lib/module-automation-dry-run.js";
import {
  runCollectionDailyRoutePreparationAutomation,
  runCollectionRoutesSnapshotAutomation
} from "../functions/_lib/collection-routes-automation-runner.js";
import { runReceivablesInvoiceSyncAutomation } from "../functions/_lib/receivables-invoice-sync-runner.js";
import { runSelfRepairHourlyMonitor } from "../functions/_lib/self-repair-monitor-runner.js";
import { SELF_REPAIR_MONITOR_CRON } from "../functions/_lib/self-repair-monitor-config.js";
import { runCollectionRouteIncidentReminderAutomation } from "../functions/_lib/collection-routes-incident-reminder-runner.js";
import { retryFailedAbsenceHistoryWorkflows } from "../functions/_lib/absence-requests-store.js";
import { runRcsSmsAutopilotRetry } from "../functions/_lib/rcs-sms-autopilot-service.js";

const COLLECTION_ROUTES_CRON = "*/15 * * * *";
const COLLECTION_ROUTE_INCIDENT_REMINDER_CRON = "*/5 * * * *";
const ABSENCE_CRON = "15 3 * * *";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      if (controller.cron === COLLECTION_ROUTE_INCIDENT_REMINDER_CRON) {
        const [summary, absenceHistoryRetry, rcsSmsAutopilot] = await Promise.all([
          runCollectionRouteIncidentReminderAutomation(env, {
            scheduledTime: controller.scheduledTime,
            cron: controller.cron,
            triggeredBy: "cloudflare-cron"
          }),
          retryFailedAbsenceHistoryWorkflows(env, {
            limit: 25,
            now: new Date(controller.scheduledTime).toISOString()
          }).catch((error) => ({
            status: "failed",
            selected: 0,
            completed: 0,
            failed: 1,
            error: error?.message || "absence_history_retry_failed"
          })),
          runRcsSmsAutopilotRetry(env, {
            scheduledTime: controller.scheduledTime,
            cron: controller.cron,
            triggeredBy: "cloudflare-cron"
          }).catch((error) => {
            console.error("rcs_sms_autopilot_retry.failed_isolated", {
              message: String(error?.message || "").slice(0, 300)
            });
            return {
              mode: "off",
              status: "failed",
              processedCount: 0,
              failedCount: 1,
              skippedCount: 0
            };
          })
        ]);
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
        console.log("absence_history_retry.completed", {
          status: absenceHistoryRetry.status,
          selected: absenceHistoryRetry.selected,
          completed: absenceHistoryRetry.completed,
          failed: absenceHistoryRetry.failed,
          error: absenceHistoryRetry.error || null,
          sms: "disabled",
          rcs: "disabled"
        });
        console.log("rcs_sms_autopilot_retry.completed", {
          mode: rcsSmsAutopilot.mode,
          status: rcsSmsAutopilot.status,
          processed: rcsSmsAutopilot.processedCount || 0,
          failed: rcsSmsAutopilot.failedCount || 0,
          skipped: rcsSmsAutopilot.skippedCount || 0,
          outboundEffects: rcsSmsAutopilot.mode === "live" ? "server-gated" : "disabled"
        });
        return;
      }

      if (controller.cron === COLLECTION_ROUTES_CRON) {
        const [collectionRoutes, receivables] = await Promise.all([
          (async () => {
            const snapshot = await runCollectionRoutesSnapshotAutomation(env, {
              scheduledTime: controller.scheduledTime,
              cron: controller.cron,
              triggeredBy: "cloudflare-cron"
            });
            const preparation = await runCollectionDailyRoutePreparationAutomation(env, {
              scheduledTime: controller.scheduledTime,
              cron: controller.cron,
              triggeredBy: "cloudflare-cron"
            });
            return { snapshot, preparation };
          })(),
          runReceivablesInvoiceSyncAutomation(env, {
            scheduledTime: controller.scheduledTime,
            cron: controller.cron,
            triggeredBy: "cloudflare-cron"
          })
        ]);
        const { snapshot: summary, preparation } = collectionRoutes;

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
          operationalRoutes: "draft-only",
          vistosWrites: "disabled"
        });
        console.log("collection_routes_daily_draft_preparation.completed", {
          mode: preparation.mode,
          status: preparation.status,
          runnerRunId: preparation.runnerRunId,
          sourceBatchId: preparation.sourceBatchId,
          createdRuns: preparation.createdRuns || 0,
          createdStops: preparation.createdStops || 0,
          autoConfirmed: false,
          autoStarted: false,
          autoCompleted: false,
          notificationsSent: false
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
        operationalRoutes: "draft-only"
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
        mode: "read-only-vistos-snapshot-and-draft-preparation",
        preparesDates: ["today", "tomorrow"],
        autoConfirm: false,
        autoStart: false,
        autoComplete: false,
        notifications: "disabled"
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
        mode: "dry-run",
        historyRetryCron: COLLECTION_ROUTE_INCIDENT_REMINDER_CRON,
        historyRetryBatchSize: 25,
        historyDatabase: "DB_AUDIT"
      },
      selfRepair: {
        cron: SELF_REPAIR_MONITOR_CRON,
        mode: "hourly-read-only-monitor",
        codexExecution: "disabled",
        repoWrite: "disabled",
        deployment: "disabled",
        notification: "disabled"
      },
      rcsSmsAutopilot: {
        cron: COLLECTION_ROUTE_INCIDENT_REMINDER_CRON,
        mode: "RCS_SMS_AUTOPILOT_MODE",
        defaultMode: "off",
        phoneAsPermissionSource: false,
        retryLimit: 3
      },
      message: "Cloud runner čte Trasy svozu, připravuje pouze nepotvrzené denní návrhy, hlídá chráněné TEST připomínky incidentů, obnovuje uložené RCS/SMS odpovědi pouze podle režimu Autopilota, ukládá staging-only Vistos faktury Pohledávek, eviduje dry-run automatizace a provádí read-only kontrolu Samooprav."
    });
  }
};
