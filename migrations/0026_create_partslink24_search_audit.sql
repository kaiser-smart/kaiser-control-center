CREATE TABLE IF NOT EXISTS driver_report_partslink24_searches (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  vehicle_id TEXT,
  vehicle_name TEXT,
  license_plate TEXT,
  vin_masked TEXT NOT NULL,
  vehicle_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  message TEXT,
  workflow_url TEXT,
  workflow_inputs_json TEXT,
  result_json TEXT,
  runner_kind TEXT NOT NULL DEFAULT 'github_actions_manual',
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_request
  ON driver_report_partslink24_searches(request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_vehicle
  ON driver_report_partslink24_searches(vehicle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_created_by
  ON driver_report_partslink24_searches(created_by_user_id, created_at);
