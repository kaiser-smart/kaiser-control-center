import { json, requireUserPermission } from "../../_lib/auth.js";
import { loadVehicleTrackingAnalytics } from "../../_lib/vehicle-tracking-analytics.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  if (!env.SMART_ODPADY_DB) return json({ error: "Analytika jízd zatím není připravená v cloudové databázi." }, 503);

  const url = new URL(request.url);
  try {
    return json(await loadVehicleTrackingAnalytics(env.SMART_ODPADY_DB, {
      period: url.searchParams.get("period") || "30d",
      vehicleKey: url.searchParams.get("vehicleKey") || ""
    }));
  } catch (error) {
    console.error("vehicle_tracking.analytics_read_failed", { message: error?.message || "unknown" });
    return json({ error: "Statistiky jízd se teď nepodařilo načíst." }, 503);
  }
}
