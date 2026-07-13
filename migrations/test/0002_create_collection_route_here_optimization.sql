CREATE TABLE IF NOT EXISTS collection_route_here_settings (
  scope TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT NOT NULL DEFAULT '',
  updated_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO collection_route_here_settings (
  scope,
  status,
  config_json
) VALUES (
  'test',
  'draft',
  '{}'
);

CREATE TABLE IF NOT EXISTS collection_route_here_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'test',
  route_date TEXT NOT NULL,
  waste_type TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitting',
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'here-tour-planning',
  provider_status_url TEXT NOT NULL DEFAULT '',
  provider_resource_url TEXT NOT NULL DEFAULT '',
  stop_count INTEGER NOT NULL DEFAULT 0,
  vehicle_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_here_runs_idempotency
  ON collection_route_here_runs(idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_here_runs_input_hash
  ON collection_route_here_runs(input_hash)
  WHERE status IN ('submitting', 'submitted', 'in_progress', 'completed');

CREATE INDEX IF NOT EXISTS idx_collection_route_here_runs_date
  ON collection_route_here_runs(route_date, waste_type, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_here_runs_status
  ON collection_route_here_runs(status, updated_at);

CREATE TABLE IF NOT EXISTS collection_route_here_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES collection_route_here_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_here_events_run
  ON collection_route_here_events(run_id, created_at);
