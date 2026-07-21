import { json, requireUserPermission } from "../../_lib/auth.js";
import { CollectionRouteIncidentsError, listCollectionRouteIncidents } from "../../_lib/collection-route-incidents-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRouteIncidentsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_incidents.api_failed", { message: error?.message });
  return json({ error: "Pracovní frontu hlášení se nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json(await listCollectionRouteIncidents(env, user, {
      scope: url.searchParams.get("scope"),
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit")
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
