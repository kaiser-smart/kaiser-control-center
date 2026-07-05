import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  DriverPartRequestsStoreError,
  getDriverPartHandoffReadiness
} from "../../../_lib/driver-part-requests-store.js";

function routeId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(params?.id || parts.at(-2) || "")).trim();
}

function errorResponse(error) {
  if (error instanceof DriverPartRequestsStoreError) {
    return json({
      error: error.message,
      apiStatus: "waiting",
      code: error.code,
      missingEndpoint: "GET /api/driver-reports/:id/handoff-readiness"
    }, error.status);
  }
  console.error("driver_reports.handoff_readiness_failed", { message: error?.message });
  return json({ error: "Kontrola předání Patrikovi se nepodařila.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "edit");
  if (response) return response;

  try {
    const readiness = await getDriverPartHandoffReadiness(env, user, routeId(request, params), {
      allowProbablePartHandoff: true,
      requireVinPartVerification: true
    });
    return json({ readiness, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
