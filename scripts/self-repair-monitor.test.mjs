import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { runSelfRepairHourlyMonitor } from "../functions/_lib/self-repair-monitor-runner.js";
import { getSelfRepairStatus } from "../functions/_lib/self-repair-store.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigration(sqlite, name) {
  sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}

function routeHtml(version) {
  return `<!doctype html><html><head><link rel="stylesheet" href="src/styles.css?v=${version}"></head><body><script type="module" src="src/app.js?v=${version}"></script></body></html>`;
}

const manifest = {
  schemaVersion: 1,
  build: { version: "0.1.495", branch: "main", commit: "test495" },
  routes: [
    { path: "/", moduleKey: "dashboard", label: "Hlavní stránka" },
    { path: "/samoopravy", moduleKey: "self-repair", label: "Samoopravy" },
    { path: "/pneumatiky", moduleKey: "tyres", label: "Pneumatiky" }
  ]
};

function fetchWithTyreFailure(input) {
  const url = new URL(input);
  if (url.pathname === "/route-manifest.json") {
    return Promise.resolve(Response.json(manifest));
  }
  if (url.pathname === "/pneumatiky") {
    return Promise.resolve(new Response("Chyba", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }));
  }
  return Promise.resolve(new Response(routeHtml(manifest.build.version), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  }));
}

function healthyFetch(input) {
  const url = new URL(input);
  if (url.pathname === "/route-manifest.json") {
    return Promise.resolve(Response.json(manifest));
  }
  return Promise.resolve(new Response(routeHtml(manifest.build.version), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  }));
}

function failedManifestFetch(input) {
  const url = new URL(input);
  if (url.pathname === "/route-manifest.json") {
    return Promise.resolve(new Response("Nedostupné", { status: 503 }));
  }
  return healthyFetch(input);
}

const sqlite = new DatabaseSync(":memory:");
applyMigration(sqlite, "0007_create_module_feedback.sql");
applyMigration(sqlite, "0015_create_module_rules.sql");
applyMigration(sqlite, "0016_create_module_automation_runner_runs.sql");
applyMigration(sqlite, "0034_create_self_repair_cases.sql");
applyMigration(sqlite, "0035_activate_self_repair_hourly_monitor.sql");

const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  APP_BASE_URL: "https://kaiser.test/"
};
const firstHour = Date.UTC(2026, 6, 11, 8, 7, 0);

const firstRun = await runSelfRepairHourlyMonitor(env, {
  scheduledTime: firstHour,
  triggeredBy: "cloudflare-cron",
  fetchImpl: fetchWithTyreFailure
});

assert.equal(firstRun.status, "dry_run");
assert.equal(firstRun.routesTotal, 3);
assert.equal(firstRun.routesChecked, 3);
assert.equal(firstRun.findingsTotal, 1);
assert.equal(firstRun.newCases, 1);
assert.equal(firstRun.deduplicatedCases, 0);
assert.equal(firstRun.codexExecuted, false);
assert.equal(firstRun.repoWrite, false);
assert.equal(firstRun.deploymentStarted, false);
assert.equal(firstRun.notificationSent, false);

const monitorCase = sqlite.prepare(`
  SELECT source, status, priority, risk_level, module_key, target_repo_key,
         occurrence_count, build_version, build_commit
  FROM self_repair_cases
  WHERE source = 'cloud_monitor'
`).get();
assert.deepEqual({ ...monitorCase }, {
  source: "cloud_monitor",
  status: "new",
  priority: "Důležitá",
  risk_level: "orange",
  module_key: "tyres",
  target_repo_key: "kaiser-control-center",
  occurrence_count: 1,
  build_version: "0.1.495",
  build_commit: "test495"
});

const evidence = sqlite.prepare(`
  SELECT evidence_type, content_text, metadata_json
  FROM self_repair_case_evidence
  ORDER BY created_at, evidence_type
`).all();
assert.equal(evidence.length, 2);
assert.deepEqual(evidence.map((item) => item.evidence_type).sort(), ["cloud_monitor_finding", "codex_prompt_draft"]);
const prompt = evidence.find((item) => item.evidence_type === "codex_prompt_draft");
assert.match(prompt.content_text, /NÁVRH PROMPTU PRO CODEX/);
assert.match(prompt.content_text, /Repozitář: kaiser-control-center/);
assert.match(prompt.content_text, /Codex spuštěn: NE/);
assert.equal(JSON.parse(prompt.metadata_json).codexExecuted, false);

assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_case_audit_log").get().count, 1);
assert.equal(sqlite.prepare("SELECT status FROM module_automation_runs").get().status, "dry_run");
const firstRunner = sqlite.prepare("SELECT status, rules_total, dry_run_count, skipped_count, failed_count FROM module_automation_runner_runs").get();
assert.deepEqual({ ...firstRunner }, {
  status: "dry_run",
  rules_total: 3,
  dry_run_count: 1,
  skipped_count: 0,
  failed_count: 0
});

const duplicateHour = await runSelfRepairHourlyMonitor(env, {
  scheduledTime: firstHour,
  triggeredBy: "admin-manual:test",
  fetchImpl: fetchWithTyreFailure
});
assert.equal(duplicateHour.status, "skipped");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_automation_runs").get().count, 1);
assert.equal(sqlite.prepare("SELECT occurrence_count FROM self_repair_cases WHERE source = 'cloud_monitor'").get().occurrence_count, 1);

const secondRun = await runSelfRepairHourlyMonitor(env, {
  scheduledTime: firstHour + 60 * 60 * 1000,
  triggeredBy: "cloudflare-cron",
  fetchImpl: fetchWithTyreFailure
});
assert.equal(secondRun.status, "dry_run");
assert.equal(secondRun.newCases, 0);
assert.equal(secondRun.deduplicatedCases, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 1);
assert.equal(sqlite.prepare("SELECT occurrence_count FROM self_repair_cases WHERE source = 'cloud_monitor'").get().occurrence_count, 2);

const healthyRun = await runSelfRepairHourlyMonitor(env, {
  scheduledTime: firstHour + 2 * 60 * 60 * 1000,
  triggeredBy: "cloudflare-cron",
  fetchImpl: healthyFetch
});
assert.equal(healthyRun.status, "success");
assert.equal(healthyRun.findingsTotal, 0);
assert.equal(healthyRun.newCases, 0);
assert.equal(sqlite.prepare("SELECT occurrence_count FROM self_repair_cases WHERE source = 'cloud_monitor'").get().occurrence_count, 2);

const failedRun = await runSelfRepairHourlyMonitor(env, {
  scheduledTime: firstHour + 3 * 60 * 60 * 1000,
  triggeredBy: "cloudflare-cron",
  fetchImpl: failedManifestFetch
});
assert.equal(failedRun.status, "error");
assert.equal(failedRun.codexExecuted, false);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 2);
assert.equal(sqlite.prepare("SELECT status FROM module_automation_runner_runs ORDER BY started_at DESC LIMIT 1").get().status, "error");

const status = await getSelfRepairStatus(env);
assert.equal(status.phase, "phase2a_hourly_read_only_monitor");
assert.equal(status.capabilities.hourlyMonitor, "warning");
assert.equal(status.capabilities.promptPreparation, "ready");
assert.equal(status.capabilities.codexExecution, "off");
assert.equal(status.capabilities.deployment, "off");
assert.equal(status.capabilities.userEmail, "off");
assert.equal(status.monitor.monitorCases, 2);
assert.equal(status.monitor.promptDrafts, 2);

console.log("Self-repair Phase 2A hourly monitor tests passed.");
