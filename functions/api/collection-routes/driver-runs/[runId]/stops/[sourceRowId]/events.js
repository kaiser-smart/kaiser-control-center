import { json, readJson, requireUserPermission } from "../../../../../../_lib/auth.js";
import {
  CollectionRouteDriverEventsError,
  recordCollectionRouteDriverStopEvent
} from "../../../../../../_lib/collection-route-driver-events-store.js";

function routeParts(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return {
    runId: decodeURIComponent(String(params?.runId || parts.at(-4) || "")).trim(),
    sourceRowId: decodeURIComponent(String(params?.sourceRowId || parts.at(-2) || "")).trim()
  };
}

function errorResponse(error) {
  if (error instanceof CollectionRouteDriverEventsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_driver_events.create_failed", { message: error?.message });
  return json({ error: "Řidičskou akci se teď nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "edit");
  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const { runId, sourceRowId } = routeParts(request, params);
    const result = await recordCollectionRouteDriverStopEvent(env, user, {
      ...payload,
      runId,
      sourceRowId
    });
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
