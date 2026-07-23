CREATE TABLE IF NOT EXISTS data_box_plus_archive_objects (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  isds_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('received', 'sent')),
  message_storage_key TEXT,
  message_sha256 TEXT,
  message_size_bytes INTEGER NOT NULL DEFAULT 0,
  delivery_storage_key TEXT,
  delivery_sha256 TEXT,
  delivery_size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  archived_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id),
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id),
  UNIQUE(mailbox_id, isds_message_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_archive_objects_mailbox
  ON data_box_plus_archive_objects(mailbox_id, status, direction);

CREATE TABLE IF NOT EXISTS data_box_plus_archive_backfills (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('received', 'sent')),
  range_from TEXT NOT NULL,
  range_to TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 1,
  page_limit INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  messages_discovered INTEGER NOT NULL DEFAULT 0,
  messages_archived INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id),
  UNIQUE(mailbox_id, direction, range_to)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_archive_backfills_queue
  ON data_box_plus_archive_backfills(status, updated_at, mailbox_id);
