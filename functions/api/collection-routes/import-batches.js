import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  listCollectionImportBatches
} from "../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.import_batches_failed", { message: error.message });
  return json({ error: "Importní batche Tras svozu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const batches = await listCollectionImportBatches(env, url.searchParams.get("limit") || 20);
    return json({ batches, apiStatus: "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
