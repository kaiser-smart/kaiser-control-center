CREATE TABLE IF NOT EXISTS vehicle_tracking_gps_points (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_key TEXT NOT NULL,
  license_plate TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  speed_kmh INTEGER,
  heading INTEGER,
  address TEXT,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'tcars'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_tracking_gps_points_dedupe
  ON vehicle_tracking_gps_points(vehicle_key, recorded_at, latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_gps_points_route
  ON vehicle_tracking_gps_points(vehicle_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS vehicle_tracking_history_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  points_written INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
);
