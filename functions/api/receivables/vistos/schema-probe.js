import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  getReceivablesVistosLedgerMapping,
  ledgerMappingError
} from "../../../_lib/receivables-vistos-ledger-mapping.js";

function probeOptions(request) {
  const url = new URL(request.url);
  return {
    limit: url.searchParams.get("limit") || "25",
    today: url.searchParams.get("today") || "",
    enrichCustomers: url.searchParams.get("enrichCustomers") !== "0",
    customerLimit: url.searchParams.get("customerLimit") || "10",
    managerLimit: url.searchParams.get("managerLimit") || "5",
    probeCustomerLink: true,
    linkProbeLimit: url.searchParams.get("linkProbeLimit") || "5"
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const result = await getReceivablesVistosLedgerMapping(env, probeOptions(request));
    return json({
      apiStatus: result.apiStatus,
      readOnly: true,
      writesD1: false,
      writesLedger: false,
      preview: result.mapping?.customerLinkProbe || null,
      snapshot: result.snapshot || null
    });
  } catch (error) {
    const normalized = ledgerMappingError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_vistos_schema_probe_failed",
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
