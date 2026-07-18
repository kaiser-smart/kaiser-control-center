import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const latencyCleanupMigration = readFileSync(
  new URL("../migrations/0047_close_self_repair_ui_latency_false_positives.sql", import.meta.url),
  "utf8"
);

const pageSource = appSource.slice(
  appSource.indexOf("function selfRepairPage(moduleItem, user)"),
  appSource.indexOf("function driverReportSelectedIdFromUrl()")
);
const detailSource = appSource.slice(
  appSource.indexOf("function selfRepairCaseDetail(user)"),
  appSource.indexOf("function selfRepairTechnicalManagement(moduleItem, user)")
);
const technicalSource = appSource.slice(
  appSource.indexOf("function selfRepairTechnicalManagement(moduleItem, user)"),
  appSource.indexOf("function selfRepairPage(moduleItem, user)")
);
const filterSource = appSource.slice(
  appSource.indexOf("function applySelfRepairFilters(form)"),
  appSource.indexOf("async function updateSelfRepairCaseFromForm(form)")
);

assert.match(appSource, /const SELF_REPAIR_ACTIVE_FILTER_VALUE = "active"/);
assert.match(appSource, /const SELF_REPAIR_ARCHIVED_STATUSES = new Set\(\["closed", "rejected", "duplicate"\]\)/);
assert.match(appSource, /status: SELF_REPAIR_ACTIVE_FILTER_VALUE/);
assert.match(appSource, /selfRepairState\.cases\.find\(\(item\) => !selfRepairCaseIsArchived\(item\)\)/);

