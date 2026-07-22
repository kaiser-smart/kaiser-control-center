import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  receivablesKbPaymentSyncError,
  receivablesKbPaymentSyncStatus,
  syncReceivablesKbPayments
} from "../../../_lib/receivables-kb-payment-sync.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    return json(await receivablesKbPaymentSyncStatus(env));
  } catch (error) {
    const normalized = receivablesKbPaymentSyncError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      apiStatus: "error"
    }, normalized.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    return json(await syncReceivablesKbPayments(env, {
      triggeredBy: "manual-ui",
      user
    }));
  } catch (error) {
    const normalized = receivablesKbPaymentSyncError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      details: normalized.details,
      apiStatus: "error"
    }, normalized.status || 500);
  }
}
