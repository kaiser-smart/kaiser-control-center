import {
  UI_ACTION_AUDIT_CASES,
  auditUiActionContractSources
} from "../../src/data/uiActionContract.js";
import {
  SELF_REPAIR_UI_SCAN_CRON,
  SELF_REPAIR_UI_SCAN_MODULE_KEY,
  SELF_REPAIR_UI_SCAN_RULE_ID,
  SELF_REPAIR_UI_SCAN_RUNNER_NAME,
  SELF_REPAIR_UI_SCAN_TARGET_URL,
  SELF_REPAIR_UI_SCAN_TIME_ZONE,
  nextSelfRepairUiScanRun,
  selfRepairUiScanDayKey
} from "./self-repair-ui-interaction-config.js";
import { upsertCloudMonitorSelfRepairCase } from "./self-repair-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const DATABASE_NAME = "smart-odpady";
const MAX_MANIFEST_BYTES = 200_000;
const MAX_APP_BYTES = 8_000_000;
const MAX_STYLES_BYTES = 8_000_000;

export class SelfRepairUiInteractionError extends Error {
  constructor(message, code = "self_repair_ui_scan_error") {
    super(message);
    this.name = "SelfRepairUiInteractionError";
    this.code = code;
  }
}

function cleanString(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function nullableString(value, maxLength) {
  const cleaned = cleanString(value, maxLength);
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
    throw new SelfRepairUiInteractionError(
      `Cloudflare D1 binding ${DB_BINDING} není dostupný pro denní UI audit.`,
      "self_repair_ui_scan_database_missing"
    );
  }
  return db;
}

function targetBaseUrl(env, options) {
  const raw = cleanString(options.targetUrl || env?.APP_BASE_URL || SELF_REPAIR_UI_SCAN_TARGET_URL, 500);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw new SelfRepairUiInteractionError(
      "Cílová adresa denního UI auditu není platná HTTPS adresa.",
      "self_repair_ui_scan_target_invalid"
    );
  }
}

async function fetchReadOnlyText(fetchImpl, baseUrl, pathname, maxBytes, expectedContentType) {
  const url = new URL(pathname, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new SelfRepairUiInteractionError(
      "Denní UI audit odmítl načíst asset mimo schválenou produkční doménu.",
      "self_repair_ui_scan_cross_origin_blocked"
    );
  }

  let response = null;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { accept: expectedContentType },
      cache: "no-store"
    });
  } catch (error) {
    throw new SelfRepairUiInteractionError(
      `Read-only GET ${url.pathname} selhal: ${cleanString(error?.message || "chyba sítě", 500)}`,
      "self_repair_ui_scan_asset_fetch_failed"
    );
  }

  if (response.status !== 200) {
    throw new SelfRepairUiInteractionError(
      `Read-only GET ${url.pathname} vrátil HTTP ${response.status}.`,
      "self_repair_ui_scan_asset_http_failed"
    );
  }
  const contentType = cleanString(response.headers.get("content-type"), 200).toLowerCase();
  if (!contentType.includes(expectedContentType)) {
    throw new SelfRepairUiInteractionError(
      `Read-only GET ${url.pathname} vrátil neočekávaný Content-Type ${contentType || "neuveden"}.`,
      "self_repair_ui_scan_asset_content_type"
    );
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new SelfRepairUiInteractionError(
      `Read-only asset ${url.pathname} překročil bezpečný velikostní limit.`,
      "self_repair_ui_scan_asset_too_large"
    );
  }
  return text;
}

