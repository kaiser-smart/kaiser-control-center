import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  auditReceivablesVistosCustomerDirectory,
  ledgerMappingError
} from "../../../_lib/receivables-vistos-ledger-mapping.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  const url = new URL(request.url);
  try {
    return json(await auditReceivablesVistosCustomerDirectory(env, {
      offset: url.searchParams.get("offset"),
      limit: url.searchParams.get("limit")
    }));
  } catch (error) {
    const normalized = ledgerMappingError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_vistos_customer_directory_audit_failed",
      apiStatus: normalized.status === 503 ? "waiting" : "error",
      readOnly: true,
      writesD1: false
    }, normalized.status || 500);
  }
}
