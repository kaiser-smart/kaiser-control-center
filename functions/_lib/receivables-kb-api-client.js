const DEFAULT_API_BASE_URL = "https://api-gateway.kb.cz";
const DEFAULT_REDIRECT_URI = "https://smart-odpady.ai/api/receivables/kb/oauth/callback";
const MAX_TRANSACTION_PAGES_PER_RUN = 45;

export class ReceivablesKbApiError extends Error {
  constructor(message, status = 502, code = "receivables_kb_api_error", details = {}) {
    super(message);
    this.name = "ReceivablesKbApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function randomCorrelationId() {
  return globalThis.crypto?.randomUUID?.()
    || `kb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function configuredBaseUrl(env) {
  const value = clean(env?.KB_ADAA_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ReceivablesKbApiError("KB API base URL není platná.", 500, "receivables_kb_api_base_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "api-gateway.kb.cz") {
    throw new ReceivablesKbApiError(
      "KB API base URL musí směřovat na oficiální api-gateway.kb.cz.",
      500,
      "receivables_kb_api_base_url_not_allowed"
    );
  }
  return value;
}

const REQUIRED_ENV = [
  "KB_ADAA_ENVIRONMENT",
  "KB_ADAA_OAUTH_API_KEY",
  "KB_ADAA_ACCOUNT_API_KEY",
  "KB_ADAA_CLIENT_ID",
  "KB_ADAA_CLIENT_SECRET",
  "KB_ADAA_REFRESH_TOKEN"
];

export function receivablesKbApiReadiness(env = {}) {
  const missingEnv = REQUIRED_ENV.filter((key) => !clean(env?.[key]));
  const environment = clean(env.KB_ADAA_ENVIRONMENT).toLowerCase();
  if (environment && environment !== "production") missingEnv.push("KB_ADAA_ENVIRONMENT");
  const blockers = [...new Set(missingEnv)];
  return {
    ready: blockers.length === 0,
    missingEnv: blockers,
    environment: environment || "nenastaveno",
    apiBaseUrl: blockers.length ? "" : configuredBaseUrl(env),
    redirectUriConfigured: Boolean(clean(env.KB_ADAA_REDIRECT_URI)),
    accountAllowlistConfigured: Boolean(clean(env.KB_ADAA_ACCOUNT_IDS)),
    requiredEnv: [...REQUIRED_ENV]
  };
}

async function responsePayload(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("json")) return response.json().catch(() => ({}));
  const text = await response.text().catch(() => "");
  return text ? { message: text.slice(0, 500) } : {};
}

async function fetchJson(fetchImpl, url, options, stage) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new ReceivablesKbApiError(
      `KB API není dostupné ve fázi ${stage}.`,
      502,
      "receivables_kb_api_network_error",
      { stage, cause: clean(error?.message) }
    );
  }
  const payload = await responsePayload(response);
  if (!response.ok) {
    const upstreamCode = clean(payload?.code || payload?.errorCode || payload?.error);
    throw new ReceivablesKbApiError(
      `KB API odmítlo požadavek ve fázi ${stage}.`,
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "receivables_kb_api_rate_limited" : "receivables_kb_api_upstream_error",
      { stage, upstreamStatus: response.status, upstreamCode }
    );
  }
  return payload;
}

export async function requestReceivablesKbAccessToken(env = {}, options = {}) {
  const readiness = receivablesKbApiReadiness(env);
  if (!readiness.ready) {
    throw new ReceivablesKbApiError(
      "KB API není nakonfigurované.",
      503,
      "receivables_kb_api_not_configured",
      { missingEnv: readiness.missingEnv }
    );
  }
  const body = new URLSearchParams({
    redirect_uri: clean(env.KB_ADAA_REDIRECT_URI) || DEFAULT_REDIRECT_URI,
    client_id: clean(env.KB_ADAA_CLIENT_ID),
    client_secret: clean(env.KB_ADAA_CLIENT_SECRET),
    refresh_token: clean(env.KB_ADAA_REFRESH_TOKEN),
    grant_type: "refresh_token"
  });
  const payload = await fetchJson(
    options.fetchImpl || fetch,
    `${readiness.apiBaseUrl}/oauth2/v3/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-correlation-id": randomCorrelationId(),
        apiKey: clean(env.KB_ADAA_OAUTH_API_KEY)
      },
      body
    },
    "oauth_access_token"
  );
  const accessToken = clean(payload.access_token);
  if (!accessToken) {
    throw new ReceivablesKbApiError(
      "KB OAuth odpověď neobsahuje access token.",
      502,
      "receivables_kb_access_token_missing"
    );
  }
  return {
    accessToken,
    expiresIn: Number(payload.expires_in) || 0,
    tokenType: clean(payload.token_type) || "Bearer"
  };
}

function apiHeaders(env, accessToken) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "x-correlation-id": randomCorrelationId(),
    apiKey: clean(env.KB_ADAA_ACCOUNT_API_KEY)
  };
}

function accountIdentifier(account = {}) {
  return clean(account.accountId || account.id || account.resourceId);
}

function accountAllowlist(env = {}) {
  return new Set(clean(env.KB_ADAA_ACCOUNT_IDS).split(",").map(clean).filter(Boolean));
}

