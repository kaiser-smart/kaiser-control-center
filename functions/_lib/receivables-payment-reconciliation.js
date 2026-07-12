import { receivableToleranceAmount } from "./receivables-payment-matching.js";

const DB_BINDING = "SMART_ODPADY_DB";
const CONFIRMED_MATCH_STATUSES = new Set(["matched", "auto_matched"]);
const PROTECTED_INVOICE_STATUSES = new Set(["disputed", "legal_handoff", "insolvency_hold"]);

export class ReceivablesPaymentReconciliationError extends Error {
  constructor(message, status = 400, code = "receivables_payment_reconciliation_error") {
    super(message);
    this.name = "ReceivablesPaymentReconciliationError";
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function dayKey(value) {
  const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function safeJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
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

function boundedInteger(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new ReceivablesPaymentReconciliationError(
      "Databáze Pohledávek není nastavená.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

export function calculateReconciledInvoiceState(invoice = {}, matches = []) {
  const totalAmount = Math.max(0, money(invoice.totalAmount ?? invoice.total_amount));
  const currentPaidAmount = Math.max(0, money(invoice.paidAmount ?? invoice.paid_amount));
  const currentOpenAmount = Math.max(0, money(invoice.openAmount ?? invoice.open_amount));
  const currentStatus = clean(invoice.status).toLowerCase() || "unpaid";
  const currentPaidDate = dayKey(invoice.paidDate ?? invoice.paid_date);
  const tolerance = receivableToleranceAmount(totalAmount);
  const confirmedMatches = matches
    .filter((match) => CONFIRMED_MATCH_STATUSES.has(clean(match.status ?? match.match_status).toLowerCase()))
    .map((match) => ({
      id: clean(match.id ?? match.payment_transaction_id),
      amount: Math.max(0, money(match.matchedAmount ?? match.matched_amount)),
      bookingDate: dayKey(match.bookingDate ?? match.booking_date ?? match.matchedAt ?? match.matched_at),
      confidence: Number(match.confidence) || 0,
      status: clean(match.status ?? match.match_status).toLowerCase()
    }))
    .filter((match) => match.amount > 0)
    .sort((left, right) => left.bookingDate.localeCompare(right.bookingDate) || left.id.localeCompare(right.id));

  let cumulativeMatchedAmount = 0;
  let matchedPaidDate = "";
  for (const match of confirmedMatches) {
    cumulativeMatchedAmount = money(cumulativeMatchedAmount + match.amount);
    if (!matchedPaidDate && cumulativeMatchedAmount >= totalAmount - tolerance) {
      matchedPaidDate = match.bookingDate;
    }
  }

  const paidAmount = Math.max(currentPaidAmount, cumulativeMatchedAmount);
  const openAmount = paidAmount >= totalAmount - tolerance ? 0 : Math.max(0, money(totalAmount - paidAmount));
  const calculatedStatus = paidAmount > totalAmount + tolerance
    ? "overpaid"
    : paidAmount >= totalAmount - tolerance
      ? "paid"
      : paidAmount > 0
        ? "partially_paid"
        : "unpaid";
  const protectedStatus = PROTECTED_INVOICE_STATUSES.has(currentStatus);
  const status = protectedStatus ? currentStatus : calculatedStatus;
  const paidDate = ["paid", "overpaid"].includes(calculatedStatus)
    ? (matchedPaidDate || currentPaidDate)
    : "";

  return {
    totalAmount,
    currentPaidAmount,
    currentOpenAmount,
    currentStatus,
    currentPaidDate,
    paidAmount: money(paidAmount),
    openAmount,
    status,
    paidDate,
    matchedAmount: money(cumulativeMatchedAmount),
    matchedPaymentCount: confirmedMatches.length,
    matchConfidenceMinimum: confirmedMatches.length
      ? Math.min(...confirmedMatches.map((match) => match.confidence))
      : 0,
    tolerance,
    protectedStatus,
    confirmedMatches
  };
}

export function buildReceivablesPaymentReconciliationRow(invoice = {}, matches = []) {
  const state = calculateReconciledInvoiceState(invoice, matches);
  const amountChanged = Math.abs(state.currentPaidAmount - state.paidAmount) > 0.01
    || Math.abs(state.currentOpenAmount - state.openAmount) > 0.01;
  const statusChanged = state.currentStatus !== state.status;
  const paidDateChanged = state.currentPaidDate !== state.paidDate;
  const requiresUpdate = !state.protectedStatus && (amountChanged || statusChanged || paidDateChanged);
  return {
    invoiceId: clean(invoice.id),
    vistoInvoiceId: clean(invoice.visto_invoice_id),
    invoiceNumber: clean(invoice.invoice_number),
    variableSymbol: clean(invoice.variable_symbol),
    customerId: clean(invoice.customer_id),
    companyName: clean(invoice.company_name),
    ico: clean(invoice.ico),
    currency: clean(invoice.currency || "CZK"),
    before: {
      status: state.currentStatus,
      paidAmount: state.currentPaidAmount,
      openAmount: state.currentOpenAmount,
      paidDate: state.currentPaidDate
    },
    after: {
      status: state.status,
      paidAmount: state.paidAmount,
      openAmount: state.openAmount,
      paidDate: state.paidDate
    },
    totalAmount: state.totalAmount,
    matchedAmount: state.matchedAmount,
    matchedPaymentCount: state.matchedPaymentCount,
    matchConfidenceMinimum: state.matchConfidenceMinimum,
    tolerance: state.tolerance,
    requiresUpdate,
    protectedStatus: state.protectedStatus,
    evidence: state.confirmedMatches
  };
}

async function reconciliationSourceRows(db) {
  const result = await db.prepare(`
    SELECT i.id, i.visto_invoice_id, i.invoice_number, i.variable_symbol, i.customer_id,
           i.total_amount, i.paid_amount, i.open_amount, i.currency, i.status, i.paid_date,
           c.company_name, c.ico,
           m.id AS match_id, m.payment_transaction_id, m.matched_amount, m.confidence,
           m.status AS match_status, m.matched_at, p.booking_date
    FROM receivable_invoices i
    JOIN receivable_customers c ON c.id = i.customer_id
    JOIN receivable_payment_matches m ON m.invoice_id = i.id
      AND m.status IN ('matched', 'auto_matched')
    JOIN receivable_payment_transactions p ON p.id = m.payment_transaction_id
    WHERE i.data_quality_flags_json LIKE '%INVOICE_AMOUNT_MISMATCH%'
      AND i.data_quality_flags_json LIKE '%MISSING_REMAINING_AMOUNT%'
    ORDER BY i.id, p.booking_date, m.matched_at, m.id
  `).all();
  return result.results || [];
}

function rowsFromSource(sourceRows) {
  const grouped = new Map();
  for (const source of sourceRows) {
    const invoiceId = clean(source.id);
    if (!grouped.has(invoiceId)) grouped.set(invoiceId, { invoice: source, matches: [] });
    grouped.get(invoiceId).matches.push({
      id: source.payment_transaction_id,
      matchedAmount: source.matched_amount,
      bookingDate: source.booking_date || source.matched_at,
      confidence: source.confidence,
      status: source.match_status
    });
  }
  return [...grouped.values()]
    .map(({ invoice, matches }) => buildReceivablesPaymentReconciliationRow(invoice, matches))
    .sort((left, right) => Number(right.requiresUpdate) - Number(left.requiresUpdate)
      || left.companyName.localeCompare(right.companyName, "cs")
      || left.invoiceNumber.localeCompare(right.invoiceNumber));
}

async function previewFingerprint(rows) {
  const source = rows.map((row) => ({
    invoiceId: row.invoiceId,
    before: row.before,
    after: row.after,
    evidence: row.evidence.map((match) => [match.id, match.amount, match.bookingDate, match.status])
  }));
  const serialized = JSON.stringify(source);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  }
  return `fnv1a32:${stableHash(serialized)}`;
}

export async function previewReceivablesPaymentReconciliation(env, options = {}) {
  const db = database(env);
  const page = boundedInteger(options.page, 1, 100000);
  const pageSize = boundedInteger(options.pageSize, 10, 100);
  const allRows = rowsFromSource(await reconciliationSourceRows(db));
  const pendingRows = allRows.filter((row) => row.requiresUpdate);
  const fullyCoveredRows = allRows.filter((row) => row.matchedAmount >= row.totalAmount - row.tolerance);
  const protectedRows = allRows.filter((row) => row.protectedStatus);
  const affectedCustomers = new Set(pendingRows.map((row) => row.customerId));
  const offset = (page - 1) * pageSize;
  return {
    apiStatus: "ready",
    previewFingerprint: await previewFingerprint(allRows),
    summary: {
      evidenceInvoiceCount: allRows.length,
      pendingCount: pendingRows.length,
      fullyCoveredCount: fullyCoveredRows.length,
      partiallyCoveredCount: allRows.length - fullyCoveredRows.length,
      protectedCount: protectedRows.length,
      affectedCustomerCount: affectedCustomers.size,
      matchedAmountTotal: money(allRows.reduce((sum, row) => sum + row.matchedAmount, 0)),
      openAmountReduction: money(pendingRows.reduce((sum, row) => sum + Math.max(0, row.before.openAmount - row.after.openAmount), 0))
    },
    rows: allRows.slice(offset, offset + pageSize),
    pagination: { page, pageSize, totalRows: allRows.length },
    readOnly: true,
    writesLedger: false,
    writesAudit: false,
    recalculatesRatings: false,
    sendsCustomerCommunication: false,
    startsAutomation: false
  };
}

function auditPayload(row, fingerprint) {
  return {
    source: "confirmed_payment_matches",
    previewFingerprint: fingerprint,
    matchedAmount: row.matchedAmount,
    matchedPaymentCount: row.matchedPaymentCount,
    matchConfidenceMinimum: row.matchConfidenceMinimum,
    tolerance: row.tolerance,
    evidence: row.evidence
  };
}

async function applyRows(db, rows, fingerprint, user) {
  for (let index = 0; index < rows.length; index += 20) {
    const statements = [];
    for (const row of rows.slice(index, index + 20)) {
      const beforeJson = safeJson(row.before, {});
      const afterJson = safeJson({ ...row.after, reconciliation: auditPayload(row, fingerprint) }, {});
      const currentPaidDate = clean(row.before.paidDate);
      statements.push(
        db.prepare(`
          INSERT INTO receivable_audit_log (
            id, entity_type, entity_id, customer_id, action, actor_user_id, reason, before_json, after_json
          )
          SELECT ?, 'receivable_invoice', id, customer_id, 'payment_state_reconciled', ?, ?, ?, ?
          FROM receivable_invoices
          WHERE id = ? AND status = ? AND paid_amount = ? AND open_amount = ?
            AND COALESCE(paid_date, '') = ?
        `).bind(
          randomId("receivable-audit"),
          clean(user?.id) || null,
          `confirmed_matches:${fingerprint}`,
          beforeJson,
          afterJson,
          row.invoiceId,
          row.before.status,
          row.before.paidAmount,
          row.before.openAmount,
          currentPaidDate
        ),
        db.prepare(`
          UPDATE receivable_invoices
          SET paid_amount = ?, open_amount = ?, status = ?, paid_date = NULLIF(?, ''), updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = ? AND paid_amount = ? AND open_amount = ?
            AND COALESCE(paid_date, '') = ?
        `).bind(
          row.after.paidAmount,
          row.after.openAmount,
          row.after.status,
          row.after.paidDate,
          row.invoiceId,
          row.before.status,
          row.before.paidAmount,
          row.before.openAmount,
          currentPaidDate
        )
      );
    }
    await db.batch(statements);
  }
}

export async function applyReceivablesPaymentReconciliation(env, payload = {}, user = null) {
  const expectedFingerprint = clean(payload.previewFingerprint);
  const expectedCount = Math.floor(Number(payload.expectedCandidateCount));
  if (!expectedFingerprint || !Number.isFinite(expectedCount) || expectedCount < 1) {
    throw new ReceivablesPaymentReconciliationError(
      "Apply vyžaduje aktuální previewFingerprint a očekávaný počet faktur.",
      400,
      "receivables_payment_reconciliation_preview_required"
    );
  }
  const before = await previewReceivablesPaymentReconciliation(env, { page: 1, pageSize: 100 });
  const pendingRows = before.rows.filter((row) => row.requiresUpdate);
  if (before.previewFingerprint !== expectedFingerprint || pendingRows.length !== expectedCount) {
    throw new ReceivablesPaymentReconciliationError(
      "Preview se mezitím změnilo. Načti ho znovu; žádná faktura nebyla upravena.",
      409,
      "receivables_payment_reconciliation_preview_stale"
    );
  }
  const db = database(env);
  await applyRows(db, pendingRows, expectedFingerprint, user);
  const auditCountRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM receivable_audit_log
    WHERE action = 'payment_state_reconciled' AND reason = ?
  `).bind(`confirmed_matches:${expectedFingerprint}`).first();
  const auditCount = Number(auditCountRow?.count || 0);
  const after = await previewReceivablesPaymentReconciliation(env, { page: 1, pageSize: 100 });
  if (after.summary.pendingCount !== 0 || auditCount !== pendingRows.length) {
    throw new ReceivablesPaymentReconciliationError(
      "Část faktur se mezitím změnila. Běh je auditovaný a vyžaduje kontrolu.",
      409,
      "receivables_payment_reconciliation_partial_apply"
    );
  }
  return {
    apiStatus: "ready",
    appliedCount: pendingRows.length,
    auditCount,
    affectedCustomerCount: new Set(pendingRows.map((row) => row.customerId)).size,
    before: before.summary,
    after: after.summary,
    persisted: true,
    writesAudit: true,
    recalculatesRatings: false,
    sendsCustomerCommunication: false,
    startsAutomation: false
  };
}

export function receivablesPaymentReconciliationError(error) {
  if (error instanceof ReceivablesPaymentReconciliationError) return error;
  const message = clean(error?.message);
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesPaymentReconciliationError(
      "Tabulky Pohledávek nejsou v D1 připravené.",
      503,
      "receivables_migration_missing"
    );
  }
  console.error("receivables.payment_reconciliation_failed", { message });
  return new ReceivablesPaymentReconciliationError(
    "Dorovnání platebních stavů se nepodařilo dokončit.",
    500,
    "receivables_payment_reconciliation_failed"
  );
}
