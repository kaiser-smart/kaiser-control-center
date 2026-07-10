import { json, requireUserPermission } from "../../../_lib/auth.js";
import { previewReceivableCustomerInsolvency } from "../../../_lib/receivables-insolvency-isir.js";
import { receivablesErrorResponse } from "../_error.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    const customerId = new URL(request.url).searchParams.get("customerId") || "";
    return json(await previewReceivableCustomerInsolvency(env, customerId));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/insolvency/preview?customerId=:customerId");
  }
}
