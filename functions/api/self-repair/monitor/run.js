import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { runSelfRepairHourlyMonitor } from "../../../_lib/self-repair-monitor-runner.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "self-repair", "manage");
  if (response) return response;

  const payload = await readJson(request);
  if (payload?.confirmReadOnly !== true) {
    return json({
      error: "Read-only kontrola vyžaduje výslovné potvrzení.",
      code: "self_repair_monitor_confirmation_required",
      apiStatus: "ready"
    }, 400);
  }

  try {
    const summary = await runSelfRepairHourlyMonitor(env, {
      scheduledTime: Date.now(),
      triggeredBy: `admin-manual:${String(user?.id || user?.email || "unknown").slice(0, 160)}`
    });

    return json({
      ...summary,
      apiStatus: summary.status === "error" ? "waiting" : "ready"
    }, summary.status === "error" ? 502 : 200);
  } catch (error) {
    console.error("self_repair_monitor.manual_run_failed", {
      code: String(error?.code || "self_repair_monitor_failed")
    });
    return json({
      error: "Read-only kontrolu se nepodařilo spustit. Chyba byla zapsaná do technického logu.",
      code: String(error?.code || "self_repair_monitor_failed"),
      apiStatus: "waiting"
    }, 500);
  }
}
