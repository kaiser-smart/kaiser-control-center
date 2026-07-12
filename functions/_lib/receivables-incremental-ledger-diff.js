import {
  invoiceAmounts,
  invoiceFlags,
  invoiceStatus
} from "./receivables-ledger-sync.js";

const DB_BINDING = "SMART_ODPADY_DB";
const IMPORT_KIND = "vistos_invoice_incremental";
const SOURCE = "vistos";

export class ReceivablesIncrementalLedgerDiffError extends Error {
  constructor(message, status = 400, code = "receivables_incremental_ledger_diff_error") {
    super(message);
    this.name = "ReceivablesIncrementalLedgerDiffError";
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

function parseJson(value, fallback) {
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

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new ReceivablesIncrementalLedgerDiffError(
      "Databáze Pohledávek není nastavená.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function expectedInvoice(row = {}) {
  const invoice = parseJson(row.normalized_json ?? row.normalizedJson, {});
  const amounts = invoiceAmounts(invoice);
  const companyId = clean(invoice.customerCompanyId || invoice.customerFk);
  const invoiceId = clean(invoice.vistoInvoiceId || invoice.invoiceId);
  const flags = invoiceFlags(row, invoice, amounts);
  return {
    invoice,
    invoiceId,
    companyId,
    customerId: companyId ? `receivable-customer:${companyId}` : "",
    invoiceNumber: clean(invoice.invoiceNumber || invoiceId),
    variableSymbol: clean(invoice.variableSymbol),
    issueDate: clean(invoice.issueDate),
    dueDate: clean(invoice.dueDate),
    totalAmount: amounts.totalAmount,
    paidAmount: amounts.paidAmount,
    openAmount: amounts.openAmount,
    currency: clean(invoice.currency || "CZK"),
    status: invoiceStatus(invoice, amounts.paidAmount, amounts.openAmount),
    branchId: clean(invoice.customerBranchId),
    managerId: clean(invoice.customerManagerId),
    managerName: clean(invoice.customerManagerName),
    flags
  };
}

function textChanged(left, right) {
  return clean(left) !== clean(right);
}

function amountChanged(left, right) {
  return Math.abs(numberValue(left) - numberValue(right)) > 0.01;
}

function addChange(changes, key, label, before, after, category) {
  changes.push({ key, label, before, after, category });
}

export function buildReceivablesIncrementalDiffRow(stagingRow = {}, ledgerRow = null) {
  const expected = expectedInvoice(stagingRow);
  const conflictReasons = [];
  if (!expected.invoiceId) conflictReasons.push("MISSING_VISTOS_INVOICE_ID");
  if (!expected.companyId) conflictReasons.push("CUSTOMER_LINK_NOT_RELIABLE");
  if (clean(stagingRow.preview_status ?? stagingRow.previewStatus) !== "ready") {
    conflictReasons.push(clean(stagingRow.issue_code ?? stagingRow.issueCode) || "STAGING_ROW_REQUIRES_REVIEW");
  }
  if (expected.flags.includes("MISSING_INVOICE_AMOUNT")) conflictReasons.push("MISSING_INVOICE_AMOUNT");

  const changes = [];
  if (ledgerRow && !conflictReasons.length) {
    if (textChanged(ledgerRow.invoice_number, expected.invoiceNumber)) addChange(changes, "invoiceNumber", "Číslo faktury", ledgerRow.invoice_number, expected.invoiceNumber, "core");
    if (textChanged(ledgerRow.variable_symbol, expected.variableSymbol)) addChange(changes, "variableSymbol", "Variabilní symbol", ledgerRow.variable_symbol, expected.variableSymbol, "core");
    if (textChanged(ledgerRow.customer_id, expected.customerId)) addChange(changes, "customerId", "Zákazník", ledgerRow.customer_id, expected.customerId, "customer");
    if (textChanged(ledgerRow.issue_date, expected.issueDate)) addChange(changes, "issueDate", "Datum vystavení", ledgerRow.issue_date, expected.issueDate, "core");
    if (textChanged(ledgerRow.due_date, expected.dueDate)) addChange(changes, "dueDate", "Datum splatnosti", ledgerRow.due_date, expected.dueDate, "due");
    if (amountChanged(ledgerRow.total_amount, expected.totalAmount)) addChange(changes, "totalAmount", "Částka", numberValue(ledgerRow.total_amount), expected.totalAmount, "core");
    if (amountChanged(ledgerRow.paid_amount, expected.paidAmount)) addChange(changes, "paidAmount", "Uhrazeno", numberValue(ledgerRow.paid_amount), expected.paidAmount, "payment");
    if (amountChanged(ledgerRow.open_amount, expected.openAmount)) addChange(changes, "openAmount", "Otevřený zůstatek", numberValue(ledgerRow.open_amount), expected.openAmount, "payment");
    if (textChanged(ledgerRow.currency, expected.currency)) addChange(changes, "currency", "Měna", ledgerRow.currency, expected.currency, "core");
    if (textChanged(ledgerRow.status, expected.status)) addChange(changes, "status", "Stav úhrady", ledgerRow.status, expected.status, "payment");
    if (textChanged(ledgerRow.visto_branch_id, expected.branchId)) addChange(changes, "branchId", "Pobočka zákazníka", ledgerRow.visto_branch_id, expected.branchId, "customer");
    if (textChanged(ledgerRow.customer_manager_id, expected.managerId)) addChange(changes, "managerId", "Zákaznický manažer", ledgerRow.customer_manager_id, expected.managerId, "contact");
    if (textChanged(ledgerRow.customer_manager_name, expected.managerName)) addChange(changes, "managerName", "Jméno zákaznického manažera", ledgerRow.customer_manager_name, expected.managerName, "contact");
    const ledgerFlags = parseJson(ledgerRow.data_quality_flags_json, []).map(clean).filter(Boolean).sort();
    if (JSON.stringify(ledgerFlags) !== JSON.stringify(expected.flags)) {
      addChange(changes, "dataQualityFlags", "Data quality", ledgerFlags.join(", "), expected.flags.join(", "), "data_quality");
    }
  }

  const classification = conflictReasons.length
    ? "conflict"
    : !ledgerRow ? "new" : changes.length ? "changed" : "unchanged";
  const ratingRelevant = classification === "new" || changes.some((change) => ["payment", "due", "customer", "core", "data_quality"].includes(change.category));
  const affectedCustomerIds = [...new Set([
    clean(ledgerRow?.customer_id),
    expected.customerId
  ].filter(Boolean))];

  return {
    rowNumber: numberValue(stagingRow.row_number ?? stagingRow.rowNumber),
    stagingStatus: clean(stagingRow.preview_status ?? stagingRow.previewStatus),
    classification,
    invoiceId: expected.invoiceId,
    invoiceNumber: expected.invoiceNumber,
    variableSymbol: expected.variableSymbol,
    customerId: expected.customerId,
    customerName: clean(expected.invoice.customerName || expected.invoice.customerCompanyName || expected.companyId),
    dueDate: expected.dueDate,
    totalAmount: expected.totalAmount,
    paidAmount: expected.paidAmount,
    openAmount: expected.openAmount,
    status: expected.status,
    changes,
    conflictReasons: [...new Set(conflictReasons)],
    dataQualityFlags: expected.flags,
    ratingImpact: {
      relevant: ratingRelevant,
      affectedCustomerIds
    }
  };
}

async function latestIncrementalBatch(db) {
  return db.prepare(`
    SELECT *
    FROM receivable_import_batches
    WHERE source = ? AND import_kind = ? AND status = 'incremental'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(SOURCE, IMPORT_KIND).first();
}

async function ledgerRowsByInvoiceIds(db, invoiceIds) {
  if (!invoiceIds.length) return [];
  const rows = [];
  for (let index = 0; index < invoiceIds.length; index += 100) {
    const chunk = invoiceIds.slice(index, index + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db.prepare(`
      SELECT visto_invoice_id, invoice_number, variable_symbol, customer_id, issue_date, due_date,
             total_amount, paid_amount, open_amount, currency, status, visto_branch_id,
             customer_manager_id, customer_manager_name, data_quality_flags_json, updated_at
      FROM receivable_invoices
      WHERE visto_invoice_id IN (${placeholders})
    `).bind(...chunk).all();
    rows.push(...(result.results || []));
  }
  return rows;
}

export async function getReceivablesIncrementalLedgerDiff(env, options = {}) {
  const db = database(env);
  const page = boundedInteger(options.page, 1, 100000);
  const pageSize = boundedInteger(options.pageSize, 10, 100);
  const offset = (page - 1) * pageSize;
  const batch = await latestIncrementalBatch(db);
  if (!batch) {
    return {
      apiStatus: "empty",
      batch: null,
      summary: { totalRows: 0, newCount: 0, changedCount: 0, unchangedCount: 0, conflictCount: 0, affectedCustomerCount: 0 },
      rows: [],
      pagination: { page, pageSize, totalRows: 0 },
      readOnly: true,
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false
    };
  }

  const [rowsResult, allRowsResult] = await Promise.all([
    db.prepare(`
      SELECT row_number, preview_status, issue_code, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT ? OFFSET ?
    `).bind(batch.id, pageSize, offset).all(),
    db.prepare(`
      SELECT row_number, preview_status, issue_code, normalized_json
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
    `).bind(batch.id).all()
  ]);
  const allStagingRows = allRowsResult.results || [];
  const invoiceIds = [...new Set(allStagingRows.map((row) => expectedInvoice(row).invoiceId).filter(Boolean))];
  const ledgerRows = await ledgerRowsByInvoiceIds(db, invoiceIds);
  const ledgerByInvoiceId = new Map(ledgerRows.map((row) => [clean(row.visto_invoice_id), row]));
  const allDiffRows = allStagingRows.map((row) => {
    const invoiceId = expectedInvoice(row).invoiceId;
    return buildReceivablesIncrementalDiffRow(row, ledgerByInvoiceId.get(invoiceId) || null);
  });
  const pageNumbers = new Set((rowsResult.results || []).map((row) => numberValue(row.row_number)));
  const rows = allDiffRows.filter((row) => pageNumbers.has(row.rowNumber));
  const affectedCustomers = new Set(
    allDiffRows
      .filter((row) => row.ratingImpact.relevant)
      .flatMap((row) => row.ratingImpact.affectedCustomerIds)
  );
  const count = (classification) => allDiffRows.filter((row) => row.classification === classification).length;
  const parserSummary = parseJson(batch.parser_summary_json, {});

  return {
    apiStatus: "ready",
    batch: {
      id: clean(batch.id),
      status: clean(batch.status),
      createdAt: clean(batch.created_at),
      updatedAt: clean(batch.updated_at),
      periodFrom: clean(parserSummary.periodFrom),
      periodTo: clean(parserSummary.periodTo),
      filterVerified: parserSummary.modifiedFilterProbe?.verified === true
    },
    summary: {
      totalRows: allDiffRows.length,
      newCount: count("new"),
      changedCount: count("changed"),
      unchangedCount: count("unchanged"),
      conflictCount: count("conflict"),
      ratingRelevantCount: allDiffRows.filter((row) => row.ratingImpact.relevant).length,
      affectedCustomerCount: affectedCustomers.size
    },
    rows,
    pagination: { page, pageSize, totalRows: allDiffRows.length },
    readOnly: true,
    writesLedger: false,
    calculatesRealRating: false,
    sendsCustomerCommunication: false,
    importsKbPayments: false
  };
}

export function receivablesIncrementalLedgerDiffError(error) {
  if (error instanceof ReceivablesIncrementalLedgerDiffError) return error;
  const message = clean(error?.message);
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesIncrementalLedgerDiffError(
      "Tabulky Pohledávek nejsou v D1 připravené.",
      503,
      "receivables_migration_missing"
    );
  }
  console.error("receivables.incremental_ledger_diff_failed", { message });
  return new ReceivablesIncrementalLedgerDiffError(
    "Read-only porovnání inkrementálních faktur se teď nepodařilo načíst.",
    500,
    "receivables_incremental_ledger_diff_failed"
  );
}
