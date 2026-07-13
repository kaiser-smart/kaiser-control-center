import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRouteHereError,
  getCollectionRouteHereReadiness,
  publicCollectionRouteHereReadiness,
  startCollectionRouteHereRun
} from "../../_lib/collection-route-here-optimization.js";

function errorResponse(error) {
  if (error instanceof CollectionRouteHereError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_here.api_failed", { message: error?.message });
  return json({ error: "HERE read-only pilot se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const readiness = await getCollectionRouteHereReadiness(env, user, {
      routeDate: url.searchParams.get("routeDate"),
      wasteType: url.searchParams.get("wasteType") || "SKO",
      sourceBatchId: url.searchParams.get("sourceBatchId") || ""
    });
    return json({ readiness: publicCollectionRouteHereReadiness(readiness), apiStatus: readiness.apiStatus });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const result = await startCollectionRouteHereRun(env, user, await readJson(request));
    return json({ ...result, apiStatus: result.run?.status === "completed" ? "ready" : "waiting" }, result.reused ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
