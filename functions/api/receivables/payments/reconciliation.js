import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  applyReceivablesPaymentReconciliation,
  previewReceivablesPaymentReconciliation,
  receivablesPaymentReconciliationError
} from "../../../_lib/receivables-payment-reconciliation.js";

function errorResponse(error) {
  const normalized = receivablesPaymentReconciliationError(error);
  return json({
    error: normalized.message,
    code: normalized.code,
    apiStatus: normalized.status === 503 ? "waiting" : "error"
  }, normalized.status || 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json(await previewReceivablesPaymentReconciliation(env, {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize")
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    return json(await applyReceivablesPaymentReconciliation(env, await readJson(request), user));
  } catch (error) {
    return errorResponse(error);
  }
}
