import { getModuleDatabase } from "./databases.js";
import { getAuditDatabase } from "./databases.js";

const DEFAULT_TARGET_URL = "https://smart-odpady.ai/";
const VALID_STATUS = new Set(["OK", "WARNING", "ERROR", "NEOVĚŘENO"]);

export class ProductionMonitorStoreError extends Error {
  constructor(message, status = 400, code = "production_monitor_error") {
    super(message);
    this.name = "ProductionMonitorStoreError";
    this.status = status;
    this.code = code;
  }
}

function monitorDb(env, required = false) {
  const db = getModuleDatabase(env, { moduleName: "production-monitor-store", allowedDomains: ["audit","core","messages"], defaultDomain: "audit", required: false });

  if (!db && required) {
    throw new ProductionMonitorStoreError(
      "Databáze monitoringu není nastavená. Chybí D1 binding DB_AUDIT / DB_CORE / DB_MESSAGES.",
      503,
      "production_monitor_database_missing"
    );
  }

  return db;
}

export function productionMonitorApiStatus(env) {
  return monitorDb(env) ? "ready" : "waiting";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function normalizeStatus(value, fallback = "NEOVĚŘENO") {
  const status = cleanString(value).toUpperCase();
  return VALID_STATUS.has(status) ? status : fallback;
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return new ProductionMonitorStoreError(
      "Tabulky monitoringu nejsou v D1 připravené. DB migrace je zastavená, proto je stav monitoringu NEOVĚŘENO.",
      503,
      "production_monitor_migration_missing"
    );
  }

  console.error("production_monitor.store_failed", { message });
  return new ProductionMonitorStoreError("Monitoring se teď nepodařilo načíst nebo uložit.", 500, "production_monitor_store_failed");
}

function monitorRunInput(input = {}) {
  const checkedItems = Array.isArray(input.checkedItems) ? input.checkedItems : [];
  const errors = Array.isArray(input.errors) ? input.errors : [];
  return {
    id: cleanString(input.id) || randomId("monitor-run"),
    createdAt: cleanString(input.createdAt) || nowIso(),
    source: cleanString(input.source) || "read-only-status",
    targetUrl: cleanString(input.targetUrl) || DEFAULT_TARGET_URL,
    status: normalizeStatus(input.status, "WARNING"),
    httpStatus: Number.isFinite(Number(input.httpStatus)) ? Number(input.httpStatus) : null,
    durationMs: Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 0,
    checkedItems,
    errors,
    buildVersion: cleanString(input.buildVersion),
    commitHash: cleanString(input.commitHash),
    notes: cleanString(input.notes)
  };
}

export async function latestProductionMonitorRun(env) {
  return null;
}

async function countRows(db, sql, ...bindings) {
  const row = await db.prepare(sql).bind(...bindings).first();
  return Number(row?.count || 0);
}

async function latestDatabaseCapacity(env) {
  const auditDb = getAuditDatabase(env, { required: false });
  if (!auditDb) return { status: "NEOVĚŘENO", databases: [], legacyDatabase: null, note: "Chybí binding DB_AUDIT." };
  try {
    const result = await auditDb.prepare(`
      SELECT s.*
      FROM database_capacity_snapshots s
      INNER JOIN (
        SELECT database_domain, MAX(recorded_at) AS recorded_at
        FROM database_capacity_snapshots
        GROUP BY database_domain
      ) latest
        ON latest.database_domain = s.database_domain
       AND latest.recorded_at = s.recorded_at
      ORDER BY s.usage_percent DESC
    `).all();
    const allDatabases = result.results || [];
    const databases = allDatabases.filter((item) =>
      ["core", "messages", "audit", "archive"].includes(cleanString(item.database_domain).toLowerCase())
    );
    const legacyDatabase = allDatabases.find((item) =>
      cleanString(item.database_domain).toLowerCase() === "legacy"
    ) || null;
    const levels = new Set(databases.map((item) => String(item.level || "")));
    const status = levels.has("blocked") || levels.has("critical")
      ? "ERROR"
      : levels.has("archive") || levels.has("reduced_logging") || levels.has("warning")
        ? "WARNING"
        : databases.length ? "OK" : "NEOVĚŘENO";
    return {
      status,
      databases,
      legacyDatabase,
      modularComplete: databases.length === 4,
      recordedAt: databases.reduce((latest, item) =>
        cleanString(item.recorded_at) > latest ? cleanString(item.recorded_at) : latest, ""),
      note: databases.length === 4
        ? ""
        : `Kapacitní cron má ${databases.length} ze 4 modulárních databází.`
    };
  } catch (error) {
    return {
      status: "NEOVĚŘENO",
      databases: [],
      legacyDatabase: null,
      note: `Kapacitu nelze načíst: ${cleanString(error?.message) || "neznámá chyba"}`
    };
  }
}

