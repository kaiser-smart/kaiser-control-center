const DB_BINDING = "SMART_ODPADY_DB";
const SNAPSHOT_IMPORT_KIND = "vistos_invoice_snapshot";
const SNAPSHOT_SOURCE = "vistos";
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 250;
const ROW_PAGE_SIZE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ReceivablesVistosLedgerMappingError extends Error {
  constructor(message, status = 400, code = "receivables_vistos_ledger_mapping_error") {
    super(message);
    this.name = "ReceivablesVistosLedgerMappingError";
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(clean(value));
  } catch {
    return fallback;
  }
}

function boundedInteger(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesVistosLedgerMappingError(
      "Databáze Pohledávek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function isoDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function daysBetween(leftIso, rightIso) {
  const left = Date.parse(`${leftIso}T00:00:00Z`);
  const right = Date.parse(`${rightIso}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.floor((right - left) / MS_PER_DAY);
}

function compactDigits(value) {
  return clean(value).replace(/\D/g, "");
}

function customerKey(invoice = {}) {
  const branch = clean(invoice.customerBranchId || invoice.customerBranchFk);
  if (branch) return { key: `branch:${branch}`, type: "CustomerBranch_FK", value: branch };
  const company = clean(invoice.customerCompanyId || invoice.customerFk || invoice.customerId);
  if (company) return { key: `customer:${company}`, type: "Customer_FK", value: company };
  const ico = compactDigits(invoice.ico);
  if (ico) return { key: `ico:${ico}`, type: "IČO", value: ico };
  const name = clean(invoice.customerName).toLowerCase();
  if (name) return { key: `name:${name}`, type: "Název", value: clean(invoice.customerName) };
  return { key: "unresolved", type: "nevyřešeno", value: "" };
}

function customerLabel(invoice = {}) {
  return clean(invoice.customerBranchName)
    || clean(invoice.customerName)
    || clean(invoice.customerCompanyName)
    || clean(invoice.customerId)
    || "Neurčený zákazník";
}

function openAmount(invoice = {}) {
  const explicit = numberValue(invoice.openAmount ?? invoice.remainingAmount, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (invoice.isPaid === true) return 0;
  const total = numberValue(invoice.totalAmount ?? invoice.priceWithTax);
  const paid = numberValue(invoice.paidAmount);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

function invoiceIssueCodes(row = {}, invoice = {}) {
  const codes = [];
  const direct = clean(row.issueCode);
  if (direct) codes.push(direct);
  if (!clean(invoice.invoiceNumber || invoice.vistoInvoiceId)) codes.push("missing_invoice_number");
  if (!clean(invoice.customerId || invoice.customerName || invoice.ico)) codes.push("missing_customer_reference");
  if (!isoDate(invoice.dueDate)) codes.push("missing_due_date");
  if (!numberValue(invoice.totalAmount ?? invoice.priceWithTax)) codes.push("missing_total_amount");
  return [...new Set(codes)];
}

export function buildReceivablesVistosLedgerMapping(rows = [], options = {}) {
  const today = isoDate(options.today || options.now) || new Date().toISOString().slice(0, 10);
  const groups = new Map();
  const issueCounts = new Map();
  let invoiceCount = 0;
  let readyInvoiceCount = 0;
  let reviewInvoiceCount = 0;
  let openInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  let totalOpenAmount = 0;
  let unresolvedInvoiceCount = 0;

  for (const row of rows) {
    const invoice = row.invoice || parseJson(row.normalized_json, {}) || {};
    invoiceCount += 1;
    const issues = invoiceIssueCodes(row, invoice);
    const rowStatus = clean(row.previewStatus || row.preview_status);
    const needsReview = rowStatus === "review" || rowStatus === "needs_review" || issues.length > 0;
    if (needsReview) reviewInvoiceCount += 1;
    else readyInvoiceCount += 1;
    for (const code of issues) {
      issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
    }

    const keyInfo = customerKey(invoice);
    if (keyInfo.key === "unresolved") unresolvedInvoiceCount += 1;
    if (!groups.has(keyInfo.key)) {
      groups.set(keyInfo.key, {
        customerKey: keyInfo.key,
        customerKeyType: keyInfo.type,
        customerKeyValue: keyInfo.value,
        customerName: customerLabel(invoice),
        customerId: clean(invoice.customerId),
        customerCompanyId: clean(invoice.customerCompanyId || invoice.customerFk),
        customerBranchId: clean(invoice.customerBranchId || invoice.customerBranchFk),
        ico: compactDigits(invoice.ico),
        dic: clean(invoice.dic),
        invoiceCount: 0,
        readyInvoiceCount: 0,
        reviewInvoiceCount: 0,
        openInvoiceCount: 0,
        overdueInvoiceCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        openAmount: 0,
        maxDaysOverdue: 0,
        oldestDueDate: "",
        newestIssueDate: "",
        issueCodes: new Map(),
        sampleInvoices: []
      });
    }

    const group = groups.get(keyInfo.key);
    const amountOpen = openAmount(invoice);
    const dueDate = isoDate(invoice.dueDate);
    const issueDate = isoDate(invoice.issueDate);
    const daysOverdue = amountOpen > 0 && dueDate ? Math.max(0, daysBetween(dueDate, today)) : 0;

    group.invoiceCount += 1;
    group.readyInvoiceCount += needsReview ? 0 : 1;
    group.reviewInvoiceCount += needsReview ? 1 : 0;
    group.openInvoiceCount += amountOpen > 0 ? 1 : 0;
    group.overdueInvoiceCount += daysOverdue > 0 ? 1 : 0;
    group.totalAmount += numberValue(invoice.totalAmount ?? invoice.priceWithTax);
    group.paidAmount += numberValue(invoice.paidAmount);
    group.openAmount += amountOpen;
    group.maxDaysOverdue = Math.max(group.maxDaysOverdue, daysOverdue);
    group.oldestDueDate = dueDate && (!group.oldestDueDate || dueDate < group.oldestDueDate) ? dueDate : group.oldestDueDate;
    group.newestIssueDate = issueDate && (!group.newestIssueDate || issueDate > group.newestIssueDate) ? issueDate : group.newestIssueDate;
    if (amountOpen > 0) {
      openInvoiceCount += 1;
      totalOpenAmount += amountOpen;
    }
    if (daysOverdue > 0) overdueInvoiceCount += 1;
    for (const code of issues) {
      group.issueCodes.set(code, (group.issueCodes.get(code) || 0) + 1);
    }
    if (group.sampleInvoices.length < 5) {
      group.sampleInvoices.push({
        invoiceNumber: clean(invoice.invoiceNumber || invoice.vistoInvoiceId),
        variableSymbol: clean(invoice.variableSymbol),
        dueDate,
        issueDate,
        totalAmount: numberValue(invoice.totalAmount ?? invoice.priceWithTax),
        paidAmount: numberValue(invoice.paidAmount),
        openAmount: amountOpen,
        daysOverdue,
        status: clean(invoice.status || invoice.paymentStatus),
        issueCodes: issues
      });
    }
  }

  const candidates = [...groups.values()]
    .map((group) => ({
      ...group,
      totalAmount: Math.round(group.totalAmount * 100) / 100,
      paidAmount: Math.round(group.paidAmount * 100) / 100,
      openAmount: Math.round(group.openAmount * 100) / 100,
      issueCodes: [...group.issueCodes.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
      mappingStatus: group.customerKey === "unresolved"
        ? "needs_customer_resolution"
        : group.reviewInvoiceCount > 0 ? "needs_invoice_review" : "ready",
      recommendedAction: group.openAmount <= 0
        ? "ledger_ignore_paid"
        : group.customerKey === "unresolved"
          ? "resolve_customer_before_ledger"
          : group.reviewInvoiceCount > 0 ? "review_invoices_before_ledger" : "ready_for_ledger_preview"
    }))
    .sort((left, right) => (
      right.openAmount - left.openAmount
      || right.maxDaysOverdue - left.maxDaysOverdue
      || right.invoiceCount - left.invoiceCount
      || left.customerName.localeCompare(right.customerName, "cs")
    ));

  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
  return {
    apiStatus: "ready",
    readOnly: true,
    writesD1: false,
    writesLedger: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    importsKbPayments: false,
    mapping: {
      generatedAt: new Date().toISOString(),
      today,
      summary: {
        invoiceCount,
        customerCandidateCount: candidates.length,
        readyCandidateCount: candidates.filter((item) => item.mappingStatus === "ready").length,
        reviewCandidateCount: candidates.filter((item) => item.mappingStatus !== "ready").length,
        readyInvoiceCount,
        reviewInvoiceCount,
        openInvoiceCount,
        overdueInvoiceCount,
        unresolvedInvoiceCount,
        totalOpenAmount: Math.round(totalOpenAmount * 100) / 100,
        issueCounts: [...issueCounts.entries()]
          .map(([code, count]) => ({ code, count }))
          .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
        recommendedNextStep: "Zkontrolovat kandidáty s datovou kontrolou, potom připravit oddělený zápis do ledgeru až po dalším potvrzení."
      },
      candidates: candidates.slice(0, limit),
      pagination: {
        limit,
        returned: Math.min(candidates.length, limit),
        totalCandidates: candidates.length
      }
    }
  };
}

async function latestSnapshotBatch(db) {
  return db.prepare(`
    SELECT *
    FROM receivable_import_batches
    WHERE source = ? AND import_kind = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first();
}

async function loadSnapshotRows(db, batchId) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const result = await db.prepare(`
      SELECT row_number, preview_status, issue_code, issue_message, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT ? OFFSET ?
    `).bind(batchId, ROW_PAGE_SIZE, offset).all();
    const page = result.results || [];
    rows.push(...page);
    if (page.length < ROW_PAGE_SIZE) break;
    offset += ROW_PAGE_SIZE;
  }
  return rows;
}

