import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxApiStatus, dataBoxStoreErrorResponse, listDataBoxMessages } from "../../_lib/data-box-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  const url = new URL(request.url);

  try {
    const messages = await listDataBoxMessages(env, {
      direction: url.searchParams.get("direction"),
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit")
    });
    return json({ messages, apiStatus: dataBoxApiStatus(env) });
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
