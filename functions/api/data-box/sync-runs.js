import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxApiStatus, dataBoxStoreErrorResponse, listDataBoxSyncRuns } from "../../_lib/data-box-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  const url = new URL(request.url);

  try {
    const runs = await listDataBoxSyncRuns(env, { limit: url.searchParams.get("limit") });
    return json({ runs, apiStatus: dataBoxApiStatus(env) });
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