export async function getReceivablesVistosLedgerMapping(env, options = {}) {
  const db = database(env);
  if (!db) {
    return {
      apiStatus: "waiting",
      readOnly: true,
      mapping: null,
      message: "Databáze Pohledávek zatím není dostupná."
    };
  }

  try {
    const batch = await latestSnapshotBatch(db);
    if (!batch) {
      return {
        apiStatus: "empty",
        readOnly: true,
        mapping: null,
        message: "Nejdřív je potřeba načíst read-only snapshot Vistos faktur."
      };
    }
    const rows = await loadSnapshotRows(db, batch.id);
    const result = buildReceivablesVistosLedgerMapping(rows, options);
    return {
      ...result,
      snapshot: {
        batchId: clean(batch.id),
        status: clean(batch.status),
        rowCount: numberValue(batch.row_count, rows.length),
        createdAt: clean(batch.created_at),
        updatedAt: clean(batch.updated_at)
      }
    };
  } catch (error) {
    throw ledgerMappingError(error);
  }
}

export function ledgerMappingError(error) {
  if (error instanceof ReceivablesVistosLedgerMappingError) return error;
  const message = clean(error?.message);
  if (/no such table: receivable_import_/i.test(message)) {
    return new ReceivablesVistosLedgerMappingError(
      "Tabulky import preview nejsou v D1 připravené. Spusťte migraci 0028_create_receivable_import_preview.sql.",
      503,
      "receivables_import_preview_migration_missing"
    );
  }
  return new ReceivablesVistosLedgerMappingError(
    message || "Ledger mapping preview se teď nepodařilo načíst.",
    error?.status || 500,
    error?.code || "receivables_vistos_ledger_mapping_failed"
  );
}
