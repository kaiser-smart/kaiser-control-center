CREATE TABLE IF NOT EXISTS receivable_import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_preview',
  import_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview',
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  ignored_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parser_summary_json TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_receivable_import_batches_kind_created
  ON receivable_import_batches(import_kind, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_import_batches_status
  ON receivable_import_batches(status, created_at);

CREATE TABLE IF NOT EXISTS receivable_import_rows (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  entity_kind TEXT NOT NULL,
  preview_status TEXT NOT NULL DEFAULT 'ready',
  confidence REAL NOT NULL DEFAULT 0,
  issue_code TEXT,
  issue_message TEXT,
  normalized_json TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES receivable_import_batches(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_import_rows_batch_row
  ON receivable_import_rows(batch_id, row_number);

CREATE INDEX IF NOT EXISTS idx_receivable_import_rows_status
  ON receivable_import_rows(preview_status, entity_kind);
