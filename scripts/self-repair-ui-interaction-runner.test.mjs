import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { runSelfRepairDailyUiInteractionScan } from "../functions/_lib/self-repair-ui-interaction-runner.js";
import { getSelfRepairStatus } from "../functions/_lib/self-repair-store.js";
import {
  SELF_REPAIR_UI_SCAN_CRON,
  SELF_REPAIR_UI_SCAN_RULE_ID,
  nextSelfRepairUiScanRun
} from "../functions/_lib/self-repair-ui-interaction-config.js";
import { UI_ACTION_AUDIT_CASES } from "../src/data/uiActionContract.js";

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

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const manifest = {
  schemaVersion: 1,
  build: { version: "0.1.608", branch: "main", commit: "ui608test" },
  routes: [{ path: "/samoopravy", moduleKey: "self-repair", label: "Samoopravy" }]
};
const requests = [];

async function productionAssetFetch(input, init = {}) {
  const url = new URL(input);
  requests.push({ url: url.toString(), method: init.method });
  if (url.pathname === "/route-manifest.json") {
    return Response.json(manifest);
  }
  if (url.pathname === "/src/app.js") {
    return new Response(appSource, { status: 200, headers: { "content-type": "application/javascript" } });
  }
  if (url.pathname === "/src/styles.css") {
    return new Response(stylesSource, { status: 200, headers: { "content-type": "text/css" } });
  }
  return new Response("not found", { status: 404 });
}

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "0007_create_module_feedback.sql",
  "0015_create_module_rules.sql",
  "0016_create_module_automation_runner_runs.sql",
  "0034_create_self_repair_cases.sql",
  "0035_activate_self_repair_hourly_monitor.sql",
  "0046_activate_self_repair_daily_ui_interaction_scan.sql"
]) {
  applyMigration(sqlite, migration);
}

const rule = sqlite.prepare("SELECT status, schedule_cron, cloud_runner, conditions_json, actions_json FROM module_rules WHERE id = ?").get(SELF_REPAIR_UI_SCAN_RULE_ID);
assert.equal(rule.status, "active");
assert.equal(rule.schedule_cron, SELF_REPAIR_UI_SCAN_CRON);
assert.equal(JSON.parse(rule.conditions_json).realActionClicks, false);
assert.equal(JSON.parse(rule.conditions_json).authenticatedProductionSession, false);
assert.equal(JSON.parse(rule.actions_json).syntheticClicksOnly, true);
assert.equal(JSON.parse(rule.actions_json).blockBrowserNetwork, true);

const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  APP_BASE_URL: "https://smart-odpady.test/"
};
const scheduledTime = Date.UTC(2026, 6, 18, 2, 37, 0);

const cleanRun = await runSelfRepairDailyUiInteractionScan(env, {
  scheduledTime,
  triggeredBy: "cloudflare-cron",
  fetchImpl: productionAssetFetch,
  browserAudit: async ({ cases }) => ({
    actionsChecked: cases.length,
    findings: [],
    realProductionClicks: false,
    authenticatedSession: false,
    browserNetwork: "blocked-no-attempt"
  })
});

assert.equal(cleanRun.status, "success");
assert.equal(cleanRun.actionsChecked, UI_ACTION_AUDIT_CASES.length);
assert.equal(cleanRun.findingsTotal, 0);
assert.equal(cleanRun.realProductionClicks, false);
assert.equal(cleanRun.authenticatedSession, false);
assert.equal(cleanRun.browserNetwork, "blocked");
assert.equal(requests.length, 3);
assert.ok(requests.every((request) => request.method === "GET"));
assert.ok(requests.every((request) => new URL(request.url).origin === "https://smart-odpady.test"));

const duplicateRun = await runSelfRepairDailyUiInteractionScan(env, {
  scheduledTime,
  fetchImpl: () => {
    throw new Error("duplicate run nesmí číst síť");
  },
  browserAudit: () => {
    throw new Error("duplicate run nesmí spouštět browser");
  }
});
assert.equal(duplicateRun.status, "skipped");

const findingAction = UI_ACTION_AUDIT_CASES[0];
const findingRun = await runSelfRepairDailyUiInteractionScan(env, {
  scheduledTime: scheduledTime + 24 * 60 * 60 * 1000,
  triggeredBy: "cloudflare-cron",
  fetchImpl: productionAssetFetch,
  browserAudit: async () => ({
    actionsChecked: UI_ACTION_AUDIT_CASES.length,
    findings: [{
      key: `ui_action_browser:${findingAction.id}:duplicate_lock_missing`,
      type: "ui_action_browser",
      route: findingAction.route,
      moduleKey: findingAction.moduleKey,
      moduleName: findingAction.moduleName,
      title: `${findingAction.actionLabel}: izolovaný klikací test selhal`,
      description: "Syntetický test našel chybějící blokaci dvojkliku.",
      expected: "Jeden běh akce.",
      actual: "Dvojklik spustil dvě syntetické operace.",
      reproductionSteps: "Spustit lokální kontraktový test bez produkčního kliknutí."
    }]
  })
});
assert.equal(findingRun.status, "dry_run");
assert.equal(findingRun.findingsTotal, 1);
assert.equal(findingRun.newCases, 1);

const storedCase = sqlite.prepare(`
  SELECT reporter_user_id, reporter_user_name, occurrence_count
  FROM self_repair_cases
  WHERE reporter_user_id = 'cloud:self-repair-ui-scan'
`).get();
assert.equal(storedCase.reporter_user_name, "Denní syntetický UI audit");
assert.equal(storedCase.occurrence_count, 1);
const storedEvidence = sqlite.prepare(`
  SELECT label, metadata_json
  FROM self_repair_case_evidence
  WHERE evidence_type = 'cloud_monitor_finding'
    AND created_by_user_id = 'cloud:self-repair-ui-scan'
`).get();
assert.equal(storedEvidence.label, "Důkaz denního syntetického UI auditu");
assert.equal(JSON.parse(storedEvidence.metadata_json).readOnly, true);

const errorRun = await runSelfRepairDailyUiInteractionScan(env, {
  scheduledTime: scheduledTime + 2 * 24 * 60 * 60 * 1000,
  triggeredBy: "cloudflare-cron",
  fetchImpl: productionAssetFetch,
  browserAudit: async () => {
    throw new Error("Browser Run test failure");
  }
});
assert.equal(errorRun.status, "error");
assert.equal(errorRun.failedCount, 1);
assert.equal(errorRun.realProductionClicks, false);
assert.match(errorRun.message, /Browser Run test failure/);

const status = await getSelfRepairStatus(env);
assert.equal(status.phase, "phase2b_read_only_and_synthetic_ui_scan");
assert.equal(status.uiInteractionScan.active, true);
assert.equal(status.uiInteractionScan.scheduleCron, SELF_REPAIR_UI_SCAN_CRON);
assert.equal(status.uiInteractionScan.realProductionClicks, false);
assert.equal(status.uiInteractionScan.authenticatedSession, false);
assert.equal(status.uiInteractionScan.browserNetwork, "blocked");

assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_automation_runs WHERE rule_id = ?").get(SELF_REPAIR_UI_SCAN_RULE_ID).count, 3);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_automation_runner_runs WHERE runner_name = 'self-repair-phase2b-daily-ui-interaction-scan'").get().count, 3);
assert.equal(nextSelfRepairUiScanRun(new Date("2026-07-18T02:38:00.000Z")), "2026-07-19T02:37:00.000Z");

console.log("Self-repair daily synthetic UI interaction runner tests passed.");
