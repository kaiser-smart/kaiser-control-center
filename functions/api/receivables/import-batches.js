import { json, requireUserPermission } from "../../_lib/auth.js";
import { listReceivableImportBatches } from "../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "./_error.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    return json(await listReceivableImportBatches(env, {
      limit: url.searchParams.get("limit")
    }));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/import-batches");
  }
}
