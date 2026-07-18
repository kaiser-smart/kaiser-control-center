INSERT OR IGNORE INTO self_repair_case_audit_log (
  id, case_id, action, changed_by_user_id, changed_by_user_name,
  changed_at, before_json, after_json, note
)
SELECT
  'audit-self-repair-0047-' || id,
  id,
  'false_positive_closed',
  'migration-0047',
  'Systém Samooprav',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"status":"new","buildVersion":"0.1.611","buildCommit":"7dd6a1f"}',
  '{"status":"closed","reason":"remote_browser_round_trip_latency"}',
  'Falešný nález uzavřen bez smazání. Vzdálené čtení atributů trvalo déle než původní 350ms syntetická operace; produkční tlačítko ani akce se nespustily.'
FROM self_repair_cases
WHERE reporter_user_id = 'cloud:self-repair-ui-scan'
  AND build_version = '0.1.611'
  AND build_commit = '7dd6a1f'
  AND status = 'new'
  AND created_at >= '2026-07-18T17:46:00.000Z'
  AND created_at < '2026-07-18T17:47:00.000Z'
  AND (
    actual_behavior LIKE 'Busy stav nebyl okamžitě viditelný%'
    OR actual_behavior LIKE 'Opakovaný klik nebyl bezpečně zablokovaný%'
  );

UPDATE self_repair_cases
SET
  status = 'closed',
  internal_note = 'Automaticky uzavřeno jako falešný nález prvního vzdáleného Browser testu. Příčina: 350ms syntetická operace doběhla během síťové prodlevy čtení testovacího DOM. Produkční tlačítko ani akce se nespustily.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  updated_by_user_id = 'migration-0047'
WHERE reporter_user_id = 'cloud:self-repair-ui-scan'
  AND build_version = '0.1.611'
  AND build_commit = '7dd6a1f'
  AND status = 'new'
  AND created_at >= '2026-07-18T17:46:00.000Z'
  AND created_at < '2026-07-18T17:47:00.000Z'
  AND (
    actual_behavior LIKE 'Busy stav nebyl okamžitě viditelný%'
    OR actual_behavior LIKE 'Opakovaný klik nebyl bezpečně zablokovaný%'
  );

UPDATE module_automation_runner_runs
SET
  status = 'invalidated',
  message = 'První vzdálený Browser test byl zneplatněn: 8 nálezů vzniklo kvůli 350ms syntetickému časování a prodlevě vzdáleného čtení DOM. Produkční tlačítka se neklikala.',
  error_code = 'synthetic_timing_false_positive'
WHERE id = 'module-automation-runner-run-6bfa4f3d-8109-4825-8f0b-512f4e0080b0'
  AND runner_name = 'self-repair-phase2b-daily-ui-interaction-scan'
  AND status = 'dry_run';

UPDATE module_automation_runs
SET
  status = 'invalidated',
  message = 'První vzdálený Browser test byl zneplatněn kvůli prodlevě syntetického testovacího DOM.',
  error_code = 'synthetic_timing_false_positive',
  dedupe_key = dedupe_key || ':invalidated-0047'
WHERE id = 'module-automation-run-a23e71e4-19ca-445c-8b7d-ee2c8b025c4d'
  AND dedupe_key = 'self-repair-ui-scan:self-repair-daily-ui-interaction-scan:2026-07-18'
  AND status = 'dry_run';

UPDATE module_rules
SET
  last_run_status = 'waiting',
  last_run_message = 'První vzdálený Browser test byl zneplatněn kvůli krátkému syntetickému časování. Hotfix 0.1.612 čeká na čistý opakovaný běh.',
  updated_by_user_id = 'migration-0047',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'self-repair-daily-ui-interaction-scan'
  AND module_key = 'self-repair'
  AND last_run_status = 'dry_run';

INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at,
  before_json, after_json, note
) VALUES (
  'audit-self-repair-0047-ui-latency-cleanup',
  'self-repair-daily-ui-interaction-scan',
  'self-repair',
  'false_positive_cleanup',
  'migration-0047',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"runnerRunId":"module-automation-runner-run-6bfa4f3d-8109-4825-8f0b-512f4e0080b0","findings":8,"buildVersion":"0.1.611","buildCommit":"7dd6a1f"}',
  '{"casesClosed":8,"runnerInvalidated":true,"dedupeReleased":true,"reason":"remote_browser_round_trip_latency"}',
  'Osm falešných případů z prvního vzdáleného syntetického testu bylo uzavřeno s auditní stopou, nikoli smazáno. Produkční akce nebyly spuštěny.'
);
