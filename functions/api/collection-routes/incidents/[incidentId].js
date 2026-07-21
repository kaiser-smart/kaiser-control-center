import { json, requireUserPermission } from "../../../_lib/auth.js";
import { CollectionRouteIncidentsError, getCollectionRouteIncident } from "../../../_lib/collection-route-incidents-store.js";

function incidentId(request, params = {}) {
  const path = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = path.lastIndexOf("incidents");
  return decodeURIComponent(String(params.incidentId || path[index + 1] || "").trim());
}

function errorResponse(error) {
  if (error instanceof CollectionRouteIncidentsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_incident.api_failed", { message: error?.message });
  return json({ error: "Detail hlášení se nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json(await getCollectionRouteIncident(env, user, incidentId(request, params), {
      scope: url.searchParams.get("scope")
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
