import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  getReceivablesIncrementalLedgerDiff,
  receivablesIncrementalLedgerDiffError
} from "../../../_lib/receivables-incremental-ledger-diff.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json(await getReceivablesIncrementalLedgerDiff(env, {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize")
    }));
  } catch (error) {
    const normalized = receivablesIncrementalLedgerDiffError(error);
    return json({
      error: normalized.message,
      code: normalized.code,
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
