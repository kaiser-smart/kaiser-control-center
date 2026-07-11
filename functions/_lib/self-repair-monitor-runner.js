import {
  SELF_REPAIR_MONITOR_CONCURRENCY,
  SELF_REPAIR_MONITOR_CRON,
  SELF_REPAIR_MONITOR_MAX_ROUTES,
  SELF_REPAIR_MONITOR_MODULE_KEY,
  SELF_REPAIR_MONITOR_RULE_ID,
  SELF_REPAIR_MONITOR_RUNNER_NAME,
  SELF_REPAIR_MONITOR_TARGET_URL,
  SELF_REPAIR_MONITOR_TIME_ZONE
} from "./self-repair-monitor-config.js";
import { upsertCloudMonitorSelfRepairCase } from "./self-repair-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const DATABASE_NAME = "smart-odpady";
const ROUTE_MANIFEST_PATH = "/route-manifest.json";
const MAX_MANIFEST_BYTES = 200_000;
const MAX_ROUTE_BODY_BYTES = 120_000;
const SLOW_ROUTE_MS = 5_000;

export class SelfRepairMonitorError extends Error {
  constructor(message, code = "self_repair_monitor_error") {
    super(message);
    this.name = "SelfRepairMonitorError";
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

function monitorDatabase(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new SelfRepairMonitorError(
      `Cloudflare D1 binding ${DB_BINDING} není dostupný pro hodinový monitor.`,
      "self_repair_monitor_database_missing"
    );
  }
  return db;
}

function targetUrl(env, options) {
  const raw = cleanString(options.targetUrl || env?.APP_BASE_URL || SELF_REPAIR_MONITOR_TARGET_URL, 500);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    throw new SelfRepairMonitorError(
      "Cílová produkční adresa hodinového monitoru není platná HTTPS adresa.",
      "self_repair_monitor_target_invalid"
    );
  }
}

