import { json } from "../../../_lib/auth.js";
import {
  advanceReceivablesVistosInvoiceIncrementalSnapshot,
  advanceReceivablesVistosInvoiceSnapshot,
  createReceivablesVistosInvoiceIncrementalSnapshot,
  createReceivablesVistosInvoiceSnapshot,
  snapshotError
} from "../../../_lib/receivables-vistos-invoice-snapshot.js";

function clean(value) {
  return String(value ?? "").trim();
}

function requestToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    || request.headers.get("X-Receivables-Runner-Token")
    || "";
}

function tokenMatches(received, expected) {
  const left = clean(received);
  const right = clean(expected);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function syncAction(env, action, body) {
  const common = {
    triggeredBy: clean(body.runner) || "cloud-runner-receivables",
    periodTo: clean(body.scheduledAt) || new Date().toISOString(),
    vistosPageSize: 1000
  };
  if (action === "continue_full") {
    return advanceReceivablesVistosInvoiceSnapshot(env, { ...common, pagesPerRun: 3 });
  }
  if (action === "full") {
    return createReceivablesVistosInvoiceSnapshot(env, { ...common, maxPages: 3 });
  }
  if (action === "continue_incremental") {
    return advanceReceivablesVistosInvoiceIncrementalSnapshot(env, { ...common, pagesPerRun: 3 });
  }
  if (action === "incremental") {
    return createReceivablesVistosInvoiceIncrementalSnapshot(env, { ...common, maxPages: 3 });
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!tokenMatches(requestToken(request), env.RECEIVABLES_RUNNER_TOKEN)) {
    return json({
      error: "Interní načítání Pohledávek není povolené.",
      code: "receivables_runner_unauthorized"
    }, 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action);
    const result = await syncAction(env, action, body);
    if (!result) {
      return json({
        error: "Neznámý režim interní synchronizace Pohledávek.",
        code: "receivables_sync_action_invalid"
      }, 400);
    }
    return json({
      result,
      action,
      apiStatus: result.apiStatus || "ready",
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      importsKbPayments: false
    });
  } catch (error) {
    const normalized = snapshotError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_invoice_sync_failed",
      apiStatus: "error",
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      importsKbPayments: false
    }, normalized.status || 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Tahle interní akce je dostupná jen pro plánované serverové načítání." }, 405, {
    Allow: "POST"
  });
}
