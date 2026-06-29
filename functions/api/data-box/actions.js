import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxActionErrorResponse, listDataBoxActions } from "../../_lib/data-box-actions-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const actions = await listDataBoxActions(env, {
      limit: url.searchParams.get("limit"),
      actionType: url.searchParams.get("actionType"),
      status: url.searchParams.get("status")
    });
    return json({ actions, apiStatus: "ready" });
  } catch (error) {
    const result = dataBoxActionErrorResponse(error);
    return json(result.payload, result.status);
  }
}