function scheduledDate(value) {
  const date = new Date(Number(value || Date.now()));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function hourDedupeKey(date) {
  return `self-repair-monitor:${SELF_REPAIR_MONITOR_RULE_ID}:${date.toISOString().slice(0, 13)}`;
}

function nextHourlyRun(date) {
  const next = new Date(date);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(Number(SELF_REPAIR_MONITOR_CRON.split(" ")[0]) || 7);
  if (next.getTime() <= date.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

async function monitorRule(db) {
  return db.prepare(`
    SELECT id, status, schedule_cron, cloud_runner
    FROM module_rules
    WHERE module_key = ? AND id = ?
    LIMIT 1
  `).bind(SELF_REPAIR_MONITOR_MODULE_KEY, SELF_REPAIR_MONITOR_RULE_ID).first();
}

async function existingAutomationRun(db, dedupeKey) {
  return db.prepare(`
    SELECT id, status, message, started_at, finished_at
    FROM module_automation_runs
    WHERE module_key = ? AND dedupe_key = ?
    LIMIT 1
  `).bind(SELF_REPAIR_MONITOR_MODULE_KEY, dedupeKey).first();
}

async function claimAutomationRun(db, run) {
  try {
    await db.prepare(`
      INSERT INTO module_automation_runs (
        id, rule_id, module_key, started_at, finished_at, status,
        message, error_code, triggered_by, dedupe_key
      ) VALUES (?, ?, ?, ?, NULL, 'running', ?, NULL, ?, ?)
    `).bind(
      run.id,
      SELF_REPAIR_MONITOR_RULE_ID,
      SELF_REPAIR_MONITOR_MODULE_KEY,
      run.startedAt,
      "Hodinový read-only monitor byl spuštěn. Codex, deploy ani e-mail se nespouští.",
      nullableString(run.triggeredBy, 200),
      run.dedupeKey
    ).run();
    return { claimed: true, existing: null };
  } catch (error) {
    const existing = await existingAutomationRun(db, run.dedupeKey).catch(() => null);
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
    run.id,
    SELF_REPAIR_MONITOR_MODULE_KEY,
    SELF_REPAIR_MONITOR_RUNNER_NAME,
    run.startedAt,
    run.scheduledAt,
    nullableString(run.triggeredBy, 200),
    "Hodinový read-only monitor běží. Externí zápisy, Codex, deploy a e-mail jsou vypnuté.",
    DB_BINDING,
    DATABASE_NAME,
    SELF_REPAIR_MONITOR_CRON,
    SELF_REPAIR_MONITOR_TIME_ZONE,
    run.startedAt
  ).run();
}

async function finishAutomationRun(db, run) {
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
}

async function finishRunnerRun(db, run) {
  await db.prepare(`
    UPDATE module_automation_runner_runs
    SET
      finished_at = ?, status = ?, rules_total = ?, dry_run_count = ?,
      skipped_count = ?, failed_count = ?, message = ?, error_code = ?
    WHERE id = ?
  `).bind(
    run.finishedAt,
    run.status,
    Number(run.routesTotal || 0),
    Number(run.findingsTotal || 0),
    Number(run.deduplicatedCases || 0),
    Number(run.failedCount || 0),
    nullableString(run.message, 4000),
    nullableString(run.errorCode, 200),
    run.id
  ).run();
}

async function updateRuleRunState(db, state) {
  await db.prepare(`
    UPDATE module_rules
    SET
      last_run_at = ?, next_run_at = ?, last_run_status = ?,
      last_run_message = ?, updated_at = ?, updated_by_user_id = ?
    WHERE module_key = ? AND id = ?
  `).bind(
    state.finishedAt,
    state.nextRunAt,
    state.status,
    nullableString(state.message, 4000),
    state.finishedAt,
    SELF_REPAIR_MONITOR_RUNNER_NAME,
    SELF_REPAIR_MONITOR_MODULE_KEY,
    SELF_REPAIR_MONITOR_RULE_ID
  ).run();
}

function safeRoutePath(value) {
  const cleaned = cleanString(value, 600);
  if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.includes("\\")) return "";
  try {
    const parsed = new URL(cleaned, "https://smart-odpady.invalid");
    if (parsed.origin !== "https://smart-odpady.invalid") return "";
    return parsed.pathname;
  } catch {
    return "";
  }
}

function normalizeManifest(text) {
  if (text.length > MAX_MANIFEST_BYTES) {
    throw new SelfRepairMonitorError(
      "Produkční route manifest je neočekávaně velký.",
      "self_repair_monitor_manifest_too_large"
    );
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SelfRepairMonitorError(
      "Produkční route manifest není platný JSON.",
      "self_repair_monitor_manifest_invalid"
    );
  }

  const version = cleanString(parsed?.build?.version, 100);
  const commit = cleanString(parsed?.build?.commit, 160);
  const rawRoutes = Array.isArray(parsed?.routes) ? parsed.routes : [];
  if (!version || !commit || !rawRoutes.length || rawRoutes.length > SELF_REPAIR_MONITOR_MAX_ROUTES) {
    throw new SelfRepairMonitorError(
      "Produkční route manifest nemá platný build nebo počet cest.",
      "self_repair_monitor_manifest_incomplete"
    );
  }

  const seen = new Set();
  const routes = [];
  for (const item of rawRoutes) {
    const path = safeRoutePath(typeof item === "string" ? item : item?.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    routes.push({
      path,
      moduleKey: cleanString(item?.moduleKey || "dashboard", 100),
      label: cleanString(item?.label || path, 240)
    });
  }

  if (!routes.length) {
    throw new SelfRepairMonitorError(
      "Produkční route manifest neobsahuje žádnou bezpečnou lokální cestu.",
      "self_repair_monitor_manifest_routes_missing"
    );
  }

  return { version, commit, routes };
}

async function loadRouteManifest(fetchImpl, baseUrl) {
  const url = new URL(ROUTE_MANIFEST_PATH, baseUrl).toString();
  let response = null;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      cache: "no-store"
    });
  } catch (error) {
    throw new SelfRepairMonitorError(
      `Route manifest nejde načíst: ${cleanString(error?.message || "chyba sítě", 500)}`,
      "self_repair_monitor_manifest_fetch_failed"
    );
  }

  if (response.status !== 200) {
    throw new SelfRepairMonitorError(
      `Route manifest vrátil HTTP ${response.status}.`,
      "self_repair_monitor_manifest_http_failed"
    );
  }

  return normalizeManifest(await response.text());
}

function routeFinding(route, type, actual, details = {}) {
  return {
    key: `${type}:${route.path}`,
    type,
    route: route.path,
    moduleKey: route.moduleKey,
    title: `${route.label}: produkční kontrola selhala`,
    description: `Hodinový read-only monitor našel problém na stránce ${route.label}.`,
    expected: "HTTP 200, HTML odpověď a odkazy na app.js/styles.css stejné verze jako route manifest.",
    actual,
    reproductionSteps: `Otevřít ${route.path} na produkci a ověřit HTTP stav, Content-Type a asset cache-buster.`,
    httpStatus: details.httpStatus,
    durationMs: details.durationMs
  };
}