const TERMINAL_CRON_STATUSES = new Set([
  "blocked",
  "completed",
  "dry_run",
  "error",
  "failed",
  "invalidated",
  "ok",
  "partial",
  "partial_error",
  "partial_failure",
  "processed",
  "requires_confirmation",
  "skipped",
  "success"
]);

function cronItem(key, label, row, options = {}) {
  const status = cleanString(row?.status).toLowerCase() || "missing";
  const finishedAt = cleanString(row?.finished_at || row?.recorded_at);
  const terminal = TERMINAL_CRON_STATUSES.has(status) && Boolean(finishedAt);
  return {
    key,
    label,
    status,
    terminal,
    startedAt: cleanString(row?.started_at || row?.recorded_at),
    finishedAt,
    message: cleanString(row?.message || row?.errors || options.message),
    errorCode: cleanString(row?.error_code),
    schedule: cleanString(options.schedule)
  };
}

async function latestCronHealth(env) {
  const auditDb = getAuditDatabase(env, { required: false });
  if (!auditDb) {
    return {
      status: "NEOVĚŘENO",
      items: [],
      nonTerminalCount: null,
      note: "Chybí binding DB_AUDIT."
    };
  }

  try {
    const [
      runnersResult,
      nonTerminalCounts,
      dataBoxPlus,
      history,
      analytics,
      pairing,
      orwii,
      archiveResult,
      capacityResult
    ] = await Promise.all([
      auditDb.prepare(`
        SELECT r.*
        FROM module_automation_runner_runs r
        INNER JOIN (
          SELECT runner_name, MAX(started_at) AS started_at
          FROM module_automation_runner_runs
          GROUP BY runner_name
        ) latest ON latest.runner_name = r.runner_name AND latest.started_at = r.started_at
        ORDER BY r.runner_name
      `).all(),
      auditDb.prepare(`
        SELECT
          (SELECT COUNT(*) FROM module_automation_runner_runs WHERE status = 'running' OR finished_at IS NULL) AS module_runners,
          (SELECT COUNT(*) FROM module_automation_runs WHERE status = 'running' OR finished_at IS NULL) AS module_automations,
          (SELECT COUNT(*) FROM data_box_plus_sync_runs WHERE status = 'running' OR finished_at IS NULL) AS data_box_plus,
          (SELECT COUNT(*) FROM vehicle_tracking_history_runs WHERE status = 'running' OR finished_at IS NULL) AS vehicle_history,
          (SELECT COUNT(*) FROM vehicle_tracking_analytics_runs WHERE status = 'running' OR finished_at IS NULL) AS vehicle_analytics,
          (SELECT COUNT(*) FROM fleet_trip_job_pairing_runs WHERE status = 'running' OR finished_at IS NULL) AS trip_pairing,
          (SELECT COUNT(*) FROM fleet_orwii_fuel_sync_runs WHERE status = 'running' OR finished_at IS NULL) AS orwii,
          (SELECT COUNT(*) FROM archive_runs WHERE status = 'running' OR finished_at IS NULL) AS archives
      `).first(),
      auditDb.prepare("SELECT * FROM data_box_plus_sync_runs ORDER BY started_at DESC LIMIT 1").first(),
      auditDb.prepare("SELECT * FROM vehicle_tracking_history_runs ORDER BY started_at DESC LIMIT 1").first(),
      auditDb.prepare("SELECT * FROM vehicle_tracking_analytics_runs ORDER BY started_at DESC LIMIT 1").first(),
      auditDb.prepare("SELECT * FROM fleet_trip_job_pairing_runs ORDER BY started_at DESC LIMIT 1").first(),
      auditDb.prepare("SELECT * FROM fleet_orwii_fuel_sync_runs ORDER BY started_at DESC LIMIT 1").first(),
      auditDb.prepare(`
        SELECT a.*
        FROM archive_runs a
        INNER JOIN (
          SELECT source_table, MAX(started_at) AS started_at
          FROM archive_runs
          GROUP BY source_table
        ) latest ON latest.source_table = a.source_table AND latest.started_at = a.started_at
        ORDER BY a.source_table
      `).all(),
      auditDb.prepare(`
        SELECT recorded_at, COUNT(DISTINCT database_domain) AS database_count
        FROM database_capacity_snapshots
        WHERE database_domain IN ('core', 'messages', 'audit', 'archive')
        GROUP BY recorded_at
        ORDER BY recorded_at DESC
        LIMIT 1
      `).first()
    ]);

    const items = [
      ...(runnersResult.results || []).map((row) =>
        cronItem(`runner:${cleanString(row.runner_name)}`, cleanString(row.runner_name), row, {
          schedule: row.cron
        })
      ),
      cronItem("data-box-plus-sync", "Datové schránky Plus – synchronizace", dataBoxPlus, {
        schedule: "každou celou hodinu"
      }),
      cronItem("vehicle-tracking-history", "GPS historie vozidel", history, { schedule: "* * * * *" }),
      cronItem("vehicle-tracking-analytics", "GPS analytika", analytics, { schedule: "*/5 * * * *" }),
      cronItem("fleet-trip-job-pairing", "Párování jízd a zakázek", pairing, { schedule: "*/15 * * * *" }),
      cronItem("orwii-fuel-sync", "ORWII palivo", orwii, { schedule: "17 * * * *" }),
      ...(archiveResult.results || []).map((row) =>
        cronItem(`archive:${cleanString(row.source_table)}`, `Archivace ${cleanString(row.source_table)}`, row, {
          schedule: "*/5 * * * *"
        })
      ),
      cronItem("database-capacity", "Kapacita databází", capacityResult
        ? {
            status: Number(capacityResult.database_count || 0) === 4 ? "completed" : "partial_failure",
            recorded_at: capacityResult.recorded_at
          }
        : null, { schedule: "*/15 * * * *" })
    ];
    const nonTerminalBySource = {
      moduleRunners: Number(nonTerminalCounts?.module_runners || 0),
      moduleAutomations: Number(nonTerminalCounts?.module_automations || 0),
      dataBoxPlus: Number(nonTerminalCounts?.data_box_plus || 0),
      vehicleHistory: Number(nonTerminalCounts?.vehicle_history || 0),
      vehicleAnalytics: Number(nonTerminalCounts?.vehicle_analytics || 0),
      tripPairing: Number(nonTerminalCounts?.trip_pairing || 0),
      orwii: Number(nonTerminalCounts?.orwii || 0),
      archives: Number(nonTerminalCounts?.archives || 0)
    };
    const nonTerminalCount = Object.values(nonTerminalBySource)
      .reduce((sum, count) => sum + count, 0);
    const allTerminal = nonTerminalCount === 0 && items.length > 0 && items.every((item) => item.terminal);
    const failed = items.some((item) => ["error", "failed", "partial_error", "partial_failure"].includes(item.status));
    return {
      status: allTerminal ? (failed ? "WARNING" : "OK") : "ERROR",
      items,
      nonTerminalCount,
      nonTerminalBySource,
      allTerminal,
      note: allTerminal
        ? "Všechny evidované cloudové běhy mají terminální stav."
        : `${nonTerminalCount} evidovaných běhů nemá terminální stav.`
    };
  } catch (error) {
    return {
      status: "NEOVĚŘENO",
      items: [],
      nonTerminalCount: null,
      allTerminal: false,
      note: `Stavy cronů nelze načíst: ${cleanString(error?.message) || "neznámá chyba"}`
    };
  }
}

