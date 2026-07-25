import { runDatabaseCapacityMonitor } from "../functions/_lib/database-capacity-monitor.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await runDatabaseCapacityMonitor(env, {
        scheduledTime: controller.scheduledTime
      });
      console.log("database_capacity_monitor.completed", result);
    })());
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({
      status: "ready",
      cron: "*/15 * * * *",
      databases: ["SMART_ODPADY_DB", "SMART_ODPADY_CORE", "SMART_ODPADY_MESSAGES", "SMART_ODPADY_AUDIT", "SMART_ODPADY_ARCHIVE"],
      destructiveCleanup: false,
      automaticOperationalDataDeletion: false,
      auditDatabaseFailureIsolation: true,
      bindingsReady: Boolean(env.DB_CORE && env.DB_MESSAGES && env.DB_AUDIT && env.DB_ARCHIVE)
    });
  }
};
