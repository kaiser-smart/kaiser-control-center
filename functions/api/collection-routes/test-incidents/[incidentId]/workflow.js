import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  CollectionRoutesTestIncidentWorkflowError,
  confirmCollectionRoutesTestIncidentWorkflow,
  getCollectionRoutesTestIncidentWorkflow,
  previewCollectionRoutesTestIncidentWorkflow
} from "../../../../_lib/collection-routes-test-incident-workflow.js";

function routeIncidentId(request, params) {
  return decodeURIComponent(String(params?.incidentId || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function errorResponse(error) {
  if (error instanceof CollectionRoutesTestIncidentWorkflowError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_routes_test_incident_workflow.api_failed", { message: error?.message });
  return json({ error: "Incidentní TEST workflow se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const incidentId = routeIncidentId(request, params);
    const stored = await getCollectionRoutesTestIncidentWorkflow(env, user, incidentId);
    if (stored) return json({ apiStatus: "ready", status: "already-confirmed", workflow: stored });
    const url = new URL(request.url);
    const preview = await previewCollectionRoutesTestIncidentWorkflow(env, user, incidentId, {
      testScenario: url.searchParams.get("testScenario")
    });
    return json({ apiStatus: "ready", ...preview });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const result = await confirmCollectionRoutesTestIncidentWorkflow(
      env,
      user,
      routeIncidentId(request, params),
      await readJson(request)
    );
    return json({ apiStatus: "ready", ...result }, result.reused ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