export async function listReceivablesKbAccounts(env = {}, accessToken, options = {}) {
  const payload = await fetchJson(
    options.fetchImpl || fetch,
    `${configuredBaseUrl(env)}/adaa/v2/accounts`,
    { headers: apiHeaders(env, accessToken) },
    "accounts"
  );
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.content)
      ? payload.content
      : Array.isArray(payload.accounts)
        ? payload.accounts
        : [];
  const allowlist = accountAllowlist(env);
  const accounts = source
    .map((account) => ({ ...account, accountId: accountIdentifier(account) }))
    .filter((account) => account.accountId)
    .filter((account) => !allowlist.size || allowlist.has(account.accountId));
  if (!accounts.length) {
    throw new ReceivablesKbApiError(
      allowlist.size
        ? "KB neposkytla žádný účet z nakonfigurovaného allowlistu."
        : "KB neposkytla žádný účet dostupný pro ADAA.",
      409,
      "receivables_kb_accounts_empty"
    );
  }
  return accounts;
}

function counterpartyAccount(counterParty = {}) {
  const iban = clean(counterParty.iban).replace(/\s+/g, "").toUpperCase();
  if (iban) return iban;
  const accountNo = clean(counterParty.accountNo);
  const bankCode = clean(counterParty.bankCode);
  return accountNo && bankCode ? `${accountNo}/${bankCode}` : accountNo;
}

export function normalizeReceivablesKbTransaction(transaction = {}, account = {}) {
  const references = transaction.references || {};
  const bankTransactionId = clean(references.accountServicer);
  const amount = money(transaction.amount?.value);
  const status = clean(transaction.status).toUpperCase();
  const direction = clean(transaction.creditDebitIndicator).toUpperCase();
  const bookedIncoming = status === "BOOK" && direction === "CREDIT" && amount > 0;
  const message = [
    references.receiver,
    references.sender,
    references.myDescription,
    transaction.additionalTransactionInformation
  ].map(clean).filter(Boolean).join(" · ");
  const targetIban = clean(transaction.iban || account.iban).replace(/\s+/g, "").toUpperCase();
  return {
    source: `kb_api:${clean(account.accountId)}`,
    bankTransactionId,
    bookingDate: clean(transaction.bookingDate),
    valueDate: clean(transaction.valueDate),
    transactionType: clean(transaction.transactionType),
    status,
    direction,
    amount,
    currency: clean(transaction.amount?.currency) || "CZK",
    variableSymbol: clean(references.variable).replace(/\D/g, ""),
    constantSymbol: clean(references.constant).replace(/\D/g, ""),
    specificSymbol: clean(references.specific).replace(/\D/g, ""),
    counterpartyName: clean(transaction.counterParty?.name),
    counterpartyAccount: counterpartyAccount(transaction.counterParty),
    message,
    targetIban,
    bookedIncoming,
    raw: transaction
  };
}

function pageCount(payload) {
  const total = Number(payload?.totalPages);
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 1;
}

export async function downloadReceivablesKbPayments(env = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const token = await requestReceivablesKbAccessToken(env, { fetchImpl });
  const accounts = await listReceivablesKbAccounts(env, token.accessToken, { fetchImpl });
  const payments = [];
  const summary = {
    accountCount: accounts.length,
    pageCount: 0,
    transactionCount: 0,
    bookedCreditCount: 0,
    ignoredCount: 0,
    missingReferenceCount: 0
  };

  for (const account of accounts) {
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      if (summary.pageCount >= MAX_TRANSACTION_PAGES_PER_RUN) {
        throw new ReceivablesKbApiError(
          "KB transakční historie překročila bezpečný limit 45 stránek na jeden cloudový běh.",
          502,
          "receivables_kb_transactions_page_limit"
        );
      }
      const url = new URL(`${configuredBaseUrl(env)}/adaa/v2/accounts/${encodeURIComponent(account.accountId)}/transactions`);
      url.searchParams.set("fromDateTime", options.fromDateTime);
      url.searchParams.set("toDateTime", options.toDateTime);
      url.searchParams.set("size", "100");
      url.searchParams.set("page", String(page));
      const payload = await fetchJson(
        fetchImpl,
        url.toString(),
        { headers: apiHeaders(env, token.accessToken) },
        "transactions"
      );
      const transactions = Array.isArray(payload.content) ? payload.content : [];
      summary.pageCount += 1;
      summary.transactionCount += transactions.length;
      for (const transaction of transactions) {
        const normalized = normalizeReceivablesKbTransaction(transaction, account);
        if (!normalized.bookedIncoming) {
          summary.ignoredCount += 1;
          continue;
        }
        if (!normalized.bankTransactionId) {
          summary.missingReferenceCount += 1;
          summary.ignoredCount += 1;
          continue;
        }
        payments.push(normalized);
        summary.bookedCreditCount += 1;
      }
      totalPages = pageCount(payload);
      page += 1;
    }
  }

  return {
    payments,
    summary,
    accounts: accounts.map((account) => ({
      accountId: account.accountId,
      iban: clean(account.iban),
      currency: clean(account.currency)
    })),
    tokenExpiresIn: token.expiresIn
  };
}

export function receivablesKbApiError(error) {
  if (error instanceof ReceivablesKbApiError) return error;
  return new ReceivablesKbApiError(
    "Stahování plateb z KB selhalo.",
    500,
    "receivables_kb_payment_download_failed",
    { cause: clean(error?.message) }
  );
}
