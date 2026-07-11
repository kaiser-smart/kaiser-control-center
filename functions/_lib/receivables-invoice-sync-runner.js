const DB_BINDING = "SMART_ODPADY_DB";
const DATABASE_NAME = "smart-odpady";
const MODULE_KEY = "receivables";
const RUNNER_NAME = "receivables-vistos-invoice-sync";
const RULE_ID = "receivables-vistos-invoice-sync";
const TIME_ZONE = "Europe/Prague";
const SLOT_MS = 15 * 60 * 1000;
const DAILY_HOURS = new Set([6, 10, 14, 18]);

function clean(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  return clean(value) || null;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) throw new Error(`Cloudflare D1 binding ${DB_BINDING} není dostupný pro Pohledávky runner.`);
  return db;
}

function appBaseUrl(env) {
  return clean(env?.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

function slotIso(now) {
  return new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString();
}

function localTimeParts(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function scheduledReceivablesAction(now) {
  const parts = localTimeParts(now);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (parts.weekday === "Sun" && hour === 2 && minute === 30) return "full";
  if (minute === 30 && DAILY_HOURS.has(hour)) return "incremental";
  return "";
}

async function pendingAction(db) {
  const row = await db.prepare(`
    SELECT import_kind, status
    FROM receivable_import_batches
    WHERE source = 'vistos'
      AND import_kind IN ('vistos_invoice_snapshot', 'vistos_invoice_incremental')
    ORDER BY created_at DESC
    LIMIT 1
  `).first();
  if (
    row?.import_kind === "vistos_invoice_snapshot"
    && ["snapshot_capped", "snapshot_running"].includes(row?.status)
  ) return "continue_full";
  if (row?.import_kind === "vistos_invoice_incremental" && row?.status === "incremental_running") {
    return "continue_incremental";
  }
  return "";
}

function isUniqueDedupeError(error) {
  const message = clean(error?.message);
  return message.includes("UNIQUE constraint failed") || message.includes("idx_module_automation_runs_dedupe");
}

async function insertRuns(db, run) {
  await db.batch([
    db.prepare(`
      INSERT INTO module_automation_runner_runs (
        id, module_key, runner_name, started_at, scheduled_at, triggered_by, status,
        rules_total, message, d1_binding, database_name, cron, time_zone, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'running', 1, ?, ?, ?, ?, ?, ?)
    `).bind(
      run.runnerRunId, MODULE_KEY, RUNNER_NAME, run.startedAt, run.scheduledAt,
      run.triggeredBy, run.message, DB_BINDING, DATABASE_NAME, run.cron, TIME_ZONE, run.startedAt
    ),
    db.prepare(`
      INSERT INTO module_automation_runs (
        id, rule_id, module_key, started_at, status, message, triggered_by, dedupe_key
      ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)
    `).bind(
      run.automationRunId, RULE_ID, MODULE_KEY, run.startedAt, run.message, run.triggeredBy, run.dedupeKey
    )
  ]);
}

async function finishRuns(db, run, result) {
  await db.batch([
    db.prepare(`
      UPDATE module_automation_runs
      SET finished_at = ?, status = ?, message = ?, error_code = ?
      WHERE id = ?
    `).bind(result.finishedAt, result.status, result.message, nullable(result.errorCode), run.automationRunId),
    db.prepare(`
      UPDATE module_automation_runner_runs
      SET finished_at = ?, status = ?, dry_run_count = ?, skipped_count = ?, failed_count = ?,
          message = ?, error_code = ?
      WHERE id = ?
    `).bind(
      result.finishedAt, result.status, result.status === "dry_run" ? 1 : 0,
      result.status === "skipped" ? 1 : 0, result.status === "error" ? 1 : 0,
      result.message, nullable(result.errorCode), run.runnerRunId
    )
  ]);
}

async function callPages(env, action, scheduledAt) {
  const token = clean(env?.RECEIVABLES_RUNNER_TOKEN);
  if (!token) {
    return { ok: false, code: "receivables_runner_token_missing", message: "Runner nemá nastavený RECEIVABLES_RUNNER_TOKEN." };
  }
  const response = await fetch(`${appBaseUrl(env)}/api/receivables/vistos/invoice-sync-internal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, scheduledAt, runner: RUNNER_NAME })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      code: payload.code || "receivables_pages_sync_failed",
      message: payload.error || "Interní Pages synchronizace Pohledávek selhala."
    };
  }
  return { ok: true, payload };
}

export async function runReceivablesInvoiceSyncAutomation(env, options = {}) {
  const db = database(env);
  const now = new Date(Number(options.scheduledTime || Date.now()));
  const action = await pendingAction(db) || scheduledReceivablesAction(now);
  if (!action) {
    return { mode: "staging-only", status: "not_scheduled", moduleKey: MODULE_KEY, action: "" };
  }

  const startedAt = new Date().toISOString();
  const localParts = localTimeParts(now);
  const scheduledKey = [localParts.year, localParts.month, localParts.day, localParts.hour, localParts.minute].join("");
  const actionKey = action === "full" || action === "incremental" ? scheduledKey : slotIso(now);
  const run = {
    runnerRunId: randomId("module-automation-runner-run"),
    automationRunId: randomId("module-automation-run"),
    startedAt,
    scheduledAt: now.toISOString(),
    triggeredBy: clean(options.triggeredBy) || "cloudflare-cron",
    cron: clean(options.cron) || "*/15 * * * *",
    dedupeKey: [RUNNER_NAME, action, actionKey].join(":"),
    message: `Staging-only Vistos invoice sync spuštěn: ${action}. Ledger, ratingy, ISIR a komunikace jsou vypnuté.`
  };

  try {
    await insertRuns(db, run);
  } catch (error) {
    if (!isUniqueDedupeError(error)) throw error;
    return {
      mode: "staging-only",
      status: "skipped",
      moduleKey: MODULE_KEY,
      action,
      dedupeKey: run.dedupeKey,
      message: "Běh tohoto patnáctiminutového slotu už existuje."
    };
  }

  try {
    const pages = await callPages(env, action, now.toISOString());
    const finishedAt = new Date().toISOString();
    if (!pages.ok) {
      await finishRuns(db, run, {
        finishedAt,
        status: "error",
        message: pages.message,
        errorCode: pages.code
      });
      return {
        mode: "staging-only", status: "error", moduleKey: MODULE_KEY, action,
        runnerRunId: run.runnerRunId, message: pages.message, errorCode: pages.code
      };
    }

    const result = pages.payload.result || {};
    const summary = result.summary || result.snapshot?.summary || {};
    const batch = result.batch || result.snapshot?.batch || {};
    const message = `Staging-only Vistos invoice sync dokončen: ${action}, batch ${batch.id || "-"}, řádků ${summary.loadedRows ?? batch.rowCount ?? 0}/${summary.totalRows ?? batch.rowCount ?? 0}.`;
    await finishRuns(db, run, { finishedAt, status: "dry_run", message, errorCode: "" });
    return {
      mode: "staging-only",
      status: "dry_run",
      moduleKey: MODULE_KEY,
      action,
      runnerRunId: run.runnerRunId,
      batchId: batch.id || "",
      rowCount: summary.loadedRows ?? batch.rowCount ?? 0,
      totalRows: summary.totalRows ?? batch.rowCount ?? 0,
      message,
      writesLedger: false,
      calculatesRealRating: false,
      sendsCustomerCommunication: false,
      startsAutomation: false,
      importsKbPayments: false
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = "Staging-only Vistos invoice sync selhal; ledger, ratingy a komunikace zůstaly beze změny.";
    await finishRuns(db, run, { finishedAt, status: "error", message, errorCode: "receivables_invoice_sync_failed" });
    throw error;
  }
}
