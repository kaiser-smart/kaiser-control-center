import { json, requireUserPermission } from "../../../_lib/auth.js";
import { TcarsClientError, syncTcarsLocations } from "../../../_lib/tcars-client.js";

function canRunTcarsSync(user) {
  return ["admin", "management", "dispecer"].includes(String(user?.role || "").trim());
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  if (!canRunTcarsSync(user)) {
    return json({ error: "Nemáte oprávnění spustit T-Cars synchronizaci." }, 403);
  }

  try {
    const result = await syncTcarsLocations(env);
    return json(result);
  } catch (error) {
    if (error instanceof TcarsClientError) {
      return json({
        error: error.message,
        code: error.code,
        apiStatus: "waiting"
      }, error.status);
    }

    console.error("tcars.sync_failed", { message: error.message });
    return json({ error: "Nepodařilo se načíst polohy z T-Cars.", apiStatus: "waiting" }, 500);
  }
}
