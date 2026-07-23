export const RECEIVABLES_KB_PAYMENT_SYNC_URL = "https://smart-odpady.ai/api/receivables/kb/payment-sync-internal";

function clean(value) {
  return String(value ?? "").trim();
}

export function receivablesKbRunnerTokenMatches(received, expected) {
  const left = clean(received);
  const right = clean(expected);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function responsePayload(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("json")) return response.json().catch(() => ({}));
  return {};
}

export async function runReceivablesKbPaymentSyncRemote(env = {}, options = {}) {
  const token = clean(env.KB_RECEIVABLES_RUNNER_TOKEN);
  if (!token) {
    return {
      mode: "cloud_payment_import",
      status: "waiting_configuration",
      errorCode: "receivables_kb_runner_token_missing",
      importsKbPayments: false
    };
  }
  let response;
  try {
    response = await (options.fetchImpl || fetch)(RECEIVABLES_KB_PAYMENT_SYNC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Kaiser-Runner": "receivables-kb-payment"
      },
      body: JSON.stringify({
        scheduledTime: Number(options.scheduledTime) || Date.now(),
        cron: clean(options.cron),
        runner: "kaiser-receivables-kb-payment-runner"
      })
    });
  } catch {
    return {
      mode: "cloud_payment_import",
      status: "error",
      errorCode: "receivables_kb_runner_network_error",
      importsKbPayments: false
    };
  }
  const payload = await responsePayload(response);
  if (!response.ok || !payload?.result) {
    return {
      mode: "cloud_payment_import",
      status: "error",
      errorCode: clean(payload?.code) || "receivables_kb_runner_upstream_error",
      importsKbPayments: false
    };
  }
  return payload.result;
}

export function receivablesKbPaymentRunnerStatus(env = {}, cron = "") {
  return {
    status: clean(env.KB_RECEIVABLES_RUNNER_TOKEN) ? "ready" : "waiting_configuration",
    runner: "receivables-kb-payment-runner",
    mode: "authenticated-pages-runner",
    cron: clean(cron),
    target: RECEIVABLES_KB_PAYMENT_SYNC_URL,
    manualRun: "disabled",
    storesKbApiKeys: false,
    createsPaymentOrders: false,
    reconcilesInvoicesAutomatically: false,
    customerCommunication: "disabled"
  };
}