export async function getSystemCheckStatus(env) {
  const db = monitorDb(env, true);

  try {
    const [
      latestMonitor,
      dataBoxPlusRules,
      dataBoxPlusActiveRules,
      dataBoxPlusMessages,
      dataBoxPlusAttachments,
      dataBoxPlusAccounts,
      latestDataBoxPlusSync,
      databaseCapacity,
      cronHealth
    ] = await Promise.all([
      runProductionMonitor(env, { source: "read-only-status" }).catch(() => null),
      countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_rules"),
      countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_rules WHERE status IN (?, ?, ?)", "Učí se", "Spolehlivé", "Autonomní"),
      countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_messages"),
      countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_attachments"),
      countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_mailboxes"),
      db.prepare(`
        SELECT *
        FROM data_box_plus_sync_runs
        ORDER BY started_at DESC
        LIMIT 1
      `).first(),
      latestDatabaseCapacity(env),
      latestCronHealth(env)
    ]);

    return {
      apiStatus: "ready",
      generatedAt: nowIso(),
      production: {
        latestMonitor,
        status: latestMonitor?.status || "NEOVĚŘENO"
      },
      externalAssignmentCheck: {
        latest: null,
        checks: [],
        status: "NEOVĚŘENO",
        source: "ChatGPT",
        note: "Bez schválené DB migrace se externí hodinová kontrola pouze zobrazuje jako čekající slot."
      },
      githubActions: {
        status: "NEOVĚŘENO",
        note: "GitHub Actions kontrola není v této bezpečné fázi přidaná ani napojená."
      },
      databaseCapacity,
      cronHealth,
      dataBox: {
        expectedDefaultMailboxId: "data-box-plus",
        messages: dataBoxPlusMessages,
        attachments: dataBoxPlusAttachments,
        accounts: [],
        accountCount: dataBoxPlusAccounts
      },
      automation: {
        rulesTotal: dataBoxPlusRules,
        activeRules: dataBoxPlusActiveRules,
        automationsTotal: 0,
        activeAutomations: 0,
        latestRunnerRun: latestDataBoxPlusSync ? {
          id: cleanString(latestDataBoxPlusSync.id),
          runnerName: "data-box-plus-sync",
          startedAt: cleanString(latestDataBoxPlusSync.started_at),
          finishedAt: cleanString(latestDataBoxPlusSync.finished_at),
          status: cleanString(latestDataBoxPlusSync.status),
          rulesTotal: dataBoxPlusRules,
          dryRunCount: 0,
          skippedCount: 0,
          failedCount: Number(latestDataBoxPlusSync.errors ? 1 : 0),
          message: cleanString(latestDataBoxPlusSync.errors || latestDataBoxPlusSync.status),
          cron: "30 minut"
        } : null,
        runnerStatus: latestDataBoxPlusSync ? cleanString(latestDataBoxPlusSync.status) : "NEOVĚŘENO",
        actionHistory: {
          status: "OK",
          note: "DSP akce se zapisují do data_box_plus_action_log."
        }
      }
    };
  } catch (error) {
    throw dbError(error);
  }
}

