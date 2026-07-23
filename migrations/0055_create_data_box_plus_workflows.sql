CREATE TABLE IF NOT EXISTS data_box_plus_drafts (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  recipient_box_id TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  idempotency_key TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_drafts_idempotency
  ON data_box_plus_drafts(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_drafts_owner
  ON data_box_plus_drafts(owner_user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS data_box_plus_draft_attachments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (draft_id) REFERENCES data_box_plus_drafts(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_draft_attachments_draft
  ON data_box_plus_draft_attachments(draft_id, created_at);

CREATE TABLE IF NOT EXISTS data_box_plus_send_jobs (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  provider_message_id TEXT,
  response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (draft_id) REFERENCES data_box_plus_drafts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_draft
  ON data_box_plus_send_jobs(draft_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_idempotency
  ON data_box_plus_send_jobs(idempotency_key);
