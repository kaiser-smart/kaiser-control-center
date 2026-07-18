INSERT OR IGNORE INTO module_rules (
  id, module_key, title, description, type, status, conditions_json, actions_json,
  is_automation, trigger_type, schedule_cron, event_name, cloud_runner,
  last_run_at, next_run_at, last_run_status, last_run_message,
  created_by_user_id, created_at, updated_by_user_id, updated_at
) VALUES (
  'self-repair-daily-ui-interaction-scan',
  'self-repair',
  'Denní kontrola odezvy tlačítek',
  'Oddělený Cloudflare Browser Run jednou denně stáhne produkční app.js a CSS pouze přes GET. Kliknutí provede výhradně v izolované syntetické stránce bez přihlášení, cookies a přístupu k produkčním akcím.',
  'automation',
  'active',
  '{"intervalHours":24,"mode":"read_only_synthetic_browser","productionReads":["route_manifest","app_js","styles_css"],"authenticatedProductionSession":false,"realActionClicks":false}',
  '{"createCaseOnly":true,"syntheticClicksOnly":true,"blockBrowserNetwork":true,"runCodex":false,"repoWrite":false,"pullRequest":false,"deploy":false,"notify":false}',
  1,
  'time',
  '37 2 * * *',
  '',
  'self-repair-phase2b-daily-ui-interaction-scan',
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),
  NULL,
  'Denní bezpečný klikací audit aktivován. Čeká na první cloudový běh.',
  'migration-0046',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0046',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE module_rules
SET
  conditions_json = '{"phase":"2B","allowed":["record","triage","audit","read_only_monitor","prompt_draft","synthetic_ui_interaction_scan"],"requiresHumanApproval":true}',
  actions_json = '{"blocked":["real_production_action_click","codex_execution","code_change","pull_request","deployment","email"],"enforce":"backend_and_ui"}',
  updated_by_user_id = 'migration-0046',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'self-repair-phase1-safety-boundary'
  AND module_key = 'self-repair';

INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at,
  before_json, after_json, note
) VALUES (
  'audit-self-repair-phase2b-daily-ui-interaction-scan',
  'self-repair-daily-ui-interaction-scan',
  'self-repair',
  'activate',
  'migration-0046',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  NULL,
  '{"status":"active","scheduleCron":"37 2 * * *","cloudRunner":"self-repair-phase2b-daily-ui-interaction-scan","realActionClicks":false,"runCodex":false,"deploy":false,"notify":false}',
  'Schválen denní klikací audit pouze v izolovaném syntetickém browseru. Produkční akce se neklikají a síť testovací stránky je blokovaná.'
);
