INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at,
  before_json, after_json, note
)
SELECT
  'audit-self-repair-0036-http-308-cleanup',
  'self-repair-hourly-monitor-proposal',
  'self-repair',
  'false_positive_cleanup',
  'migration-0036',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"buildVersion":"0.1.498","buildCommit":"7c072d0","actualBehavior":"HTTP 308","testRunId":"module-automation-runner-run-4eb2ed07-1e37-4e9d-9144-c1d46d82a120"}',
  '{"falsePositiveCasesRemoved":true,"reason":"canonical_trailing_slash"}',
  'Odstraněny pouze strojově vytvořené falešné nálezy z prvního produkčního testu Fáze 2A. HTTP 308 bylo legitimní kanonické přesměrování Cloudflare Pages.'
WHERE EXISTS (
  SELECT 1
  FROM self_repair_cases
  WHERE source = 'cloud_monitor'
    AND actual_behavior = 'Stránka vrátila HTTP 308.'
    AND build_version = '0.1.498'
    AND build_commit = '7c072d0'
    AND created_at >= '2026-07-11T06:38:00.000Z'
    AND created_at < '2026-07-11T06:39:00.000Z'
);

DELETE FROM self_repair_case_evidence
WHERE case_id IN (
  SELECT id
  FROM self_repair_cases
  WHERE source = 'cloud_monitor'
    AND actual_behavior = 'Stránka vrátila HTTP 308.'
    AND build_version = '0.1.498'
    AND build_commit = '7c072d0'
    AND created_at >= '2026-07-11T06:38:00.000Z'
    AND created_at < '2026-07-11T06:39:00.000Z'
);

DELETE FROM self_repair_case_audit_log
WHERE case_id IN (
  SELECT id
  FROM self_repair_cases
  WHERE source = 'cloud_monitor'
    AND actual_behavior = 'Stránka vrátila HTTP 308.'
    AND build_version = '0.1.498'
    AND build_commit = '7c072d0'
    AND created_at >= '2026-07-11T06:38:00.000Z'
    AND created_at < '2026-07-11T06:39:00.000Z'
);

DELETE FROM self_repair_cases
WHERE source = 'cloud_monitor'
  AND actual_behavior = 'Stránka vrátila HTTP 308.'
  AND build_version = '0.1.498'
  AND build_commit = '7c072d0'
  AND created_at >= '2026-07-11T06:38:00.000Z'
  AND created_at < '2026-07-11T06:39:00.000Z';

UPDATE module_automation_runner_runs
SET
  status = 'invalidated',
  message = 'První produkční ověřovací běh byl zneplatněn: 41 nálezů HTTP 308 byla legitimní kanonická přesměrování Cloudflare Pages. Codex, repozitář, deploy ani e-mail nebyly spuštěny.'
WHERE id = 'module-automation-runner-run-4eb2ed07-1e37-4e9d-9144-c1d46d82a120'
  AND runner_name = 'self-repair-phase2a-hourly-monitor';

UPDATE module_automation_runs
SET
  status = 'invalidated',
  message = 'První produkční ověřovací běh byl zneplatněn kvůli falešné interpretaci kanonického HTTP 308.',
  dedupe_key = dedupe_key || ':invalidated-0036'
WHERE id = 'module-automation-run-6fd7a8dd-212c-4f93-a0fb-5ca16a37fa0a'
  AND dedupe_key = 'self-repair-monitor:self-repair-hourly-monitor-proposal:2026-07-11T06';

UPDATE module_rules
SET
  last_run_status = 'waiting',
  last_run_message = 'Falešné nálezy HTTP 308 byly odstraněny. Monitor čeká na čistý ověřovací běh s kanonickými adresami.',
  updated_by_user_id = 'migration-0036',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'self-repair-hourly-monitor-proposal'
  AND module_key = 'self-repair';
