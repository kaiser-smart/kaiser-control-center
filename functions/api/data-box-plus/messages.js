import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusApiStatus, dataBoxPlusStoreErrorResponse, listDataBoxPlusMessages } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  const url = new URL(request.url);
  try {
    return json({
      apiStatus: dataBoxPlusApiStatus(env),
      messages: await listDataBoxPlusMessages(env, { limit: url.searchParams.get("limit") })
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
