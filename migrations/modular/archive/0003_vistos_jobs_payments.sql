-- Source evidence, not a second accounting ledger. No production activation.
CREATE TABLE IF NOT EXISTS vistos_source_records (
  id TEXT PRIMARY KEY, installation TEXT NOT NULL, entity TEXT NOT NULL, source_id TEXT NOT NULL,
  company_id TEXT, number TEXT, customer TEXT, place TEXT, service TEXT,
  planned_start TEXT, planned_end TEXT, planned_day TEXT, status TEXT NOT NULL DEFAULT 'unverified',
  driver_id TEXT, vehicle_ids_json TEXT NOT NULL DEFAULT '[]', parent_id TEXT,
  unassigned INTEGER NOT NULL DEFAULT 1, needs_review INTEGER NOT NULL DEFAULT 1,
  fields_json TEXT NOT NULL, fingerprint TEXT NOT NULL, source_modified TEXT,
  received_at TEXT NOT NULL, detail_at TEXT, mapping_version TEXT NOT NULL,
  UNIQUE(installation, entity, source_id)
);
CREATE INDEX IF NOT EXISTS vistos_source_company_date ON vistos_source_records(entity, company_id, planned_start, source_id);
CREATE INDEX IF NOT EXISTS vistos_source_status_date ON vistos_source_records(entity, company_id, status, planned_start);
CREATE INDEX IF NOT EXISTS vistos_source_driver ON vistos_source_records(entity, company_id, driver_id);
CREATE INDEX IF NOT EXISTS vistos_source_parent ON vistos_source_records(installation, entity, parent_id);
CREATE INDEX IF NOT EXISTS vistos_source_modified ON vistos_source_records(installation, entity, source_modified);
CREATE TABLE IF NOT EXISTS vistos_sync_checkpoints (
  id TEXT PRIMARY KEY, installation TEXT NOT NULL, entity TEXT NOT NULL, mode TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1, offset INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER, last_source_id TEXT, status TEXT NOT NULL DEFAULT 'queued',
  window_from TEXT, window_to TEXT, confirmed_through TEXT, last_success_at TEXT,
  lease_owner TEXT, lease_until TEXT, error_code TEXT, comparison_json TEXT, updated_at TEXT NOT NULL,
  UNIQUE(installation,entity,mode)
);
CREATE TABLE IF NOT EXISTS vistos_sync_seen (
  checkpoint_id TEXT NOT NULL, generation INTEGER NOT NULL, source_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  PRIMARY KEY(checkpoint_id,generation,source_id)
);
CREATE TABLE IF NOT EXISTS vistos_sync_entity_locks (
  resource TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL
);
-- Transactional delivery queue for ARCHIVE -> AUDIT. Replay uses event ID.
CREATE TABLE IF NOT EXISTS vistos_evidence_events (
  id TEXT PRIMARY KEY, record_id TEXT, company_id TEXT, kind TEXT NOT NULL, actor TEXT NOT NULL,
  before_fingerprint TEXT, after_fingerprint TEXT, changed_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS job_execution_evidence (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, company_id TEXT NOT NULL, revision INTEGER NOT NULL,
  fingerprint TEXT NOT NULL, evidence_json TEXT NOT NULL, assignment_status TEXT NOT NULL,
  coverage_status TEXT NOT NULL, created_at TEXT NOT NULL, use_for_payroll INTEGER NOT NULL DEFAULT 0 CHECK(use_for_payroll=0),
  UNIQUE(job_id, fingerprint), UNIQUE(job_id,revision)
);
CREATE TABLE IF NOT EXISTS vistos_tcars_trip_days (
  installation TEXT NOT NULL, vehicle_id TEXT NOT NULL, local_day TEXT NOT NULL,
  status TEXT NOT NULL, trips_json TEXT NOT NULL DEFAULT '[]', read_at TEXT, error_code TEXT,
  PRIMARY KEY(installation,vehicle_id,local_day)
);
ALTER TABLE vehicle_tracking_gps_points ADD COLUMN provider_point_id TEXT;
ALTER TABLE vehicle_tracking_gps_points ADD COLUMN source_timestamp TEXT;
ALTER TABLE vehicle_tracking_gps_points ADD COLUMN gps_valid INTEGER;
ALTER TABLE vehicle_tracking_gps_points ADD COLUMN ignition INTEGER;
ALTER TABLE vehicle_tracking_gps_points ADD COLUMN provider_scope TEXT;
CREATE TABLE IF NOT EXISTS vistos_execution_checks (
  job_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, error_code TEXT
);
CREATE TABLE IF NOT EXISTS vistos_detail_refresh_queue (
  installation TEXT NOT NULL, entity TEXT NOT NULL, source_id TEXT NOT NULL, requested_at TEXT NOT NULL,
  PRIMARY KEY(installation,entity,source_id)
);
