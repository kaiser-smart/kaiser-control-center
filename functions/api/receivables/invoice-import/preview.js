import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { previewReceivablesInvoiceImport } from "../../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "../_error.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const payload = await readJson(request);
    return json(await previewReceivablesInvoiceImport(env, payload, user));
  } catch (error) {
    return receivablesErrorResponse(error, "POST /api/receivables/invoice-import/preview");
  }
}
