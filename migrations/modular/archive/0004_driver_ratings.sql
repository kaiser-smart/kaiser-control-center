-- Only SMART_ODPADY_ARCHIVE. No example records or automatic identity grants.
CREATE TABLE IF NOT EXISTS driver_rating_inputs (
  installation TEXT NOT NULL, company_id TEXT NOT NULL, day TEXT NOT NULL,
  revision INTEGER NOT NULL, document_json TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (installation, company_id, day, revision)
);
CREATE TABLE IF NOT EXISTS driver_rating_results (
  installation TEXT NOT NULL, company_id TEXT NOT NULL, day TEXT NOT NULL,
  input_revision INTEGER NOT NULL, slot TEXT NOT NULL, category TEXT NOT NULL,
  document_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (installation, company_id, day, input_revision, slot, category)
);
CREATE TABLE IF NOT EXISTS driver_rating_validations (
  installation TEXT NOT NULL, company_id TEXT NOT NULL, version TEXT NOT NULL,
  document_json TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (installation, company_id, version, created_at)
);
