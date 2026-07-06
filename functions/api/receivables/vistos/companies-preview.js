import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  createReceivablesLedgerReadinessPreview,
  receivablesLedgerReadinessError
} from "../../../_lib/receivables-ledger-readiness.js";

function previewOptions(request) {
  const url = new URL(request.url);
  return {
    pageSize: url.searchParams.get("pageSize"),
    maxPages: url.searchParams.get("maxPages")
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const preview = await createReceivablesLedgerReadinessPreview(env, previewOptions(request));
    return json({
      apiStatus: preview.apiStatus || "ready",
      preview: {
        apiStatus: preview.apiStatus || "ready",
        message: preview.message,
        readOnly: true,
        writesD1: false,
        companies: preview.companies,
        problematicCompanies: preview.problematicCompanies,
        ledgerReadiness: preview.ledgerReadiness,
        diagnostics: preview.diagnostics
      }
    });
  } catch (error) {
    const { payload, status } = receivablesLedgerReadinessError(error);
    return json(payload, status);
  }
}
