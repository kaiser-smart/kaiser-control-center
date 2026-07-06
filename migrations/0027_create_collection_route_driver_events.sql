CREATE TABLE IF NOT EXISTS collection_route_driver_runs (
  id TEXT PRIMARY KEY,
  source_batch_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  route_day_code TEXT NOT NULL DEFAULT '',
  route_week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  waste_filter TEXT NOT NULL DEFAULT 'all',
  mapping_status_filter TEXT NOT NULL DEFAULT 'all',
  driver_user_id TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (source_batch_id) REFERENCES collection_route_source_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_batch
  ON collection_route_driver_runs(source_batch_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_driver
  ON collection_route_driver_runs(driver_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_route_key
  ON collection_route_driver_runs(route_key, status);

CREATE TABLE IF NOT EXISTS collection_route_driver_stop_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES collection_route_driver_runs(id),
  FOREIGN KEY (source_row_id) REFERENCES collection_route_source_rows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_idempotency
  ON collection_route_driver_stop_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_run
  ON collection_route_driver_stop_events(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_stop
  ON collection_route_driver_stop_events(run_id, source_row_id, action);

CREATE TABLE IF NOT EXISTS collection_route_driver_problem_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES collection_route_driver_runs(id),
  FOREIGN KEY (event_id) REFERENCES collection_route_driver_stop_events(id),
  FOREIGN KEY (source_row_id) REFERENCES collection_route_source_rows(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_problem_reports_run
  ON collection_route_driver_problem_reports(run_id, status, created_at);