async function checkRoute(fetchImpl, baseUrl, route, version) {
  const startedAt = Date.now();
  let response = null;
  try {
    response = await fetchImpl(new URL(route.path, baseUrl).toString(), {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html" },
      cache: "no-store"
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      route,
      durationMs,
      finding: routeFinding(
        route,
        "route_fetch_error",
        `Požadavek selhal: ${cleanString(error?.message || "chyba sítě", 500)}`,
        { durationMs }
      )
    };
  }

  const durationMs = Date.now() - startedAt;
  if (response.status !== 200) {
    return {
      route,
      durationMs,
      finding: routeFinding(route, "route_http_status", `Stránka vrátila HTTP ${response.status}.`, {
        httpStatus: response.status,
        durationMs
      })
    };
  }

  const contentType = cleanString(response.headers.get("content-type"), 200).toLowerCase();
  if (!contentType.includes("text/html")) {
    return {
      route,
      durationMs,
      finding: routeFinding(route, "route_content_type", `Content-Type je ${contentType || "neuveden"}.`, {
        httpStatus: response.status,
        durationMs
      })
    };
  }

  const html = (await response.text()).slice(0, MAX_ROUTE_BODY_BYTES);
  const encodedVersion = encodeURIComponent(version);
  const appToken = `src/app.js?v=${encodedVersion}`;
  const stylesToken = `src/styles.css?v=${encodedVersion}`;
  if (!html.includes(appToken) || !html.includes(stylesToken)) {
    return {
      route,
      durationMs,
      finding: routeFinding(
        route,
        "route_asset_version",
        `HTML neobsahuje oba očekávané assety verze ${version}.`,
        { httpStatus: response.status, durationMs }
      )
    };
  }

  return { route, durationMs, finding: null };
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function createRuntimeFailureCase(env, error, context) {
  return upsertCloudMonitorSelfRepairCase(env, {
    key: `monitor_runtime:${cleanString(error?.code || "unknown", 100)}`,
    type: "monitor_runtime",
    route: ROUTE_MANIFEST_PATH,
    moduleKey: SELF_REPAIR_MONITOR_MODULE_KEY,
    title: "Hodinový monitor nedokončil kontrolu aplikace",
    description: "Cloudový read-only monitor selhal dříve, než dokončil kontrolu všech produkčních cest.",
    expected: "Monitor načte route manifest, ověří všechny stránky a zapíše souhrn běhu.",
    actual: cleanString(error?.message || "Monitor selhal bez čitelné zprávy.", 1000),
    reproductionSteps: "Ověřit dostupnost /route-manifest.json, produkční Pages a D1 logů monitoru."
  }, context);
}

export async function runSelfRepairHourlyMonitor(env, options = {}) {
  const db = monitorDatabase(env);
  const rule = await monitorRule(db);
  const scheduledAt = scheduledDate(options.scheduledTime);
  const startedAt = new Date().toISOString();
  const triggeredBy = cleanString(options.triggeredBy || "cloudflare-cron", 200);
  const baseUrl = targetUrl(env, options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!rule || cleanString(rule.status, 80) !== "active") {
    return {
      mode: "read-only-monitor",
      status: "skipped",
      message: "Hodinový monitor je neaktivní. Nic se nekontrolovalo ani nezapsalo.",
      ruleStatus: cleanString(rule?.status || "missing", 80),
      cron: SELF_REPAIR_MONITOR_CRON,
      codexExecuted: false,
      deploymentStarted: false,
      notificationSent: false
    };
  }

  const automationRunId = randomId("module-automation-run");
  const runnerRunId = randomId("module-automation-runner-run");
  const dedupeKey = hourDedupeKey(scheduledAt);
  const claim = await claimAutomationRun(db, {
    id: automationRunId,
    startedAt,
    triggeredBy,
    dedupeKey
  });

  if (!claim.claimed) {
    return {
      mode: "read-only-monitor",
      status: "skipped",
      message: "Kontrola pro tuto hodinu už byla spuštěna; duplicitní běh byl zastaven.",
      existingRunId: cleanString(claim.existing?.id, 200),
      dedupeKey,
      cron: SELF_REPAIR_MONITOR_CRON,
      codexExecuted: false,
      deploymentStarted: false,
      notificationSent: false
    };
  }

  await insertRunnerRun(db, {
    id: runnerRunId,
    startedAt,
    scheduledAt: scheduledAt.toISOString(),
    triggeredBy
  });

  let manifest = null;
  let routeResults = [];
  let findings = [];
  let newCases = 0;
  let deduplicatedCases = 0;
  let failedCount = 0;
  const caseResults = [];

  try {
    manifest = await loadRouteManifest(fetchImpl, baseUrl);
    routeResults = await mapWithConcurrency(
      manifest.routes,
      SELF_REPAIR_MONITOR_CONCURRENCY,
      (route) => checkRoute(fetchImpl, baseUrl, route, manifest.version)
    );
    findings = routeResults.map((item) => item.finding).filter(Boolean);

    for (const finding of findings) {
      try {
        const result = await upsertCloudMonitorSelfRepairCase(env, finding, {
          observedAt: new Date().toISOString(),
          targetUrl: baseUrl,
          buildVersion: manifest.version,
          buildCommit: manifest.commit,
          monitorRunId: runnerRunId
        });
        caseResults.push(result);
        if (result.created) newCases += 1;
        if (result.deduplicated) deduplicatedCases += 1;
      } catch (error) {
        failedCount += 1;
        caseResults.push({
          errorCode: cleanString(error?.code || "self_repair_case_write_failed", 200),
          message: cleanString(error?.message || "Nález se nepodařilo uložit.", 1000)
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const slowRouteCount = routeResults.filter((item) => item.durationMs > SLOW_ROUTE_MS).length;
    const status = failedCount > 0 ? "partial_error" : findings.length ? "dry_run" : "success";
    const message = findings.length
      ? `Zkontrolováno ${manifest.routes.length} cest, nalezeno ${findings.length} problémů, nové případy ${newCases}, deduplikované ${deduplicatedCases}. Připraveny jsou pouze návrhy promptů; Codex, deploy a e-mail jsou vypnuté.`
      : `Zkontrolováno ${manifest.routes.length} cest bez nálezu. Pomalé cesty: ${slowRouteCount}. Codex, deploy a e-mail jsou vypnuté.`;

    await finishAutomationRun(db, {
      id: automationRunId,
      finishedAt,
      status,
      message,
      errorCode: failedCount ? "self_repair_case_partial_write_failed" : ""
    });
    await finishRunnerRun(db, {
      id: runnerRunId,
      finishedAt,
      status,
      routesTotal: manifest.routes.length,
      findingsTotal: findings.length,
      deduplicatedCases,
      failedCount,
      message,
      errorCode: failedCount ? "self_repair_case_partial_write_failed" : ""
    });
    await updateRuleRunState(db, {
      finishedAt,
      nextRunAt: nextHourlyRun(scheduledAt),
      status,
      message
    });

    return {
      mode: "read-only-monitor",
      status,
      message,
      automationRunId,
      runnerRunId,
      dedupeKey,
      cron: SELF_REPAIR_MONITOR_CRON,
      targetUrl: baseUrl,
      buildVersion: manifest.version,
      buildCommit: manifest.commit,
      routesTotal: manifest.routes.length,
      routesChecked: routeResults.length,
      slowRouteCount,
      findingsTotal: findings.length,
      newCases,
      deduplicatedCases,
      failedCount,
      caseIds: caseResults.map((item) => item?.case?.id).filter(Boolean),
      codexExecuted: false,
      repoWrite: false,
      pullRequestCreated: false,
      deploymentStarted: false,
      notificationSent: false
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorCode = cleanString(error?.code || "self_repair_monitor_failed", 200);
    const message = `Hodinový read-only monitor selhal: ${cleanString(error?.message || "neznámá chyba", 1000)} Codex, deploy a e-mail nebyly spuštěny.`;

    await createRuntimeFailureCase(env, error, {
      observedAt: finishedAt,
      targetUrl: baseUrl,
      buildVersion: cleanString(manifest?.version, 100),
      buildCommit: cleanString(manifest?.commit, 160),
      monitorRunId: runnerRunId
    }).catch(() => null);
    await finishAutomationRun(db, {
      id: automationRunId,
      finishedAt,
      status: "error",
      message,
      errorCode
    });
    await finishRunnerRun(db, {
      id: runnerRunId,
      finishedAt,
      status: "error",
      routesTotal: manifest?.routes?.length || 0,
      findingsTotal: findings.length,
      deduplicatedCases,
      failedCount: Math.max(1, failedCount),
      message,
      errorCode
    });
    await updateRuleRunState(db, {
      finishedAt,
      nextRunAt: nextHourlyRun(scheduledAt),
      status: "error",
      message
    });

    return {
      mode: "read-only-monitor",
      status: "error",
      message,
      errorCode,
      automationRunId,
      runnerRunId,
      dedupeKey,
      cron: SELF_REPAIR_MONITOR_CRON,
      routesTotal: manifest?.routes?.length || 0,
      routesChecked: routeResults.length,
      findingsTotal: findings.length,
      newCases,
      deduplicatedCases,
      failedCount: Math.max(1, failedCount),
      codexExecuted: false,
      repoWrite: false,
      pullRequestCreated: false,
      deploymentStarted: false,
      notificationSent: false
    };
  }
}
