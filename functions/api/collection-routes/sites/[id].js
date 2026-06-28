import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  getCollectionSite
} from "../../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.site_detail_failed", { message: error.message });
  return json({ error: "Detail stanoviště se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");

  if (response) {
    return response;
  }

  try {
    const result = await getCollectionSite(env, params.id);
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
