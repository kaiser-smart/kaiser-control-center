CREATE TABLE IF NOT EXISTS tyre_import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tyre_vehicle_profiles (
  id TEXT PRIMARY KEY,
  license_plate TEXT NOT NULL,
  normalized_license_plate TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL DEFAULT '',
  driver_label TEXT NOT NULL DEFAULT '',
  odometer_km INTEGER NOT NULL DEFAULT 0,
  depot TEXT NOT NULL DEFAULT '',
  wheel_positions_json TEXT NOT NULL DEFAULT '[]',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tyre_inventory (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tyre_size TEXT NOT NULL DEFAULT '',
  load_index TEXT NOT NULL DEFAULT '',
  dot_code TEXT NOT NULL DEFAULT '',
  tyre_type TEXT NOT NULL DEFAULT '',
  purchase_price_ex REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  lifecycle_state TEXT NOT NULL DEFAULT 'sklad',
  vehicle_license_plate TEXT NOT NULL DEFAULT '',
  wheel_position TEXT NOT NULL DEFAULT '',
  mounted_at TEXT NOT NULL DEFAULT '',
  mounted_odometer_km INTEGER NOT NULL DEFAULT 0,
  current_tread_mm REAL,
  pressure_bar REAL,
  mileage_km INTEGER NOT NULL DEFAULT 0,
  defect_count INTEGER NOT NULL DEFAULT 0,
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_tyre_inventory_vehicle
  ON tyre_inventory(vehicle_license_plate, lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_tyre_inventory_tread
  ON tyre_inventory(current_tread_mm);

CREATE TABLE IF NOT EXISTS tyre_measurements (
  id TEXT PRIMARY KEY,
  legacy_key TEXT UNIQUE,
  tyre_id TEXT NOT NULL DEFAULT '',
  vehicle_license_plate TEXT NOT NULL,
  wheel_position TEXT NOT NULL,
  tread_mm REAL NOT NULL,
  pressure_bar REAL,
  odometer_km INTEGER NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tyre_measurements_vehicle_date
  ON tyre_measurements(vehicle_license_plate, measured_at DESC);

CREATE TABLE IF NOT EXISTS tyre_service_records (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  service_date TEXT NOT NULL,
  vehicle_license_plate TEXT NOT NULL DEFAULT '',
  technician_name TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  labor_cost REAL NOT NULL DEFAULT 0,
  material_cost REAL NOT NULL DEFAULT 0,
  tyre_cost REAL NOT NULL DEFAULT 0,
  invoice_number TEXT NOT NULL DEFAULT '',
  tyre_types_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_tyre_service_records_date
  ON tyre_service_records(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_tyre_service_records_vehicle
  ON tyre_service_records(vehicle_license_plate, service_date DESC);

CREATE TABLE IF NOT EXISTS tyre_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tyre_audit_log_created
  ON tyre_audit_log(created_at DESC);
