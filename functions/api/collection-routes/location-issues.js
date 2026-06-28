import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  listCollectionLocationIssues
} from "../../_lib/collection-routes-store.js";

function collectionRoutesError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.location_issues_failed", { message: error.message });
  return json({ error: "Problémy poloh Tras svozu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const issues = await listCollectionLocationIssues(env, url.searchParams.get("limit") || 100);
    return json({ issues, apiStatus: "ready" });
  } catch (error) {
    return collectionRoutesError(error);
  }
}
