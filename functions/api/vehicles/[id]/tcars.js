import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getFleetVehicleWithAssignment } from "../../../_lib/fleet-vehicles-store.js";
import { loadTcarsVehicleDetailPayload } from "../../../_lib/tcars-client.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function periodDays(request) {
  const url = new URL(request.url);
  const days = Number.parseInt(url.searchParams.get("days") || "30", 10);
  return [1, 7, 30].includes(days) ? days : 30;
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;

  try {
    const fleetPayload = await getFleetVehicleWithAssignment(env, cleanString(params?.id), user);
    const detail = await loadTcarsVehicleDetailPayload(env, fleetPayload.vehicle, {
      days: periodDays(request)
    });
    return json({
      ...detail,
      fleetVehicleId: fleetPayload.vehicle.id,
      fleetSource: fleetPayload.source
    });
  } catch (error) {
    console.error("vehicles.tcars_detail_failed", {
      code: cleanString(error?.code || "fleet_tcars_detail_failed"),
      message: cleanString(error?.message || "unknown")
    });
    const status = Number(error?.status) || 500;
    return json({
      error: status === 404
        ? "Vozidlo nebylo nalezeno."
        : "T-Cars detail vozidla se teď nepodařilo načíst.",
      code: cleanString(error?.code || "fleet_tcars_detail_failed"),
      apiStatus: "waiting"
    }, status);
  }
}
