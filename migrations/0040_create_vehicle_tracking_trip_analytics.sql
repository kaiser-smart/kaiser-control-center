CREATE TABLE IF NOT EXISTS vehicle_tracking_trip_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_key TEXT NOT NULL,
  license_plate TEXT,
  local_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  distance_km REAL NOT NULL DEFAULT 0,
  duration_minutes REAL NOT NULL DEFAULT 0,
  moving_minutes REAL NOT NULL DEFAULT 0,
  point_count INTEGER NOT NULL DEFAULT 0,
  segment_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0,
  quality_status TEXT NOT NULL DEFAULT 'insufficient',
  distance_source TEXT NOT NULL DEFAULT 'gps_geometry',
  calculated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_trip_summaries_period
  ON vehicle_tracking_trip_summaries(local_date DESC, vehicle_key);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_trip_summaries_vehicle
  ON vehicle_tracking_trip_summaries(vehicle_key, started_at DESC);

CREATE TABLE IF NOT EXISTS vehicle_tracking_daily_metrics (
  vehicle_key TEXT NOT NULL,
  local_date TEXT NOT NULL,
  license_plate TEXT,
  total_km REAL NOT NULL DEFAULT 0,
  trip_count INTEGER NOT NULL DEFAULT 0,
  moving_minutes REAL NOT NULL DEFAULT 0,
  point_count INTEGER NOT NULL DEFAULT 0,
  valid_segment_count INTEGER NOT NULL DEFAULT 0,
  rejected_segment_count INTEGER NOT NULL DEFAULT 0,
  coverage_percent REAL NOT NULL DEFAULT 0,
  quality_status TEXT NOT NULL DEFAULT 'insufficient',
  first_recorded_at TEXT,
  last_recorded_at TEXT,
  distance_source TEXT NOT NULL DEFAULT 'gps_geometry',
  calculated_at TEXT NOT NULL,
  PRIMARY KEY (vehicle_key, local_date)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_daily_metrics_period
  ON vehicle_tracking_daily_metrics(local_date DESC, total_km DESC);

CREATE TABLE IF NOT EXISTS vehicle_tracking_analytics_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  vehicles_processed INTEGER NOT NULL DEFAULT 0,
  points_processed INTEGER NOT NULL DEFAULT 0,
  trips_written INTEGER NOT NULL DEFAULT 0,
  daily_rows_written INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_analytics_runs_started
  ON vehicle_tracking_analytics_runs(started_at DESC);
