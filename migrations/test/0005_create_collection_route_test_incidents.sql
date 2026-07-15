CREATE TABLE IF NOT EXISTS collection_route_test_incidents (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded-test',
  note TEXT NOT NULL DEFAULT '',
  photo_storage_key TEXT NOT NULL,
  photo_content_type TEXT NOT NULL,
  photo_size_bytes INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id),
  FOREIGN KEY (source_row_id) REFERENCES collection_import_rows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_incidents_idempotency
  ON collection_route_test_incidents(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incidents_run
  ON collection_route_test_incidents(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incidents_stop
  ON collection_route_test_incidents(stop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collection_route_test_incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (incident_id) REFERENCES collection_route_test_incidents(id),
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_events_incident
  ON collection_route_test_incident_events(incident_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_events_run
  ON collection_route_test_incident_events(run_id, created_at);
