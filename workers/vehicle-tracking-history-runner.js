const CRON = "* * * * *";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const token = String(env.VEHICLE_TRACKING_HISTORY_SYNC_TOKEN || "").trim();
      if (!token) return console.error("vehicle_tracking_history.missing_token");
      const response = await fetch(`${String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "")}/api/vehicle-tracking/internal-history-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) console.error("vehicle_tracking_history.failed", { status: response.status });
    })());
  },
  async fetch() { return Response.json({ status: "ready", cron: CRON, mode: "read-only-gps-history" }); }
};
