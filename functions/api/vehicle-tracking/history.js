import { json, requireUserPermission } from "../../_lib/auth.js";
import { loadVehicleTrackingHistory } from "../../_lib/vehicle-tracking-history.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  if (!env.SMART_ODPADY_DB) return json({ error: "Historie tras zatím není připravená v cloudové databázi." }, 503);

  const url = new URL(request.url);
  const vehicleKey = url.searchParams.get("vehicleKey") || "";
  const range = url.searchParams.get("range") || "24h";
  try {
    return json({
      apiStatus: "ready",
      source: "T-Cars uložené GPS body",
      ...(await loadVehicleTrackingHistory(env.SMART_ODPADY_DB, { vehicleKey, range }))
    });
  } catch (error) {
    console.error("vehicle_tracking.history_read_failed", { message: error?.message || "unknown" });
    return json({ error: "Historii trasy se teď nepodařilo načíst." }, 503);
  }
}
