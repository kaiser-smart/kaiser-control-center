import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  createReceivablesLedgerReadinessPreview,
  receivablesLedgerReadinessError
} from "../../../_lib/receivables-ledger-readiness.js";

function previewOptions(request) {
  const url = new URL(request.url);
  return {
    pageSize: url.searchParams.get("pageSize"),
    maxPages: url.searchParams.get("maxPages"),
    maxDetailIds: url.searchParams.get("maxDetailIds"),
    invoiceLookbackMonths: url.searchParams.get("invoiceLookbackMonths"),
    runMode: url.searchParams.get("runMode")
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const preview = await createReceivablesLedgerReadinessPreview(env, previewOptions(request));
    return json({ preview, apiStatus: preview.apiStatus || "ready" });
  } catch (error) {
    const { payload, status } = receivablesLedgerReadinessError(error);
    return json(payload, status);
  }
}
