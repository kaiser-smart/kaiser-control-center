import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  listCollectionSites
} from "../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.sites_failed", { message: error.message });
  return json({ error: "Stanoviště Tras svozu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const sites = await listCollectionSites(env, url.searchParams.get("limit") || 100);
    return json({ sites, apiStatus: "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