async function loadProductionSources(fetchImpl, baseUrl) {
  const manifestText = await fetchReadOnlyText(
    fetchImpl,
    baseUrl,
    "/route-manifest.json",
    MAX_MANIFEST_BYTES,
    "application/json"
  );
  let manifest = null;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new SelfRepairUiInteractionError(
      "Produkční route manifest není platný JSON.",
      "self_repair_ui_scan_manifest_invalid"
    );
  }
  const version = cleanString(manifest?.build?.version, 100);
  const commit = cleanString(manifest?.build?.commit, 160);
  if (!version || !commit) {
    throw new SelfRepairUiInteractionError(
      "Produkční route manifest nemá platnou verzi a commit.",
      "self_repair_ui_scan_manifest_build_missing"
    );
  }
  const versionQuery = encodeURIComponent(version);
  const [appSource, stylesSource] = await Promise.all([
    fetchReadOnlyText(fetchImpl, baseUrl, `/src/app.js?v=${versionQuery}`, MAX_APP_BYTES, "javascript"),
    fetchReadOnlyText(fetchImpl, baseUrl, `/src/styles.css?v=${versionQuery}`, MAX_STYLES_BYTES, "text/css")
  ]);
  return { version, commit, appSource, stylesSource };
}

async function currentRule(db) {
  return db.prepare(`
    SELECT id, status, schedule_cron, cloud_runner
    FROM module_rules
    WHERE module_key = ? AND id = ?
    LIMIT 1
  `).bind(SELF_REPAIR_UI_SCAN_MODULE_KEY, SELF_REPAIR_UI_SCAN_RULE_ID).first();
}

async function existingRun(db, dedupeKey) {
  return db.prepare(`
    SELECT id, status, message, started_at, finished_at
    FROM module_automation_runs
    WHERE module_key = ? AND dedupe_key = ?
    LIMIT 1
  `).bind(SELF_REPAIR_UI_SCAN_MODULE_KEY, dedupeKey).first();
}

async function claimRun(db, run) {
  try {
    await db.prepare(`
      INSERT INTO module_automation_runs (
        id, rule_id, module_key, started_at, finished_at, status,
        message, error_code, triggered_by, dedupe_key
      ) VALUES (?, ?, ?, ?, NULL, 'running', ?, NULL, ?, ?)
    `).bind(
      run.id,
      SELF_REPAIR_UI_SCAN_RULE_ID,
      SELF_REPAIR_UI_SCAN_MODULE_KEY,
      run.startedAt,
      "Denní UI audit spuštěn. Produkční assety se pouze čtou a kliká se jen v izolované syntetické stránce.",
      nullableString(run.triggeredBy, 200),
      run.dedupeKey
    ).run();
    return { claimed: true, existing: null };
  } catch (error) {
    const existing = await existingRun(db, run.dedupeKey).catch(() => null);
    if (existing) return { claimed: false, existing };
    throw error;
  }
}

async function insertRunnerRun(db, run) {
  await db.prepare(`
    INSERT INTO module_automation_runner_runs (
      id, module_key, runner_name, started_at, scheduled_at, finished_at,
      triggered_by, status, rules_total, dry_run_count, skipped_count,
      failed_count, message, error_code, d1_binding, database_name,
      cron, time_zone, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'running', 0, 0, 0, 0, ?, NULL, ?, ?, ?, ?, ?)
  `).bind(
    run.runnerRunId,
    SELF_REPAIR_UI_SCAN_MODULE_KEY,
    SELF_REPAIR_UI_SCAN_RUNNER_NAME,
    run.startedAt,
    run.scheduledAt,
    nullableString(run.triggeredBy, 200),
    "Denní syntetický klikací audit běží. Přihlášení, produkční kliknutí a síťové požadavky browseru jsou vypnuté.",
    DB_BINDING,
    DATABASE_NAME,
    SELF_REPAIR_UI_SCAN_CRON,
    SELF_REPAIR_UI_SCAN_TIME_ZONE,
    run.startedAt
  ).run();
}

