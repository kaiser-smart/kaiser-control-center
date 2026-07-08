import {
  createCollectionRoutesVistosKommunalPreview,
  isVistosExecuteConfigured
} from "./collection-routes-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const DATABASE_NAME = "smart-odpady";
const MODULE_KEY = "collection-routes";
const RUNNER_NAME = "collection-routes-vistos-snapshot-15m";
const RULE_ID = "collection-routes-vistos-snapshot-15m";
const TIME_ZONE = "Europe/Prague";
const SLOT_MS = 15 * 60 * 1000;

function appBaseUrl(env) {
  return cleanString(env?.APP_BASE_URL || "https://kaiser-control-center.pages.dev").replace(/\/+$/, "");
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new Error(`Cloudflare D1 binding ${DB_BINDING} není dostupný pro Trasy svozu runner.`);
  }
  return db;
}

function slotIso(now) {
  return new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString();
}

function dedupeKey(now) {
  return ["read-only-snapshot", RUNNER_NAME, slotIso(now)].join(":");
}

function isUniqueDedupeError(error) {
  const message = cleanString(error?.message);
  return message.includes("UNIQUE constraint failed") || message.includes("idx_module_automation_runs_dedupe");
}

async function insertRunnerRun(db, run) {
  await db
    .prepare(`
      INSERT INTO module_automation_runner_runs (
        id,
        module_key,
        runner_name,
        started_at,
        scheduled_at,
        finished_at,
        triggered_by,
        status,
        rules_total,
        dry_run_count,
        skipped_count,
        failed_count,
        message,
        error_code,
        d1_binding,
        database_name,
        cron,
        time_zone,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      run.id,
      MODULE_KEY,
      RUNNER_NAME,
      run.startedAt,
      nullableString(run.scheduledAt),
      nullableString(run.finishedAt),
      nullableString(run.triggeredBy),
      run.status,
      Number(run.rulesTotal || 1),
      Number(run.dryRunCount || 0),
      Number(run.skippedCount || 0),
      Number(run.failedCount || 0),
      nullableString(run.message),
      nullableString(run.errorCode),
      DB_BINDING,
      DATABASE_NAME,
      nullableString(run.cron),
      TIME_ZONE,
      run.startedAt
    )
    .run();
}

async function updateRunnerRun(db, run) {
  await db
    .prepare(`
      UPDATE module_automation_runner_runs
      SET
        finished_at = ?,
        status = ?,
        dry_run_count = ?,
        skipped_count = ?,
        failed_count = ?,
        message = ?,
        error_code = ?
      WHERE id = ?
    `)
    .bind(
      nullableString(run.finishedAt),
      run.status,
      Number(run.dryRunCount || 0),
      Number(run.skippedCount || 0),
      Number(run.failedCount || 0),
      nullableString(run.message),
      nullableString(run.errorCode),
      run.id
    )
    .run();
}

async function insertAutomationRun(db, run) {
  await db
    .prepare(`
      INSERT INTO module_automation_runs (
        id,
        rule_id,
        module_key,
        started_at,
        finished_at,
        status,
        message,
        error_code,
        triggered_by,
        dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      run.id,
      RULE_ID,
      MODULE_KEY,
      run.startedAt,
      nullableString(run.finishedAt),
      run.status,
      nullableString(run.message),
      nullableString(run.errorCode),
      nullableString(run.triggeredBy),
      nullableString(run.dedupeKey)
    )
    .run();
}

async function updateAutomationRun(db, run) {
  await db
    .prepare(`
      UPDATE module_automation_runs
      SET finished_at = ?, status = ?, message = ?, error_code = ?
      WHERE id = ?
    `)
    .bind(
      nullableString(run.finishedAt),
      run.status,
      nullableString(run.message),
      nullableString(run.errorCode),
      run.id
    )
    .run();
}

async function runPagesSnapshot(env, scheduledAt) {
  const token = cleanString(env?.COLLECTION_ROUTES_RUNNER_TOKEN);
  if (!token) {
    return {
      ok: false,
      reason: "missing_token",
      errorCode: "collection_routes_runner_token_missing",
      message: "Read-only Vistos snapshot přeskočen: worker nemá nastavený COLLECTION_ROUTES_RUNNER_TOKEN."
    };
  }

  const response = await fetch(`${appBaseUrl(env)}/api/collection-routes/vistos/kommunal-preview-internal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      scheduledAt,
      runner: RUNNER_NAME
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      reason: "pages_snapshot_failed",
      errorCode: payload.code || "collection_routes_pages_snapshot_failed",
      message: payload.error || "Interní Pages snapshot Tras svozu selhal."
    };
  }

  return {
    ok: true,
    preview: payload.preview || payload
  };
}

export async function runCollectionRoutesSnapshotAutomation(env, options = {}) {
  const db = database(env);
  const now = new Date(Number(options.scheduledTime || Date.now()));
  const startedAt = new Date().toISOString();
  const runnerRunId = randomId("module-automation-runner-run");
  const automationRunId = randomId("module-automation-run");
  const key = dedupeKey(now);
  const cron = cleanString(options.cron || "*/15 * * * *");
  const triggeredBy = cleanString(options.triggeredBy || "cloudflare-cron");

  await insertRunnerRun(db, {
    id: runnerRunId,
    startedAt,
    scheduledAt: now.toISOString(),
    triggeredBy,
    status: "running",
    rulesTotal: 1,
    cron,
    message: "Cloud runner spustil read-only Vistos snapshot Tras svozu. Ostré trasy, SMS/e-maily ani zápis do Vistosu nejsou povolené."
  });

  try {
    await insertAutomationRun(db, {
      id: automationRunId,
      startedAt,
      status: "running",
      message: "Read-only Vistos snapshot Tras svozu spuštěn.",
      triggeredBy,
      dedupeKey: key
    });
  } catch (error) {
    if (!isUniqueDedupeError(error)) {
      throw error;
    }
    const finishedAt = new Date().toISOString();
    await updateRunnerRun(db, {
      id: runnerRunId,
      finishedAt,
      status: "skipped",
      skippedCount: 1,
      message: `Běh přeskočen: snapshot pro slot ${slotIso(now)} už existuje.`,
      errorCode: ""
    });
    return {
      mode: "read-only-snapshot",
      runner: RUNNER_NAME,
      runnerRunId,
      moduleKey: MODULE_KEY,
      status: "skipped",
      message: `Běh přeskočen: snapshot pro slot ${slotIso(now)} už existuje.`,
      dryRunCount: 0,
      skippedCount: 1,
      errorCount: 0,
      cron,
      dedupeKey: key
    };
  }

  try {
    let result;
    if (isVistosExecuteConfigured(env)) {
      result = await createCollectionRoutesVistosKommunalPreview(env, {
        id: `cloud-runner:${RUNNER_NAME}`
      }, {
        derivedRowsLimit: 0
      });
    } else {
      const pagesResult = await runPagesSnapshot(env, now.toISOString());
      if (!pagesResult.ok) {
        const finishedAt = new Date().toISOString();
        await updateAutomationRun(db, {
          id: automationRunId,
          finishedAt,
          status: "skipped",
          message: pagesResult.message,
          errorCode: pagesResult.errorCode
        });
        await updateRunnerRun(db, {
          id: runnerRunId,
          finishedAt,
          status: "skipped",
          dryRunCount: 0,
          skippedCount: 1,
          failedCount: 0,
          message: pagesResult.message,
          errorCode: pagesResult.errorCode
        });
        return {
          mode: "read-only-snapshot",
          runner: RUNNER_NAME,
          runnerRunId,
          moduleKey: MODULE_KEY,
          status: "skipped",
          message: pagesResult.message,
          dryRunCount: 0,
          skippedCount: 1,
          errorCount: 0,
          cron,
          dedupeKey: key
        };
      }
      result = pagesResult.preview;
    }

    const finishedAt = new Date().toISOString();
    const summary = result.summary || {};
    const batch = result.batch || {};
    const ready = result.apiStatus === "ready";
    const message = ready
      ? `Read-only Vistos snapshot uložen: batch ${batch.id || "-"}, řádků ${summary.rowCount || batch.rowCount || 0}, upozornění ${summary.issueCount || batch.issueCount || 0}.`
      : `Read-only Vistos snapshot nevznikl v plném režimu: ${summary.message || batch.message || result.apiStatus || "čeká"}.`;
    const status = ready ? "dry_run" : "skipped";

    await updateAutomationRun(db, {
      id: automationRunId,
      finishedAt,
      status,
      message,
      errorCode: ready ? "" : "vistos_snapshot_waiting"
    });
    await updateRunnerRun(db, {
      id: runnerRunId,
      finishedAt,
      status,
      dryRunCount: ready ? 1 : 0,
      skippedCount: ready ? 0 : 1,
      failedCount: 0,
      message,
      errorCode: ready ? "" : "vistos_snapshot_waiting"
    });

    return {
      mode: "read-only-snapshot",
      runner: RUNNER_NAME,
      runnerRunId,
      moduleKey: MODULE_KEY,
      status,
      message,
      batchId: batch.id || "",
      rowCount: summary.rowCount || batch.rowCount || 0,
      issueCount: summary.issueCount || batch.issueCount || 0,
      dryRunCount: ready ? 1 : 0,
      skippedCount: ready ? 0 : 1,
      errorCount: 0,
      cron,
      dedupeKey: key
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = "Read-only Vistos snapshot Tras svozu selhal. Poslední platný D1 snapshot zůstává zachovaný.";
    await updateAutomationRun(db, {
      id: automationRunId,
      finishedAt,
      status: "error",
      message,
      errorCode: "collection_routes_snapshot_failed"
    });
    await updateRunnerRun(db, {
      id: runnerRunId,
      finishedAt,
      status: "error",
      failedCount: 1,
      message,
      errorCode: "collection_routes_snapshot_failed"
    });
    throw error;
  }
}
