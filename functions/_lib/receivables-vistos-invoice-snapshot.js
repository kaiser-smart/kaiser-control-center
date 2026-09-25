import {
  VistosExecuteError,
  cleanVistosValue,
  getVistosPage,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";
import {
  mapReceivablesVistosInvoice,
  receivablesVistosInvoiceLookbackWindow
} from "./receivables-vistos-preview.js";
import { getArchiveDatabase } from "./databases.js";

const SNAPSHOT_IMPORT_KIND = "vistos_invoice_snapshot";
const INCREMENTAL_IMPORT_KIND = "vistos_invoice_incremental";
const SNAPSHOT_SOURCE = "vistos";
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 1;
const MAX_MAX_PAGES = 3;
const DEFAULT_LOOKBACK_MONTHS = 24;
const DEFAULT_ADVANCE_PAGE_SIZE = 1000;
const DEFAULT_ADVANCE_PAGES_PER_RUN = 1;
const MAX_ADVANCE_PAGES_PER_RUN = 3;
const DEFAULT_INCREMENTAL_OVERLAP_HOURS = 6;

const INVOICE_COLUMNS = [
  "Id",
  "InvoiceNumber",
  "BankReference2",
  "BankReference1",
  "BankReference3",
  "CustomerBranch_FK",
  "Customer_FK",
  "CustomerRegNumber",
  "CustomerVatNumber",
  "IssuedDate",
  "DueDate",
  "TaxableSupplyDate",
  "DateOfTaxableSupply",
  "PriceWithoutTax",
  "PriceWithTax",
  "AmountPaid",
  "RemainToPay",
  "Currency_FK",
  "Status_FK",
  "PaymentStatus_FK",
  "IsPaid",
  "PdfUrl",
  "PrintUrl",
  "AttachmentUrl",
  "Created",
  "Modified"
];

const INVOICE_ATTEMPTS = [
  { key: "kaiser_invoice_columns_customer_manager", entityName: "InvoiceIssued", columns: [...INVOICE_COLUMNS, "CustomerManager_FK"] },
  { key: "kaiser_invoice_columns", entityName: "InvoiceIssued", columns: INVOICE_COLUMNS },
  {
    key: "legacy_invoice_issued_standard",
    entityName: "InvoiceIssued",
    columns: [
      "Id",
      "Number",
      "InvoiceNumber",
      "VariableSymbol",
      "Directory_FK",
      "Company_FK",
      "IssueDate",
      "InvoiceDate",
      "DueDate",
      "TotalAmount",
      "PaidAmount",
      "OpenAmount",
      "Currency_FK",
      "Status_FK",
      "PaymentStatus_FK",
      "Created",
      "Modified"
    ]
  }
];

export class ReceivablesVistosInvoiceSnapshotError extends Error {
  constructor(message, status = 400, code = "receivables_vistos_invoice_snapshot_error") {
    super(message);
    this.name = "ReceivablesVistosInvoiceSnapshotError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = getArchiveDatabase(env, { required: false });
  if (!db && required) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Archiv importů Pohledávek není nastavený. Chybí Cloudflare D1 binding DB_ARCHIVE.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function clean(value) {
  return cleanVistosValue(value);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(clean(value));
  } catch {
    return fallback;
  }
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function boundedInteger(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function invoiceIssues(invoice = {}) {
  const issues = [];
  if (!invoice.vistoInvoiceId) issues.push("missing_vistos_invoice_id");
  if (!invoice.invoiceNumber) issues.push("missing_invoice_number");
  if (!invoice.customerId && !invoice.customerName) issues.push("missing_customer_reference");
  if (!invoice.dueDate) issues.push("missing_due_date");
  if (!invoice.totalAmount) issues.push("missing_total_amount");
  if (invoice.remainingAmount === 0 && !invoice.isPaid) issues.push("zero_remaining_amount_unpaid_flag_unknown");
  return issues;
}

function countIssues(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    for (const issue of row.issues || []) {
      counts.set(issue, (counts.get(issue) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function mergeIssueCounts(left = [], right = []) {
  const counts = new Map();
  for (const item of [...left, ...right]) {
    const code = clean(item?.code);
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + numberValue(item?.count));
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function assertInvoicePageCount(page, offset) {
  if (!page.countEvidence?.filteredReported || !Number.isInteger(page.filtered) || page.filtered < 0
      || (page.rows.length === 0 && offset < page.filtered)
      || (page.rows.length > 0 && offset + page.rows.length > page.filtered)) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Vistos nevrátil ověřitelný počet faktur. Uložený import a poslední potvrzená změna zůstávají zachované.",
      502, "receivables_vistos_invoice_count_unverified");
  }
}

async function assertUniqueSnapshot(db, batchId) {
  const counts = await db.prepare(`SELECT COUNT(*) AS total,
    COUNT(DISTINCT json_extract(normalized_json, '$.vistoInvoiceId')) AS unique_ids
    FROM receivable_import_rows WHERE batch_id = ?`).bind(batchId).first();
  if (Number(counts.total) !== Number(counts.unique_ids)) throw new ReceivablesVistosInvoiceSnapshotError(
    "Import obsahuje duplicitní ID faktur a nebyl označen za dokončený.",
    409, "receivables_invoice_duplicate_id");
}

async function loadFirstWorkingInvoiceEntity(env, session, options = {}) {
  const diagnostics = [];
  let firstSuccessful = null;
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow({
    months: options.invoiceLookbackMonths || DEFAULT_LOOKBACK_MONTHS,
    now: options.now
  });
  const filter = options.filter && typeof options.filter === "object" ? options.filter : invoiceLookback.filter;
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, MAX_MAX_PAGES);

  for (const attempt of INVOICE_ATTEMPTS) {
    const entityName = clean(options.entityName) || attempt.entityName;
    try {
      const page = { rows: [], total: 0, filtered: 0, capped: false };
      for (let index = 0; index < maxPages; index += 1) {
        const part = await getVistosPage(env, session, entityName, attempt.columns, filter, page.rows.length, pageSize);
        assertInvoicePageCount(part, page.rows.length);
        page.rows.push(...part.rows);
        page.total = part.total;
        page.filtered = part.filtered;
        page.capped = page.rows.length < page.filtered;
        if (!page.capped || part.rows.length < pageSize) break;
      }
      diagnostics.push({
        key: attempt.key,
        entityName,
        columns: attempt.columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        capped: Boolean(page.capped),
        filter
      });
      if (!firstSuccessful) {
        firstSuccessful = {
          entityName,
          columns: attempt.columns,
          page,
          invoiceLookback,
          pageSize,
          maxPages
        };
      }
      if (page.rows.length > 0) {
        return { entityName, columns: attempt.columns, page, diagnostics, invoiceLookback, pageSize, maxPages };
      }
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        entityName,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180),
        filter
      });
    }
  }

  if (firstSuccessful) {
    return { ...firstSuccessful, diagnostics };
  }

  throw new ReceivablesVistosInvoiceSnapshotError(
    "Vistos nevydal seznam faktur. Poslední uložené faktury zůstávají zachované.",
    502, diagnostics.at(-1)?.code || "receivables_vistos_invoice_read_failed"
  );
}

async function loadInvoicePage(env, session, options = {}) {
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow({
    months: options.invoiceLookbackMonths || DEFAULT_LOOKBACK_MONTHS,
    now: options.now
  });
  const filter = options.filter && typeof options.filter === "object" ? options.filter : invoiceLookback.filter;
  const pageSize = boundedInteger(options.vistosPageSize ?? options.pageSize, DEFAULT_ADVANCE_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const start = Math.max(0, Math.floor(Number(options.start) || 0));
  const diagnostics = [];

  const attempts = clean(options.entityName) && options.columns?.length ? [INVOICE_ATTEMPTS[0]] : INVOICE_ATTEMPTS;
  for (const attempt of attempts) {
    const entityName = clean(options.entityName) || attempt.entityName;
    const columns = Array.isArray(options.columns) && options.columns.length ? options.columns : attempt.columns;
    try {
      const page = await getVistosPage(env, session, entityName, columns, filter, start, pageSize);
      assertInvoicePageCount(page, start);
      diagnostics.push({
        key: attempt.key,
        entityName,
        columns,
        ok: true,
        returnedRows: page.rows.length,
        recordsTotal: page.total || 0,
        recordsFiltered: page.filtered || 0,
        start,
        pageSize,
        filter
      });
      if (page.rows.length > 0 || clean(options.entityName)) {
        return { entityName, columns, page, diagnostics, invoiceLookback, filter, pageSize, start };
      }
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        entityName,
        ok: false,
        code: clean(error?.code),
        message: clean(error?.message).slice(0, 180),
        start,
        pageSize,
        filter
      });
    }
  }

  throw new ReceivablesVistosInvoiceSnapshotError(
    "Další dávku faktur se nepodařilo načíst. Import bude pokračovat od poslední uložené dávky.",
    502, diagnostics.at(-1)?.code || "receivables_vistos_invoice_read_failed"
  );
}

function rowToBatch(row = {}) {
  return {
    id: clean(row.id),
    source: clean(row.source),
    importKind: clean(row.import_kind),
    status: clean(row.status || "preview"),
    filename: clean(row.filename),
    rowCount: numberValue(row.row_count),
    acceptedCount: numberValue(row.accepted_count),
    reviewCount: numberValue(row.review_count),
    ignoredCount: numberValue(row.ignored_count),
    createdByUserId: clean(row.created_by_user_id),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
    parserSummary: parseJson(row.parser_summary_json, {}),
    rawPayload: parseJson(row.raw_payload, {})
  };
}

function rowToSnapshotRow(row = {}) {
  return {
    id: clean(row.id),
    batchId: clean(row.batch_id),
    rowNumber: numberValue(row.row_number),
    entityKind: clean(row.entity_kind),
    previewStatus: clean(row.preview_status),
    confidence: numberValue(row.confidence),
    issueCode: clean(row.issue_code),
    issueMessage: clean(row.issue_message),
    invoice: parseJson(row.normalized_json, {}),
    rawPayload: parseJson(row.raw_payload, {}),
    createdAt: clean(row.created_at)
  };
}

function snapshotSummaryFromBatch(batch = {}, rowCount = 0) {
  const parserSummary = batch.parserSummary || {};
  const rawPayload = batch.rawPayload || {};
  return {
    ...parserSummary,
    acceptedCount: batch.acceptedCount,
    reviewCount: batch.reviewCount,
    readOnly: true,
    writesLedger: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    loadedRows: batch.rowCount ?? parserSummary.loadedRows ?? rowCount,
    totalRows: parserSummary.totalRows ?? rawPayload.totalRows ?? batch.rowCount ?? rowCount,
    capped: Boolean(parserSummary.capped ?? rawPayload.capped),
    invoiceLookback: parserSummary.invoiceLookback || rawPayload.invoiceLookback || null
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

async function latestIncrementalBatch(db, onlyRunning = false) {
  return db.prepare(`
    SELECT *
    FROM receivable_import_batches
    WHERE source = ? AND import_kind = ?
      ${onlyRunning ? "AND status IN ('incremental_running', 'incremental_loading', 'incremental_applying')" : ""}
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(SNAPSHOT_SOURCE, INCREMENTAL_IMPORT_KIND).first();
}

function validDate(value) {
  const text = clean(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(" ", "T")}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function vistosDateTime(value) {
  const date = validDate(value);
  if (!date) return "";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function incrementalWindow(checkpoint, options = {}) {
  const periodTo = validDate(options.periodTo) || new Date();
  const sourceCheckpoint = validDate(checkpoint) || new Date(periodTo.getTime() - 24 * 60 * 60 * 1000);
  const overlapHours = boundedInteger(
    options.overlapHours,
    DEFAULT_INCREMENTAL_OVERLAP_HOURS,
    24
  );
  const periodFrom = new Date(sourceCheckpoint.getTime() - overlapHours * 60 * 60 * 1000);
  return {
    checkpoint: sourceCheckpoint.toISOString(),
    overlapHours,
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    filter: {
      Modified_From: vistosDateTime(periodFrom),
      Modified_To: vistosDateTime(periodTo)
    }
  };
}

function rawModifiedDate(row = {}) {
  return validDate(row.Modified || row.modified || row.Updated || row.updated);
}

export function assertIncrementalFilter(rows, window) {
  const from = validDate(window.periodFrom);
  const to = validDate(window.periodTo);
  if (!from || !to) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Časové okno inkrementálního Vistos načítání není platné.",
      400,
      "receivables_incremental_window_invalid"
    );
  }

  const invalidRows = rows.filter((row) => {
    const modified = rawModifiedDate(row);
    return !modified || modified < from || modified > new Date(to.getTime() + 60 * 1000);
  });
  if (invalidRows.length) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Vistos nepotvrdil filtr změněných faktur. Inkrementální staging byl bezpečně zastaven.",
      502,
      "receivables_vistos_modified_filter_unreliable"
    );
  }
}

export function incrementalPageTotal(page = {}, loadedRows = 0, knownTotal = 0) {
  const filteredTotal = numberValue(page.filtered);
  if (filteredTotal > 0) return filteredTotal;
  const pageRows = Array.isArray(page.rows) ? page.rows.length : 0;
  if (pageRows === 0) return loadedRows;
  return Math.max(numberValue(knownTotal), loadedRows + pageRows);
}

function incrementalControlWindow(periodTo) {
  const to = validDate(periodTo) || new Date();
  const from = new Date(to.getTime() - 730 * 24 * 60 * 60 * 1000);
  return {
    periodFrom: from.toISOString(),
    periodTo: to.toISOString(),
    filter: {
      Modified_From: vistosDateTime(from),
      Modified_To: vistosDateTime(to)
    }
  };
}

async function incrementalCheckpoint(db) {
  const row = await db.prepare(`SELECT * FROM receivable_import_batches
    WHERE source = ? AND import_kind = ? AND status = 'snapshot'
    ORDER BY created_at DESC LIMIT 1`).bind(SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first();
  if (!row) return null;
  const summary = parseJson(row.parser_summary_json, {});
  // Start of the full scan, not its completion: changes during the scan must be read again.
  return summary.syncedThrough || summary.scanStartedAt || row.created_at;
}

export async function getLatestReceivablesVistosInvoiceSnapshot(env, options = {}) {
  const db = database(env);
  if (!db) {
    return { snapshot: null, rows: [], pagination: { page: 1, pageSize: 100, totalRows: 0 }, apiStatus: "waiting" };
  }

  const page = boundedInteger(options.page, 1, 100000);
  const pageSize = boundedInteger(options.pageSize, 100, 500);
  const offset = (page - 1) * pageSize;

  try {
    const latestRow = await latestSnapshotBatch(db);
    const pendingDelta = await latestIncrementalBatch(db, true);
    const syncRow = pendingDelta || latestRow;
    const batchRow = options.batchId
      ? await db.prepare("SELECT * FROM receivable_import_batches WHERE id = ? AND source = ? AND import_kind = ?")
        .bind(clean(options.batchId), SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first()
      : await db.prepare("SELECT * FROM receivable_import_batches WHERE source = ? AND import_kind = ? AND status = 'snapshot' ORDER BY created_at DESC LIMIT 1")
        .bind(SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first() || latestRow;

    if (!batchRow) {
      return { snapshot: null, rows: [], pagination: { page, pageSize, totalRows: 0 }, apiStatus: "empty" };
    }

    const [rowsResult, countRow] = await Promise.all([
      db.prepare(`
        SELECT *
        FROM receivable_import_rows
        WHERE batch_id = ?
        ORDER BY row_number ASC
        LIMIT ? OFFSET ?
      `).bind(batchRow.id, pageSize, offset).all(),
      db.prepare("SELECT COUNT(*) AS count FROM receivable_import_rows WHERE batch_id = ?").bind(batchRow.id).first()
    ]);
    const batch = rowToBatch(batchRow);
    const totalRows = numberValue(countRow?.count, batch.rowCount);
    return {
      sync: syncRow ? { batch: rowToBatch(syncRow), summary: snapshotSummaryFromBatch(rowToBatch(syncRow)) } : null,
      snapshot: {
        batch,
        summary: snapshotSummaryFromBatch(batch, totalRows)
      },
      rows: (rowsResult.results || []).map(rowToSnapshotRow),
      pagination: { page, pageSize, totalRows },
      apiStatus: "ready"
    };
  } catch (error) {
    throw snapshotError(error);
  }
}

async function storeIncrementalRows(db, batchId, rows, rowOffset = 0) {
  const normalizedRows = rows.map((raw, index) => {
    const invoice = mapReceivablesVistosInvoice(raw);
    const issues = invoiceIssues(invoice);
    return {
      rowNumber: rowOffset + index + 1,
      invoice,
      raw,
      issues,
      previewStatus: issues.length ? "review" : "ready"
    };
  });
  const statements = snapshotRowStatements(db, batchId, normalizedRows);
  if (statements.length) await db.batch(statements);
  return normalizedRows;
}

function incrementalResult(batch, summary) {
  return {
    apiStatus: "ready",
    mode: "vistos-invoice-incremental",
    batch: {
      id: batch.id,
      importKind: INCREMENTAL_IMPORT_KIND,
      status: batch.status,
      rowCount: summary.loadedRows,
      acceptedCount: summary.acceptedCount,
      reviewCount: summary.reviewCount
    },
    summary,
    readOnly: true,
    writesD1: true,
    writesLedger: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false
  };
}

async function createReceivablesVistosInvoiceIncrementalSnapshotUnlocked(env, options = {}) {
  const db = database(env, true);
  if (!isVistosExecuteConfigured(env)) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Vistos API není nakonfigurováno.",
      503,
      "vistos_api_not_configured"
    );
  }

  try {
    if (await latestIncrementalBatch(db, true)) return advanceReceivablesVistosInvoiceIncrementalSnapshotUnlocked(env, options);
    const checkpoint = options.checkpoint || await incrementalCheckpoint(db);
    if (!checkpoint) {
      throw new ReceivablesVistosInvoiceSnapshotError(
        "Inkrementální načítání čeká na dokončený úplný Vistos snapshot.",
        409,
        "receivables_incremental_checkpoint_missing"
      );
    }
    const window = incrementalWindow(checkpoint, options);
    const session = await loginVistosExecute(env);
    const invoiceResult = await loadFirstWorkingInvoiceEntity(env, session, {
      ...options,
      entityName: env?.VISTOS_RECEIVABLES_INVOICE_ENTITY,
      filter: window.filter,
      pageSize: options.vistosPageSize || DEFAULT_ADVANCE_PAGE_SIZE,
      maxPages: options.maxPages || MAX_ADVANCE_PAGES_PER_RUN
    });
    if (!invoiceResult.diagnostics.some((item) => item.ok)) {
      throw new ReceivablesVistosInvoiceSnapshotError(
        "Vistos nepotvrdil filtr změněných faktur. Inkrementální staging nebyl vytvořen.",
        502,
        "receivables_vistos_modified_filter_not_supported"
      );
    }
    assertIncrementalFilter(invoiceResult.page.rows, window);
    let modifiedFilterProbe = {
      verified: invoiceResult.page.rows.length > 0,
      mode: invoiceResult.page.rows.length > 0 ? "incremental_rows" : "wide_control",
      returnedRows: invoiceResult.page.rows.length
    };
    if (!invoiceResult.page.rows.length) {
      const controlWindow = incrementalControlWindow(window.periodTo);
      const controlResult = await loadInvoicePage(env, session, {
        entityName: invoiceResult.entityName,
        columns: invoiceResult.columns,
        filter: controlWindow.filter,
        start: 0,
        vistosPageSize: 1
      });
      if (!controlResult.page.rows.length) {
        throw new ReceivablesVistosInvoiceSnapshotError(
          "Vistos v kontrolním okně nepotvrdil filtr Modified. Nulový inkrementální běh nebyl uložen.",
          502,
          "receivables_vistos_modified_filter_unverified"
        );
      }
      assertIncrementalFilter(controlResult.page.rows, controlWindow);
      modifiedFilterProbe = {
        verified: true,
        mode: "wide_control",
        returnedRows: controlResult.page.rows.length,
        periodFrom: controlWindow.periodFrom,
        periodTo: controlWindow.periodTo,
        diagnostics: controlResult.diagnostics
      };
    }

    const totalRows = incrementalPageTotal(invoiceResult.page);
    const capped = Boolean(invoiceResult.page.rows.length < totalRows);
    const batchId = randomId("receivable-vistos-invoice-incremental");
    const normalizedRows = invoiceResult.page.rows.map((raw) => {
      const invoice = mapReceivablesVistosInvoice(raw);
      const issues = invoiceIssues(invoice);
      return { invoice, raw, issues, previewStatus: issues.length ? "review" : "ready" };
    });
    const acceptedCount = normalizedRows.filter((row) => row.previewStatus === "ready").length;
    const reviewCount = normalizedRows.length - acceptedCount;
    const summary = {
      mode: "vistos-invoice-incremental",
      source: SNAPSHOT_SOURCE,
      sourceMode: "read_only_vistos_execute",
      invoiceEntity: invoiceResult.entityName,
      invoiceColumns: invoiceResult.columns,
      modifiedWindow: window,
      modifiedFilterProbe,
      periodFrom: window.periodFrom,
      periodTo: window.periodTo,
      loadedRows: normalizedRows.length,
      totalRows,
      acceptedCount,
      reviewCount,
      ignoredCount: 0,
      issueCounts: countIssues(normalizedRows),
      capped,
      pageSize: invoiceResult.pageSize,
      maxPages: invoiceResult.maxPages,
      readOnly: true,
      writesD1: true,
      writesLedger: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      calculatesRealRating: false,
      importsKbPayments: false
    };
    const rawPayload = {
      trigger: clean(options.triggeredBy) || "cloud-runner-incremental",
      source: SNAPSHOT_SOURCE,
      importKind: INCREMENTAL_IMPORT_KIND,
      invoiceEntity: invoiceResult.entityName,
      modifiedWindow: window,
      modifiedFilterProbe,
      diagnostics: invoiceResult.diagnostics,
      readOnly: true,
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false,
      startsAutomation: false
    };

    await db.prepare(`
      INSERT INTO receivable_import_batches (
        id, source, import_kind, status, filename, row_count, accepted_count,
        review_count, ignored_count, created_by_user_id, parser_summary_json, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(
      batchId,
      SNAPSHOT_SOURCE,
      INCREMENTAL_IMPORT_KIND,
      "incremental_loading",
      `vistos-invoices-modified-${window.periodFrom.slice(0, 10)}`,
      normalizedRows.length,
      acceptedCount,
      reviewCount,
      clean(options.createdByUserId) || null,
      safeJson(summary),
      safeJson(rawPayload)
    ).run();
    await storeIncrementalRows(db, batchId, invoiceResult.page.rows, 0);
    await db.prepare("UPDATE receivable_import_batches SET status = ? WHERE id = ?")
      .bind(capped ? "incremental_running" : "incremental_applying", batchId).run();
    if (!capped) return applyInvoiceChanges(db, { id: batchId, parserSummary: summary });

    return incrementalResult({
      id: batchId,
      status: capped ? "incremental_running" : "incremental"
    }, summary);
  } catch (error) {
    throw snapshotError(error);
  }
}

async function advanceReceivablesVistosInvoiceIncrementalSnapshotUnlocked(env, options = {}) {
  const db = database(env, true);
  const batchRow = await latestIncrementalBatch(db, true);
  if (!batchRow) {
    return createReceivablesVistosInvoiceIncrementalSnapshotUnlocked(env, options);
  }

  try {
    const batch = rowToBatch(batchRow);
    if (batch.status === "incremental_applying") return applyInvoiceChanges(db, batch);
    const summary = batch.parserSummary || {};
    const window = summary.modifiedWindow || batch.rawPayload?.modifiedWindow;
    if (!window?.filter || !window?.periodFrom || !window?.periodTo) {
      throw new ReceivablesVistosInvoiceSnapshotError(
        "Rozpracovaný inkrementální snapshot nemá ověřitelné časové okno.",
        409,
        "receivables_incremental_window_missing"
      );
    }
    const countRow = await db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(preview_status = 'ready'), 0) AS accepted, COALESCE(SUM(preview_status = 'review'), 0) AS review FROM receivable_import_rows WHERE batch_id = ?")
      .bind(batch.id)
      .first();
    const loadedBefore = numberValue(countRow?.count, summary.loadedRows);
    const knownTotal = numberValue(summary.totalRows);
    const session = await loginVistosExecute(env);
    const pageSize = boundedInteger(options.vistosPageSize, DEFAULT_ADVANCE_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const pagesPerRun = boundedInteger(options.pagesPerRun, DEFAULT_ADVANCE_PAGES_PER_RUN, MAX_ADVANCE_PAGES_PER_RUN);
    let loadedRows = loadedBefore;
    let totalRows = knownTotal;
    let acceptedCount = numberValue(countRow?.accepted);
    let reviewCount = numberValue(countRow?.review);
    let issueCounts = Array.isArray(summary.issueCounts) ? summary.issueCounts : [];
    const diagnostics = [];

    for (let pageIndex = 0; pageIndex < pagesPerRun; pageIndex += 1) {
      const pageResult = await loadInvoicePage(env, session, {
        entityName: summary.invoiceEntity || batch.rawPayload?.invoiceEntity,
        columns: summary.invoiceColumns,
        filter: window.filter,
        start: loadedRows,
        vistosPageSize: pageSize
      });
      diagnostics.push(...pageResult.diagnostics);
      const rows = pageResult.page.rows || [];
      assertIncrementalFilter(rows, window);
      totalRows = incrementalPageTotal(pageResult.page, loadedRows, totalRows);
      if (!rows.length) break;

      const storedRows = await storeIncrementalRows(db, batch.id, rows, loadedRows);
      acceptedCount += storedRows.filter((row) => row.previewStatus === "ready").length;
      reviewCount += storedRows.filter((row) => row.previewStatus === "review").length;
      issueCounts = mergeIssueCounts(issueCounts, countIssues(storedRows));
      loadedRows += storedRows.length;
      if ((totalRows > 0 && loadedRows >= totalRows) || rows.length < pageSize) break;
    }

    const capped = Boolean(totalRows && loadedRows < totalRows);
    const status = capped ? "incremental_running" : "incremental_applying";
    const updatedSummary = {
      ...summary,
      loadedRows,
      totalRows,
      acceptedCount,
      reviewCount,
      issueCounts,
      capped,
      pageSize,
      readOnly: true,
      writesD1: true,
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      importsKbPayments: false
    };
    await db.prepare(`
      UPDATE receivable_import_batches
      SET status = ?, row_count = ?, accepted_count = ?, review_count = ?,
          parser_summary_json = ?, raw_payload = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      status,
      loadedRows,
      acceptedCount,
      reviewCount,
      safeJson(updatedSummary),
      safeJson({
        ...(batch.rawPayload || {}),
        diagnostics: diagnostics.slice(-20),
        readOnly: true,
        writesLedger: false,
        calculatesRealRating: false,
        sendsCustomerCommunication: false,
        startsAutomation: false
      }),
      batch.id
    ).run();
    if (!capped) return applyInvoiceChanges(db, { ...batch, parserSummary: updatedSummary });
    return incrementalResult({ id: batch.id, status }, updatedSummary);
  } catch (error) {
    throw snapshotError(error);
  }
}

function snapshotRowStatements(db, batchId, rows) {
  if (rows.some(row => !clean(row.invoice.vistoInvoiceId))) throw new ReceivablesVistosInvoiceSnapshotError(
    "Vistos vrátil fakturu bez stabilního ID.", 502, "receivables_invoice_id_missing");
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    const chunk = rows.slice(offset, offset + 10);
    statements.push(db.prepare(`
      INSERT INTO receivable_import_rows (
        id, batch_id, row_number, entity_kind, preview_status, confidence,
        issue_code, issue_message, normalized_json, raw_payload
      ) VALUES ${chunk.map(() => "(?, ?, ?, 'vistos_invoice', ?, ?, ?, ?, ?, ?)").join(", ")}
      ON CONFLICT(batch_id, row_number) DO UPDATE SET
        preview_status = excluded.preview_status, confidence = excluded.confidence,
        issue_code = excluded.issue_code, issue_message = excluded.issue_message,
        normalized_json = excluded.normalized_json, raw_payload = excluded.raw_payload
    `).bind(...chunk.flatMap(row => [
      `${batchId}-row-${row.rowNumber}`, batchId, row.rowNumber, row.previewStatus,
      row.issues.length ? 0.55 : 0.95, row.issues[0] || null,
      row.issues.join(", ") || null, safeJson(row.invoice), safeJson(row.raw)
    ])));
  }
  return statements;
}

async function createReceivablesVistosInvoiceSnapshotUnlocked(env, options = {}) {
  const db = database(env, true);
  if (!isVistosExecuteConfigured(env)) {
    throw new ReceivablesVistosInvoiceSnapshotError("Vistos API není nakonfigurováno.", 503, "vistos_api_not_configured");
  }

  try {
    const scanStartedAt = new Date().toISOString();
    const existing = await latestSnapshotBatch(db);
    if (existing && ["snapshot_running", "snapshot_capped", "snapshot_loading"].includes(existing.status)) {
      return advanceReceivablesVistosInvoiceSnapshotUnlocked(env, options);
    }
    if (existing?.status === "snapshot") {
      return createReceivablesVistosInvoiceIncrementalSnapshotUnlocked(env, options);
    }
    const session = await loginVistosExecute(env);
    const invoiceResult = await loadFirstWorkingInvoiceEntity(env, session, {
      ...options,
      entityName: env?.VISTOS_RECEIVABLES_INVOICE_ENTITY,
      pageSize: options.vistosPageSize ?? options.loadPageSize ?? options.pageSize
    });
    const normalizedRows = invoiceResult.page.rows.map((raw, index) => {
      const invoice = mapReceivablesVistosInvoice(raw);
      const issues = invoiceIssues(invoice);
      return {
        rowNumber: index + 1,
        invoice,
        raw,
        issues,
        previewStatus: issues.length ? "review" : "ready"
      };
    });
    const issueCounts = countIssues(normalizedRows);
    const acceptedCount = normalizedRows.filter((row) => row.previewStatus === "ready").length;
    const reviewCount = normalizedRows.length - acceptedCount;
    const totalRows = invoiceResult.page.filtered ?? normalizedRows.length;
    const capped = Boolean(invoiceResult.page.capped || (totalRows && normalizedRows.length < totalRows));
    const batchId = randomId("receivable-vistos-invoice-snapshot");
    const summary = {
      mode: "vistos-invoice-snapshot",
      scanStartedAt,
      source: SNAPSHOT_SOURCE,
      sourceMode: "read_only_vistos_execute",
      invoiceEntity: invoiceResult.entityName,
      invoiceColumns: invoiceResult.columns,
      invoiceLookback: invoiceResult.invoiceLookback,
      loadedRows: normalizedRows.length,
      totalRows,
      acceptedCount,
      reviewCount,
      ignoredCount: 0,
      issueCounts,
      capped,
      pageSize: invoiceResult.pageSize,
      maxPages: invoiceResult.maxPages,
      readOnly: true,
      writesD1: true,
      writesLedger: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      calculatesRealRating: false,
      importsKbPayments: false,
      recommendedNextStep: capped
        ? "Snapshot je orezany limitem strankovani. Pro ostry ledger zaver je potreba davkovy export/job po castech."
        : "Snapshot faktur je nacteny v preview/staging vrstve. Dalsi krok je mapovani firem a KB plateb bez komunikace zakaznikum."
    };
    const rawPayload = {
      trigger: clean(options.triggeredBy) || "ui-auto",
      source: SNAPSHOT_SOURCE,
      importKind: SNAPSHOT_IMPORT_KIND,
      invoiceEntity: invoiceResult.entityName,
      totalRows,
      capped,
      invoiceLookback: invoiceResult.invoiceLookback,
      diagnostics: invoiceResult.diagnostics,
      readOnly: true,
      writesLedger: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false
    };

    await db.batch([
      db.prepare(`
        INSERT INTO receivable_import_batches (
          id, source, import_kind, status, filename, row_count, accepted_count,
          review_count, ignored_count, created_by_user_id, parser_summary_json, raw_payload
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        batchId,
        SNAPSHOT_SOURCE,
        SNAPSHOT_IMPORT_KIND,
        "snapshot_loading",
        `vistos-invoices-${summary.invoiceLookback?.months || DEFAULT_LOOKBACK_MONTHS}m`,
        normalizedRows.length,
        acceptedCount,
        reviewCount,
        0,
        clean(options.createdByUserId) || null,
        safeJson(summary),
        safeJson(rawPayload)
      )
    ]);

    const rowStatements = snapshotRowStatements(db, batchId, normalizedRows);

    if (rowStatements.length) await db.batch(rowStatements);

    if (!capped) await assertUniqueSnapshot(db, batchId);
    await db.prepare("UPDATE receivable_import_batches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(capped ? "snapshot_capped" : "snapshot", batchId).run();
    return getLatestReceivablesVistosInvoiceSnapshot(env, options);
  } catch (error) {
    throw snapshotError(error);
  }
}

async function advanceReceivablesVistosInvoiceSnapshotUnlocked(env, options = {}) {
  const db = database(env, true);
  if (!isVistosExecuteConfigured(env)) {
    throw new ReceivablesVistosInvoiceSnapshotError("Vistos API není nakonfigurováno.", 503, "vistos_api_not_configured");
  }

  try {
    const batchRow = await latestSnapshotBatch(db);
    if (!batchRow) {
      return createReceivablesVistosInvoiceSnapshotUnlocked(env, {
        ...options,
        triggeredBy: clean(options.triggeredBy) || "ui-auto-batch-first-open"
      });
    }

    const batch = rowToBatch(batchRow);
    const summary = snapshotSummaryFromBatch(batch, batch.rowCount);
    const currentRowCount = await db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(preview_status = 'ready'), 0) AS accepted, COALESCE(SUM(preview_status = 'review'), 0) AS review FROM receivable_import_rows WHERE batch_id = ?")
      .bind(batch.id)
      .first();
    const loadedBefore = numberValue(currentRowCount?.count, summary.loadedRows || batch.rowCount);
    const knownTotal = numberValue(summary.totalRows);

    if (knownTotal > 0 && loadedBefore >= knownTotal) {
      await assertUniqueSnapshot(db, batch.id);
      await db.prepare(`
        UPDATE receivable_import_batches
        SET status = 'snapshot', row_count = ?, accepted_count = ?, review_count = ?,
            parser_summary_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(loadedBefore, currentRowCount.accepted, currentRowCount.review,
        safeJson({ ...summary, loadedRows: loadedBefore, totalRows: knownTotal, capped: false,
          acceptedCount: currentRowCount.accepted, reviewCount: currentRowCount.review,
          recommendedNextStep: "Načtení faktur bylo dokončeno." }), batch.id).run();
      return getLatestReceivablesVistosInvoiceSnapshot(env, options);
    }

    const session = await loginVistosExecute(env);
    const pagesPerRun = boundedInteger(options.pagesPerRun, DEFAULT_ADVANCE_PAGES_PER_RUN, MAX_ADVANCE_PAGES_PER_RUN);
    const pageSize = boundedInteger(options.vistosPageSize, DEFAULT_ADVANCE_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const baseColumns = Array.isArray(summary.invoiceColumns) && summary.invoiceColumns.length ? summary.invoiceColumns : INVOICE_COLUMNS;
    const baseEntity = clean(summary.invoiceEntity) || clean(batch.rawPayload?.invoiceEntity) || clean(env?.VISTOS_RECEIVABLES_INVOICE_ENTITY);
    const baseLookback = summary.invoiceLookback || batch.rawPayload?.invoiceLookback || receivablesVistosInvoiceLookbackWindow({
      months: options.invoiceLookbackMonths || DEFAULT_LOOKBACK_MONTHS,
      now: options.now
    });
    const filter = baseLookback.filter || receivablesVistosInvoiceLookbackWindow({
      months: options.invoiceLookbackMonths || DEFAULT_LOOKBACK_MONTHS,
      now: options.now
    }).filter;

    let loadedRows = loadedBefore;
    let totalRows = knownTotal;
    let acceptedCount = numberValue(currentRowCount?.accepted);
    let reviewCount = numberValue(currentRowCount?.review);
    let ignoredCount = numberValue(summary.ignoredCount);
    let issueCounts = Array.isArray(summary.issueCounts) ? summary.issueCounts : [];
    let latestEntity = baseEntity;
    let latestColumns = baseColumns;
    const diagnostics = [];
    let lastPageRows = 0;

    for (let pageIndex = 0; pageIndex < pagesPerRun; pageIndex += 1) {
      const pageResult = await loadInvoicePage(env, session, {
        entityName: latestEntity,
        columns: latestColumns,
        filter,
        start: loadedRows,
        vistosPageSize: pageSize,
        invoiceLookbackMonths: options.invoiceLookbackMonths
      });
      latestEntity = pageResult.entityName || latestEntity;
      latestColumns = pageResult.columns?.length ? pageResult.columns : latestColumns;
      diagnostics.push(...pageResult.diagnostics);
      const rows = pageResult.page.rows || [];
      lastPageRows = rows.length;
      totalRows = pageResult.page.countEvidence?.filteredReported ? pageResult.page.filtered : (pageResult.page.filtered || totalRows || loadedRows + rows.length);

      if (!rows.length) {
        if (loadedRows < totalRows) throw new ReceivablesVistosInvoiceSnapshotError(
          "Vistos vrátil prázdnou dávku před koncem seznamu. Import zůstává nedokončený a bude opakován.",
          502, "receivables_vistos_invoice_page_empty"
        );
        break;
      }

      const normalizedRows = rows.map((raw, index) => {
        const invoice = mapReceivablesVistosInvoice(raw);
        const issues = invoiceIssues(invoice);
        return {
          rowNumber: loadedRows + index + 1,
          invoice,
          raw,
          issues,
          previewStatus: issues.length ? "review" : "ready"
        };
      });
      const newIssueCounts = countIssues(normalizedRows);
      issueCounts = mergeIssueCounts(issueCounts, newIssueCounts);
      acceptedCount += normalizedRows.filter((row) => row.previewStatus === "ready").length;
      reviewCount += normalizedRows.filter((row) => row.previewStatus === "review").length;

      const rowStatements = snapshotRowStatements(db, batch.id, normalizedRows);

      if (rowStatements.length) await db.batch(rowStatements);
      loadedRows += normalizedRows.length;

      if ((totalRows > 0 && loadedRows >= totalRows) || rows.length < pageSize) {
        break;
      }
    }

    const capped = Boolean(totalRows && loadedRows < totalRows);
    const status = capped ? "snapshot_running" : "snapshot";
    if (!capped) await assertUniqueSnapshot(db, batch.id);
    const updatedSummary = {
      ...summary,
      mode: "vistos-invoice-snapshot",
      source: SNAPSHOT_SOURCE,
      sourceMode: "read_only_vistos_execute",
      invoiceEntity: latestEntity,
      invoiceColumns: latestColumns,
      invoiceLookback: baseLookback,
      loadedRows,
      totalRows,
      acceptedCount,
      reviewCount,
      ignoredCount,
      issueCounts,
      capped,
      pageSize,
      maxPages: numberValue(summary.maxPages),
      lastBatchRows: loadedRows - loadedBefore,
      lastBatchStartedAt: loadedBefore,
      lastBatchFinishedAt: loadedRows,
      readOnly: true,
      writesD1: true,
      writesLedger: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      calculatesRealRating: false,
      importsKbPayments: false,
      recommendedNextStep: capped
        ? `Dávkový read-only snapshot pokračuje automaticky: načteno ${loadedRows} / ${totalRows}.`
        : "Dávkový read-only snapshot faktur za 24 měsíců doběhl do staging vrstvy. Další krok je ledger mapping bez komunikace zákazníkům."
    };
    const updatedRawPayload = {
      ...(batch.rawPayload || {}),
      trigger: clean(options.triggeredBy) || "ui-auto-batch-advance",
      source: SNAPSHOT_SOURCE,
      importKind: SNAPSHOT_IMPORT_KIND,
      invoiceEntity: latestEntity,
      totalRows,
      capped,
      invoiceLookback: baseLookback,
      diagnostics: [
        ...((batch.rawPayload?.diagnostics || []).slice?.(-10) || []),
        ...diagnostics
      ].slice(-20),
      lastPageRows,
      readOnly: true,
      writesLedger: false,
      createsReceivableRecords: false,
      sendsCustomerCommunication: false,
      startsAutomation: false
    };

    await db.prepare(`
      UPDATE receivable_import_batches
      SET status = ?,
          row_count = ?,
          accepted_count = ?,
          review_count = ?,
          ignored_count = ?,
          parser_summary_json = ?,
          raw_payload = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      status,
      loadedRows,
      acceptedCount,
      reviewCount,
      ignoredCount,
      safeJson(updatedSummary),
      safeJson(updatedRawPayload),
      batch.id
    ).run();

    return getLatestReceivablesVistosInvoiceSnapshot(env, options);
  } catch (error) {
    throw snapshotError(error);
  }
}


const SNAPSHOT_LEASE_ID = "receivables-vistos-full-sync-lease";
async function withSnapshotLease(env, options, action) {
  const db = database(env, true);
  const owner = randomId("invoice-sync-owner");
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const claim = await db.prepare(`
    INSERT INTO receivable_import_batches (id, source, import_kind, status, raw_payload, updated_at)
    VALUES (?, 'vistos', 'vistos_invoice_sync_lease', 'locked', ?, ?)
    ON CONFLICT(id) DO UPDATE SET raw_payload = excluded.raw_payload, updated_at = excluded.updated_at
    WHERE receivable_import_batches.updated_at < ?
  `).bind(SNAPSHOT_LEASE_ID, owner, expires, now).run();
  if (!claim.meta?.changes) {
    return { ...await getLatestReceivablesVistosInvoiceSnapshot(env, options), syncBusy: true,
      message: "Načítání už běží. Zobrazuji poslední uložené faktury." };
  }
  try { return await action(env, options); }
  finally {
    await db.prepare("UPDATE receivable_import_batches SET updated_at = '1970-01-01' WHERE id = ? AND raw_payload = ?")
      .bind(SNAPSHOT_LEASE_ID, owner).run();
  }
}

export async function createReceivablesVistosInvoiceSnapshot(env, options = {}) {
  return withSnapshotLease(env, options, createReceivablesVistosInvoiceSnapshotUnlocked);
}

export async function advanceReceivablesVistosInvoiceSnapshot(env, options = {}) {
  return withSnapshotLease(env, options, advanceReceivablesVistosInvoiceSnapshotUnlocked);
}

export async function createReceivablesVistosInvoiceIncrementalSnapshot(env, options = {}) {
  return withSnapshotLease(env, options, createReceivablesVistosInvoiceIncrementalSnapshotUnlocked);
}
export async function advanceReceivablesVistosInvoiceIncrementalSnapshot(env, options = {}) {
  return withSnapshotLease(env, options, advanceReceivablesVistosInvoiceIncrementalSnapshotUnlocked);
}

// Changes are staged first. Each application page and its cursor commit together.
// Repeating a failed invocation cannot append a second copy or advance the watermark early.
async function applyInvoiceChanges(db, delta) {
  const baseRow = await db.prepare(`SELECT * FROM receivable_import_batches
    WHERE source = ? AND import_kind = ? AND status = 'snapshot'
    ORDER BY created_at DESC LIMIT 1`).bind(SNAPSHOT_SOURCE, SNAPSHOT_IMPORT_KIND).first();
  if (!baseRow) throw new ReceivablesVistosInvoiceSnapshotError(
    "Chybí dokončený počáteční import faktur.", 409, "receivables_incremental_checkpoint_missing");
  const base = rowToBatch(baseRow);
  const summary = delta.parserSummary || {};
  if (summary.appliedToSnapshotId && summary.appliedToSnapshotId !== base.id) {
    throw new ReceivablesVistosInvoiceSnapshotError("Základ importu se změnil během aktualizace.", 409, "receivables_snapshot_changed");
  }
  const offset = numberValue(summary.appliedRows);
  const page = await db.prepare(`SELECT * FROM receivable_import_rows
    WHERE batch_id = ? ORDER BY row_number ASC LIMIT 1000 OFFSET ?`).bind(delta.id, offset).all();
  const rows = (page.results || []).map(rowToSnapshotRow);
  const current = await db.prepare(`SELECT id, row_number,
    json_extract(normalized_json, '$.vistoInvoiceId') AS invoice_id,
    json_extract(raw_payload, '$.Modified') AS modified
    FROM receivable_import_rows WHERE batch_id = ?`).bind(base.id).all();
  const byId = new Map();
  let lastNumber = 0;
  for (const row of current.results || []) {
    if (byId.has(clean(row.invoice_id))) throw new ReceivablesVistosInvoiceSnapshotError(
      "Počáteční import obsahuje duplicitní ID faktury.", 409, "receivables_invoice_duplicate_id");
    byId.set(clean(row.invoice_id), row);
    lastNumber = Math.max(lastNumber, numberValue(row.row_number));
  }
  const updates = new Map();
  for (const row of rows) {
    const id = clean(row.invoice.vistoInvoiceId);
    if (!id) throw new ReceivablesVistosInvoiceSnapshotError(
      "Změněná faktura nemá stabilní ID. Aktualizace byla zastavena.", 502, "receivables_invoice_id_missing");
    const existing = byId.get(id);
    const modified = rawModifiedDate(row.rawPayload);
    if (existing?.modified && modified && validDate(existing.modified) > modified) continue;
    if (!existing && row.invoice.issueDate && row.invoice.issueDate < base.parserSummary.invoiceLookback?.fromDate) continue;
    const rowNumber = existing?.row_number || ++lastNumber;
    byId.set(id, { row_number: rowNumber, modified: row.rawPayload.Modified });
    const issues = invoiceIssues(row.invoice);
    updates.set(id, { rowNumber, invoice: row.invoice, raw: row.rawPayload, issues,
      previewStatus: issues.length ? "review" : "ready" });
  }
  const appliedRows = offset + rows.length;
  const done = appliedRows >= numberValue(summary.loadedRows);
  if (!rows.length && !done) throw new ReceivablesVistosInvoiceSnapshotError(
    "Ve změnové dávce chybí uložené řádky.", 409, "receivables_incremental_rows_missing");
  const updated = { ...summary, appliedRows, appliedToSnapshotId: base.id, changesApplied: done };
  const statements = snapshotRowStatements(db, base.id, [...updates.values()]);
  statements.push(db.prepare(`UPDATE receivable_import_batches
    SET status = ?, parser_summary_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(done ? "incremental" : "incremental_applying", safeJson(updated), delta.id));
  const baseSummary = { ...base.parserSummary, loadedRows: lastNumber, totalRows: lastNumber, capped: false,
    ...(done ? { syncedThrough: validDate(base.parserSummary.syncedThrough) > validDate(summary.periodTo) ? base.parserSummary.syncedThrough : summary.periodTo, lastIncrementalBatchId: delta.id,
      recommendedNextStep: "Seznam je aktualizovaný změnami z Vistosu." } : {}) };
  statements.push(db.prepare(`UPDATE receivable_import_batches SET row_count = ?, parser_summary_json = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(lastNumber, safeJson(baseSummary), base.id));
  // Quality counters derive from the committed rows, including changed (not just appended) invoices.
  statements.push(db.prepare(`UPDATE receivable_import_batches SET
    accepted_count = (SELECT COUNT(*) FROM receivable_import_rows WHERE batch_id = ? AND preview_status = 'ready'),
    review_count = (SELECT COUNT(*) FROM receivable_import_rows WHERE batch_id = ? AND preview_status = 'review')
    WHERE id = ?`).bind(base.id, base.id, base.id));
  await db.batch(statements);
  return incrementalResult({ id: delta.id, status: done ? "incremental" : "incremental_applying" }, updated);
}

export function snapshotError(error) {
  if (error instanceof ReceivablesVistosInvoiceSnapshotError) return error;
  if (error instanceof VistosExecuteError) {
    return new ReceivablesVistosInvoiceSnapshotError(error.message, error.status || 502, error.code || "vistos_execute_error");
  }

  const message = clean(error?.message);
  if (/no such table: receivable_import_/i.test(message)) {
    return new ReceivablesVistosInvoiceSnapshotError(
      "Tabulky import preview nejsou v D1 připravené. Spusťte migraci 0028_create_receivable_import_preview.sql.",
      503,
      "receivables_import_preview_migration_missing"
    );
  }
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesVistosInvoiceSnapshotError(
      "Tabulky Pohledávek nejsou v D1 připravené.",
      503,
      "receivables_migration_missing"
    );
  }

  console.error("receivables.vistos_invoice_snapshot_failed", { message });
  return new ReceivablesVistosInvoiceSnapshotError("Snapshot Vistos faktur se teď nepodařilo načíst.", 500, "receivables_vistos_invoice_snapshot_failed");
}
