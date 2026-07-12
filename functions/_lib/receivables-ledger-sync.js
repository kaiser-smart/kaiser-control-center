const DB_BINDING = "SMART_ODPADY_DB";
const VISTOS_IMPORT_KIND = "vistos_invoice_snapshot";
const BANK_IMPORT_KIND = "bank_transactions";

export class ReceivablesLedgerSyncError extends Error {
  constructor(message, status = 400, code = "receivables_ledger_sync_error") {
    super(message);
    this.name = "ReceivablesLedgerSyncError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const normalized = cleanString(value).replace(/\u00a0/g, "").replace(/\s+/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value) {
  return value === true || value === 1 || cleanString(value).toLowerCase() === "true";
}

function optionalBoolean(value) {
  if (value === undefined || value === null || cleanString(value) === "") return null;
  return booleanValue(value);
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

function stableId(prefix, value) {
  return `${prefix}:${cleanString(value)}`;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesLedgerSyncError("Databáze Pohledávek není nastavená.", 503, "receivables_database_missing");
  }
  return db;
}

function boundedInteger(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(number, max);
}

async function latestBatch(db, importKind) {
  return db.prepare(`
    SELECT * FROM receivable_import_batches
    WHERE import_kind = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(importKind).first();
}

async function latestCompletedVistosBatch(db) {
  return db.prepare(`
    SELECT * FROM receivable_import_batches
    WHERE import_kind = ? AND status = 'snapshot'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(VISTOS_IMPORT_KIND).first();
}

async function selectedBatch(db, importKind, batchId) {
  if (!cleanString(batchId)) return latestBatch(db, importKind);
  return db.prepare(`
    SELECT * FROM receivable_import_batches
    WHERE id = ? AND import_kind = ?
    LIMIT 1
  `).bind(cleanString(batchId), importKind).first();
}

async function runStatements(db, statements) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

export function invoiceStatus(invoice, paidAmount, openAmount) {
  const sourceStatus = cleanString(invoice.status).toLowerCase();
  if (sourceStatus.includes("spor") || sourceStatus === "disputed") return "disputed";
  const sourcePaid = optionalBoolean(invoice.isPaid);
  if (sourcePaid === true) return "paid";
  if (sourcePaid === false) return paidAmount > 0 && openAmount > 0 ? "partially_paid" : "unpaid";
  if (openAmount <= 0) return "paid";
  if (paidAmount > 0) return "partially_paid";
  return "unpaid";
}

export function invoiceAmounts(invoice) {
  const totalAmount = numberValue(invoice.totalAmount ?? invoice.priceWithTax);
  const paidAmount = Math.max(0, numberValue(invoice.paidAmount));
  const computedOpenAmount = Math.max(0, totalAmount - paidAmount);
  const sourceOpenValue = invoice.openAmount ?? invoice.remainingAmount;
  const sourceOpenAmount = sourceOpenValue === undefined || sourceOpenValue === null || cleanString(sourceOpenValue) === ""
    ? null
    : Math.max(0, numberValue(sourceOpenValue));
  const sourcePaid = optionalBoolean(invoice.isPaid);
  let openAmount = sourceOpenAmount ?? computedOpenAmount;
  if (sourcePaid === true) openAmount = 0;
  if (sourcePaid === false) openAmount = Math.max(sourceOpenAmount ?? 0, computedOpenAmount);
  return { totalAmount, paidAmount, openAmount, sourceOpenAmount, computedOpenAmount, sourcePaid };
}

export function invoiceFlags(row, invoice, amounts) {
  const flags = [];
  if (cleanString(row.preview_status) === "review" || cleanString(row.preview_status) === "needs_review") {
    const issue = cleanString(row.issue_code).toUpperCase();
    if (issue === "MISSING_DUE_DATE") flags.push("MISSING_DUE_DATE");
    else if (issue === "MISSING_TOTAL_AMOUNT") flags.push("MISSING_INVOICE_AMOUNT");
    else if (issue === "MISSING_CUSTOMER_REFERENCE") flags.push("CUSTOMER_LINK_NOT_RELIABLE");
  }
  if (!cleanString(invoice.dueDate)) flags.push("MISSING_DUE_DATE");
  if (!cleanString(invoice.variableSymbol)) flags.push("MISSING_VARIABLE_SYMBOL");
  if (!amounts.totalAmount) flags.push("MISSING_INVOICE_AMOUNT");
  const tolerance = Math.max(1, Math.abs(amounts.totalAmount) * 0.001);
  if (
    amounts.sourcePaid === false
    && (amounts.sourceOpenAmount ?? 0) <= tolerance
    && amounts.computedOpenAmount > tolerance
  ) {
    flags.push("MISSING_REMAINING_AMOUNT", "INVOICE_AMOUNT_MISMATCH");
  }
  if (amounts.sourcePaid === true && amounts.computedOpenAmount > tolerance) {
    flags.push("INVOICE_AMOUNT_MISMATCH");
  }
  return [...new Set(flags)].sort();
}

export async function syncReceivablesVistosLedger(env, payload = {}, user = null) {
  const db = database(env, true);
  const offset = boundedInteger(payload.offset, 0, 10_000_000);
  const limit = Math.max(1, boundedInteger(payload.limit, 100, 250));
  try {
    const batch = cleanString(payload.batchId)
      ? await selectedBatch(db, VISTOS_IMPORT_KIND, payload.batchId)
      : await latestCompletedVistosBatch(db);
    if (!batch) throw new ReceivablesLedgerSyncError("Vistos snapshot nebyl nalezen.", 404, "receivables_vistos_snapshot_missing");
    if (cleanString(batch.status) !== "snapshot") {
      throw new ReceivablesLedgerSyncError(
        "Vistos snapshot ještě není dokončený.",
        409,
        "receivables_vistos_snapshot_not_complete"
      );
    }
    const rowsResult = await db.prepare(`
      SELECT row_number, preview_status, issue_code, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT ? OFFSET ?
    `).bind(batch.id, limit, offset).all();
    const rows = rowsResult.results || [];
    const statements = [];
    const summary = { processed: rows.length, ready: 0, review: 0, skipped: 0, customerCount: 0, invoiceCount: 0 };
    const customerIds = new Set();
    for (const row of rows) {
      const invoice = parseJson(row.normalized_json, {});
      const companyId = cleanString(invoice.customerCompanyId || invoice.customerFk);
      const invoiceId = cleanString(invoice.vistoInvoiceId || invoice.invoiceId);
      const amounts = invoiceAmounts(invoice);
      const flags = invoiceFlags(row, invoice, amounts);
      if (!companyId || !invoiceId || flags.includes("MISSING_INVOICE_AMOUNT")) {
        summary.skipped += 1;
        summary.review += 1;
        continue;
      }
      const customerId = stableId("receivable-customer", companyId);
      const ledgerInvoiceId = stableId("receivable-invoice", invoiceId);
      const sourceCustomerName = cleanString(invoice.customerCompanyName || invoice.customerName);
      const customerName = sourceCustomerName || companyId;
      const { totalAmount, paidAmount, openAmount } = amounts;
      const status = invoiceStatus(invoice, paidAmount, openAmount);
      customerIds.add(customerId);
      summary.invoiceCount += 1;
      summary[flags.length ? "review" : "ready"] += 1;
      statements.push(
        db.prepare(`
          INSERT OR IGNORE INTO receivable_customers (
            id, visto_company_id, company_name, ico, dic, automation_status, raw_payload,
            visto_branch_id, billing_email, standard_due_days, insolvency_status, customer_link_confidence
          ) VALUES (?, ?, ?, ?, ?, 'dry_run', ?, ?, ?, ?, 'not_checked', 'HIGH')
        `).bind(
          customerId,
          companyId,
          customerName,
          cleanString(invoice.ico) || null,
          cleanString(invoice.dic) || null,
          safeJson({ source: "vistos_invoice_snapshot", customerCompanyId: companyId }, {}),
          cleanString(invoice.customerBranchId) || null,
          cleanString(invoice.billingEmail) || null,
          numberValue(invoice.standardDueDays) || null
        ),
        db.prepare(`
          UPDATE receivable_customers
          SET company_name = COALESCE(NULLIF(?, ''), company_name),
              ico = COALESCE(NULLIF(?, ''), ico),
              dic = COALESCE(NULLIF(?, ''), dic),
              visto_branch_id = COALESCE(NULLIF(?, ''), visto_branch_id),
              billing_email = COALESCE(NULLIF(?, ''), billing_email),
              standard_due_days = COALESCE(?, standard_due_days),
              customer_link_confidence = 'HIGH', updated_at = CURRENT_TIMESTAMP
          WHERE visto_company_id = ?
        `).bind(
          sourceCustomerName,
          cleanString(invoice.ico),
          cleanString(invoice.dic),
          cleanString(invoice.customerBranchId),
          cleanString(invoice.billingEmail),
          numberValue(invoice.standardDueDays) || null,
          companyId
        ),
        db.prepare(`
          INSERT OR IGNORE INTO receivable_invoices (
            id, visto_invoice_id, invoice_number, variable_symbol, customer_id, issue_date, due_date,
            total_amount, paid_amount, open_amount, currency, status, paid_date, raw_payload,
            visto_branch_id, customer_manager_id, customer_manager_name, customer_link_confidence,
            data_quality_flags_json, source_snapshot_batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'HIGH', ?, ?)
        `).bind(
          ledgerInvoiceId,
          invoiceId,
          cleanString(invoice.invoiceNumber || invoiceId),
          cleanString(invoice.variableSymbol) || null,
          customerId,
          cleanString(invoice.issueDate) || null,
          cleanString(invoice.dueDate) || null,
          totalAmount,
          paidAmount,
          openAmount,
          cleanString(invoice.currency || "CZK"),
          status,
          safeJson(invoice, {}),
          cleanString(invoice.customerBranchId) || null,
          cleanString(invoice.customerManagerId) || null,
          cleanString(invoice.customerManagerName) || null,
          safeJson(flags, []),
          batch.id
        ),
        db.prepare(`
          UPDATE receivable_invoices
          SET invoice_number = ?, variable_symbol = ?, customer_id = ?, issue_date = ?, due_date = ?,
              total_amount = ?, paid_amount = ?, open_amount = ?, currency = ?, status = ?, raw_payload = ?,
              visto_branch_id = ?, customer_manager_id = ?, customer_manager_name = ?,
              customer_link_confidence = 'HIGH', data_quality_flags_json = ?, source_snapshot_batch_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE visto_invoice_id = ?
        `).bind(
          cleanString(invoice.invoiceNumber || invoiceId),
          cleanString(invoice.variableSymbol) || null,
          customerId,
          cleanString(invoice.issueDate) || null,
          cleanString(invoice.dueDate) || null,
          totalAmount,
          paidAmount,
          openAmount,
          cleanString(invoice.currency || "CZK"),
          status,
          safeJson(invoice, {}),
          cleanString(invoice.customerBranchId) || null,
          cleanString(invoice.customerManagerId) || null,
          cleanString(invoice.customerManagerName) || null,
          safeJson(flags, []),
          batch.id,
          invoiceId
        )
      );
    }
    summary.customerCount = customerIds.size;
    const nextOffset = offset + rows.length;
    const totalRows = numberValue(batch.row_count);
    const done = rows.length < limit || (totalRows > 0 && nextOffset >= totalRows);
    if (payload.persist === true && statements.length) {
      await runStatements(db, statements);
      await db.prepare(`
        INSERT INTO receivable_audit_log (
          id, entity_type, entity_id, action, actor_user_id, reason, after_json
        ) VALUES (?, 'receivable_import_batch', ?, 'vistos_ledger_sync_chunk', ?, ?, ?)
      `).bind(
        randomId("receivable-audit"),
        batch.id,
        cleanString(user?.id) || null,
        `offset=${offset};limit=${limit}`,
        safeJson(summary, {})
      ).run();
    }
    return {
      apiStatus: "ready",
      batchId: batch.id,
      offset,
      nextOffset,
      limit,
      totalRows,
      done,
      persisted: payload.persist === true,
      summary,
      sendsCustomerCommunication: false,
      startsAutomation: false
    };
  } catch (error) {
    throw receivablesLedgerSyncError(error);
  }
}

export async function syncReceivablesBankLedger(env, payload = {}, user = null) {
  const db = database(env, true);
  const offset = boundedInteger(payload.offset, 0, 10_000_000);
  const limit = Math.max(1, boundedInteger(payload.limit, 100, 250));
  try {
    const batch = await selectedBatch(db, BANK_IMPORT_KIND, payload.batchId);
    if (!batch) throw new ReceivablesLedgerSyncError("Bankovní import batch nebyl nalezen.", 404, "receivables_bank_batch_missing");
    const rowsResult = await db.prepare(`
      SELECT row_number, preview_status, issue_code, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT ? OFFSET ?
    `).bind(batch.id, limit, offset).all();
    const rows = rowsResult.results || [];
    const statements = [];
    const summary = { processed: rows.length, imported: 0, skipped: 0, review: 0 };
    for (const row of rows) {
      const payment = parseJson(row.normalized_json, {});
      const bankTransactionId = cleanString(payment.bankTransactionId);
      const source = cleanString(payment.source || batch.source || "kb_csv");
      if (!bankTransactionId) {
        summary.skipped += 1;
        summary.review += 1;
        continue;
      }
      const paymentId = stableId("receivable-payment", `${source}:${bankTransactionId}`);
      const flags = Array.isArray(payment.dataQualityFlags) ? payment.dataQualityFlags : [];
      summary.imported += 1;
      if (cleanString(row.preview_status) === "needs_review" || cleanString(row.preview_status) === "review") summary.review += 1;
      statements.push(
        db.prepare(`
          INSERT OR IGNORE INTO receivable_payment_transactions (
            id, source, bank_transaction_id, booking_date, value_date, transaction_type, amount,
            currency, variable_symbol, constant_symbol, specific_symbol, counterparty_name,
            counterparty_account, message, raw_payload, import_batch_id, data_quality_flags_json, content_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          paymentId,
          source,
          bankTransactionId,
          cleanString(payment.bookingDate) || null,
          cleanString(payment.valueDate) || null,
          cleanString(payment.transactionType) || null,
          numberValue(payment.amount),
          cleanString(payment.currency || "CZK"),
          cleanString(payment.variableSymbol) || null,
          cleanString(payment.constantSymbol) || null,
          cleanString(payment.specificSymbol) || null,
          cleanString(payment.counterpartyName) || null,
          cleanString(payment.counterpartyAccount) || null,
          cleanString(payment.message) || null,
          safeJson(payment, {}),
          batch.id,
          safeJson(flags, []),
          cleanString(batch.content_sha256) || null
        ),
        db.prepare(`
          UPDATE receivable_payment_transactions
          SET booking_date = ?, value_date = ?, transaction_type = ?, amount = ?, currency = ?,
              variable_symbol = ?, constant_symbol = ?, specific_symbol = ?, counterparty_name = ?,
              counterparty_account = ?, message = ?, raw_payload = ?, import_batch_id = ?,
              data_quality_flags_json = ?, content_hash = ?
          WHERE source = ? AND bank_transaction_id = ?
        `).bind(
          cleanString(payment.bookingDate) || null,
          cleanString(payment.valueDate) || null,
          cleanString(payment.transactionType) || null,
          numberValue(payment.amount),
          cleanString(payment.currency || "CZK"),
          cleanString(payment.variableSymbol) || null,
          cleanString(payment.constantSymbol) || null,
          cleanString(payment.specificSymbol) || null,
          cleanString(payment.counterpartyName) || null,
          cleanString(payment.counterpartyAccount) || null,
          cleanString(payment.message) || null,
          safeJson(payment, {}),
          batch.id,
          safeJson(flags, []),
          cleanString(batch.content_sha256) || null,
          source,
          bankTransactionId
        )
      );
    }
    const nextOffset = offset + rows.length;
    const totalRows = numberValue(batch.row_count);
    const done = rows.length < limit || (totalRows > 0 && nextOffset >= totalRows);
    if (payload.persist === true && statements.length) {
      await runStatements(db, statements);
      await db.prepare(`
        INSERT INTO receivable_audit_log (
          id, entity_type, entity_id, action, actor_user_id, reason, after_json
        ) VALUES (?, 'receivable_import_batch', ?, 'bank_ledger_sync_chunk', ?, ?, ?)
      `).bind(
        randomId("receivable-audit"),
        batch.id,
        cleanString(user?.id) || null,
        `offset=${offset};limit=${limit}`,
        safeJson(summary, {})
      ).run();
    }
    return {
      apiStatus: "ready",
      batchId: batch.id,
      offset,
      nextOffset,
      limit,
      totalRows,
      done,
      persisted: payload.persist === true,
      summary,
      sendsCustomerCommunication: false,
      startsAutomation: false
    };
  } catch (error) {
    throw receivablesLedgerSyncError(error);
  }
}

export function receivablesLedgerSyncError(error) {
  if (error instanceof ReceivablesLedgerSyncError) return error;
  const message = cleanString(error?.message);
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesLedgerSyncError(
      "Ledger Pohledávek není připravený. Je potřeba migrace 0033_expand_receivables_payment_rating.sql.",
      503,
      "receivables_ledger_migration_missing"
    );
  }
  console.error("receivables.ledger_sync_failed", { message });
  return new ReceivablesLedgerSyncError("Ledger synchronizaci se nepodařilo připravit.", 500, "receivables_ledger_sync_failed");
}
