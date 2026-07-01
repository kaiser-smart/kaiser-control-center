import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  DriverPartRequestsStoreError,
  getDriverPartRequest
} from "../../../_lib/driver-part-requests-store.js";
import {
  Partslink24SearchStoreError,
  createPartslink24VinSearchAudit,
  partslink24EligibilityForVehicle,
  partslink24PermissionSummary,
  resolvePartslink24VehicleForRequest
} from "../../../_lib/partslink24-search-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function errorResponse(error, missingEndpoint = "POST /api/driver-reports/partslink24/search-by-vin") {
  if (error instanceof Partslink24SearchStoreError || error instanceof DriverPartRequestsStoreError) {
    return json({
      ok: false,
      error: error.message,
      message: error.message,
      code: error.code,
      errorCode: error.code,
      details: error.details || null,
      missingEndpoint,
      apiStatus: error.status >= 500 ? "waiting" : "ready"
    }, error.status);
  }

  console.error("partslink24.search_by_vin_failed", { message: cleanString(error?.message) });
  return json({
    ok: false,
    error: "Vyhledání přes partslink24 se teď nepodařilo připravit.",
    message: "Vyhledání přes partslink24 se teď nepodařilo připravit.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "view");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const requestId = cleanString(payload.requestId || payload.request_id || payload.id);
    if (!requestId) {
      throw new Partslink24SearchStoreError(
        "Chybí ID hlášení řidiče.",
        400,
        "partslink24_request_id_required"
      );
    }

    const requestItem = await getDriverPartRequest(env, user, requestId);
    const { vehicle } = await resolvePartslink24VehicleForRequest(env, requestItem, user, payload);
    const eligibility = partslink24EligibilityForVehicle(user, vehicle);
    const result = await createPartslink24VinSearchAudit(env, user, {
      requestItem,
      vehicle,
      eligibility
    });

    return json({
      ok: true,
      status: result.audit.status,
      message: result.reusedRecent
        ? "Stejný partslink24 pilotní požadavek už byl před chvílí připravený. Nepřipravuji duplicitní běh."
        : result.audit.message,
      audit: result.audit,
      eligibility,
      workflow: result.workflow,
      permissions: partslink24PermissionSummary(user),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
