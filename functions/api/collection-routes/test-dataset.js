import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesTestStoreError,
  ensureCollectionRoutesTestDataset,
  getCollectionRoutesTestDataset
} from "../../_lib/collection-routes-test-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRoutesTestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_routes_test.api_failed", { message: error?.message });
  return json({ error: "Testovací sada Brno 501 se teď nepodařila zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const result = await getCollectionRoutesTestDataset(env, user, {
      includeRows: url.searchParams.get("includeRows") !== "false",
      limit: url.searchParams.get("limit") || 500
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const body = await readJson(request);
    const result = await ensureCollectionRoutesTestDataset(env, user, {
      confirmation: body.confirmation
    });
    return json(result, result.created ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
