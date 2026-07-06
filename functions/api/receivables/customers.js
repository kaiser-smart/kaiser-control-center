import { json, requireUserPermission } from "../../_lib/auth.js";
import { listReceivableCustomers } from "../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "./_error.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const result = await listReceivableCustomers(env, {
      limit: url.searchParams.get("limit"),
      rating: url.searchParams.get("rating"),
      status: url.searchParams.get("status"),
      search: url.searchParams.get("search")
    });
    return json(result);
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/customers");
  }
}
