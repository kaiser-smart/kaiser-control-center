import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteSourcesError,
  listCollectionRouteSourceRows
} from "../../../_lib/collection-route-sources-store.js";

function sourceRoutesError(error) {
  if (error instanceof CollectionRouteSourcesError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_route_sources.routes_failed", { message: error.message });
  return json({ error: "Svozové trasy z 13 Excelů se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const payload = await listCollectionRouteSourceRows(env, {
      batchId: url.searchParams.get("batchId") || "",
      day: url.searchParams.get("day") || "all",
      week: url.searchParams.get("week") || "all",
      vehicle: url.searchParams.get("vehicle") || "all",
      waste: url.searchParams.get("waste") || "all",
      mappingStatus: url.searchParams.get("mappingStatus") || "all",
      limit: url.searchParams.get("limit") || 500
    });
    return json({ ...payload, apiStatus: "ready" });
  } catch (error) {
    return sourceRoutesError(error);
  }
}
