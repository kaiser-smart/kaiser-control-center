CREATE TABLE IF NOT EXISTS self_repair_cases (
  id TEXT PRIMARY KEY NOT NULL,
  feedback_id TEXT UNIQUE,
  source TEXT NOT NULL,
  case_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  module_key TEXT NOT NULL,
  module_name TEXT NOT NULL,
  target_repo_key TEXT NOT NULL,
  target_production_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_behavior TEXT,
  actual_behavior TEXT,
  reproduction_steps TEXT,
  source_route TEXT,
  build_version TEXT,
  build_commit TEXT,
  browser_info TEXT,
  reporter_user_id TEXT NOT NULL,
  reporter_user_name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  triage_summary TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_status
  ON self_repair_cases(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_risk
  ON self_repair_cases(risk_level, updated_at);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_module
  ON self_repair_cases(module_key, updated_at);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_reporter
  ON self_repair_cases(reporter_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_fingerprint
  ON self_repair_cases(fingerprint, last_seen_at);

CREATE TABLE IF NOT EXISTS self_repair_case_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  label TEXT,
  content_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_evidence_case
  ON self_repair_case_evidence(case_id, created_at);

CREATE TABLE IF NOT EXISTS self_repair_case_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_user_name TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_audit_case
  ON self_repair_case_audit_log(case_id, changed_at);

INSERT OR IGNORE INTO module_rules (
  id, module_key, title, description, type, status, conditions_json, actions_json,
  is_automation, trigger_type, schedule_cron, event_name, cloud_runner,
  last_run_at, next_run_at, last_run_status, last_run_message,
  created_by_user_id, created_at, updated_by_user_id, updated_at
) VALUES
(
  'self-repair-phase1-safety-boundary',
  'self-repair',
  'Fáze 1 pouze eviduje a třídí podněty',
  'Případy lze uložit a spravovat. Systém bez následného schválení nesmí měnit kód, otevírat pull request, nasazovat ani odesílat zprávy.',
  'rule',
  'active',
  '{"phase":"1","allowed":["record","triage","audit"],"requiresHumanApproval":true}',
  '{"blocked":["code_change","pull_request","deployment","email"],"enforce":"backend_and_ui"}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  'Aktivní bezpečnostní hranice Fáze 1.',
  'migration-0034',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0034',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'self-repair-hourly-monitor-proposal',
  'self-repair',
  'Budoucí hodinová kontrola aplikace',
  'Návrh budoucí kontroly aplikace. Ve Fázi 1 se sama nespouští a nemá přístup ke Codexu.',
  'automation',
  'draft',
  '{"intervalMinutes":60,"mode":"read_only","sources":["production_http","runtime_errors","tests"]}',
  '{"createCaseOnly":true,"runCodex":false,"deploy":false,"notify":false}',
  1,
  'time',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  'Čeká na samostatné schválení infrastruktury a bezpečnostních pravidel.',
  'migration-0034',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0034',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO module_rule_audit_log (
  id, rule_id, module_key, action, changed_by_user_id, changed_at,
  before_json, after_json, note
)
SELECT
  'audit-seed-' || id,
  id,
  module_key,
  'seed',
  'migration-0034',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  NULL,
  '{"status":"seeded"}',
  'Výchozí pravidla modulu Samoopravy Fáze 1.'
FROM module_rules
WHERE module_key = 'self-repair'
  AND id IN ('self-repair-phase1-safety-boundary', 'self-repair-hourly-monitor-proposal');
