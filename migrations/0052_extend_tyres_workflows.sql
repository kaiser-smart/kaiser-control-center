CREATE INDEX IF NOT EXISTS idx_tyre_measurements_tyre_date
  ON tyre_measurements(tyre_id, measured_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_audit_entity_date
  ON tyre_audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tyre_service_record_tyres (
  service_record_id TEXT NOT NULL,
  tyre_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_record_id, tyre_id)
);

CREATE INDEX IF NOT EXISTS idx_tyre_service_record_tyres_tyre
  ON tyre_service_record_tyres(tyre_id, service_record_id);
