import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRouteDriverEventsError,
  createOrGetCollectionRouteDriverRun
} from "../../_lib/collection-route-driver-events-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRouteDriverEventsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_driver_runs.create_failed", { message: error?.message });
  return json({ error: "Řidičskou trasu se teď nepodařilo připravit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "edit");
  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const run = await createOrGetCollectionRouteDriverRun(env, user, payload);
    return json({ run, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
