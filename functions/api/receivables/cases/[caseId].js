import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getReceivableCase } from "../../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "../_error.js";

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    return json(await getReceivableCase(env, params.caseId));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/cases/:caseId");
  }
}
