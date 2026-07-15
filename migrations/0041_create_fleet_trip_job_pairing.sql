CREATE TABLE IF NOT EXISTS fleet_vehicle_external_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_id TEXT NOT NULL,
  external_system TEXT NOT NULL,
  external_key TEXT NOT NULL,
  normalized_license_plate TEXT,
  route_vehicle_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  match_method TEXT NOT NULL DEFAULT 'bootstrap_unique_plate',
  confidence TEXT NOT NULL DEFAULT 'high',
  valid_from TEXT,
  valid_to TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_external
  ON fleet_vehicle_external_aliases(external_system, external_key);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_vehicle
  ON fleet_vehicle_external_aliases(vehicle_id, external_system, status);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_route
  ON fleet_vehicle_external_aliases(route_vehicle_code, status);

CREATE TABLE IF NOT EXISTS fleet_trip_job_pairing_runs (
  id TEXT PRIMARY KEY NOT NULL,
  dedupe_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  scheduled_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'cloudflare-cron',
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  aliases_required INTEGER NOT NULL DEFAULT 0,
  aliases_ready INTEGER NOT NULL DEFAULT 0,
  trips_seen INTEGER NOT NULL DEFAULT 0,
  candidate_trips INTEGER NOT NULL DEFAULT 0,
  unclassified_trips INTEGER NOT NULL DEFAULT 0,
  actual_route_runs INTEGER NOT NULL DEFAULT 0,
  actual_stops INTEGER NOT NULL DEFAULT 0,
  candidate_coverage_percent REAL NOT NULL DEFAULT 0,
  job_pair_coverage_percent REAL NOT NULL DEFAULT 0,
  total_distance_km REAL NOT NULL DEFAULT 0,
  candidate_distance_km REAL NOT NULL DEFAULT 0,
  quality_reasons_json TEXT NOT NULL DEFAULT '[]',
  gate_status TEXT NOT NULL DEFAULT 'blocked',
  dashboard_activation_allowed INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_trip_job_pairing_runs_dedupe
  ON fleet_trip_job_pairing_runs(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_pairing_runs_started
  ON fleet_trip_job_pairing_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS fleet_trip_job_allocations (
  trip_id TEXT PRIMARY KEY NOT NULL,
  pairing_run_id TEXT NOT NULL,
  vehicle_id TEXT,
  tcars_vehicle_key TEXT NOT NULL,
  route_vehicle_code TEXT,
  local_date TEXT NOT NULL,
  route_run_id TEXT,
  job_stop_id TEXT,
  allocation_status TEXT NOT NULL DEFAULT 'unclassified',
  classification TEXT NOT NULL DEFAULT 'unclassified',
  distance_km REAL NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT 'none',
  confidence TEXT NOT NULL DEFAULT 'none',
  reason_code TEXT NOT NULL DEFAULT 'unclassified',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_trip_calculated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_period
  ON fleet_trip_job_allocations(local_date DESC, route_vehicle_code, classification);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_vehicle
  ON fleet_trip_job_allocations(vehicle_id, local_date DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_route
  ON fleet_trip_job_allocations(route_run_id, job_stop_id);

INSERT OR IGNORE INTO module_rules (
  id,
  module_key,
  title,
  description,
  type,
  status,
  conditions_json,
  actions_json,
  is_automation,
  trigger_type,
  schedule_cron,
  event_name,
  cloud_runner,
  last_run_at,
  next_run_at,
  last_run_status,
  last_run_message,
  created_by_user_id,
  created_at,
  updated_by_user_id,
  updated_at
) VALUES (
  'vehicle-tracking-trip-job-pairing-phase1a',
  'vehicle-tracking',
  'Párování GPS jízd na skutečné svozové zakázky',
  'Cloudový read-only pilot páruje GPS jízdy pouze na dokončené denní trasy a skutečně potvrzené zastávky. Nezařazené kilometry zůstávají nezařazené.',
  'automation',
  'active',
  '{"pilotVehicleCodes":["A","B","C"],"periodDays":7,"requiresCompletedRoute":true,"requiresCompletedStops":true,"dashboardQualityGatePercent":90}',
  '{"writesDerivedD1Only":true,"externalSystemsReadOnly":true,"dashboardActivation":false,"frontendTrigger":false}',
  1,
  'time',
  '*/15 * * * *',
  '',
  'kaiser-vehicle-tracking-history-runner',
  NULL,
  NULL,
  NULL,
  'Fáze 1A: cloudový pilot je auditovaný; dashboardové ekonomické hodnoty zůstávají vypnuté do splnění kvalitativní brány.',
  'migration-0041',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration-0041',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO module_rule_audit_log (
  id,
  rule_id,
  module_key,
  action,
  changed_by_user_id,
  changed_at,
  before_json,
  after_json,
  note
) VALUES (
  'vehicle-tracking-trip-job-pairing-phase1a-created',
  'vehicle-tracking-trip-job-pairing-phase1a',
  'vehicle-tracking',
  'created',
  'migration-0041',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  NULL,
  '{"status":"active","phase":"read-only-pilot","dashboardActivation":false}',
  'Schválená Fáze 1A. Automatizace zapisuje pouze odvozené párovací výsledky a audit.'
);