async function finishRuns(db, run) {
  await db.prepare(`
    UPDATE module_automation_runs
    SET finished_at = ?, status = ?, message = ?, error_code = ?
    WHERE id = ?
  `).bind(
    run.finishedAt,
    run.status,
    nullableString(run.message, 4000),
    nullableString(run.errorCode, 200),
    run.id
  ).run();
  await db.prepare(`
    UPDATE module_automation_runner_runs
    SET finished_at = ?, status = ?, rules_total = ?, dry_run_count = ?,
        skipped_count = ?, failed_count = ?, message = ?, error_code = ?
    WHERE id = ?
  `).bind(
    run.finishedAt,
    run.status,
    Number(run.actionsChecked || 0),
    Number(run.findingsTotal || 0),
    Number(run.deduplicatedCases || 0),
    Number(run.failedCount || 0),
    nullableString(run.message, 4000),
    nullableString(run.errorCode, 200),
    run.runnerRunId
  ).run();
  await db.prepare(`
    UPDATE module_rules
    SET last_run_at = ?, next_run_at = ?, last_run_status = ?,
        last_run_message = ?, updated_at = ?, updated_by_user_id = ?
    WHERE module_key = ? AND id = ?
  `).bind(
    run.finishedAt,
    run.nextRunAt,
    run.status,
    nullableString(run.message, 4000),
    run.finishedAt,
    SELF_REPAIR_UI_SCAN_RUNNER_NAME,
    SELF_REPAIR_UI_SCAN_MODULE_KEY,
    SELF_REPAIR_UI_SCAN_RULE_ID
  ).run();
}

function runtimeFinding(error) {
  const code = cleanString(error?.code || "unknown", 100);
  return {
    key: `ui_interaction_runtime:${code}`,
    type: "ui_interaction_runtime",
    route: "/samoopravy",
    moduleKey: "self-repair",
    moduleName: "Samoopravy",
    title: "Denní klikací audit nedokončil bezpečnou kontrolu",
    description: "Denní read-only UI audit selhal před dokončením kontroly produkčního kontraktu a izolovaných syntetických kliknutí.",
    expected: "Worker přes GET načte produkční app.js a CSS, v izolované stránce bez sítě ověří odezvu tlačítek a zapíše souhrn.",
    actual: cleanString(error?.message || "Neznámá chyba denního UI auditu.", 4000),
    reproductionSteps: "Ověřit poslední běh self-repair-phase2b-daily-ui-interaction-scan a Browser Run binding. Nespouštět produkční akce."
  };
}

