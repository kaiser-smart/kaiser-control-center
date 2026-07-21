import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import { applyCollectionRouteIncidentAction, CollectionRouteIncidentsError } from "../../../../_lib/collection-route-incidents-store.js";

function incidentId(request, params = {}) {
  const path = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = path.lastIndexOf("incidents");
  return decodeURIComponent(String(params.incidentId || path[index + 1] || "").trim());
}

function errorResponse(error) {
  if (error instanceof CollectionRouteIncidentsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_incident_action.api_failed", { message: error?.message });
  return json({ error: "Akci hlášení se nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json(await applyCollectionRouteIncidentAction(
      env,
      user,
      incidentId(request, params),
      await readJson(request)
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
