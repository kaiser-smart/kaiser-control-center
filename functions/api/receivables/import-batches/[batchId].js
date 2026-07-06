import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getReceivableImportBatch } from "../../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "../_error.js";

export async function onRequestGet({ params, request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    return json(await getReceivableImportBatch(env, params.batchId));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/import-batches/:batchId");
  }
}
