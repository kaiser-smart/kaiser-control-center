import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  DriverPartRequestsStoreError,
  getDriverPartRequest
} from "../../_lib/driver-part-requests-store.js";

function requestId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-1) || "")).trim();
}

function errorResponse(error, missingEndpoint = "GET /api/driver-reports/:id") {
  if (error instanceof DriverPartRequestsStoreError) {
    return json({ error: error.message, apiStatus: "waiting", code: error.code, missingEndpoint }, error.status);
  }

  console.error("driver_reports.detail_failed", { message: error?.message });
  return json({ error: "Detail hlášení se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "view");

  if (response) {
    return response;
  }

  try {
    const partRequest = await getDriverPartRequest(env, user, requestId(request, params));
    return json({ request: partRequest, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