function itemStatus(ok, warning = false) {
  if (!ok) return "ERROR";
  return warning ? "WARNING" : "OK";
}

async function fetchWithTiming(url, options = {}) {
  const start = Date.now();
  const response = await fetch(url, {
    redirect: "follow",
    ...options
  });
  return {
    response,
    durationMs: Date.now() - start
  };
}

function parseBuildMeta(text) {
  return {
    version: text.match(/"version"\s*:\s*"([^"]*)"/)?.[1] || "",
    commit: text.match(/"commit"\s*:\s*"([^"]*)"/)?.[1] || ""
  };
}

async function monitorHttpItem(targetUrl, path, label, expectedStatuses = [200]) {
  const url = new URL(path, targetUrl).toString();
  try {
    const { response, durationMs } = await fetchWithTiming(url, { cache: "no-store" });
    const ok = expectedStatuses.includes(response.status);
    return {
      key: path,
      label,
      status: itemStatus(ok),
      httpStatus: response.status,
      durationMs,
      message: ok ? "Dostupné." : `Neočekávaný HTTP stav ${response.status}.`
    };
  } catch (error) {
    return {
      key: path,
      label,
      status: "ERROR",
      httpStatus: null,
      durationMs: 0,
      message: error?.message || "Kontrola selhala."
    };
  }
}

async function monitorBuildMeta(targetUrl) {
  const url = new URL("/src/data/buildMeta.js", targetUrl).toString();
  try {
    const { response, durationMs } = await fetchWithTiming(url, { cache: "no-store" });
    const text = await response.text();
    const meta = parseBuildMeta(text);
    const ok = response.ok && Boolean(meta.commit || meta.version);
    return {
      item: {
        key: "build-meta",
        label: "Build metadata",
        status: itemStatus(ok),
        httpStatus: response.status,
        durationMs,
        message: ok ? `Verze ${meta.version || "neuvedena"}, commit ${meta.commit || "neuveden"}.` : "Build metadata nejsou čitelná."
      },
      meta
    };
  } catch (error) {
    return {
      item: {
        key: "build-meta",
        label: "Build metadata",
        status: "ERROR",
        httpStatus: null,
        durationMs: 0,
        message: error?.message || "Build metadata nejdou načíst."
      },
      meta: { version: "", commit: "" }
    };
  }
}

