CREATE TABLE IF NOT EXISTS vistos_sync_runs (
  id TEXT PRIMARY KEY, installation TEXT NOT NULL, entity TEXT NOT NULL, mode TEXT NOT NULL,
  status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, rows_seen INTEGER NOT NULL DEFAULT 0,
  error_code TEXT, scope_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS vistos_integration_events (
  id TEXT PRIMARY KEY, entity_id TEXT, company_id TEXT, kind TEXT NOT NULL, actor TEXT NOT NULL,
  before_value TEXT, after_value TEXT, fields_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vistos_integration_event_history ON vistos_integration_events(entity_id,company_id,created_at,id);
