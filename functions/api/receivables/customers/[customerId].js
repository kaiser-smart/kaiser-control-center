import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getReceivableCustomerDetail } from "../../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "../_error.js";

export function decodeReceivableCustomerId(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    return json(await getReceivableCustomerDetail(env, decodeReceivableCustomerId(params.customerId)));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/customers/:customerId");
  }
}
