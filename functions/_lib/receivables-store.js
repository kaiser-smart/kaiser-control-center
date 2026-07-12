import { decideReceivablesNextAction } from "./receivables-ai-decision-engine.js";
import { buildBankImportPreview, buildInvoiceImportPreview } from "./receivables-import-preview.js";
import { parseKbBankStatementText } from "./receivables-kb-bank-parser.js";
import { isKbBankCsvText, kbCsvContentSha256, parseKbBankCsvText } from "./receivables-kb-csv-parser.js";
import { calculateCustomerPaymentRating } from "./receivables-rating-engine.js";
import { calculateInvoicePaymentState, matchReceivablePayments } from "./receivables-payment-matching.js";

const DB_BINDING = "SMART_ODPADY_DB";
const DEFAULT_LEGAL_HANDOFF_DAYS = 60;

export class ReceivablesStoreError extends Error {
  constructor(message, status = 400, code = "receivables_error") {
    super(message);
    this.name = "ReceivablesStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesStoreError(
      "Databáze Pohledávek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

export function receivablesApiStatus(env) {
  return database(env) ? "ready" : "waiting";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return fallback;
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return 0;
  }
  return Math.floor((rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000));
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function storeError(error) {
  if (error instanceof ReceivablesStoreError) {
    return error;
  }

  const message = cleanString(error?.message);
  if (/no such table: receivable_import_/i.test(message)) {
    return new ReceivablesStoreError(
      "Tabulky import preview nejsou v D1 připravené. Spusťte migraci 0028_create_receivable_import_preview.sql.",
      503,
      "receivables_import_preview_migration_missing"
    );
  }
  if (/no such table|no such column/i.test(message)) {
    return new ReceivablesStoreError(
      "Tabulky Pohledávek nejsou v D1 připravené. Spusťte migraci 0027_create_receivables_core.sql.",
      503,
      "receivables_migration_missing"
    );
  }

  console.error("receivables.store_failed", { message });
  return new ReceivablesStoreError("Pohledávky se teď nepodařilo načíst.", 500, "receivables_store_failed");
}

function emptyDashboard(apiStatus = "waiting", message = "D1 databáze pro Pohledávky zatím není dostupná.") {
  return {
    apiStatus,
    mode: "dry_run",
    message,
    kpis: {
      totalOverdue: 0,
      overdue1To15: 0,
      overdue16To30: 0,
      overdue31To45: 0,
      overdue46To60: 0,
      overdueOver60: 0,
      promisedPayments: 0,
      todayReview: 0,
      insolvencyFindings: 0,
      avgPaymentDelay: 0,
      predicted7d: 0,
      predicted14d: 0,
      predicted30d: 0,
      automaticCustomers: 0,
      stoppedCustomers: 0
    },
    customers: [],
    dryRunDecisions: [],
    settings: defaultReceivablesSettings(),
    sourceStatus: {
      vistos: "read_only_preview",
      bank: "pdf_text_preview_to_d1",
      insolvency: "isir_read_only_preview",
      outbound: "disabled"
    },
    unmatchedPaymentReview: {
      totalCount: 0,
      totalAmount: 0,
      receivableReviewCount: 0,
      receivableReviewAmount: 0,
      technicalMovementCount: 0,
      technicalMovementAmount: 0,
      duplicateCandidateCount: 0,
      duplicateCandidateAmount: 0,
      safeAutoMatchCount: 0,
      blocksAutomation: true,
      buckets: []
    }
  };
}

export function defaultReceivablesSettings() {
  return {
    mode: { dryRun: true, autonomyEnabled: false },
    working_hours: {
      timezone: "Europe/Prague",
      days: ["mon", "tue", "wed", "thu", "fri"],
      sendFrom: "09:00",
      sendTo: "15:30",
      hardStop: "16:00"
    },
    sender: {
      email: "fakturace@kaiserservis.cz",
      name: "Kaiser servis - fakturace",
      replyTo: "fakturace@kaiserservis.cz"
    },
    legal_handoff: { daysOverdue: DEFAULT_LEGAL_HANDOFF_DAYS, enabled: true },
    communication_limits: {
      emailDays: 1,
      smsDays: 7,
      whatsappDays: 7,
      voiceDays: 14,
      maxCustomerActionsPerDay: 1
    },
    banned_words: [
      "dluh",
      "dlužník",
      "vymáhání",
      "sankce",
      "penále",
      "exekuce",
      "právní kroky",
      "poslední výzva",
      "okamžitě uhraďte"
    ],
    thresholds: { significantAmount: 50000 },
    channels: { email: true, sms: false, whatsapp: false, voice: false }
  };
}

function rowToCustomer(row = {}) {
  return {
    id: cleanString(row.id),
    vistoCompanyId: cleanString(row.visto_company_id),
    companyName: cleanString(row.company_name),
    ico: cleanString(row.ico),
    dic: cleanString(row.dic),
    registeredAddress: cleanString(row.registered_address),
    contactEmail: cleanString(row.contact_email),
    contactPhone: cleanString(row.contact_phone),
    contactWhatsapp: cleanString(row.contact_whatsapp),
    preferredContactPerson: cleanString(row.preferred_contact_person),
    preferredChannel: cleanString(row.preferred_channel || "email"),
    automationStatus: cleanString(row.automation_status || "dry_run"),
    rawPayload: parseJson(row.raw_payload, {}),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToInvoice(row = {}) {
  return {
    id: cleanString(row.id),
    vistoInvoiceId: cleanString(row.visto_invoice_id),
    invoiceNumber: cleanString(row.invoice_number),
    variableSymbol: cleanString(row.variable_symbol),
    customerId: cleanString(row.customer_id),
    issueDate: cleanString(row.issue_date),
    dueDate: cleanString(row.due_date),
    totalAmount: numberValue(row.total_amount),
    paidAmount: numberValue(row.paid_amount),
    openAmount: numberValue(row.open_amount),
    currency: cleanString(row.currency || "CZK"),
    status: cleanString(row.status || "unpaid"),
    paidDate: cleanString(row.paid_date),
    pdfUrl: cleanString(row.pdf_url),
    rawPayload: parseJson(row.raw_payload, {}),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToPackage(row = {}) {
  return {
    id: cleanString(row.package_id || row.id),
    customerId: cleanString(row.customer_id),
    totalOpenAmount: numberValue(row.total_open_amount),
    totalOverdueAmount: numberValue(row.total_overdue_amount),
    invoiceCount: numberValue(row.rating_invoice_count ?? row.invoice_count),
    oldestDueDate: cleanString(row.oldest_due_date),
    maxDaysOverdue: numberValue(row.max_days_overdue),
    daysToLegalHandoff: numberValue(row.days_to_legal_handoff, DEFAULT_LEGAL_HANDOFF_DAYS),
    status: cleanString(row.package_status || row.status || "dry_run"),
    nextActionAt: cleanString(row.next_action_at),
    updatedAt: cleanString(row.package_updated_at || row.updated_at),
    rawPayload: parseJson(row.package_raw_payload || row.raw_payload, {})
  };
}

function rowToRating(row = {}) {
  const calculationVersion = cleanString(row.calculation_version || "legacy");
  const ratingMode = cleanString(row.rating_mode || "PRE_RATING");
  const rawRating = cleanString(row.rating || "N").toUpperCase();
  const legacyUnsafe = calculationVersion !== "payment-rating-v1"
    || (ratingMode === "PRE_RATING" && ["A", "B", "C", "D", "E"].includes(rawRating));
  const score = legacyUnsafe || row.payment_morality_score === null || row.payment_morality_score === undefined
    ? null
    : numberValue(row.payment_morality_score);
  const blockingReasons = parseJson(row.blocking_reasons_json, []);
  if (legacyUnsafe) blockingReasons.push("Starší výpočet není ověřený rating payment-rating-v1.");
  return {
    id: cleanString(row.rating_id || row.id),
    customerId: cleanString(row.customer_id),
    score,
    paymentMoralityScore: score,
    ratingMode: legacyUnsafe ? "PRE_RATING" : ratingMode,
    rating: legacyUnsafe ? "N" : rawRating,
    confidence: legacyUnsafe ? "NONE" : cleanString(row.confidence || "NONE"),
    automationStatus: legacyUnsafe ? "DRY_RUN_ONLY" : cleanString(row.rating_automation_status || row.automation_status || "DRY_RUN_ONLY"),
    recommendedAutomationStatus: legacyUnsafe ? "DRY_RUN_ONLY" : cleanString(row.recommended_automation_status || "DRY_RUN_ONLY"),
    periodFrom: cleanString(row.period_from),
    periodTo: cleanString(row.period_to),
    invoiceCount: numberValue(row.invoice_count),
    paidInvoiceCount: numberValue(row.paid_invoice_count),
    openInvoiceCount: numberValue(row.open_invoice_count),
    invoiceAmountTotal: numberValue(row.invoice_amount_total),
    paidAmountTotal: numberValue(row.paid_amount_total),
    openAmountTotal: numberValue(row.open_amount_total),
    overdueAmountTotal: numberValue(row.overdue_amount_total),
    weightedAvgDelay: row.weighted_avg_delay === null ? null : numberValue(row.weighted_avg_delay),
    p90Delay: row.p90_delay === null ? null : numberValue(row.p90_delay),
    onTimeAmountRate: row.on_time_amount_rate === null ? null : numberValue(row.on_time_amount_rate),
    currentOverdueBalance: numberValue(row.current_overdue_balance),
    avgMonthlyBilling: numberValue(row.avg_monthly_billing),
    currentMaxDaysOverdue: numberValue(row.current_max_days_overdue),
    brokenPromiseRate: numberValue(row.broken_promise_rate),
    partialPaymentRisk: numberValue(row.partial_payment_risk),
    disputeRate: numberValue(row.dispute_rate),
    unmatchedPaymentRate: numberValue(row.unmatched_payment_rate),
    unmatchedPaymentPenalty: numberValue(row.unmatched_payment_penalty),
    penalties: parseJson(row.penalties_json, {}),
    dataQualityFlags: parseJson(row.data_quality_flags_json, []),
    blockingReasons: [...new Set(blockingReasons)],
    explanation: legacyUnsafe
      ? "Starší výpočet se nezobrazuje jako ostrý rating. Je nutný nový ověřitelný přepočet."
      : cleanString(row.explanation),
    calculationVersion,
    sourceFingerprint: cleanString(row.source_fingerprint),
    variables: parseJson(row.variables_json, {}),
    calculatedAt: cleanString(row.calculated_at)
  };
}

function rowToDecision(row = {}) {
  return {
    id: cleanString(row.id),
    customerId: cleanString(row.customer_id),
    packageId: cleanString(row.package_id),
    action: cleanString(row.action),
    scheduledAt: cleanString(row.scheduled_at),
    channel: cleanString(row.channel),
    template: cleanString(row.template_key),
    tone: cleanString(row.tone),
    reason: cleanString(row.reason),
    confidence: numberValue(row.confidence),
    requiresHumanApproval: booleanValue(row.requires_human_approval),
    marketaAlert: booleanValue(row.marketa_alert),
    dryRun: booleanValue(row.dry_run, true),
    blockedRules: parseJson(row.blocked_rules_json, []),
    messagePreview: cleanString(row.message_preview),
    createdAt: cleanString(row.created_at)
  };
}

function rowToPaymentTransaction(row = {}) {
  return {
    id: cleanString(row.id),
    source: cleanString(row.source),
    bankTransactionId: cleanString(row.bank_transaction_id),
    bookingDate: cleanString(row.booking_date),
    valueDate: cleanString(row.value_date),
    transactionType: cleanString(row.transaction_type),
    amount: numberValue(row.amount),
    currency: cleanString(row.currency || "CZK"),
    variableSymbol: cleanString(row.variable_symbol),
    constantSymbol: cleanString(row.constant_symbol),
    specificSymbol: cleanString(row.specific_symbol),
    counterpartyName: cleanString(row.counterparty_name),
    counterpartyAccount: cleanString(row.counterparty_account),
    message: cleanString(row.message),
    rawPayload: parseJson(row.raw_payload, {}),
    createdAt: cleanString(row.created_at)
  };
}

function rowToImportBatch(row = {}) {
  return {
    id: cleanString(row.id),
    source: cleanString(row.source),
    importKind: cleanString(row.import_kind),
    status: cleanString(row.status || "preview"),
    filename: cleanString(row.filename),
    rowCount: numberValue(row.row_count),
    acceptedCount: numberValue(row.accepted_count),
    reviewCount: numberValue(row.review_count),
    ignoredCount: numberValue(row.ignored_count),
    createdByUserId: cleanString(row.created_by_user_id),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    parserSummary: parseJson(row.parser_summary_json, {}),
    rawPayload: parseJson(row.raw_payload, {})
  };
}

function rowToImportRow(row = {}) {
  return {
    id: cleanString(row.id),
    batchId: cleanString(row.batch_id),
    rowNumber: numberValue(row.row_number),
    entityKind: cleanString(row.entity_kind),
    previewStatus: cleanString(row.preview_status),
    confidence: numberValue(row.confidence),
    issueCode: cleanString(row.issue_code),
    issueMessage: cleanString(row.issue_message),
    normalized: parseJson(row.normalized_json, {}),
    rawPayload: parseJson(row.raw_payload, {}),
    createdAt: cleanString(row.created_at)
  };
}

function customerListItem(row = {}) {
  return {
    ...rowToCustomer(row),
    package: rowToPackage(row),
    rating: row.rating_id ? rowToRating(row) : null,
    nextDecision: row.decision_id ? rowToDecision({
      id: row.decision_id,
      customer_id: row.customer_id,
      package_id: row.package_id,
      action: row.decision_action,
      scheduled_at: row.decision_scheduled_at,
      channel: row.decision_channel,
      template_key: row.decision_template_key,
      tone: row.decision_tone,
      reason: row.decision_reason,
      confidence: row.decision_confidence,
      requires_human_approval: row.decision_requires_human_approval,
      marketa_alert: row.decision_marketa_alert,
      dry_run: row.decision_dry_run,
      blocked_rules_json: row.decision_blocked_rules_json,
      message_preview: row.decision_message_preview,
      created_at: row.decision_created_at
    }) : null
  };
}

async function listOpenInvoices(db) {
  const result = await db.prepare(`
    SELECT *
    FROM receivable_invoices
    WHERE open_amount > 0
      AND status NOT IN ('paid', 'overpaid', 'legal_handoff', 'insolvency_hold')
    ORDER BY due_date ASC
    LIMIT 5000
  `).all();
  return (result.results || []).map(rowToInvoice);
}

function bucketKpis(invoices, today = todayKey()) {
  const kpis = {
    totalOverdue: 0,
    overdue1To15: 0,
    overdue16To30: 0,
    overdue31To45: 0,
    overdue46To60: 0,
    overdueOver60: 0
  };

  for (const invoice of invoices) {
    const overdueDays = Math.max(0, daysBetween(invoice.dueDate, today));
    if (!overdueDays) {
      continue;
    }
    kpis.totalOverdue += invoice.openAmount;
    if (overdueDays <= 15) kpis.overdue1To15 += invoice.openAmount;
    else if (overdueDays <= 30) kpis.overdue16To30 += invoice.openAmount;
    else if (overdueDays <= 45) kpis.overdue31To45 += invoice.openAmount;
    else if (overdueDays <= 60) kpis.overdue46To60 += invoice.openAmount;
    else kpis.overdueOver60 += invoice.openAmount;
  }

  return Object.fromEntries(Object.entries(kpis).map(([key, value]) => [key, Math.round(value * 100) / 100]));
}

async function countScalar(db, sql, ...bindings) {
  const row = await db.prepare(sql).bind(...bindings).first();
  return numberValue(row?.count);
}

async function unmatchedPaymentReviewSummary(db) {
  const result = await db.prepare(`
    WITH unmatched AS (
      SELECT id, amount, booking_date, variable_symbol, transaction_type, data_quality_flags_json
      FROM receivable_payment_transactions
      WHERE amount > 0
        AND data_quality_flags_json LIKE '%UNMATCHED_PAYMENT%'
    ),
    invoice_vs AS (
      SELECT
        variable_symbol,
        COUNT(*) AS invoice_count,
        SUM(total_amount) AS invoice_amount,
        MIN(issue_date) AS first_issue_date
      FROM receivable_invoices
      WHERE total_amount > 0
        AND COALESCE(variable_symbol, '') <> ''
      GROUP BY variable_symbol
    ),
    payment_vs AS (
      SELECT variable_symbol, SUM(amount) AS payment_amount, MIN(booking_date) AS first_booking_date
      FROM unmatched
      WHERE COALESCE(variable_symbol, '') <> ''
      GROUP BY variable_symbol
    ),
    classified AS (
      SELECT
        u.amount,
        u.data_quality_flags_json,
        CASE
          WHEN LOWER(COALESCE(u.transaction_type, '')) = 'vraceni nakupu' THEN 'technical_purchase_refund'
          WHEN LOWER(COALESCE(u.transaction_type, '')) = 'vklad pres atm' THEN 'technical_atm_deposit'
          WHEN LOWER(COALESCE(u.transaction_type, '')) = 'storno mobilni platby' THEN 'technical_mobile_reversal'
          WHEN COALESCE(u.variable_symbol, '') = '' THEN 'missing_variable_symbol'
          WHEN i.variable_symbol IS NULL THEN 'variable_symbol_without_invoice'
          WHEN i.invoice_count > 1 THEN 'multiple_invoice_candidates'
          WHEN p.first_booking_date < i.first_issue_date THEN 'payment_before_invoice'
          WHEN p.payment_amount > i.invoice_amount + MAX(1, ABS(i.invoice_amount) * 0.001)
            THEN 'exact_variable_symbol_over_invoice_total'
          ELSE 'exact_variable_symbol_requires_review'
        END AS bucket
      FROM unmatched u
      LEFT JOIN invoice_vs i ON i.variable_symbol = u.variable_symbol
      LEFT JOIN payment_vs p ON p.variable_symbol = u.variable_symbol
    )
    SELECT
      bucket,
      COUNT(*) AS payment_count,
      ROUND(SUM(amount), 2) AS amount_total,
      SUM(CASE WHEN data_quality_flags_json LIKE '%DUPLICATE_PAYMENT_CANDIDATE%' THEN 1 ELSE 0 END) AS duplicate_count,
      ROUND(SUM(CASE WHEN data_quality_flags_json LIKE '%DUPLICATE_PAYMENT_CANDIDATE%' THEN amount ELSE 0 END), 2) AS duplicate_amount
    FROM classified
    GROUP BY bucket
    ORDER BY CASE WHEN bucket LIKE 'technical_%' THEN 1 ELSE 0 END, payment_count DESC
  `).all();

  const buckets = (result.results || []).map((row) => ({
    code: cleanString(row.bucket),
    paymentCount: numberValue(row.payment_count),
    amountTotal: numberValue(row.amount_total),
    reviewKind: cleanString(row.bucket).startsWith("technical_") ? "technical" : "receivable"
  }));
  const receivableBuckets = buckets.filter((bucket) => bucket.reviewKind === "receivable");
  const technicalBuckets = buckets.filter((bucket) => bucket.reviewKind === "technical");
  const sumCount = (items) => items.reduce((sum, bucket) => sum + bucket.paymentCount, 0);
  const sumAmount = (items) => Math.round(items.reduce((sum, bucket) => sum + bucket.amountTotal, 0) * 100) / 100;
  return {
    totalCount: sumCount(buckets),
    totalAmount: sumAmount(buckets),
    receivableReviewCount: sumCount(receivableBuckets),
    receivableReviewAmount: sumAmount(receivableBuckets),
    technicalMovementCount: sumCount(technicalBuckets),
    technicalMovementAmount: sumAmount(technicalBuckets),
    duplicateCandidateCount: (result.results || []).reduce((sum, row) => cleanString(row.bucket).startsWith("technical_") ? sum : sum + numberValue(row.duplicate_count), 0),
    duplicateCandidateAmount: Math.round((result.results || []).reduce((sum, row) => cleanString(row.bucket).startsWith("technical_") ? sum : sum + numberValue(row.duplicate_amount), 0) * 100) / 100,
    safeAutoMatchCount: 0,
    blocksAutomation: sumCount(receivableBuckets) > 0,
    buckets
  };
}

export async function getReceivablesSettings(env) {
  const db = database(env);
  const defaults = defaultReceivablesSettings();
  if (!db) {
    return { settings: defaults, apiStatus: "waiting" };
  }

  try {
    const result = await db.prepare("SELECT key, value_json FROM receivable_settings").all();
    const settings = { ...defaults };
    for (const row of result.results || []) {
      settings[cleanString(row.key)] = parseJson(row.value_json, settings[cleanString(row.key)] || {});
    }
    return { settings, apiStatus: "ready" };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getReceivablesDashboard(env, options = {}) {
  const db = database(env);
  if (!db) {
    return emptyDashboard("waiting");
  }

  try {
    const today = cleanString(options.today) || todayKey();
    const openInvoices = await listOpenInvoices(db);
    const bucketed = bucketKpis(openInvoices, today);
    const promisedPayments = await countScalar(db, "SELECT COUNT(*) AS count FROM receivable_promises_to_pay WHERE status = 'active'");
    const todayReview = await countScalar(db, `
      SELECT COUNT(*) AS count
      FROM receivable_ai_decisions
      WHERE dry_run = 1 AND (requires_human_approval = 1 OR marketa_alert = 1)
    `);
    const insolvencyFindings = await countScalar(db, "SELECT COUNT(*) AS count FROM receivable_insolvency_checks WHERE found = 1");
    const automaticCustomers = await countScalar(db, "SELECT COUNT(*) AS count FROM receivable_customers WHERE automation_status IN ('autonomous', 'READY_FOR_AUTOMATION', 'ready_for_automation')");
    const stoppedCustomers = await countScalar(db, "SELECT COUNT(*) AS count FROM receivable_customers WHERE automation_status IN ('STOP', 'stop', 'insolvency_hold')");
    const settingsResult = await getReceivablesSettings(env);
    const customers = await listReceivableCustomers(env, { limit: options.limit || 100 });
    const unmatchedPaymentReview = await unmatchedPaymentReviewSummary(db);

    return {
      ...emptyDashboard("ready", "Pohledávkový kompas AI běží v dry-run režimu."),
      apiStatus: "ready",
      kpis: {
        ...emptyDashboard().kpis,
        ...bucketed,
        promisedPayments,
        todayReview,
        insolvencyFindings,
        avgPaymentDelay: 0,
        predicted7d: Math.round(bucketed.totalOverdue * 0.28 * 100) / 100,
        predicted14d: Math.round(bucketed.totalOverdue * 0.46 * 100) / 100,
        predicted30d: Math.round(bucketed.totalOverdue * 0.68 * 100) / 100,
        automaticCustomers,
        stoppedCustomers
      },
      customers: customers.customers,
      settings: settingsResult.settings,
      unmatchedPaymentReview
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function listReceivableCustomers(env, options = {}) {
  const db = database(env);
  if (!db) {
    return { customers: [], total: 0, apiStatus: "waiting" };
  }

  try {
    const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
    const result = await db.prepare(`
      SELECT
        c.*,
        p.id AS package_id,
        COALESCE(p.total_open_amount, invoice_aggregate.total_open_amount, 0) AS total_open_amount,
        COALESCE(p.total_overdue_amount, invoice_aggregate.total_overdue_amount, 0) AS total_overdue_amount,
        COALESCE(p.invoice_count, invoice_aggregate.invoice_count, 0) AS invoice_count,
        COALESCE(p.oldest_due_date, invoice_aggregate.oldest_due_date) AS oldest_due_date,
        COALESCE(p.max_days_overdue, invoice_aggregate.max_days_overdue, 0) AS max_days_overdue,
        p.days_to_legal_handoff,
        p.status AS package_status,
        p.next_action_at,
        p.updated_at AS package_updated_at,
        p.raw_payload AS package_raw_payload,
        r.id AS rating_id,
        r.payment_morality_score,
        r.rating,
        r.automation_status AS rating_automation_status,
        r.weighted_avg_delay,
        r.p90_delay,
        r.on_time_amount_rate,
        r.current_overdue_balance,
        r.avg_monthly_billing,
        r.broken_promise_rate,
        r.partial_payment_risk,
        r.dispute_rate,
        r.unmatched_payment_penalty,
        r.rating_mode,
        r.confidence,
        r.recommended_automation_status,
        r.period_from,
        r.period_to,
        r.invoice_count AS rating_invoice_count,
        r.paid_invoice_count,
        r.open_invoice_count,
        r.invoice_amount_total,
        r.paid_amount_total,
        r.open_amount_total,
        r.overdue_amount_total,
        r.current_max_days_overdue,
        r.unmatched_payment_rate,
        r.penalties_json,
        r.data_quality_flags_json,
        r.blocking_reasons_json,
        r.explanation,
        r.calculation_version,
        r.source_fingerprint,
        r.variables_json,
        r.calculated_at,
        d.id AS decision_id,
        d.action AS decision_action,
        d.scheduled_at AS decision_scheduled_at,
        d.channel AS decision_channel,
        d.template_key AS decision_template_key,
        d.tone AS decision_tone,
        d.reason AS decision_reason,
        d.confidence AS decision_confidence,
        d.requires_human_approval AS decision_requires_human_approval,
        d.marketa_alert AS decision_marketa_alert,
        d.dry_run AS decision_dry_run,
        d.blocked_rules_json AS decision_blocked_rules_json,
        d.message_preview AS decision_message_preview,
        d.created_at AS decision_created_at
      FROM receivable_customers c
      LEFT JOIN receivable_packages p ON p.customer_id = c.id
      LEFT JOIN (
        SELECT
          customer_id,
          ROUND(SUM(open_amount), 2) AS total_open_amount,
          ROUND(SUM(CASE WHEN due_date < date('now') THEN open_amount ELSE 0 END), 2) AS total_overdue_amount,
          COUNT(*) AS invoice_count,
          MIN(CASE WHEN due_date < date('now') THEN due_date END) AS oldest_due_date,
          MAX(CASE
            WHEN due_date < date('now') THEN CAST(julianday(date('now')) - julianday(due_date) AS INTEGER)
            ELSE 0
          END) AS max_days_overdue
        FROM receivable_invoices
        WHERE open_amount > 0
          AND status NOT IN ('paid', 'overpaid', 'legal_handoff', 'insolvency_hold')
        GROUP BY customer_id
      ) invoice_aggregate ON invoice_aggregate.customer_id = c.id
      LEFT JOIN receivable_customer_payment_ratings r ON r.id = (
        SELECT id FROM receivable_customer_payment_ratings
        WHERE customer_id = c.id
        ORDER BY calculated_at DESC
        LIMIT 1
      )
      LEFT JOIN receivable_ai_decisions d ON d.id = (
        SELECT id FROM receivable_ai_decisions
        WHERE customer_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      )
      ORDER BY COALESCE(p.max_days_overdue, invoice_aggregate.max_days_overdue, 0) DESC,
        COALESCE(p.total_open_amount, invoice_aggregate.total_open_amount, 0) DESC,
        c.company_name ASC
      LIMIT ?
    `).bind(limit).all();

    return {
      customers: (result.results || []).map(customerListItem),
      total: (result.results || []).length,
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getReceivableCustomerDetail(env, customerId) {
  const db = database(env);
  if (!db) {
    return { customer: null, apiStatus: "waiting" };
  }

  try {
    const customerRow = await db.prepare("SELECT * FROM receivable_customers WHERE id = ?").bind(customerId).first();
    if (!customerRow) {
      throw new ReceivablesStoreError("Zákazník nebyl nalezen.", 404, "receivables_customer_not_found");
    }

    const [
      invoices,
      packageRow,
      ratings,
      decisions,
      communication,
      promises,
      inbox,
      insolvency,
      legal,
      audit,
      payments
    ] = await Promise.all([
      db.prepare("SELECT * FROM receivable_invoices WHERE customer_id = ? ORDER BY due_date ASC").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_packages WHERE customer_id = ? LIMIT 1").bind(customerId).first(),
      db.prepare("SELECT * FROM receivable_customer_payment_ratings WHERE customer_id = ? ORDER BY calculated_at DESC LIMIT 20").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_ai_decisions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_communication_events WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_promises_to_pay WHERE customer_id = ? ORDER BY promised_date DESC LIMIT 50").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_inbox_messages WHERE customer_id = ? ORDER BY received_at DESC LIMIT 50").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_insolvency_checks WHERE customer_id = ? ORDER BY checked_at DESC LIMIT 20").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_legal_handoff_packages WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20").bind(customerId).all(),
      db.prepare("SELECT * FROM receivable_audit_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100").bind(customerId).all(),
      db.prepare(`
        SELECT t.*, m.invoice_id, m.matched_amount, m.confidence, m.match_method, m.status AS match_status
        FROM receivable_payment_matches m
        JOIN receivable_payment_transactions t ON t.id = m.payment_transaction_id
        WHERE m.customer_id = ?
        ORDER BY t.booking_date DESC
        LIMIT 100
      `).bind(customerId).all()
    ]);

    return {
      customer: rowToCustomer(customerRow),
      package: packageRow ? rowToPackage(packageRow) : null,
      invoices: (invoices.results || []).map(rowToInvoice),
      ratings: (ratings.results || []).map(rowToRating),
      decisions: (decisions.results || []).map(rowToDecision),
      communicationEvents: (communication.results || []).map((row) => ({
        id: cleanString(row.id),
        direction: cleanString(row.direction),
        channel: cleanString(row.channel),
        subject: cleanString(row.subject),
        body: cleanString(row.body),
        templateKey: cleanString(row.template_key),
        status: cleanString(row.status),
        createdAt: cleanString(row.created_at),
        sentAt: cleanString(row.sent_at)
      })),
      promises: (promises.results || []).map((row) => ({
        id: cleanString(row.id),
        promisedDate: cleanString(row.promised_date),
        promisedAmount: numberValue(row.promised_amount),
        status: cleanString(row.status),
        detectedText: cleanString(row.detected_text),
        createdAt: cleanString(row.created_at),
        resolvedAt: cleanString(row.resolved_at)
      })),
      inboxMessages: (inbox.results || []).map((row) => ({
        id: cleanString(row.id),
        fromAddress: cleanString(row.from_address),
        subject: cleanString(row.subject),
        bodyText: cleanString(row.body_text),
        receivedAt: cleanString(row.received_at),
        classification: cleanString(row.classification),
        sentiment: cleanString(row.sentiment),
        requiresHumanReview: booleanValue(row.requires_human_review)
      })),
      insolvencyChecks: (insolvency.results || []).map((row) => ({
        id: cleanString(row.id),
        checkedAt: cleanString(row.checked_at),
        status: cleanString(row.status),
        found: booleanValue(row.found),
        proceedingReference: cleanString(row.proceeding_reference),
        automationStopped: booleanValue(row.automation_stopped)
      })),
      legalPackages: (legal.results || []).map((row) => ({
        id: cleanString(row.id),
        status: cleanString(row.status),
        totalOpenAmount: numberValue(row.total_open_amount),
        oldestDueDate: cleanString(row.oldest_due_date),
        createdAt: cleanString(row.created_at),
        preparedBy: cleanString(row.prepared_by)
      })),
      auditLog: (audit.results || []).map((row) => ({
        id: cleanString(row.id),
        entityType: cleanString(row.entity_type),
        entityId: cleanString(row.entity_id),
        action: cleanString(row.action),
        actorUserId: cleanString(row.actor_user_id),
        reason: cleanString(row.reason),
        createdAt: cleanString(row.created_at)
      })),
      paymentTransactions: (payments.results || []).map((row) => ({
        ...rowToPaymentTransaction(row),
        invoiceId: cleanString(row.invoice_id),
        matchedAmount: numberValue(row.matched_amount),
        confidence: numberValue(row.confidence),
        matchMethod: cleanString(row.match_method),
        matchStatus: cleanString(row.match_status)
      })),
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getReceivableCase(env, caseId) {
  const db = database(env);
  if (!db) {
    return { caseFile: null, apiStatus: "waiting" };
  }

  try {
    const legal = await db.prepare("SELECT * FROM receivable_legal_handoff_packages WHERE id = ? LIMIT 1").bind(caseId).first();
    if (!legal) {
      throw new ReceivablesStoreError("Případ nebyl nalezen.", 404, "receivables_case_not_found");
    }

    const detail = await getReceivableCustomerDetail(env, legal.customer_id);
    return {
      caseFile: {
        id: cleanString(legal.id),
        status: cleanString(legal.status),
        triggerReason: cleanString(legal.trigger_reason),
        totalOpenAmount: numberValue(legal.total_open_amount),
        oldestDueDate: cleanString(legal.oldest_due_date),
        caseFile: parseJson(legal.case_file_json, {}),
        createdAt: cleanString(legal.created_at)
      },
      customer: detail.customer,
      invoices: detail.invoices,
      communicationEvents: detail.communicationEvents,
      promises: detail.promises,
      insolvencyChecks: detail.insolvencyChecks,
      auditLog: detail.auditLog,
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

async function createReceivableImportPreviewBatch(env, preview, payload = {}, user = null) {
  const db = database(env, true);
  const batchId = randomId("receivable-import-batch");
  const summary = preview.summary || {};
  const createdByUserId = cleanString(user?.id);
  const rows = Array.isArray(preview.rows) ? preview.rows : [];
  await db.batch([
    db.prepare(`
        INSERT INTO receivable_import_batches (
          id, source, import_kind, status, filename, row_count, accepted_count,
          review_count, ignored_count, created_by_user_id, parser_summary_json, raw_payload,
          content_sha256, period_from, period_to
        )
        VALUES (?, ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        batchId,
        preview.source,
        preview.importKind,
        preview.filename || "",
        numberValue(summary.rowCount),
        numberValue(summary.acceptedCount),
        numberValue(summary.reviewCount),
        numberValue(summary.ignoredCount),
        createdByUserId || null,
        safeJson(summary),
        safeJson({
          source: payload.source || "",
          filename: payload.filename || "",
          inputType: preview.inputType || "",
          persist: true
        }),
        cleanString(summary.contentSha256) || null,
        cleanString(summary.dateFrom) || null,
        cleanString(summary.dateTo) || null
      )
  ]);

  const rowStatements = rows.map((row) => db.prepare(`
    INSERT INTO receivable_import_rows (
      id, batch_id, row_number, entity_kind, preview_status, confidence,
      issue_code, issue_message, normalized_json, raw_payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("receivable-import-row"),
    batchId,
    numberValue(row.rowNumber),
    cleanString(row.entityKind),
    cleanString(row.previewStatus || "ready"),
    numberValue(row.confidence),
    cleanString(row.issueCode) || null,
    cleanString(row.issueMessage) || null,
    safeJson(row.normalized),
    safeJson(row.raw)
  ));

  for (let index = 0; index < rowStatements.length; index += 100) {
    await db.batch(rowStatements.slice(index, index + 100));
  }

  await db.batch([db.prepare(`
    INSERT INTO receivable_audit_log (
      id, entity_type, entity_id, action, actor_user_id, reason, after_json
    )
    VALUES (?, 'receivable_import_batch', ?, 'preview_import_created', ?, ?, ?)
  `).bind(
    randomId("receivable-audit"),
    batchId,
    createdByUserId || null,
    `Preview import ${preview.importKind}`,
    safeJson(summary)
  )]);
  return getReceivableImportBatch(env, batchId);
}

export async function listReceivableImportBatches(env, options = {}) {
  const db = database(env);
  if (!db) {
    return { batches: [], total: 0, apiStatus: "waiting" };
  }

  try {
    const limit = Math.max(1, Math.min(Number(options.limit) || 20, 100));
    const result = await db.prepare(`
      SELECT *
      FROM receivable_import_batches
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();
    const batches = (result.results || []).map(rowToImportBatch);
    return { batches, total: batches.length, apiStatus: "ready" };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getReceivableImportBatch(env, batchId) {
  const db = database(env);
  if (!db) {
    return { batch: null, rows: [], apiStatus: "waiting" };
  }

  try {
    const id = cleanString(batchId);
    const batch = await db.prepare("SELECT * FROM receivable_import_batches WHERE id = ? LIMIT 1").bind(id).first();
    if (!batch) {
      throw new ReceivablesStoreError("Import preview batch nebyl nalezen.", 404, "receivables_import_batch_not_found");
    }
    const rows = await db.prepare(`
      SELECT *
      FROM receivable_import_rows
      WHERE batch_id = ?
      ORDER BY row_number ASC
      LIMIT 5000
    `).bind(id).all();
    return {
      batch: rowToImportBatch(batch),
      rows: (rows.results || []).map(rowToImportRow),
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function previewReceivablesInvoiceImport(env, payload = {}, user = null) {
  const preview = buildInvoiceImportPreview(payload);
  if (payload.persist === false || payload.dryRun === true) {
    return {
      ...preview,
      persisted: false,
      apiStatus: database(env) ? "ready" : "waiting",
      message: "Preview faktur proběhl bez zápisu do D1."
    };
  }

  try {
    const saved = await createReceivableImportPreviewBatch(env, preview, payload, user);
    return {
      ...preview,
      batch: saved.batch,
      rows: saved.rows,
      persisted: true,
      apiStatus: "ready",
      message: "Preview faktur je uložený ve staging tabulkách. Ostré faktury zůstaly beze změny."
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function previewReceivablesBankTextImport(env, payload = {}, user = null) {
  const text = payload.text || "";
  const csvInput = isKbBankCsvText(text) || cleanString(payload.filename).toLowerCase().endsWith(".csv");
  const parsed = csvInput
    ? parseKbBankCsvText(text, {
      source: payload.source || "kb_csv",
      filename: payload.filename || "",
      internalAccounts: payload.internalAccounts || []
    })
    : parseKbBankStatementText(text, {
      source: payload.source || "kb_pdf_text",
      filename: payload.filename || ""
    });
  if (csvInput) parsed.contentSha256 = await kbCsvContentSha256(text);
  const preview = buildBankImportPreview(parsed, payload);

  if (payload.persist === true) {
    try {
      const saved = await createReceivableImportPreviewBatch(env, preview, payload, user);
      return {
        ...parsed,
        preview: { ...preview, rows: saved.rows },
        batch: saved.batch,
        persisted: true,
        matching: { matches: [], reviewQueue: [], threshold: 0.85 },
        apiStatus: "ready",
        message: "Preview KB plateb je uložený ve staging tabulkách. Ostré platby zůstaly beze změny."
      };
    } catch (error) {
      throw storeError(error);
    }
  }

  const db = database(env);
  if (!db) {
    return {
      ...parsed,
      preview,
      matching: { matches: [], reviewQueue: [], threshold: 0.85 },
      apiStatus: "waiting",
      message: "Parser proběhl bez D1. Párování proti fakturám čeká na migraci a data."
    };
  }

  try {
    const invoices = await listOpenInvoices(db);
    const customersResult = await db.prepare("SELECT * FROM receivable_customers LIMIT 5000").all();
    const customers = (customersResult.results || []).map(rowToCustomer);
    const payments = parsed.incomingPayments.map((transaction) => ({
      id: transaction.bankTransactionId,
      amount: transaction.amountIn,
      variableSymbol: transaction.variableSymbol,
      counterpartyName: transaction.counterpartyName,
      counterpartyAccount: transaction.counterpartyAccount,
      message: transaction.message,
      bookingDate: transaction.bookingDate,
      transactionType: transaction.transactionType
    }));
    return {
      ...parsed,
      preview,
      matching: matchReceivablePayments(invoices, payments, customers),
      apiStatus: "ready",
      message: "Parser a dry-run párování proběhly bez zápisu. Pro D1 staging použijte persist=true."
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function buildReceivablesDryRunDecision(env, payload = {}, user = null) {
  const db = database(env);
  const customerId = cleanString(payload.customerId || payload.customer_id);
  if (!db || !customerId) {
    return {
      decision: decideReceivablesNextAction(payload.input || payload, { now: payload.now }),
      apiStatus: db ? "ready" : "waiting",
      persisted: false
    };
  }

  try {
    const detail = await getReceivableCustomerDetail(env, customerId);
    const rating = detail.ratings[0] || calculateCustomerPaymentRating({
      invoices: detail.invoices,
      promises: detail.promises,
      inboxMessages: detail.inboxMessages
    });
    const receivablePackage = {
      ...(detail.package || {}),
      invoices: detail.invoices.filter((invoice) => invoice.openAmount > 0)
    };
    const activePromise = detail.promises.find((promise) => promise.status === "active");
    const decision = decideReceivablesNextAction({
      customer: {
        id: detail.customer.id,
        name: detail.customer.companyName,
        ico: detail.customer.ico,
        rating: rating.rating,
        paymentMoralityScore: rating.paymentMoralityScore,
        preferredChannel: detail.customer.preferredChannel,
        automationStatus: detail.customer.automationStatus
      },
      receivablePackage,
      history: {
        promiseDate: activePromise?.promisedDate || "",
        promiseStatus: activePromise?.status || "",
        disputeActive: detail.invoices.some((invoice) => invoice.status === "disputed")
      },
      constraints: detail.settings || defaultReceivablesSettings().working_hours
    }, { now: payload.now });

    if (payload.persist === true) {
      const id = randomId("receivable-ai-decision");
      await db.prepare(`
        INSERT INTO receivable_ai_decisions (
          id, customer_id, package_id, action, scheduled_at, channel, template_key, tone,
          reason, confidence, requires_human_approval, marketa_alert, dry_run,
          blocked_rules_json, message_preview, input_json, output_json, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).bind(
        id,
        detail.customer.id,
        detail.package?.id || "",
        decision.action,
        decision.scheduledAt,
        decision.channel,
        decision.template,
        decision.tone,
        decision.reason,
        decision.confidence,
        decision.requiresHumanApproval ? 1 : 0,
        decision.marketaAlert ? 1 : 0,
        safeJson(decision.blockedRules, []),
        decision.messagePreview,
        safeJson(payload),
        safeJson(decision),
        cleanString(user?.id)
      ).run();
      return { decision: { ...decision, id }, apiStatus: "ready", persisted: true };
    }

    return { decision, apiStatus: "ready", persisted: false };
  } catch (error) {
    throw storeError(error);
  }
}

export function recomputeInvoicePaymentState(invoice, matches = []) {
  return calculateInvoicePaymentState(invoice, matches);
}