export async function runSelfRepairDailyUiInteractionScan(env, options = {}) {
  const db = database(env);
  const scheduledDate = new Date(Number(options.scheduledTime || Date.now()));
  const safeScheduledDate = Number.isNaN(scheduledDate.getTime()) ? new Date() : scheduledDate;
  const startedAt = new Date().toISOString();
  const dedupeKey = `self-repair-ui-scan:${SELF_REPAIR_UI_SCAN_RULE_ID}:${selfRepairUiScanDayKey(safeScheduledDate)}`;
  const rule = await currentRule(db);
  if (!rule || cleanString(rule.status, 80) !== "active") {
    return {
      mode: "daily-synthetic-ui-interaction-scan",
      status: "skipped",
      message: "Denní UI audit je vypnutý nebo jeho pravidlo v D1 chybí.",
      actionsChecked: 0,
      findingsTotal: 0
    };
  }

  const prior = await existingRun(db, dedupeKey);
  if (prior) {
    return {
      mode: "daily-synthetic-ui-interaction-scan",
      status: "skipped",
      message: "Denní UI audit už pro tento UTC den proběhl.",
      automationRunId: prior.id,
      actionsChecked: 0,
      findingsTotal: 0
    };
  }

  const run = {
    id: randomId("module-automation-run"),
    runnerRunId: randomId("module-automation-runner-run"),
    startedAt,
    scheduledAt: safeScheduledDate.toISOString(),
    triggeredBy: cleanString(options.triggeredBy || "cloudflare-cron", 200),
    dedupeKey,
    nextRunAt: nextSelfRepairUiScanRun(safeScheduledDate),
    actionsChecked: 0,
    findingsTotal: 0,
    newCases: 0,
    deduplicatedCases: 0,
    failedCount: 0,
    status: "running",
    message: "",
    errorCode: ""
  };

  const claim = await claimRun(db, run);
  if (!claim.claimed) {
    return {
      mode: "daily-synthetic-ui-interaction-scan",
      status: "skipped",
      message: "Denní UI audit už byl souběžně převzat jiným workerem.",
      automationRunId: claim.existing?.id,
      actionsChecked: 0,
      findingsTotal: 0
    };
  }
  await insertRunnerRun(db, run);

  let buildVersion = "";
  let buildCommit = "";
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const baseUrl = targetBaseUrl(env, options);
    const sources = await loadProductionSources(fetchImpl, baseUrl);
    buildVersion = sources.version;
    buildCommit = sources.commit;
    const sourceFindings = auditUiActionContractSources(sources.appSource, sources.stylesSource);
    if (typeof options.browserAudit !== "function") {
      throw new SelfRepairUiInteractionError(
        "Browser Run audit není připojený.",
        "self_repair_ui_scan_browser_missing"
      );
    }
    const browserResult = await options.browserAudit({
      cases: UI_ACTION_AUDIT_CASES,
      stylesSource: sources.stylesSource
    });
    const browserFindings = Array.isArray(browserResult?.findings) ? browserResult.findings : [];
    const findings = [...sourceFindings, ...browserFindings];
    run.actionsChecked = Number(browserResult?.actionsChecked || UI_ACTION_AUDIT_CASES.length);
    run.findingsTotal = findings.length;

    for (const finding of findings) {
      const result = await upsertCloudMonitorSelfRepairCase(env, finding, {
        observedAt: new Date().toISOString(),
        buildVersion,
        buildCommit,
        monitorRunId: run.runnerRunId,
        reporterUserId: "cloud:self-repair-ui-scan",
        reporterUserName: "Denní syntetický UI audit"
      });
      if (result.created) run.newCases += 1;
      if (result.deduplicated) run.deduplicatedCases += 1;
    }

    run.status = findings.length ? "dry_run" : "success";
    run.message = findings.length
      ? `Denní UI audit zkontroloval ${run.actionsChecked} bezpečně povolené akce a zapsal ${findings.length} nálezů. Produkční tlačítka se neklikala; browser síť zůstala blokovaná.`
      : `Denní UI audit zkontroloval ${run.actionsChecked} bezpečně povolené akce bez nálezu. Produkční tlačítka se neklikala; browser síť zůstala blokovaná.`;
  } catch (error) {
    run.status = "error";
    run.failedCount = 1;
    run.errorCode = cleanString(error?.code || "self_repair_ui_scan_error", 200);
    run.message = cleanString(error?.message || "Denní UI audit selhal.", 4000);
    const result = await upsertCloudMonitorSelfRepairCase(env, runtimeFinding(error), {
      observedAt: new Date().toISOString(),
      buildVersion,
      buildCommit,
      monitorRunId: run.runnerRunId,
      reporterUserId: "cloud:self-repair-ui-scan",
      reporterUserName: "Denní syntetický UI audit"
    }).catch(() => null);
    if (result?.created) run.newCases += 1;
    if (result?.deduplicated) run.deduplicatedCases += 1;
    run.findingsTotal = 1;
  }

  run.finishedAt = new Date().toISOString();
  await finishRuns(db, run);
  return {
    mode: "daily-synthetic-ui-interaction-scan",
    status: run.status,
    automationRunId: run.id,
    runnerRunId: run.runnerRunId,
    actionsChecked: run.actionsChecked,
    findingsTotal: run.findingsTotal,
    newCases: run.newCases,
    deduplicatedCases: run.deduplicatedCases,
    failedCount: run.failedCount,
    message: run.message,
    errorCode: run.errorCode,
    buildVersion,
    buildCommit,
    realProductionClicks: false,
    browserNetwork: "blocked",
    authenticatedSession: false,
    codexExecuted: false,
    repoWrite: false,
    deploymentStarted: false,
    notificationSent: false
  };
}
