CREATE TABLE IF NOT EXISTS module_automation_runner_runs (
  id TEXT PRIMARY KEY NOT NULL,
  module_key TEXT NOT NULL,
  runner_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  scheduled_at TEXT,
  finished_at TEXT,
  triggered_by TEXT,
  status TEXT NOT NULL,
  rules_total INTEGER NOT NULL DEFAULT 0,
  dry_run_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT,
  d1_binding TEXT,
  database_name TEXT,
  cron TEXT,
  time_zone TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_module_automation_runner_runs_module
  ON module_automation_runner_runs(module_key, started_at);

CREATE INDEX IF NOT EXISTS idx_module_automation_runner_runs_status
  ON module_automation_runner_runs(status, started_at);
