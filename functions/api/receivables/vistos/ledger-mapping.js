import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  getReceivablesVistosLedgerMapping,
  ledgerMappingError
} from "../../../_lib/receivables-vistos-ledger-mapping.js";

function mappingOptions(request) {
  const url = new URL(request.url);
  return {
    limit: url.searchParams.get("limit") || "80",
    today: url.searchParams.get("today") || ""
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const result = await getReceivablesVistosLedgerMapping(env, mappingOptions(request));
    return json(result);
  } catch (error) {
    const normalized = ledgerMappingError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_vistos_ledger_mapping_failed",
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
