import {
  downloadReceivablesKbPayments,
  receivablesKbApiError,
  receivablesKbApiReadiness
} from "./receivables-kb-api-client.js";

const DB_BINDING = "SMART_ODPADY_DB";
const MODULE_KEY = "receivables";
const RULE_ID = "receivables-kb-payment-sync";
const SOURCE = "kb_api";
const IMPORT_KIND = "bank_transactions";
const RATE_LIMIT_WINDOW_MS = 61 * 60 * 1000;

export const RECEIVABLES_KB_PAYMENT_CRON = "7 */2 * * *";

export class ReceivablesKbPaymentSyncError extends Error {
  constructor(message, status = 500, code = "receivables_kb_payment_sync_error", details = {}) {
    super(message);
    this.name = "ReceivablesKbPaymentSyncError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function safeJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(clean(value));
  } catch {
    return fallback;
  }
}

function boundedInteger(value, fallback, min, max) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function stableId(prefix, value) {
  return `${prefix}:${clean(value)}`;
}

function database(env, required = true) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new ReceivablesKbPaymentSyncError(
      "Databáze Pohledávek není nastavená.",
      503,
      "receivables_database_missing"
    );
  }
  return db;
}

function dateFromSql(value) {
  const text = clean(value);
  if (!text) return null;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoWithoutMilliseconds(value) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function receivablesKbPaymentWindow(nowValue, latestBatch = null, env = {}) {
  const now = new Date(nowValue || Date.now());
  if (!Number.isFinite(now.getTime())) {
    throw new ReceivablesKbPaymentSyncError(
      "Čas synchronizace KB není platný.",
      400,
      "receivables_kb_sync_time_invalid"
    );
  }
  const initialLookbackDays = boundedInteger(env.KB_ADAA_INITIAL_LOOKBACK_DAYS, 90, 1, 730);
  const overlapDays = boundedInteger(env.KB_ADAA_OVERLAP_DAYS, 7, 1, 30);
  const latestPeriodTo = dateFromSql(latestBatch?.period_to);
  const lookbackDays = latestPeriodTo ? overlapDays : initialLookbackDays;
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return {
    fromDateTime: isoWithoutMilliseconds(from),
    toDateTime: isoWithoutMilliseconds(now),
    lookbackDays,
    mode: latestPeriodTo ? "incremental_overlap" : "initial_backfill"
  };
}

async function latestBatch(db) {
  return db.prepare(`
    SELECT * FROM receivable_import_batches
    WHERE source = ? AND import_kind = ? AND status = 'imported'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(SOURCE, IMPORT_KIND).first();
}

async function latestRun(db) {
  return db.prepare(`
    SELECT * FROM module_automation_runs
    WHERE module_key = ? AND rule_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).bind(MODULE_KEY, RULE_ID).first();
}

function nextCronAt(nowValue = Date.now()) {
  const now = new Date(nowValue);
  const next = new Date(now);
  next.setUTCMinutes(7, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  if (next.getUTCHours() % 2 !== 0) next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

function environmentAutomationEnabled(env = {}) {
  return clean(env.KB_ADAA_PAYMENT_SYNC_ENABLED).toLowerCase() !== "false";
}

async function paymentSyncRule(db) {
  if (!db) return null;
  return db.prepare("SELECT * FROM module_rules WHERE id = ? LIMIT 1").bind(RULE_ID).first();
}

async function ensurePaymentSyncRule(db, nowValue = Date.now()) {
  const now = new Date(nowValue).toISOString();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO module_rules (
      id, module_key, title, description, type, status, conditions_json, actions_json,
      is_automation, trigger_type, schedule_cron, event_name, cloud_runner,
      next_run_at, created_by_user_id, created_at, updated_by_user_id, updated_at
    ) VALUES (?, ?, ?, ?, 'automation', 'active', ?, ?, 1, 'time', ?, '', ?, ?, ?, ?, ?, ?)
  `).bind(
    RULE_ID,
    MODULE_KEY,
    "Stahování příchozích plateb z KB",
    "Cloudový import zaúčtovaných příchozích transakcí BOOK/CREDIT z KB Account Direct Access API.",
    safeJson({ provider: "Komerční banka", statuses: ["BOOK"], directions: ["CREDIT"] }, {}),
    safeJson({ import: "receivable_payment_transactions", paymentOrders: false, customerCommunication: false }, {}),
    RECEIVABLES_KB_PAYMENT_CRON,
    "kaiser-receivables-kb-payment-runner",
    nextCronAt(nowValue),
    "system-kb-payment-sync",
    now,
    "system-kb-payment-sync",
    now
  ).run();
  if (Number(result?.meta?.changes) > 0) {
    await db.prepare(`
      INSERT INTO module_rule_audit_log (
        id, rule_id, module_key, action, changed_by_user_id, changed_at, before_json, after_json, note
      ) VALUES (?, ?, ?, 'created', ?, ?, NULL, ?, ?)
    `).bind(
      randomId("module-rule-audit"),
      RULE_ID,
      MODULE_KEY,
      "system-kb-payment-sync",
      now,
      safeJson({ status: "active", scheduleCron: RECEIVABLES_KB_PAYMENT_CRON, cloudRunner: "kaiser-receivables-kb-payment-runner" }, {}),
      "Automatizace zaregistrovaná cloudovým runnerem."
    ).run();
  }
  return paymentSyncRule(db);
}

export async function receivablesKbPaymentSyncStatus(env = {}) {
  const readiness = receivablesKbApiReadiness(env);
  const db = database(env, false);
  let batch = null;
  let run = null;
  let rule = null;
  if (db) {
    [batch, run, rule] = await Promise.all([latestBatch(db), latestRun(db), paymentSyncRule(db)]);
  }
  const summary = parseJson(batch?.parser_summary_json, {});
  return {
    apiStatus: !db ? "waiting" : readiness.ready ? "ready" : "waiting_configuration",
    provider: "Komerční banka",
    service: "Account Direct Access API v2",
    mode: "cloud_payment_import",
    configured: readiness.ready,
    missingEnv: readiness.missingEnv,
    automationEnabled: environmentAutomationEnabled(env) && (!rule || rule.status === "active"),
    automationRule: rule ? {
      id: rule.id,
      status: rule.status,
      lastRunAt: rule.last_run_at,
      nextRunAt: rule.next_run_at
    } : null,
    cron: RECEIVABLES_KB_PAYMENT_CRON,
    nextScheduledAt: nextCronAt(),
    lastRun: run ? {
      id: run.id,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      status: run.status,
      message: run.message,
      errorCode: run.error_code,
      triggeredBy: run.triggered_by
    } : null,
    lastBatch: batch ? {
      id: batch.id,
      createdAt: batch.created_at,
      periodFrom: batch.period_from,
      periodTo: batch.period_to,
      rowCount: Number(batch.row_count) || 0,
      acceptedCount: Number(batch.accepted_count) || 0,
      ignoredCount: Number(batch.ignored_count) || 0,
      summary
    } : null,
    safety: {
      readsKbApi: true,
      writesPaymentTransactions: true,
      createsPaymentOrders: false,
      importsDebits: false,
      importsPendingTransactions: false,
      reconcilesInvoicesAutomatically: false,
      sendsCustomerCommunication: false
    }
  };
}

function rateLimitDetails(run, now) {
  const startedAt = dateFromSql(run?.started_at);
  if (!startedAt) return null;
  const elapsed = now.getTime() - startedAt.getTime();
  if (elapsed < 0 || elapsed >= RATE_LIMIT_WINDOW_MS) return null;
  return {
    lastStartedAt: startedAt.toISOString(),
    retryAt: new Date(startedAt.getTime() + RATE_LIMIT_WINDOW_MS).toISOString()
  };
}

function isRunDedupeConflict(error) {
  const message = clean(error?.message);
  return message.includes("UNIQUE constraint failed")
    || message.includes("idx_module_automation_runs_dedupe");
}

async function insertRun(db, run) {
  await db.batch([
    db.prepare(`
      INSERT INTO module_automation_runs (
        id, rule_id, module_key, started_at, status, message, triggered_by, dedupe_key
      ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)
    `).bind(
      run.id,
      RULE_ID,
      MODULE_KEY,
      run.startedAt,
      run.message,
      run.triggeredBy,
      run.dedupeKey
    ),
    db.prepare(`
      INSERT INTO receivable_audit_log (
        id, entity_type, entity_id, action, actor_user_id, reason, after_json, created_at
      ) VALUES (?, 'kb_payment_sync', ?, 'kb_api_payment_sync_started', ?, ?, ?, ?)
    `).bind(
      randomId("receivable-audit"),
      run.id,
      run.actorUserId || null,
      run.triggeredBy,
      safeJson({ window: run.window, createsPaymentOrders: false, sendsCustomerCommunication: false }, {}),
      run.startedAt
    )
  ]);
}

async function finishRun(db, run, result) {
  const finishedAt = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE module_automation_runs
      SET finished_at = ?, status = ?, message = ?, error_code = ?
      WHERE id = ?
    `).bind(finishedAt, result.status, result.message, result.errorCode || null, run.id),
    db.prepare(`
      INSERT INTO receivable_audit_log (
        id, entity_type, entity_id, action, actor_user_id, reason, after_json, created_at
      ) VALUES (?, 'kb_payment_sync', ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("receivable-audit"),
      run.id,
      result.status === "completed" ? "kb_api_payment_sync_completed" : "kb_api_payment_sync_failed",
      run.actorUserId || null,
      result.message,
      safeJson(result.audit || { errorCode: result.errorCode || "" }, {}),
      finishedAt
    ),
    db.prepare(`
      UPDATE module_rules
      SET last_run_at = ?, next_run_at = ?, last_run_status = ?, last_run_message = ?,
          updated_by_user_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      run.startedAt,
      nextCronAt(finishedAt),
      result.status,
      result.message,
      "system-kb-payment-sync",
      finishedAt,
      RULE_ID
    )
  ]);
  return finishedAt;
}

