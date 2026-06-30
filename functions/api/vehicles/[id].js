import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  FleetVehiclesStoreError,
  fleetVehicleCanEditDriver,
  getFleetVehicleWithAssignment,
  saveFleetVehicleDriverAssignment
} from "../../_lib/fleet-vehicles-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function vehicleIdFromContext(context = {}) {
  return cleanString(context.params?.id);
}

function errorResponse(error) {
  if (error instanceof FleetVehiclesStoreError) {
    return json({
      error: error.message,
      code: error.code,
      apiStatus: error.status === 503 ? "waiting" : "ready"
    }, error.status);
  }

  console.error("vehicles.detail_failed", { message: cleanString(error?.message) });
  return json({
    error: "Vozidlo se teď nepodařilo načíst nebo uložit.",
    code: "fleet_vehicle_failed",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "fleet", "view");

  if (response) {
    return response;
  }

  try {
    const payload = await getFleetVehicleWithAssignment(env, vehicleIdFromContext({ params }), user);
    return json({
      provider: payload.provider,
      source: payload.source,
      apiStatus: payload.apiStatus,
      assignmentApiStatus: payload.assignmentApiStatus,
      assignmentMessage: payload.assignmentMessage,
      driverCandidates: payload.driverCandidates || [],
      vehicle: payload.vehicle
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "fleet", "edit");

  if (response) {
    return response;
  }

  if (!fleetVehicleCanEditDriver(user)) {
    return json({ error: "Nemáte oprávnění upravit řidiče vozidla." }, 403);
  }

  try {
    const body = await readJson(request);
    const payload = await saveFleetVehicleDriverAssignment(env, user, vehicleIdFromContext({ params }), body);
    return json({
      provider: payload.provider,
      source: payload.source,
      apiStatus: payload.apiStatus,
      assignmentApiStatus: payload.assignmentApiStatus,
      assignmentMessage: payload.assignmentMessage,
      vehicle: payload.vehicle
    });
  } catch (error) {
    return errorResponse(error);
  }
}
