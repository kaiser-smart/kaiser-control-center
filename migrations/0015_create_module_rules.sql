CREATE TABLE IF NOT EXISTS module_rules (
  id TEXT PRIMARY KEY NOT NULL,
  module_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '{}',
  is_automation INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  schedule_cron TEXT,
  event_name TEXT,
  cloud_runner TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  last_run_status TEXT,
  last_run_message TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_module_rules_module_status
  ON module_rules(module_key, status);

CREATE INDEX IF NOT EXISTS idx_module_rules_type
  ON module_rules(module_key, type, is_automation);

CREATE INDEX IF NOT EXISTS idx_module_rules_updated
  ON module_rules(module_key, updated_at);

CREATE TABLE IF NOT EXISTS module_rule_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_rule_audit_rule
  ON module_rule_audit_log(rule_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_module_rule_audit_module
  ON module_rule_audit_log(module_key, changed_at);

CREATE TABLE IF NOT EXISTS module_automation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  message TEXT,
  error_code TEXT,
  triggered_by TEXT,
  dedupe_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_automation_runs_rule
  ON module_automation_runs(rule_id, started_at);

CREATE INDEX IF NOT EXISTS idx_module_automation_runs_module
  ON module_automation_runs(module_key, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_module_automation_runs_dedupe
  ON module_automation_runs(module_key, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

INSERT OR IGNORE INTO module_rules (
  id,
  module_key,
  title,
  description,
  type,
  status,
  conditions_json,
  actions_json,
  is_automation,
  trigger_type,
  schedule_cron,
  event_name,
  cloud_runner,
  last_run_at,
  next_run_at,
  last_run_status,
  last_run_message,
  created_by_user_id,
  created_at,
  updated_by_user_id,
  updated_at
) VALUES
(
  'absence-medical-exam-due-soon',
  'absence',
  'Lékařské prohlídky - upozornění do 60 dnů',
  'Cloud evidence pravidla pro hlídání lékařských prohlídek, které mají termín do 60 dnů.',
  'automation',
  'active',
  '{"source":"employee_medical_exams","status":["due_soon"],"daysToDue":60}',
  '{"notification":"medical_exam_due_soon","channel":"backend_only","frontendSend":false}',
  1,
  'time',
  '0 6 * * *',
  '',
  'phase2-cloud-cron',
  NULL,
  NULL,
  NULL,
  'Fáze 1 eviduje pravidlo bez spuštění automatizace.',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-medical-exam-overdue',
  'absence',
  'Lékařské prohlídky - upozornění po termínu',
  'Cloud evidence pravidla pro zaměstnance s prošlou lékařskou prohlídkou.',
  'automation',
  'active',
  '{"source":"employee_medical_exams","status":["overdue"]}',
  '{"notification":"medical_exam_overdue","channel":"backend_only","frontendSend":false}',
  1,
  'time',
  '0 6 * * *',
  '',
  'phase2-cloud-cron',
  NULL,
  NULL,
  NULL,
  'Fáze 1 eviduje pravidlo bez spuštění automatizace.',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-approval-reminder-24h',
  'absence',
  'Dovolená - připomenutí schválení po 24 hodinách',
  'Cloud evidence připomínky pro žádosti čekající na schválení déle než 24 hodin.',
  'automation',
  'active',
  '{"source":"absence_requests","status":["pending_approval"],"olderThanHours":24}',
  '{"notification":"absence_approval_reminder","channel":"backend_only","frontendSend":false}',
  1,
  'time',
  '0 * * * *',
  '',
  'phase2-cloud-cron',
  NULL,
  NULL,
  NULL,
  'Fáze 1 eviduje pravidlo bez spuštění automatizace.',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-employee-decision-notification',
  'absence',
  'Notifikace zaměstnanci po schválení/zamítnutí',
  'Cloud evidence pravidla pro backendovou SMS/e-mail notifikaci zaměstnance po rozhodnutí.',
  'automation',
  'active',
  '{"source":"absence_approval_history","toStatus":["approved","rejected"]}',
  '{"notification":"absence_decision_employee","channel":"backend_only","frontendSend":false}',
  1,
  'event',
  '',
  'absence_request_decided',
  'backend-event',
  NULL,
  NULL,
  NULL,
  'Fáze 1 eviduje pravidlo bez spuštění automatizace.',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-export-authorized-roles',
  'absence',
  'Export/report pouze pro oprávněné role',
  'Pravidlo pro backendové ověření oprávnění před exportem a reporty.',
  'rule',
  'active',
  '{"permission":"absence:export","roles":["admin","management","kancelar"]}',
  '{"enforce":"backend_permission_check"}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  '',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-sensitive-fields-role-guard',
  'absence',
  'Citlivá pole nezobrazovat běžným rolím',
  'Pravidlo pro ochranu citlivých polí v kartě zaměstnance a lékařských prohlídkách.',
  'rule',
  'active',
  '{"sensitiveFields":["medicalExam","internalNote","documents"],"allowedRoles":["admin","management"]}',
  '{"enforce":"backend_and_ui_visibility"}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  '',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-doctor-hours-other-days',
  'absence',
  'Lékař v hodinách, ostatní absence ve dnech',
  'Pravidlo pro jednotky absence: lékař může být evidovaný v hodinách, ostatní typy ve dnech.',
  'rule',
  'active',
  '{"doctorUnit":"hours","defaultUnit":"days","types":["vacation","sick","care","compensatory_leave"]}',
  '{"enforce":"absence_request_validation"}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  '',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'absence-vacation-business-days',
  'absence',
  'Dovolená počítá pracovní dny bez víkendů a českých svátků',
  'Pravidlo pro budoucí výpočet dovolené podle pracovních dnů a českých svátků.',
  'rule',
  'active',
  '{"type":"vacation","excludeWeekends":true,"holidayCalendar":"CZ"}',
  '{"enforce":"absence_day_count"}',
  0,
  'manual',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  '',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO module_rule_audit_log (
  id,
  rule_id,
  module_key,
  action,
  changed_by_user_id,
  changed_at,
  before_json,
  after_json,
  note
)
SELECT
  'audit-seed-' || id,
  id,
  module_key,
  'seed',
  'migration-0015',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  NULL,
  '{"status":"seeded"}',
  'První ostrá pravidla Fáze 1.'
FROM module_rules
WHERE module_key = 'absence'
  AND id IN (
    'absence-medical-exam-due-soon',
    'absence-medical-exam-overdue',
    'absence-approval-reminder-24h',
    'absence-employee-decision-notification',
    'absence-export-authorized-roles',
    'absence-sensitive-fields-role-guard',
    'absence-doctor-hours-other-days',
    'absence-vacation-business-days'
  );
