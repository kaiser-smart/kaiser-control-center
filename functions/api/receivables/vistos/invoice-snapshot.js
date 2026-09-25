import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  createReceivablesVistosInvoiceSnapshot,
  getLatestReceivablesVistosInvoiceSnapshot,
  snapshotError
} from "../../../_lib/receivables-vistos-invoice-snapshot.js";

function snapshotOptions(request, user) {
  const url = new URL(request.url);
  return {
    page: url.searchParams.get("page"),
    batchId: url.searchParams.get("batchId"),
    pageSize: url.searchParams.get("pageSize"),
    maxPages: url.searchParams.get("maxPages") || "1",
    pagesPerRun: url.searchParams.get("pagesPerRun") || "1",
    vistosPageSize: url.searchParams.get("vistosPageSize") || "1000",
    invoiceLookbackMonths: url.searchParams.get("invoiceLookbackMonths"),
    createdByUserId: user?.id,
    triggeredBy: url.searchParams.get("mode") === "advance"
      ? "ui-auto-batch-advance"
      : url.searchParams.get("mode") === "live" || url.searchParams.get("live") === "1"
      ? "ui-live-refresh"
      : "ui-first-open"
  };
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    // Reading or paging through invoices never starts an import or talks to Vistos.
    return json({ ...await getLatestReceivablesVistosInvoiceSnapshot(env, snapshotOptions(request, user)), mode: "latest" });
  } catch (error) { return errorResponse(error); }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    const options = { ...snapshotOptions(request, user), triggeredBy: "ui-invoice-sync", page: 1, batchId: undefined };
    const result = await createReceivablesVistosInvoiceSnapshot(env, options);
    return json({ ...await getLatestReceivablesVistosInvoiceSnapshot(env, options), syncResult: result, mode: "sync" });
  } catch (error) { return errorResponse(error); }
}

function errorResponse(error) {
  const normalized = snapshotError(error);
  return json({ error: normalized.message, code: normalized.code,
    apiStatus: normalized.status === 503 ? "waiting" : "error" }, normalized.status || 500);
}
