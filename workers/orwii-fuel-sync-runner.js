import { runOrwiiFuelSyncAutomation, verifyOrwiiFuelRecoveryHistory } from "../functions/_lib/orwii-fuel-store.js";

const ORWII_FUEL_SYNC_CRON = "17 * * * *";

export default {
  async scheduled(controller, env, ctx) {
    const recoveryOnly = controller.cron === "*/5 * * * *";
    if (controller.cron !== ORWII_FUEL_SYNC_CRON && !(recoveryOnly && env.ORWII_RECOVERY_MODE === "enabled")) {
      console.log("orwii_fuel_sync.skipped_unknown_cron", { cron: controller.cron });
      return;
    }
    ctx.waitUntil((async () => {
      try {
        const deadline = Date.now() + 120_000;
        for (let batch = 0; batch < (recoveryOnly ? 4 : 1) && Date.now() < deadline; batch++) {
          const summary = await runOrwiiFuelSyncAutomation(env, {
            scheduledTime: controller.scheduledTime,
            recoveryOnly,
            triggeredBy: "cloudflare-cron"
          });
          console.log("orwii_fuel_sync.completed", summary);
          if (recoveryOnly && summary.reason === "recovery_caught_up") {
            console.log("orwii_fuel_sync.historical_verification", await verifyOrwiiFuelRecoveryHistory(env));
          }
          if (summary.status !== "completed") break;
        }
      } catch (error) {
        console.error("orwii_fuel_sync.failed", {
          code: String(error?.code || "orwii_sync_failed"),
          message: String(error?.message || "Cloudová synchronizace ORWII selhala.")
        });
      }
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "cloud-scheduled-sync",
      cron: ORWII_FUEL_SYNC_CRON,
      writes: "D1 audit mirror only",
      fleetMatching: "d1-master-aliases",
      historicalReprocessing: "automatic",
      externalWrites: "disabled",
      manualRun: "disabled",
      message: "ORWII tankování se čte každou hodinu v minutě 17 a ukládá se do D1 včetně auditu běhů."
    });
  }
};
