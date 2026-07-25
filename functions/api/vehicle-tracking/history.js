import { json, requireUserPermission } from "../../_lib/auth.js";
import { getArchiveDatabase } from "../../_lib/databases.js";
import { loadVehicleTrackingHistory } from "../../_lib/vehicle-tracking-history.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  const archiveDb = getArchiveDatabase(env, { required: false });
  if (!archiveDb) return json({ error: "Historie tras zatím není připravená v DB_ARCHIVE." }, 503);

  const url = new URL(request.url);
  const vehicleKey = url.searchParams.get("vehicleKey") || "";
  const range = url.searchParams.get("range") || "24h";
  try {
    return json({
      apiStatus: "ready",
      source: "T-Cars uložené GPS body",
      ...(await loadVehicleTrackingHistory(archiveDb, { vehicleKey, range }))
    });
  } catch (error) {
    console.error("vehicle_tracking.history_read_failed", { message: error?.message || "unknown" });
    return json({ error: "Historii trasy se teď nepodařilo načíst." }, 503);
  }
}
