CREATE TABLE IF NOT EXISTS employee_document_files (
  document_id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_document_files_employee_id
  ON employee_document_files(employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_document_files_storage_key
  ON employee_document_files(storage_key);
