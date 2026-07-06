import { json, requireUserPermission } from "../../_lib/auth.js";
import { getReceivablesDashboard } from "../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "./_error.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const dashboard = await getReceivablesDashboard(env, {
      limit: url.searchParams.get("limit"),
      today: url.searchParams.get("today")
    });
    return json(dashboard);
  } catch (error) {
    return receivablesErrorResponse(error);
  }
}
