CREATE TABLE IF NOT EXISTS fleet_orwii_fuel_transactions (
  external_id TEXT PRIMARY KEY NOT NULL, occurred_at TEXT, fuel_type TEXT, liters REAL, unit_price REAL, total_price REAL, odometer_km REAL, license_plate TEXT, orwii_vehicle_id TEXT, fuel_chip_id TEXT, matched_vehicle_id TEXT, match_status TEXT NOT NULL DEFAULT 'unmatched', match_method TEXT, source_payload_json TEXT NOT NULL DEFAULT '{}', first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_occurred_at ON fleet_orwii_fuel_transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_matched_vehicle ON fleet_orwii_fuel_transactions(matched_vehicle_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_match_status ON fleet_orwii_fuel_transactions(match_status, occurred_at);
CREATE TABLE IF NOT EXISTS fleet_orwii_fuel_sync_runs (
  id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, requested_from TEXT, requested_to TEXT, transaction_count INTEGER NOT NULL DEFAULT 0, matched_count INTEGER NOT NULL DEFAULT 0, unmatched_count INTEGER NOT NULL DEFAULT 0, ambiguous_count INTEGER NOT NULL DEFAULT 0, error_code TEXT, error_message TEXT, started_by_user_id TEXT, started_by_name TEXT
);
