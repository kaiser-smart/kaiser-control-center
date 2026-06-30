import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  DriverPartRequestsStoreError,
  closeDriverPartRequest
} from "../../../_lib/driver-part-requests-store.js";

function routeId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(params?.id || parts.at(-2) || "")).trim();
}

function errorResponse(error) {
  if (error instanceof DriverPartRequestsStoreError) {
    return json({ error: error.message, apiStatus: "waiting", code: error.code, missingEndpoint: "POST /api/driver-reports/:id/complete" }, error.status);
  }
  console.error("driver_reports.complete_failed", { message: error?.message });
  return json({ error: "Uzavření požadavku se nepodařilo.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "driver-reports", "edit");
  if (response) return response;

  try {
    const payload = await readJson(request);
    const partRequest = await closeDriverPartRequest(env, user, routeId(request, params), payload);
    return json({ request: partRequest, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
