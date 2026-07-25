CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  module_key TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  idempotency_key TEXT,
  detail TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_idempotency
  ON audit_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_audit_events_module_created
  ON audit_events(module_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity_created
  ON audit_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  database_domain TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_workflow_attempts_workflow
  ON workflow_attempts(workflow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS database_capacity_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  database_domain TEXT NOT NULL,
  database_name TEXT NOT NULL,
  database_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  max_bytes INTEGER NOT NULL,
  usage_percent REAL NOT NULL,
  level TEXT NOT NULL,
  growth_bytes_24h INTEGER,
  estimated_days_to_full REAL,
  page_count INTEGER,
  free_page_count INTEGER,
  source TEXT NOT NULL DEFAULT 'cloudflare-api',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_database_capacity_domain_recorded
  ON database_capacity_snapshots(database_domain, recorded_at DESC);

CREATE TABLE IF NOT EXISTS database_capacity_objects (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_name TEXT NOT NULL,
  table_name TEXT,
  row_count INTEGER,
  logical_payload_bytes INTEGER,
  size_estimate_type TEXT NOT NULL DEFAULT 'logical',
  rank_position INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_database_capacity_objects_snapshot
  ON database_capacity_objects(snapshot_id, rank_position);

CREATE TABLE IF NOT EXISTS migration_preflight_runs (
  id TEXT PRIMARY KEY NOT NULL,
  database_domain TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_size_bytes INTEGER NOT NULL,
  estimated_table_bytes INTEGER NOT NULL DEFAULT 0,
  estimated_index_bytes INTEGER NOT NULL DEFAULT 0,
  projected_usage_percent REAL NOT NULL,
  time_travel_bookmark TEXT,
  rollback_command TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source_domain TEXT NOT NULL,
  source_table TEXT NOT NULL,
  status TEXT NOT NULL,
  selected_rows INTEGER NOT NULL DEFAULT 0,
  transferred_rows INTEGER NOT NULL DEFAULT 0,
  deleted_rows INTEGER NOT NULL DEFAULT 0,
  checksum_source TEXT,
  checksum_target TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
