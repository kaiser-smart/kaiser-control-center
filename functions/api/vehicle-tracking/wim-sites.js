import { json, requireUserPermission } from "../../_lib/auth.js";
import { listVehicleWimSites, VehicleWimStoreError, vehicleWimApiStatus } from "../../_lib/vehicle-wim-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  try {
    return json(await listVehicleWimSites(env));
  } catch (error) {
    const status = error instanceof VehicleWimStoreError ? error.status : 500;
    return json({
      error: error.message || "WIM mista se nepodarilo nacist.",
      code: error.code || "vehicle_wim_api_failed",
      apiStatus: vehicleWimApiStatus(env)
    }, status);
  }
}
