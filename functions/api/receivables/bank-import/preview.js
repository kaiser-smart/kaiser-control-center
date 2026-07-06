import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { previewReceivablesBankTextImport } from "../../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "../_error.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const payload = await readJson(request);
    return json(await previewReceivablesBankTextImport(env, payload));
  } catch (error) {
    return receivablesErrorResponse(error, "POST /api/receivables/bank-import/preview");
  }
}
