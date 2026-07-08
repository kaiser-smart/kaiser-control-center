import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, listDataBoxPlusSyncRuns } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  const url = new URL(request.url);
  try {
    return json({
      apiStatus: "ready",
      syncRuns: await listDataBoxPlusSyncRuns(env, { limit: url.searchParams.get("limit") })
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