assert.match(pageSource, /selfRepairOperationalOverview\(\)/);
assert.match(pageSource, /Nahlásit problém/);
assert.match(pageSource, /Hodinová dostupnost \+ denní bezpečný UI audit/);
assert.match(pageSource, /uiActionContractAttributes\(selfRepairRefreshAction\)/);
assert.match(pageSource, /Žádný aktivní případ\. Teď není potřeba nic řešit\./);
assert.match(pageSource, /Obnovit seznam/);
assert.match(pageSource, /selfRepairTechnicalManagement\(moduleItem, user\)/);
assert.doesNotMatch(pageSource, /Spustit read-only kontrolu/);
assert.doesNotMatch(pageSource, /moduleRulesAutomationPanel\(\{/);

assert.match(detailSource, /Vyřízení případu/);
assert.match(detailSource, /Uložit vyřízení/);
assert.match(detailSource, /<details class="self-repair-case-history">/);
assert.match(detailSource, /Historie a technické podklady/);
assert.match(detailSource, /Historie změn/);

assert.match(technicalSource, /<details class="self-repair-technical">/);
assert.match(technicalSource, /Technická správa/);
assert.match(technicalSource, /Spustit servisní kontrolu/);
assert.match(technicalSource, /selfRepairCapabilityGrid\(\)/);
assert.match(technicalSource, /moduleRulesAutomationPanel\(\{/);
assert.match(technicalSource, /self-repair-daily-ui-interaction-scan/);
assert.match(technicalSource, /genericModuleSettingsSection\(moduleItem\)/);

assert.match(filterSource, /status: SELF_REPAIR_ACTIVE_FILTER_VALUE/);
assert.match(filterSource, /selfRepairCaseIsArchived\(item\)/);
assert.match(stylesSource, /\.self-repair-overview\s*\{/);
assert.match(stylesSource, /\.self-repair-case-history\s*\{/);
assert.match(stylesSource, /\.self-repair-technical\s*\{/);
assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]*\.self-repair-service-actions/);
assert.match(latencyCleanupMigration, /status = 'closed'/);
assert.match(latencyCleanupMigration, /status = 'invalidated'/);
assert.match(latencyCleanupMigration, /dedupe_key = dedupe_key \|\| ':invalidated-0047'/);
assert.match(latencyCleanupMigration, /Produkční tlačítko ani akce se nespustily/);
assert.doesNotMatch(latencyCleanupMigration, /DELETE\s+FROM/i);

const cleanupDb = new DatabaseSync(":memory:");
for (const migration of [
  "0015_create_module_rules.sql",
  "0016_create_module_automation_runner_runs.sql",
  "0034_create_self_repair_cases.sql",
  "0035_activate_self_repair_hourly_monitor.sql",
  "0046_activate_self_repair_daily_ui_interaction_scan.sql"
]) {
  cleanupDb.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
}
cleanupDb.exec(`
  INSERT INTO module_automation_runs (
    id, rule_id, module_key, started_at, finished_at, status,
    message, error_code, triggered_by, dedupe_key
  ) VALUES (
    'module-automation-run-a23e71e4-19ca-445c-8b7d-ee2c8b025c4d',
    'self-repair-daily-ui-interaction-scan',
    'self-repair',
    '2026-07-18T17:46:33.309Z',
    '2026-07-18T17:46:48.301Z',
    'dry_run',
    '8 testovacích nálezů',
    NULL,
    'cloudflare-cron',
    'self-repair-ui-scan:self-repair-daily-ui-interaction-scan:2026-07-18'
  );
  INSERT INTO module_automation_runner_runs (
    id, module_key, runner_name, started_at, scheduled_at, finished_at,
    triggered_by, status, rules_total, dry_run_count, skipped_count,
    failed_count, message, error_code, d1_binding, database_name,
    cron, time_zone, created_at
  ) VALUES (
    'module-automation-runner-run-6bfa4f3d-8109-4825-8f0b-512f4e0080b0',
    'self-repair',
    'self-repair-phase2b-daily-ui-interaction-scan',
    '2026-07-18T17:46:33.309Z',
    '2026-07-18T17:46:33.309Z',
    '2026-07-18T17:46:48.301Z',
    'cloudflare-cron',
    'dry_run',
    4,
    8,
    0,
    0,
    '8 testovacích nálezů',
    NULL,
    'SMART_ODPADY_DB',
    'smart-odpady',
    '37 2 * * *',
    'Europe/Prague',
    '2026-07-18T17:46:33.309Z'
  );
  WITH RECURSIVE sequence(number) AS (
    VALUES(1)
    UNION ALL
    SELECT number + 1 FROM sequence WHERE number < 8
  )
  INSERT INTO self_repair_cases (
    id, feedback_id, source, case_type, status, priority, risk_level,
    module_key, module_name, target_repo_key, target_production_url,
    title, description, expected_behavior, actual_behavior,
    reproduction_steps, source_route, build_version, build_commit,
    browser_info, reporter_user_id, reporter_user_name, fingerprint,
    occurrence_count, first_seen_at, last_seen_at, triage_summary,
    internal_note, created_at, updated_at, updated_by_user_id
  )
  SELECT
    'cleanup-test-case-' || number,
    NULL,
    'cloud_monitor',
    'bug',
    'new',
    'Běžná',
    'unclassified',
    'self-repair',
    'Samoopravy',
    'kaiser-control-center',
    'https://smart-odpady.ai/',
    'Syntetický test ' || number,
    'Test falešně pozitivního nálezu.',
    'Bez falešného nálezu.',
    CASE WHEN number % 2 = 0
      THEN 'Busy stav nebyl okamžitě viditelný (observed=true, state=busy, ariaBusy=false, disabled=false).'
      ELSE 'Opakovaný klik nebyl bezpečně zablokovaný (blocked=0, actionCount=2).'
    END,
    'Pouze syntetická stránka.',
    '/samoopravy',
    '0.1.611',
    '7dd6a1f',
    '',
    'cloud:self-repair-ui-scan',
    'Denní syntetický UI audit',
    'cleanup-test-fingerprint-' || number,
    1,
    '2026-07-18T17:46:40.000Z',
    '2026-07-18T17:46:40.000Z',
    NULL,
    NULL,
    '2026-07-18T17:46:40.000Z',
    '2026-07-18T17:46:40.000Z',
    NULL
  FROM sequence;
  UPDATE module_rules
  SET last_run_status = 'dry_run'
  WHERE id = 'self-repair-daily-ui-interaction-scan';
`);
cleanupDb.exec(latencyCleanupMigration);
assert.equal(cleanupDb.prepare("SELECT COUNT(*) AS count FROM self_repair_cases").get().count, 8);
assert.equal(cleanupDb.prepare("SELECT COUNT(*) AS count FROM self_repair_cases WHERE status = 'closed'").get().count, 8);
assert.equal(cleanupDb.prepare("SELECT COUNT(*) AS count FROM self_repair_case_audit_log WHERE action = 'false_positive_closed'").get().count, 8);
assert.equal(cleanupDb.prepare("SELECT status FROM module_automation_runner_runs WHERE id = 'module-automation-runner-run-6bfa4f3d-8109-4825-8f0b-512f4e0080b0'").get().status, "invalidated");
const invalidatedAutomation = cleanupDb.prepare("SELECT status, dedupe_key FROM module_automation_runs WHERE id = 'module-automation-run-a23e71e4-19ca-445c-8b7d-ee2c8b025c4d'").get();
assert.equal(invalidatedAutomation.status, "invalidated");
assert.match(invalidatedAutomation.dedupe_key, /:invalidated-0047$/);
assert.equal(cleanupDb.prepare("SELECT COUNT(*) AS count FROM module_rule_audit_log WHERE id = 'audit-self-repair-0047-ui-latency-cleanup'").get().count, 1);

console.log("Self-repair UI cleanup tests passed.");
