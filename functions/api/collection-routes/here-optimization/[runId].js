import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteHereError,
  getCollectionRouteHereRun
} from "../../../_lib/collection-route-here-optimization.js";

function runIdFromRequest(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf("here-optimization");
  return decodeURIComponent(String(params?.runId || parts[index + 1] || "").trim());
}

function errorResponse(error) {
  if (error instanceof CollectionRouteHereError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_here.detail_failed", { message: error?.message });
  return json({ error: "Stav HERE výpočtu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json(await getCollectionRouteHereRun(env, user, runIdFromRequest(request, params)));
  } catch (error) {
    return errorResponse(error);
  }
}
