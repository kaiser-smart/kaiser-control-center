import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteDriverEventsError,
  getCollectionRouteDriverRun
} from "../../../_lib/collection-route-driver-events-store.js";

function routeId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(params?.runId || parts.at(-1) || "")).trim();
}

function errorResponse(error) {
  if (error instanceof CollectionRouteDriverEventsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_driver_runs.detail_failed", { message: error?.message });
  return json({ error: "Řidičskou trasu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return response;
  }

  try {
    const run = await getCollectionRouteDriverRun(env, routeId(request, params));
    return json({ run, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
