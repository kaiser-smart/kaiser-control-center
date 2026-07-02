import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  FleetVehiclesStoreError,
  validateFleetLicensePlate
} from "../../_lib/fleet-vehicles-store.js";
import { hasPermission } from "../../../src/permissions.js";

function errorResponse(error) {
  if (error instanceof FleetVehiclesStoreError) {
    return json({
      error: "Vozový park se teď nepodařilo ověřit. Zkuste to prosím znovu.",
      apiStatus: "waiting",
      code: error.code
    }, error.status);
  }

  console.error("driver_reports.license_plate_failed", { message: error?.message });
  return json({
    error: "SPZ se teď nepodařilo ověřit. Zkuste to prosím znovu.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "create");

  if (response) {
    return response;
  }

  if (!hasPermission(user, "fleet", "view")) {
    return json({ error: "K tomu nemáš oprávnění.", code: "FORBIDDEN", apiStatus: "ready" }, 403);
  }

  try {
    const url = new URL(request.url);
    const value = url.searchParams.get("value") || url.searchParams.get("spz") || "";
    const result = await validateFleetLicensePlate(env, value, user);
    return json({
      ...result,
      valid: result.validFormat && result.exact,
      status: result.exact ? "found" : result.validFormat ? "not_found" : result.formatReason,
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
