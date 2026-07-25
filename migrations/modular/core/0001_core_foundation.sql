CREATE TABLE IF NOT EXISTS database_migration_log (
  id TEXT PRIMARY KEY NOT NULL,
  database_domain TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'rolled_back')),
  time_travel_bookmark TEXT,
  rollback_command TEXT,
  rows_before_json TEXT NOT NULL DEFAULT '{}',
  rows_after_json TEXT NOT NULL DEFAULT '{}',
  checksums_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_database_migration_log_domain_migration
  ON database_migration_log(database_domain, migration_id);

CREATE TABLE IF NOT EXISTS cross_database_workflows (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'compensating', 'compensated')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  compensation_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_database_workflows_idempotency
  ON cross_database_workflows(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_cross_database_workflows_retry
  ON cross_database_workflows(status, next_attempt_at, attempt_count);

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY NOT NULL,
  database_domain TEXT NOT NULL,
  table_name TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  archive_target TEXT NOT NULL,
  batch_size INTEGER NOT NULL DEFAULT 500 CHECK (batch_size BETWEEN 1 AND 1000),
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_domain_table
  ON retention_policies(database_domain, table_name);

INSERT OR IGNORE INTO retention_policies
  (id, database_domain, table_name, retention_days, archive_target, batch_size)
VALUES
  ('retention-technical-logs', 'audit', 'audit_events', 60, 'archive', 500),
  ('retention-webhook-payloads', 'audit', 'webhook_payloads', 30, 'r2', 500),
  ('retention-ai-tool-runs', 'messages', 'rcs_sms_tool_runs', 90, 'archive', 500),
  ('retention-delivery-events', 'messages', 'rcs_sms_events', 365, 'archive', 500),
  ('retention-collection-previews', 'legacy', 'collection_import_rows', 2, 'r2', 500);
