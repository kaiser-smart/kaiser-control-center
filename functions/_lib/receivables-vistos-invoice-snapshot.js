import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  getVistosPage,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";
import {
  mapReceivablesVistosInvoice,
  receivablesVistosInvoiceLookbackWindow
} from "./receivables-vistos-preview.js";

const DB_BINDING = "SMART_ODPADY_DB";
const SNAPSHOT_IMPORT_KIND = "vistos_invoice_snapshot";
const SNAPSHOT_SOURCE = "vistos";
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 5;
const MAX_MAX_PAGES = 24;
const DEFAULT_LOOKBACK_MONTHS = 24;
const DEFAULT_ADVANCE_PAGE_SIZE = 1000;
const DEFAULT_ADVANCE_PAGES_PER_RUN = 1;
const MAX_ADVANCE_PAGES_PER_RUN = 3;

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
  { key: "kaiser_invoice_columns", entityName: "InvoiceIssued", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Document", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "Invoice", columns: INVOICE_COLUMNS },
  { key: "kaiser_invoice_columns", entityName: "IssuedInvoice", columns: INVOICE_COLUMNS },
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
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesVistosInvoiceSnapshotError(
      "Databáze Pohledávek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
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

async function loadFirstWorkingInvoiceEntity(env, session, options = {}) {
  const diagnostics = [];
  const invoiceLookback = receivablesVistosInvoiceLookbackWindow({
    months: options.invoiceLookbackMonths || DEFAULT_LOOKBACK_MONTHS,
    now: options.now
  });
  const filter = invoiceLookback.filter;
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, MAX_MAX_PAGES);

  for (const attempt of INVOICE_ATTEMPTS) {
    const entityName = clean(options.entityName) || attempt.entityName;
    try {
      const page = await getAllVistosPages(env, session, entityName, attempt.columns, filter, {
        pageSize,
        maxPages
      });
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

  return {
    entityName: clean(options.entityName),
    columns: [],
    page: { rows: [], total: 0, filtered: 0, capped: false },
    diagnostics,
    invoiceLookback,
    pageSize,
    maxPages
  };
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

  for (const attempt of INVOICE_ATTEMPTS) {
    const entityName = clean(options.entityName) || attempt.entityName;
    const columns = Array.isArray(options.columns) && options.columns.length ? options.columns : attempt.columns;
    try {
      const page = await getVistosPage(env, session, entityName, columns, filter, start, pageSize);
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

  return {
    entityName: clean(options.entityName),
    columns: Array.isArray(options.columns) ? options.columns : [],
    page: { rows: [], total: 0, filtered: 0 },
    diagnostics,
    invoiceLookback,
    filter,
    pageSize,
    start
  };
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
    readOnly: true,
    writesLedger: false,
    createsReceivableRecords: false,
    sendsCustomerCommunication: false,
    startsAutomation: false,
    calculatesRealRating: false,
    importsKbPayments: false,
    loadedRows: parserSummary.loadedRows ?? batch.rowCount ?? rowCount,
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

export async function getLatestReceivablesVistosInvoiceSnapshot(env, options = {}) {
  const db = database(env);
  if (!db) {
    return { snapshot: null, rows: [], pagination: { page: 1, pageSize: 100, totalRows: 0 }, apiStatus: "waiting" };
  }

  const page = boundedInteger(options.page, 1, 100000);
  const pageSize = boundedInteger(options.pageSize, 100, 500);
  const offset = (page - 1) * pageSize;

  try {
    const batchRow = await latestSnapshotBatch(db);

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

export async function createReceivablesVistosInvoiceSnapshot(env, options = {}) {
  const db = database(env, true);
  if (!isVistosExecuteConfigured(env)) {
    return {
      snapshot: null,
      rows: [],
      pagination: { page: 1, pageSize: 100, totalRows: 0 },
      apiStatus: "not_configured",
      message: "Vistos API není nakonfigurováno.",
      readOnly: true
    };
  }

  try {
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
    const totalRows = invoiceResult.page.filtered || invoiceResult.page.total || normalizedRows.length;
    const capped = Boolean(invoiceResult.page.capped || (totalRows && normalizedRows.length < totalRows));
    const batchId = randomId("receivable-vistos-invoice-snapshot");
    const summary = {
      mode: "vistos-invoice-snapshot",
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
        capped ? "snapshot_capped" : "snapshot",
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

    const rowStatements = normalizedRows.map((row) => db.prepare(`
      INSERT INTO receivable_import_rows (
        id, batch_id, row_number, entity_kind, preview_status, confidence,
        issue_code, issue_message, normalized_json, raw_payload
      )
      VALUES (?, ?, ?, 'vistos_invoice', ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("receivable-vistos-invoice-row"),
      batchId,
      row.rowNumber,
      row.previewStatus,
      row.issues.length ? 0.55 : 0.95,
      row.issues[0] || null,
      row.issues.join(", ") || null,
      safeJson(row.invoice),
      safeJson(row.raw)
    ));

    for (let index = 0; index < rowStatements.length; index += 100) {
      await db.batch(rowStatements.slice(index, index + 100));
    }

    return getLatestReceivablesVistosInvoiceSnapshot(env, {
      page: options.page,
      pageSize: options.pageSize
    });
  } catch (error) {
    throw snapshotError(error);
  }
}

export async function advanceReceivablesVistosInvoiceSnapshot(env, options = {}) {
  const db = database(env, true);
  if (!isVistosExecuteConfigured(env)) {
    return {
      snapshot: null,
      rows: [],
      pagination: { page: 1, pageSize: 100, totalRows: 0 },
      apiStatus: "not_configured",
      message: "Vistos API není nakonfigurováno.",
      readOnly: true
    };
  }

  try {
    const batchRow = await latestSnapshotBatch(db);
    if (!batchRow) {
      return createReceivablesVistosInvoiceSnapshot(env, {
        ...options,
        triggeredBy: clean(options.triggeredBy) || "ui-auto-batch-first-open"
      });
    }

    const batch = rowToBatch(batchRow);
    const summary = snapshotSummaryFromBatch(batch, batch.rowCount);
    const currentRowCount = await db.prepare("SELECT COUNT(*) AS count FROM receivable_import_rows WHERE batch_id = ?")
      .bind(batch.id)
      .first();
    const loadedBefore = numberValue(currentRowCount?.count, summary.loadedRows || batch.rowCount);
    const knownTotal = numberValue(summary.totalRows);

    if (knownTotal > 0 && loadedBefore >= knownTotal) {
      await db.prepare(`
        UPDATE receivable_import_batches
        SET status = 'snapshot', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(batch.id).run();
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
    let acceptedCount = numberValue(summary.acceptedCount);
    let reviewCount = numberValue(summary.reviewCount);
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
      totalRows = pageResult.page.filtered || pageResult.page.total || totalRows || loadedRows + rows.length;

      if (!rows.length) {
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

      const rowStatements = normalizedRows.map((row) => db.prepare(`
        INSERT OR REPLACE INTO receivable_import_rows (
          id, batch_id, row_number, entity_kind, preview_status, confidence,
          issue_code, issue_message, normalized_json, raw_payload
        )
        VALUES (?, ?, ?, 'vistos_invoice', ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("receivable-vistos-invoice-row"),
        batch.id,
        row.rowNumber,
        row.previewStatus,
        row.issues.length ? 0.55 : 0.95,
        row.issues[0] || null,
        row.issues.join(", ") || null,
        safeJson(row.invoice),
        safeJson(row.raw)
      ));

      for (let index = 0; index < rowStatements.length; index += 100) {
        await db.batch(rowStatements.slice(index, index + 100));
      }
      loadedRows += normalizedRows.length;

      if ((totalRows > 0 && loadedRows >= totalRows) || rows.length < pageSize) {
        break;
      }
    }

    const capped = Boolean(totalRows && loadedRows < totalRows);
    const status = capped ? "snapshot_running" : "snapshot";
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
