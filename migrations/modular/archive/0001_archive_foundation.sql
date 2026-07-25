CREATE TABLE IF NOT EXISTS archive_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source_domain TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'transferred', 'verified', 'failed')),
  selected_rows INTEGER NOT NULL DEFAULT 0,
  transferred_rows INTEGER NOT NULL DEFAULT 0,
  checksum_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  checksum_value TEXT,
  r2_object_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_batches_source
  ON archive_batches(source_domain, source_table, source_batch_id);

CREATE TABLE IF NOT EXISTS archive_objects (
  id TEXT PRIMARY KEY NOT NULL,
  archive_batch_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_created_at TEXT,
  r2_object_key TEXT,
  payload_checksum TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_objects_source
  ON archive_objects(archive_batch_id, source_id);
CREATE INDEX IF NOT EXISTS idx_archive_objects_r2
  ON archive_objects(r2_object_key);

CREATE TABLE IF NOT EXISTS archive_integrity_checks (
  id TEXT PRIMARY KEY NOT NULL,
  archive_batch_id TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  target_count INTEGER NOT NULL,
  source_checksum TEXT NOT NULL,
  target_checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_integrity_batch
  ON archive_integrity_checks(archive_batch_id, checked_at DESC);
