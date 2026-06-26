import { json, requireUserPermission } from "../../_lib/auth.js";
import { listVehicleWimAlertEvents, VehicleWimStoreError, vehicleWimApiStatus } from "../../_lib/vehicle-wim-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);

  try {
    return json(await listVehicleWimAlertEvents(env, limit));
  } catch (error) {
    const status = error instanceof VehicleWimStoreError ? error.status : 500;
    return json({
      error: error.message || "WIM alerty se nepodarilo nacist.",
      code: error.code || "vehicle_wim_alerts_api_failed",
      apiStatus: vehicleWimApiStatus(env)
    }, status);
  }
}