async function existingPaymentKeys(db, periodFrom) {
  const result = await db.prepare(`
    SELECT source, bank_transaction_id
    FROM receivable_payment_transactions
    WHERE source LIKE 'kb_api:%' AND booking_date >= ?
  `).bind(clean(periodFrom).slice(0, 10)).all();
  return new Set((result.results || []).map((row) => `${clean(row.source)}\n${clean(row.bank_transaction_id)}`));
}

async function runStatements(db, statements) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

async function persistPayments(db, downloaded, window, run) {
  const batchId = randomId("receivable-import");
  const existing = await existingPaymentKeys(db, window.fromDateTime);
  let insertedCount = 0;
  let updatedCount = 0;
  const statements = [];
  for (const payment of downloaded.payments) {
    const key = `${payment.source}\n${payment.bankTransactionId}`;
    if (existing.has(key)) updatedCount += 1;
    else {
      insertedCount += 1;
      existing.add(key);
    }
    const paymentId = stableId("receivable-payment", `${payment.source}:${payment.bankTransactionId}`);
    const rawPayload = safeJson({
      provider: "Komerční banka",
      api: "ADAA v2",
      status: payment.status,
      direction: payment.direction,
      targetIban: payment.targetIban,
      transaction: payment.raw
    }, {});
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO receivable_payment_transactions (
          id, source, bank_transaction_id, booking_date, value_date, transaction_type, amount,
          currency, variable_symbol, constant_symbol, specific_symbol, counterparty_name,
          counterparty_account, message, raw_payload, import_batch_id, data_quality_flags_json, content_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
      `).bind(
        paymentId,
        payment.source,
        payment.bankTransactionId,
        payment.bookingDate || null,
        payment.valueDate || null,
        payment.transactionType || null,
        payment.amount,
        payment.currency,
        payment.variableSymbol || null,
        payment.constantSymbol || null,
        payment.specificSymbol || null,
        payment.counterpartyName || null,
        payment.counterpartyAccount || null,
        payment.message || null,
        rawPayload,
        batchId,
        payment.bankTransactionId
      ),
      db.prepare(`
        UPDATE receivable_payment_transactions
        SET booking_date = ?, value_date = ?, transaction_type = ?, amount = ?, currency = ?,
            variable_symbol = ?, constant_symbol = ?, specific_symbol = ?, counterparty_name = ?,
            counterparty_account = ?, message = ?, raw_payload = ?, import_batch_id = ?,
            data_quality_flags_json = '[]', content_hash = ?
        WHERE source = ? AND bank_transaction_id = ?
      `).bind(
        payment.bookingDate || null,
        payment.valueDate || null,
        payment.transactionType || null,
        payment.amount,
        payment.currency,
        payment.variableSymbol || null,
        payment.constantSymbol || null,
        payment.specificSymbol || null,
        payment.counterpartyName || null,
        payment.counterpartyAccount || null,
        payment.message || null,
        rawPayload,
        batchId,
        payment.bankTransactionId,
        payment.source,
        payment.bankTransactionId
      )
    );
  }

  const batchSummary = {
    ...downloaded.summary,
    insertedCount,
    updatedCount,
    periodMode: window.mode,
    triggeredBy: run.triggeredBy
  };
  await db.prepare(`
    INSERT INTO receivable_import_batches (
      id, source, import_kind, status, filename, row_count, accepted_count, review_count,
      ignored_count, created_by_user_id, created_at, updated_at, parser_summary_json,
      raw_payload, period_from, period_to
    ) VALUES (?, ?, ?, 'importing', NULL, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    batchId,
    SOURCE,
    IMPORT_KIND,
    downloaded.summary.transactionCount,
    downloaded.payments.length,
    downloaded.summary.ignoredCount,
    run.actorUserId || null,
    run.startedAt,
    run.startedAt,
    safeJson(batchSummary, {}),
    safeJson({ accountCount: downloaded.summary.accountCount, createsPaymentOrders: false }, {}),
    window.fromDateTime,
    window.toDateTime
  ).run();
  try {
    await runStatements(db, statements);
    await db.prepare(`
      UPDATE receivable_import_batches
      SET status = 'imported', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), batchId).run();
  } catch (error) {
    await db.prepare(`
      UPDATE receivable_import_batches
      SET status = 'error', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), batchId).run();
    throw error;
  }
  return { batchId, insertedCount, updatedCount, summary: batchSummary };
}

export async function syncReceivablesKbPayments(env = {}, options = {}) {
  const readiness = receivablesKbApiReadiness(env);
  if (!readiness.ready) {
    throw new ReceivablesKbPaymentSyncError(
      "KB API není nakonfigurované pro stahování plateb.",
      503,
      "receivables_kb_api_not_configured",
      { missingEnv: readiness.missingEnv }
    );
  }
  if (!environmentAutomationEnabled(env) && options.triggeredBy === "cloudflare-cron") {
    return { status: "disabled", mode: "cloud_payment_import", importsKbPayments: false };
  }

  const db = database(env);
  const now = new Date(options.now || Date.now());
  await ensurePaymentSyncRule(db, now);
  const [batch, previousRun] = await Promise.all([latestBatch(db), latestRun(db)]);
  const limited = rateLimitDetails(previousRun, now);
  if (limited) {
    throw new ReceivablesKbPaymentSyncError(
      "Bezpečný interval KB dovolí další stažení nejdříve po 61 minutách.",
      429,
      "receivables_kb_sync_rate_limited",
      limited
    );
  }
  const window = receivablesKbPaymentWindow(now, batch, env);
  const startedAt = now.toISOString();
  const run = {
    id: randomId("module-automation-run"),
    startedAt,
    triggeredBy: clean(options.triggeredBy) || "manual-ui",
    actorUserId: clean(options.user?.id),
    dedupeKey: `kb-payments:${startedAt.slice(0, 13)}`,
    message: `Stahování zaúčtovaných příchozích plateb z KB: ${window.fromDateTime} až ${window.toDateTime}.`,
    window
  };
  try {
    await insertRun(db, run);
  } catch (error) {
    if (isRunDedupeConflict(error)) {
      throw new ReceivablesKbPaymentSyncError(
        "Stahování plateb z KB už v tomto časovém okně běží nebo proběhlo.",
        429,
        "receivables_kb_sync_already_started",
        { dedupeKey: run.dedupeKey }
      );
    }
    throw error;
  }

  try {
    const downloaded = await downloadReceivablesKbPayments(env, {
      fromDateTime: window.fromDateTime,
      toDateTime: window.toDateTime,
      fetchImpl: options.fetchImpl
    });
    const persisted = await persistPayments(db, downloaded, window, run);
    const message = `KB platby staženy: nové ${persisted.insertedCount}, aktualizované ${persisted.updatedCount}, ignorované ${downloaded.summary.ignoredCount}.`;
    const finishedAt = await finishRun(db, run, {
      status: "completed",
      message,
      audit: { batchId: persisted.batchId, window, ...persisted.summary }
    });
    return {
      apiStatus: "ready",
      status: "completed",
      mode: "cloud_payment_import",
      runId: run.id,
      batchId: persisted.batchId,
      startedAt,
      finishedAt,
      window,
      summary: persisted.summary,
      message,
      importsKbPayments: true,
      writesPaymentTransactions: true,
      reconcilesInvoicesAutomatically: false,
      createsPaymentOrders: false,
      sendsCustomerCommunication: false
    };
  } catch (error) {
    const normalized = receivablesKbPaymentSyncError(error);
    await finishRun(db, run, {
      status: "error",
      message: normalized.message,
      errorCode: normalized.code,
      audit: { window, errorCode: normalized.code, details: normalized.details }
    });
    throw normalized;
  }
}

export async function runReceivablesKbPaymentSyncAutomation(env = {}, options = {}) {
  const db = database(env, false);
  if (db) {
    const rule = await ensurePaymentSyncRule(db, options.scheduledTime || Date.now());
    if (rule?.status !== "active" || !environmentAutomationEnabled(env)) {
      return {
        mode: "cloud_payment_import",
        status: "disabled",
        importsKbPayments: false,
        automationRuleStatus: rule?.status || "missing"
      };
    }
  }
  const readiness = receivablesKbApiReadiness(env);
  if (!readiness.ready) {
    return {
      mode: "cloud_payment_import",
      status: "waiting_configuration",
      missingEnv: readiness.missingEnv,
      importsKbPayments: false
    };
  }
  try {
    return await syncReceivablesKbPayments(env, {
      ...options,
      now: options.scheduledTime || Date.now(),
      triggeredBy: options.triggeredBy || "cloudflare-cron"
    });
  } catch (error) {
    const normalized = receivablesKbPaymentSyncError(error);
    return {
      mode: "cloud_payment_import",
      status: normalized.status === 429 ? "skipped" : "error",
      errorCode: normalized.code,
      message: normalized.message,
      importsKbPayments: false,
      createsPaymentOrders: false,
      sendsCustomerCommunication: false
    };
  }
}

export function receivablesKbPaymentSyncError(error) {
  if (error instanceof ReceivablesKbPaymentSyncError) return error;
  const apiError = receivablesKbApiError(error);
  if (apiError) {
    return new ReceivablesKbPaymentSyncError(apiError.message, apiError.status, apiError.code, apiError.details);
  }
  return new ReceivablesKbPaymentSyncError("Stahování plateb z KB selhalo.");
}
