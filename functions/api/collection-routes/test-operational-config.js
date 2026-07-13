import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  CollectionRoutesTestGpsError,
  getCollectionRoutesTestOperationalConfig
} from "../../_lib/collection-routes-test-gps-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRoutesTestGpsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_routes_test_config.api_failed", { message: error?.message });
  return json({ error: "TEST provozní konfiguraci se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json({
      ...(await getCollectionRoutesTestOperationalConfig(env, user)),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
