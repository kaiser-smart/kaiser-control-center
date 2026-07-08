import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  getLatestCollectionRoutesVistosSnapshot
} from "../../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.vistos_kommunal_snapshot_failed", { message: error.message });
  return json({ error: "Vistos Komunál snapshot se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const snapshot = await getLatestCollectionRoutesVistosSnapshot(env, {
      limit: url.searchParams.get("limit") || 10000
    });
    return json({ snapshot, apiStatus: snapshot.apiStatus || "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
