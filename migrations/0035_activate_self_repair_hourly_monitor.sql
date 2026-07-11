CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_cloud_monitor_active_fingerprint
  ON self_repair_cases(fingerprint)
  WHERE source = 'cloud_monitor'
    AND status NOT IN ('rejected', 'duplicate', 'closed');

UPDATE module_rules
SET
  title = 'Fáze 2A dovoluje pouze read-only monitoring a návrh promptu',
  description = 'Systém smí každou hodinu číst veřejný produkční web, zapsat nález, deduplikovat případ a připravit návrh promptu. Nesmí spustit Codex, měnit repozitář, otevřít pull request, nasadit ani odeslat zprávu.',
  conditions_json = '{"phase":"2A","allowed":["record","triage","audit","read_only_monitor","prompt_draft"],"requiresHumanApproval":true}',
  actions_json = '{"blocked":["codex_execution","code_change","pull_request","deployment","email"],"enforce":"backend_and_ui"}',
  updated_by_user_id = 'migration-0035',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'self-repair-phase1-safety-boundary'
  AND module_key = 'self-repair';

UPDATE module_rules
SET
  title = 'Hodinová read-only kontrola aplikace',
  description = 'Cloud Worker každou hodinu čte manifest nasazených stránek a ověřuje jejich HTTP/HTML a verzi assetů. Nález pouze uloží, deduplikuje a doplní návrh promptu; Codex ani další akci nespouští.',
  type = 'automation',
  status = 'active',
  conditions_json = '{"intervalMinutes":60,"mode":"read_only","source":"production_route_manifest","maxRoutes":48}',
  actions_json = '{"createCaseOnly":true,"preparePromptDraft":true,"runCodex":false,"repoWrite":false,"pullRequest":false,"deploy":false,"notify":false}',
  is_automation = 1,
  trigger_type = 'time',
  schedule_cron = '7 * * * *',
  event_name = '',
  cloud_runner = 'self-repair-phase2a-hourly-monitor',
  next_run_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),
  last_run_message = 'Fáze 2A aktivována. Čeká na první ověřený cloudový běh.',
  updated_by_user_id = 'migration-0035',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'self-repair-hourly-monitor-proposal'
  AND module_key = 'self-repair';

INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at,
  before_json, after_json, note
) VALUES
(
  'audit-self-repair-phase2a-safety-boundary',
  'self-repair-phase1-safety-boundary',
  'self-repair',
  'phase2a_activate',
  'migration-0035',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"phase":"1","allowed":["record","triage","audit"]}',
  '{"phase":"2A","allowed":["record","triage","audit","read_only_monitor","prompt_draft"],"blocked":["codex_execution","code_change","pull_request","deployment","email"]}',
  'Schválena pouze read-only kontrola a návrh promptu. Codex, zápis do repozitáře, deploy a e-mail zůstávají blokované.'
),
(
  'audit-self-repair-phase2a-hourly-monitor',
  'self-repair-hourly-monitor-proposal',
  'self-repair',
  'activate',
  'migration-0035',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"status":"draft","scheduleCron":"","cloudRunner":""}',
  '{"status":"active","scheduleCron":"7 * * * *","cloudRunner":"self-repair-phase2a-hourly-monitor","runCodex":false,"deploy":false,"notify":false}',
  'Hodinový cloud monitor Fáze 2A aktivován v read-only režimu.'
);
