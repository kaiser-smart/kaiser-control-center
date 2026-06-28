CREATE TABLE IF NOT EXISTS data_boxes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  isds_id TEXT,
  mode TEXT NOT NULL DEFAULT 'pilot',
  status TEXT NOT NULL DEFAULT 'inactive',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_messages (
  id TEXT PRIMARY KEY,
  data_box_id TEXT NOT NULL,
  isds_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('received', 'sent')),
  subject TEXT,
  sender_name TEXT,
  sender_box_id TEXT,
  recipient_name TEXT,
  recipient_box_id TEXT,
  delivered_at TEXT,
  accepted_at TEXT,
  read_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  has_attachments INTEGER NOT NULL DEFAULT 0,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  ai_status TEXT NOT NULL DEFAULT 'not_evaluated',
  source TEXT NOT NULL DEFAULT 'cloud_metadata',
  isds_state TEXT,
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (data_box_id) REFERENCES data_boxes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_messages_isds_id
  ON data_box_messages(data_box_id, isds_message_id)
  WHERE isds_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_box_messages_list
  ON data_box_messages(data_box_id, direction, status, delivered_at DESC);

CREATE TABLE IF NOT EXISTS data_box_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'metadata_only',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_attachments_message
  ON data_box_attachments(message_id);

CREATE TABLE IF NOT EXISTS data_box_ai_evaluations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  label TEXT,
  priority TEXT,
  confidence REAL,
  summary TEXT,
  suggested_action TEXT,
  result_json TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_ai_evaluations_message
  ON data_box_ai_evaluations(message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_box_sync_runs (
  id TEXT PRIMARY KEY,
  data_box_id TEXT,
  trigger_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  messages_found INTEGER NOT NULL DEFAULT 0,
  messages_created INTEGER NOT NULL DEFAULT 0,
  messages_updated INTEGER NOT NULL DEFAULT 0,
  attachments_found INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  message TEXT,
  dedupe_key TEXT UNIQUE,
  created_by_user_id TEXT,
  FOREIGN KEY (data_box_id) REFERENCES data_boxes(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_sync_runs_started
  ON data_box_sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS data_box_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_box_audit_log_entity
  ON data_box_audit_log(entity_type, entity_id, changed_at DESC);

INSERT INTO data_boxes (
  id,
  label,
  mode,
  status,
  last_sync_status,
  last_sync_message
)
VALUES (
  'kaiser-primary',
  'Kaiser Smart Datova schranka',
  'pilot',
  'inactive',
  'waiting',
  'ISDS integrace neni aktivni.'
)
ON CONFLICT(id) DO NOTHING;
