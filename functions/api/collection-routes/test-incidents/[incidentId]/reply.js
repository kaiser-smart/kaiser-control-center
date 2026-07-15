import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  CollectionRoutesTestIncidentWorkflowError,
  simulateCollectionRoutesTestIncidentReply
} from "../../../../_lib/collection-routes-test-incident-workflow.js";

function routeIncidentId(request, params) {
  return decodeURIComponent(String(params?.incidentId || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json({
      apiStatus: "ready",
      ...(await simulateCollectionRoutesTestIncidentReply(env, user, routeIncidentId(request, params), await readJson(request)))
    });
  } catch (error) {
    if (error instanceof CollectionRoutesTestIncidentWorkflowError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    console.error("collection_routes_test_incident_reply.api_failed", { message: error?.message });
    return json({ error: "Simulovanou TEST komunikaci se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
  }
}
