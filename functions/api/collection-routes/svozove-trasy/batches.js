import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteSourcesError,
  listCollectionRouteSourceBatches
} from "../../../_lib/collection-route-sources-store.js";

function sourceBatchesError(error) {
  if (error instanceof CollectionRouteSourcesError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_sources.batches_failed", { message: error.message });
  return json({ error: "Importy Svozových tras se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const batches = await listCollectionRouteSourceBatches(env, url.searchParams.get("limit") || 10);
    return json({ batches, apiStatus: "ready" });
  } catch (error) {
    return sourceBatchesError(error);
  }
}
