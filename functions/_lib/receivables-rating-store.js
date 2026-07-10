import {
  PAYMENT_RATING_CALCULATION_VERSION,
  calculateCustomerPaymentRating
} from "./receivables-rating-engine.js";
import { matchReceivablePayments } from "./receivables-payment-matching.js";

const DB_BINDING = "SMART_ODPADY_DB";

export class ReceivablesRatingStoreError extends Error {
  constructor(message, status = 400, code = "receivables_rating_store_error") {
    super(message);
    this.name = "ReceivablesRatingStoreError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value) {
  return value === true || value === 1 || cleanString(value).toLowerCase() === "true";
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function safeJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesRatingStoreError(
      "Databáze Pohledávek není nastavená.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function invoiceFromRow(row, matchedPayments = []) {
  return {
    id: cleanString(row.id),
    invoiceId: cleanString(row.visto_invoice_id || row.id),
    invoiceNumber: cleanString(row.invoice_number),
    variableSymbol: cleanString(row.variable_symbol),
    customerId: cleanString(row.customer_id),
    issueDate: cleanString(row.issue_date),
    dueDate: cleanString(row.due_date),
    totalAmount: numberValue(row.total_amount),
    paidAmount: row.paid_amount === null || row.paid_amount === undefined ? null : numberValue(row.paid_amount),
    openAmount: row.open_amount === null || row.open_amount === undefined ? null : numberValue(row.open_amount),
    currency: cleanString(row.currency || "CZK"),
    status: cleanString(row.status),
    paidDate: cleanString(row.paid_date),
    paidDateReliable: Boolean(cleanString(row.paid_date)),
    disputeActive: cleanString(row.status).toLowerCase() === "disputed",
    customerLinkConfidence: cleanString(row.customer_link_confidence || "NONE"),
    dataQualityFlags: parseJson(row.data_quality_flags_json, []),
    matchedPayments
  };
}

function paymentFromRow(row) {
  return {
    id: cleanString(row.payment_transaction_id || row.id),
    paymentId: cleanString(row.payment_transaction_id || row.id),
    bookingDate: cleanString(row.booking_date),
    amount: numberValue(row.matched_amount ?? row.amount),
    variableSymbol: cleanString(row.variable_symbol),
    counterpartyAccount: cleanString(row.counterparty_account),
    counterpartyName: cleanString(row.counterparty_name),
    message: cleanString(row.message),
    matchedInvoiceId: cleanString(row.invoice_id),
    confidence: numberValue(row.confidence),
    status: cleanString(row.match_status || row.status),
    dataQualityFlags: parseJson(row.data_quality_flags_json, [])
  };
}

function normalizedSymbol(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  return !digits || Number(digits) === 0 ? "" : digits;
}

function unmatchedPaymentFromRow(row) {
  return {
    id: cleanString(row.id),
    paymentId: cleanString(row.id),
    bookingDate: cleanString(row.booking_date),
    amount: numberValue(row.amount),
    variableSymbol: cleanString(row.variable_symbol),
    counterpartyAccount: cleanString(row.counterparty_account),
    counterpartyName: cleanString(row.counterparty_name),
    message: cleanString(row.message),
    matchedInvoiceId: "",
    confidence: 0,
    status: "unmatched",
    dataQualityFlags: parseJson(row.data_quality_flags_json, [])
  };
}

async function sourceFingerprint(input) {
  const invoices = (input.invoices || []).map((invoice) => [
    invoice.id,
    invoice.issueDate,
    invoice.dueDate,
    invoice.totalAmount,
    invoice.paidAmount,
    invoice.openAmount,
    invoice.status,
    invoice.paidDate,
    ...(invoice.matchedPayments || []).map((payment) => `${payment.id}:${payment.bookingDate}:${payment.amount}:${payment.status}`)
  ]);
  const promises = (input.promises || []).map((promise) => [promise.id, promise.status, promise.promisedDate]);
  const payments = (input.payments || []).map((payment) => [
    payment.id,
    payment.bookingDate,
    payment.amount,
    payment.matchedInvoiceId,
    payment.status,
    payment.confidence
  ]);
  const inboxMessages = (input.inboxMessages || []).map((message) => [
    message.id,
    message.classification,
    message.receivedAt
  ]);
  const source = JSON.stringify({
    customerId: input.customerId,
    periodTo: input.periodTo,
    customerLinkConfidence: input.customerLinkConfidence,
    invoices,
    payments,
    promises,
    inboxMessages,
    insolvencyStatus: input.insolvencyStatus
  });
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  }
  return `fnv1a32:${stableHash(source)}`;
}

async function loadCustomerRatingInput(db, customerId, options = {}) {
  const customer = await db.prepare("SELECT * FROM receivable_customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!customer) {
    throw new ReceivablesRatingStoreError("Zákazník nebyl nalezen.", 404, "receivables_customer_not_found");
  }
  const [invoiceRows, paymentRows, promiseRows, inboxRows, insolvencyRow] = await Promise.all([
    db.prepare("SELECT * FROM receivable_invoices WHERE customer_id = ? ORDER BY issue_date ASC, id ASC LIMIT 10000").bind(customerId).all(),
    db.prepare(`
      SELECT
        t.*,
        m.invoice_id,
        m.payment_transaction_id,
        m.matched_amount,
        m.confidence,
        m.match_method,
        m.status AS match_status
      FROM receivable_payment_matches m
      JOIN receivable_payment_transactions t ON t.id = m.payment_transaction_id
      WHERE m.customer_id = ?
      ORDER BY t.booking_date ASC, t.id ASC
      LIMIT 10000
    `).bind(customerId).all(),
    db.prepare("SELECT * FROM receivable_promises_to_pay WHERE customer_id = ? ORDER BY promised_date ASC LIMIT 1000").bind(customerId).all(),
    db.prepare("SELECT * FROM receivable_inbox_messages WHERE customer_id = ? ORDER BY received_at ASC LIMIT 1000").bind(customerId).all(),
    db.prepare("SELECT * FROM receivable_insolvency_checks WHERE customer_id = ? ORDER BY checked_at DESC LIMIT 1").bind(customerId).first()
  ]);
  let payments = (paymentRows.results || []).map(paymentFromRow);
  const baseInvoices = (invoiceRows.results || []).map((row) => invoiceFromRow(row, []));
  if (!payments.length && baseInvoices.length) {
    const [transactionRows, ambiguousRows] = await Promise.all([
      db.prepare(`
        SELECT * FROM receivable_payment_transactions
        WHERE amount > 0
        ORDER BY booking_date ASC, id ASC
        LIMIT 50000
      `).all(),
      db.prepare(`
        SELECT variable_symbol
        FROM receivable_invoices
        WHERE variable_symbol IS NOT NULL AND variable_symbol <> ''
        GROUP BY variable_symbol
        HAVING COUNT(*) > 1
        LIMIT 10000
      `).all()
    ]);
    const candidateSymbols = new Set(baseInvoices.map((invoice) => normalizedSymbol(invoice.variableSymbol)).filter(Boolean));
    const candidatePayments = (transactionRows.results || [])
      .filter((row) => candidateSymbols.has(normalizedSymbol(row.variable_symbol)))
      .map(unmatchedPaymentFromRow);
    const ambiguousVariableSymbols = (ambiguousRows.results || []).map((row) => cleanString(row.variable_symbol));
    const matching = matchReceivablePayments(baseInvoices, candidatePayments, [{
      id: customerId,
      companyName: cleanString(customer.company_name)
    }], { includePaidInvoices: true, ambiguousVariableSymbols });
    const matched = matching.matches.map((match) => ({
      ...candidatePayments.find((payment) => payment.id === match.paymentTransactionId),
      matchedInvoiceId: match.invoiceId,
      matchedAmount: match.matchedAmount,
      amount: match.matchedAmount,
      confidence: match.confidence,
      status: match.status
    }));
    const reviewedIds = new Set(matching.reviewQueue.map((match) => match.paymentTransactionId));
    const review = candidatePayments
      .filter((payment) => reviewedIds.has(payment.id))
      .map((payment) => ({ ...payment, status: "needs_review" }));
    payments = [...matched, ...review];
  }
  const paymentsByInvoice = new Map();
  for (const payment of payments) {
    const current = paymentsByInvoice.get(payment.matchedInvoiceId) || [];
    current.push(payment);
    paymentsByInvoice.set(payment.matchedInvoiceId, current);
  }
  const invoices = (invoiceRows.results || []).map((row) => invoiceFromRow(row, paymentsByInvoice.get(cleanString(row.id)) || []));
  const promises = (promiseRows.results || []).map((row) => ({
    id: cleanString(row.id),
    status: cleanString(row.status),
    promisedDate: cleanString(row.promised_date),
    promisedAmount: numberValue(row.promised_amount)
  }));
  const inboxMessages = (inboxRows.results || []).map((row) => ({
    id: cleanString(row.id),
    classification: cleanString(row.classification),
    receivedAt: cleanString(row.received_at)
  }));
  const customerLinkConfidence = cleanString(customer.customer_link_confidence || "NONE").toUpperCase();
  return {
    customerId,
    periodFrom: cleanString(options.periodFrom || options.period_from),
    periodTo: cleanString(options.periodTo || options.period_to || options.asOfDate || options.today),
    calculatedAt: cleanString(options.calculatedAt),
    ratingMode: cleanString(options.ratingMode),
    customerLinkConfidence,
    customerLinkReliable: ["HIGH", "MEDIUM"].includes(customerLinkConfidence),
    customerMatchByNameOnly: booleanValue(customer.customer_match_by_name_only),
    insolvencyStatus: insolvencyRow?.found ? "found" : cleanString(customer.insolvency_status || "not_checked"),
    invoices,
    payments,
    bankPayments: payments,
    promises,
    inboxMessages,
    dataQualityFlags: invoices.flatMap((invoice) => invoice.dataQualityFlags || [])
  };
}

async function saveRating(db, rating, fingerprint, user = null) {
  const existing = await db.prepare(`
    SELECT id
    FROM receivable_customer_payment_ratings
    WHERE customer_id = ? AND calculation_version = ? AND period_to = ? AND source_fingerprint = ?
    LIMIT 1
  `).bind(rating.customerId, rating.calculationVersion, rating.periodTo, fingerprint).first();
  const id = cleanString(existing?.id) || randomId("receivable-rating");
  const values = [
    rating.score,
    rating.rating,
    rating.automationStatus,
    rating.weightedAvgDelay ?? 0,
    rating.p90Delay ?? 0,
    rating.onTimeAmountRate ?? 0,
    rating.currentOverdueBalance,
    rating.avgMonthlyBilling,
    rating.brokenPromiseRate,
    rating.partialPaymentRisk,
    rating.disputeRate,
    rating.penalties.unmatchedPaymentPenalty,
    safeJson({
      calculationVersion: rating.calculationVersion,
      recommendedAutomationStatus: rating.recommendedAutomationStatus
    }, {}),
    rating.ratingMode,
    rating.confidence,
    rating.recommendedAutomationStatus,
    rating.periodFrom,
    rating.periodTo,
    rating.invoiceCount,
    rating.paidInvoiceCount,
    rating.openInvoiceCount,
    rating.invoiceAmountTotal,
    rating.paidAmountTotal,
    rating.openAmountTotal,
    rating.overdueAmountTotal,
    rating.currentMaxDaysOverdue,
    rating.unmatchedPaymentRate,
    safeJson(rating.penalties, {}),
    safeJson(rating.dataQualityFlags, []),
    safeJson(rating.blockingReasons, []),
    rating.explanation,
    rating.calculationVersion,
    fingerprint
  ];
  if (existing?.id) {
    await db.prepare(`
      UPDATE receivable_customer_payment_ratings
      SET payment_morality_score = ?, rating = ?, automation_status = ?, weighted_avg_delay = ?,
          p90_delay = ?, on_time_amount_rate = ?, current_overdue_balance = ?, avg_monthly_billing = ?,
          broken_promise_rate = ?, partial_payment_risk = ?, dispute_rate = ?, unmatched_payment_penalty = ?,
          variables_json = ?, rating_mode = ?, confidence = ?, recommended_automation_status = ?,
          period_from = ?, period_to = ?, invoice_count = ?, paid_invoice_count = ?, open_invoice_count = ?,
          invoice_amount_total = ?, paid_amount_total = ?, open_amount_total = ?, overdue_amount_total = ?,
          current_max_days_overdue = ?, unmatched_payment_rate = ?, penalties_json = ?,
          data_quality_flags_json = ?, blocking_reasons_json = ?, explanation = ?, calculation_version = ?,
          source_fingerprint = ?, calculated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(...values, id).run();
  } else {
    await db.prepare(`
      INSERT INTO receivable_customer_payment_ratings (
        id, customer_id, payment_morality_score, rating, automation_status, weighted_avg_delay,
        p90_delay, on_time_amount_rate, current_overdue_balance, avg_monthly_billing,
        broken_promise_rate, partial_payment_risk, dispute_rate, unmatched_payment_penalty,
        variables_json, rating_mode, confidence, recommended_automation_status, period_from, period_to,
        invoice_count, paid_invoice_count, open_invoice_count, invoice_amount_total, paid_amount_total,
        open_amount_total, overdue_amount_total, current_max_days_overdue, unmatched_payment_rate,
        penalties_json, data_quality_flags_json, blocking_reasons_json, explanation, calculation_version,
        source_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, rating.customerId, ...values).run();
  }
  await db.prepare(`
    INSERT INTO receivable_audit_log (
      id, entity_type, entity_id, customer_id, action, actor_user_id, reason, after_json
    ) VALUES (?, 'customer_payment_rating', ?, ?, 'rating_calculated', ?, ?, ?)
  `).bind(
    randomId("receivable-audit"),
    id,
    rating.customerId,
    cleanString(user?.id) || null,
    `${rating.calculationVersion}:${rating.ratingMode}`,
    safeJson({ rating: rating.rating, score: rating.score, confidence: rating.confidence, fingerprint }, {})
  ).run();
  return id;
}

export async function previewReceivablePaymentRating(env, payload = {}) {
  const customerId = cleanString(payload.customerId || payload.customer_id);
  if (!customerId) {
    const input = payload.input || payload;
    return {
      rating: calculateCustomerPaymentRating(input),
      persisted: false,
      apiStatus: "ready",
      sendsCustomerCommunication: false,
      startsAutomation: false
    };
  }
  const db = database(env, true);
  try {
    const input = await loadCustomerRatingInput(db, customerId, payload);
    const rating = calculateCustomerPaymentRating(input);
    return {
      rating,
      sourceFingerprint: await sourceFingerprint(input),
      persisted: false,
      apiStatus: "ready",
      sendsCustomerCommunication: false,
      startsAutomation: false
    };
  } catch (error) {
    throw receivablesRatingStoreError(error);
  }
}

export async function recomputeReceivablePaymentRating(env, payload = {}, user = null) {
  const customerId = cleanString(payload.customerId || payload.customer_id);
  if (!customerId) {
    throw new ReceivablesRatingStoreError("Chybí customerId.", 400, "receivables_rating_customer_required");
  }
  const db = database(env, true);
  try {
    const input = await loadCustomerRatingInput(db, customerId, payload);
    const rating = calculateCustomerPaymentRating(input);
    const fingerprint = await sourceFingerprint(input);
    if (payload.persist !== true) {
      return {
        rating,
        sourceFingerprint: fingerprint,
        persisted: false,
        apiStatus: "ready",
        sendsCustomerCommunication: false,
        startsAutomation: false
      };
    }
    const ratingId = await saveRating(db, rating, fingerprint, user);
    return {
      rating: { ...rating, id: ratingId },
      sourceFingerprint: fingerprint,
      persisted: true,
      apiStatus: "ready",
      sendsCustomerCommunication: false,
      startsAutomation: false
    };
  } catch (error) {
    throw receivablesRatingStoreError(error);
  }
}

export function receivablesRatingStoreError(error) {
  if (error instanceof ReceivablesRatingStoreError) return error;
  const message = cleanString(error?.message);
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesRatingStoreError(
      "Ratingové tabulky nejsou připravené. Je potřeba migrace 0033_expand_receivables_payment_rating.sql.",
      503,
      "receivables_rating_migration_missing"
    );
  }
  console.error("receivables.rating_store_failed", { message });
  return new ReceivablesRatingStoreError("Rating se nepodařilo vypočítat.", 500, "receivables_rating_failed");
}

export function ratingCalculationVersion() {
  return PAYMENT_RATING_CALCULATION_VERSION;
}
