CREATE TABLE IF NOT EXISTS collection_daily_route_runs (
  id TEXT PRIMARY KEY,
  route_key TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  source_mode TEXT NOT NULL DEFAULT 'vistos-komunal-preview',
  route_date TEXT NOT NULL,
  route_day_code TEXT NOT NULL DEFAULT '',
  route_week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL,
  vehicle_registration TEXT NOT NULL DEFAULT '',
  vehicle_label TEXT NOT NULL DEFAULT '',
  driver_user_id TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  stop_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  confirmed_by_user_id TEXT NOT NULL DEFAULT '',
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT,
  started_by_user_id TEXT NOT NULL DEFAULT '',
  started_by_name TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  completed_by_user_id TEXT NOT NULL DEFAULT '',
  completed_by_name TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  reopened_by_user_id TEXT NOT NULL DEFAULT '',
  reopened_by_name TEXT NOT NULL DEFAULT '',
  reopened_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_batch_id) REFERENCES collection_import_batches(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_runs_key
  ON collection_daily_route_runs(route_key);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_runs_date_status
  ON collection_daily_route_runs(route_date, status, vehicle_code);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_runs_driver
  ON collection_daily_route_runs(driver_user_id, status, route_date);

CREATE TABLE IF NOT EXISTS collection_daily_route_stops (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  route_date TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  station_name TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  container_volume INTEGER NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0,
  container_type TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  pickup_days_text TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  source_contract_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  problem_reason TEXT NOT NULL DEFAULT '',
  problem_note TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  last_event_at TEXT,
  source_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (source_batch_id) REFERENCES collection_import_batches(id),
  FOREIGN KEY (source_row_id) REFERENCES collection_import_rows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_source
  ON collection_daily_route_stops(run_id, source_row_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_stops_date_source
  ON collection_daily_route_stops(route_date, source_row_id);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_order
  ON collection_daily_route_stops(run_id, route_order);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_status
  ON collection_daily_route_stops(run_id, status, route_order);

CREATE TABLE IF NOT EXISTS collection_daily_route_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stop_id TEXT,
  event_type TEXT NOT NULL,
  before_status TEXT NOT NULL DEFAULT '',
  after_status TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_events_idempotency
  ON collection_daily_route_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_events_run
  ON collection_daily_route_events(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_events_stop
  ON collection_daily_route_events(stop_id, created_at);
