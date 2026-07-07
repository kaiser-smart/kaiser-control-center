import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  advanceReceivablesVistosInvoiceSnapshot,
  createReceivablesVistosInvoiceSnapshot,
  getLatestReceivablesVistosInvoiceSnapshot,
  snapshotError
} from "../../../_lib/receivables-vistos-invoice-snapshot.js";

function snapshotOptions(request, user) {
  const url = new URL(request.url);
  return {
    page: url.searchParams.get("page"),
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

function snapshotIsStale(snapshot, maxAgeHours = 12) {
  const createdAt = new Date(snapshot?.batch?.createdAt || 0).getTime();
  if (!Number.isFinite(createdAt) || createdAt <= 0) return true;
  return Date.now() - createdAt > maxAgeHours * 60 * 60 * 1000;
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const rawMode = url.searchParams.get("mode");
    const mode = rawMode === "advance"
      ? "advance"
      : rawMode === "live" || url.searchParams.get("live") === "1" ? "live" : "latest";
    const options = snapshotOptions(request, user);

    if (mode === "advance") {
      const result = await advanceReceivablesVistosInvoiceSnapshot(env, options);
      return json({ ...result, mode });
    }

    if (mode === "live") {
      const result = await createReceivablesVistosInvoiceSnapshot(env, options);
      return json({ ...result, mode });
    }

    const latest = await getLatestReceivablesVistosInvoiceSnapshot(env, options);
    if (latest.snapshot && !snapshotIsStale(latest.snapshot)) {
      return json({ ...latest, mode });
    }

    const created = await createReceivablesVistosInvoiceSnapshot(env, {
      ...options,
      triggeredBy: latest.snapshot ? "ui-auto-stale-refresh" : options.triggeredBy
    });
    return json({ ...created, mode: latest.snapshot ? "auto_stale_refresh" : "first_open" });
  } catch (error) {
    const normalized = snapshotError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_vistos_invoice_snapshot_failed",
      apiStatus: normalized.status === 503 ? "waiting" : "error"
    }, normalized.status || 500);
  }
}
