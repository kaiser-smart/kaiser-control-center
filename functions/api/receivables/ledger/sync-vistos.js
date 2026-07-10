import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  receivablesLedgerSyncError,
  syncReceivablesVistosLedger
} from "../../../_lib/receivables-ledger-sync.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    return json(await syncReceivablesVistosLedger(env, await readJson(request), user));
  } catch (error) {
    const normalized = receivablesLedgerSyncError(error);
    return json({ error: normalized.message, code: normalized.code, apiStatus: "error" }, normalized.status || 500);
  }
}
