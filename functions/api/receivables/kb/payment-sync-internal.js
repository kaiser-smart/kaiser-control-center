import { json } from "../../../_lib/auth.js";
import {
  receivablesKbPaymentSyncError,
  runReceivablesKbPaymentSyncAutomation
} from "../../../_lib/receivables-kb-payment-sync.js";
import { receivablesKbRunnerTokenMatches } from "../../../_lib/receivables-kb-payment-runner.js";

function clean(value) {
  return String(value ?? "").trim();
}

function requestToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    || request.headers.get("X-Receivables-KB-Runner-Token")
    || "";
}

export async function onRequestPost({ request, env }) {
  if (!receivablesKbRunnerTokenMatches(requestToken(request), env.KB_RECEIVABLES_RUNNER_TOKEN)) {
    return json({
      error: "Interní stahování plateb z KB není povolené.",
      code: "receivables_kb_runner_unauthorized"
    }, 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const scheduledTime = Number(body.scheduledTime);
    const result = await runReceivablesKbPaymentSyncAutomation(env, {
      scheduledTime: Number.isFinite(scheduledTime) && scheduledTime > 0 ? scheduledTime : Date.now(),
      cron: clean(body.cron),
      triggeredBy: clean(body.runner) || "kaiser-receivables-kb-payment-runner"
    });
    return json({
      result,
      apiStatus: result.status === "error" ? "error" : "ready",
      importsKbPayments: Boolean(result.importsKbPayments),
      createsPaymentOrders: false,
      reconcilesInvoicesAutomatically: false,
      sendsCustomerCommunication: false
    });
  } catch (error) {
    const normalized = receivablesKbPaymentSyncError(error);
    return json({
      error: normalized.message,
      code: normalized.code || "receivables_kb_payment_sync_failed",
      apiStatus: "error",
      importsKbPayments: false,
      createsPaymentOrders: false,
      reconcilesInvoicesAutomatically: false,
      sendsCustomerCommunication: false
    }, normalized.status || 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Tahle interní akce je dostupná jen cloudovému KB runneru." }, 405, {
    Allow: "POST"
  });
}
