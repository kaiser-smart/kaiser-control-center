const MONITOR_DB_BINDING = "SMART_ODPADY_DB";
const DEFAULT_TARGET_URL = "https://kaiser-control-center.pages.dev/";
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
  const db = env?.[MONITOR_DB_BINDING] || null;

  if (!db && required) {
    throw new ProductionMonitorStoreError(
      "Databáze monitoringu není nastavená. Chybí D1 binding SMART_ODPADY_DB.",
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
      latestDataBoxPlusSync
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
      `).first()
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
      message: "D1 binding SMART_ODPADY_DB není dostupný."
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