async function monitorDatabaseItems(env) {
  const db = monitorDb(env, false);
  if (!db) {
    return [{
      key: "d1",
      label: "Cloud DB",
      status: "ERROR",
      message: "D1 binding DB_AUDIT / DB_CORE / DB_MESSAGES není dostupný."
    }];
  }

  try {
    const messagesTotal = await countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_messages");
    const mailboxesTotal = await countRows(db, "SELECT COUNT(*) AS count FROM data_box_plus_mailboxes");
    const runnerRun = await db.prepare(`
      SELECT status, started_at
      FROM data_box_plus_sync_runs
      ORDER BY started_at DESC
      LIMIT 1
    `).first();

    return [
      {
        key: "data-box-plus-messages",
        label: "DSP zprávy v cloud DB",
        status: messagesTotal > 0 ? "OK" : "WARNING",
        message: messagesTotal > 0
          ? `${messagesTotal} zpráv napříč ${mailboxesTotal} schránkami.`
          : "DSP zatím nemá uložené žádné zprávy."
      },
      {
        key: "data-box-plus-sync",
        label: "DSP cloud načítání",
        status: runnerRun ? (cleanString(runnerRun.status).toLowerCase() === "completed" ? "OK" : "WARNING") : "WARNING",
        message: runnerRun
          ? `Poslední běh: ${cleanString(runnerRun.status)} ${cleanString(runnerRun.started_at)}.`
          : "DSP zatím nemá zapsaný běh načítání."
      }
    ];
  } catch (error) {
    const mapped = dbError(error);
    return [{
      key: "cloud-db",
      label: "Cloud DB kontrola",
      status: "ERROR",
      message: mapped.message
    }];
  }
}

export async function runProductionMonitor(env, options = {}) {
  const targetUrl = cleanString(options.targetUrl || env?.PRODUCTION_MONITOR_TARGET_URL) || DEFAULT_TARGET_URL;
  const source = cleanString(options.source) || "read-only-status";
  const startedAt = Date.now();
  const [home, dataBoxPlus, dataBoxPlusStatus, buildMeta, dbItems] = await Promise.all([
    monitorHttpItem(targetUrl, "/", "Produkční web", [200]),
    monitorHttpItem(targetUrl, "/datove-schranky-plus", "DSP modul", [200]),
    monitorHttpItem(targetUrl, "/api/data-box-plus/status", "DSP status endpoint", [200, 401, 403]),
    monitorBuildMeta(targetUrl),
    monitorDatabaseItems(env)
  ]);

  const checkedItems = [
    home,
    dataBoxPlus,
    dataBoxPlusStatus,
    buildMeta.item,
    ...dbItems
  ];
  const errors = checkedItems
    .filter((item) => item.status === "ERROR")
    .map((item) => `${item.label}: ${item.message}`);
  const warnings = checkedItems
    .filter((item) => item.status === "WARNING")
    .map((item) => `${item.label}: ${item.message}`);
  const status = errors.length ? "ERROR" : (warnings.length ? "WARNING" : "OK");

  const run = monitorRunInput({
    source,
    targetUrl,
    status,
    httpStatus: home.httpStatus,
    durationMs: Date.now() - startedAt,
    checkedItems,
    errors: [...errors, ...warnings],
    buildVersion: buildMeta.meta.version,
    commitHash: buildMeta.meta.commit,
    notes: options.note || ""
  });

  return {
    ...run,
    stored: false,
    storageStatus: "NEOVĚŘENO",
    storageMessage: "Ukládání monitoringu do nové DB tabulky je zastavené. DB migrace nebyla provedena."
  };
}

export function productionMonitorErrorResponse(error) {
  if (error instanceof ProductionMonitorStoreError) {
    return {
      status: error.status,
      payload: {
        error: error.message,
        code: error.code,
        apiStatus: "waiting"
      }
    };
  }

  console.error("production_monitor.api_failed", { message: error?.message });
  return {
    status: 500,
    payload: {
      error: "Monitoring se teď nepodařilo načíst.",
      apiStatus: "waiting"
    }
  };
}
