import { json, requireUserPermission } from "../../_lib/auth.js";
import { getModuleDatabase } from "../../_lib/databases.js";
import { loadVehicleTrackingAnalytics } from "../../_lib/vehicle-tracking-analytics.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  const db = getModuleDatabase(env, {
    moduleName: "vehicle-tracking-analytics-read",
    allowedDomains: ["archive", "audit"],
    defaultDomain: "archive",
    required: false
  });
  if (!db) return json({ error: "Analytika jízd vyžaduje DB_ARCHIVE i DB_AUDIT." }, 503);

  const url = new URL(request.url);
  try {
    return json(await loadVehicleTrackingAnalytics(db, {
      period: url.searchParams.get("period") || "30d",
      vehicleKey: url.searchParams.get("vehicleKey") || ""
    }));
  } catch (error) {
    console.error("vehicle_tracking.analytics_read_failed", { message: error?.message || "unknown" });
    return json({ error: "Statistiky jízd se teď nepodařilo načíst." }, 503);
  }
}
