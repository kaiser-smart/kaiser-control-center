CREATE TABLE IF NOT EXISTS fleet_vehicle_technical_profiles (
  id TEXT PRIMARY KEY,
  vehicle_code TEXT NOT NULL DEFAULT '',
  driver_label TEXT NOT NULL DEFAULT '',
  license_plate TEXT NOT NULL,
  normalized_license_plate TEXT NOT NULL UNIQUE,
  empty_weight_kg INTEGER NOT NULL,
  gross_weight_kg INTEGER NOT NULL,
  payload_capacity_kg INTEGER NOT NULL,
  length_cm INTEGER NOT NULL,
  width_cm INTEGER NOT NULL,
  height_cm INTEGER NOT NULL,
  weight_per_axle_kg INTEGER,
  data_quality TEXT NOT NULL DEFAULT 'owner-confirmed',
  source_note TEXT NOT NULL DEFAULT '',
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_technical_profiles_code
  ON fleet_vehicle_technical_profiles(vehicle_code, active);

INSERT INTO fleet_vehicle_technical_profiles (
  id, vehicle_code, driver_label, license_plate, normalized_license_plate,
  empty_weight_kg, gross_weight_kg, payload_capacity_kg,
  length_cm, width_cm, height_cm, weight_per_axle_kg,
  data_quality, source_note, confirmed_by_name, confirmed_at, active
) VALUES
  ('fleet-tech-3bn3558', 'A', 'Kouba', '3BN 3558', '3BN3558', 13500, 19000, 5500, 850, 240, 350, NULL, 'owner-confirmed', 'Potvrzené provozní údaje pro routing; zatížení náprav nebylo dodáno.', 'Radim Opluštil', '2026-07-18T00:00:00.000Z', 1),
  ('fleet-tech-1bp8373', 'B', 'Míra', '1BP 8373', '1BP8373', 13200, 19000, 5800, 850, 240, 350, NULL, 'owner-confirmed', 'Potvrzené provozní údaje pro routing; zatížení náprav nebylo dodáno.', 'Radim Opluštil', '2026-07-18T00:00:00.000Z', 1),
  ('fleet-tech-3be2831', 'C', 'Florian', '3BE 2831', '3BE2831', 15400, 25000, 9600, 940, 240, 350, NULL, 'owner-confirmed', 'Potvrzené provozní údaje pro routing; zatížení náprav nebylo dodáno.', 'Radim Opluštil', '2026-07-18T00:00:00.000Z', 1)
ON CONFLICT(normalized_license_plate) DO UPDATE SET
  vehicle_code = excluded.vehicle_code,
  driver_label = excluded.driver_label,
  license_plate = excluded.license_plate,
  empty_weight_kg = excluded.empty_weight_kg,
  gross_weight_kg = excluded.gross_weight_kg,
  payload_capacity_kg = excluded.payload_capacity_kg,
  length_cm = excluded.length_cm,
  width_cm = excluded.width_cm,
  height_cm = excluded.height_cm,
  weight_per_axle_kg = excluded.weight_per_axle_kg,
  data_quality = excluded.data_quality,
  source_note = excluded.source_note,
  confirmed_by_name = excluded.confirmed_by_name,
  confirmed_at = excluded.confirmed_at,
  active = 1,
  updated_at = CURRENT_TIMESTAMP;
