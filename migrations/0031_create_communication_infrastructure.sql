ALTER TABLE notification_logs ADD COLUMN message_id TEXT;
ALTER TABLE notification_logs ADD COLUMN thread_id TEXT;
ALTER TABLE notification_logs ADD COLUMN audit_id TEXT;
ALTER TABLE notification_logs ADD COLUMN from_name TEXT;
ALTER TABLE notification_logs ADD COLUMN from_address TEXT;
ALTER TABLE notification_logs ADD COLUMN reply_to TEXT;
ALTER TABLE notification_logs ADD COLUMN subject_token TEXT;
ALTER TABLE notification_logs ADD COLUMN provider_status TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_logs_thread
  ON notification_logs(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_logs_message
  ON notification_logs(message_id);

CREATE TABLE IF NOT EXISTS communication_threads (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  module_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  audit_id TEXT,
  subject_token TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to_user_id TEXT,
  assigned_to_name TEXT,
  assigned_to_email TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  last_event_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_threads_entity
  ON communication_threads(module_key, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_communication_threads_status
  ON communication_threads(status, updated_at);

CREATE TABLE IF NOT EXISTS communication_messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT,
  audit_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'webhook')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound', 'status_callback', 'system')),
  module_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  message_id TEXT,
  provider TEXT,
  provider_message_id TEXT,
  provider_status TEXT,
  from_name TEXT,
  from_address TEXT,
  reply_to TEXT,
  to_address TEXT,
  cc_address TEXT,
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  matched_confidence REAL NOT NULL DEFAULT 0,
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  action_suggestion TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES communication_threads(thread_id)
);

CREATE INDEX IF NOT EXISTS idx_communication_messages_thread
  ON communication_messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_communication_messages_entity
  ON communication_messages(module_key, entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_communication_messages_message
  ON communication_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_provider
  ON communication_messages(provider, provider_message_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_status
  ON communication_messages(status, created_at);

CREATE TABLE IF NOT EXISTS communication_unmatched_replies (
  id TEXT PRIMARY KEY NOT NULL,
  communication_message_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body_preview TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'manual_queue',
  assigned_to_user_id TEXT,
  assigned_to_name TEXT,
  reason TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (communication_message_id) REFERENCES communication_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_communication_unmatched_replies_status
  ON communication_unmatched_replies(status, received_at);

CREATE TABLE IF NOT EXISTS communication_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT,
  module_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  thread_id TEXT,
  communication_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  detail TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_events_created
  ON communication_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_events_thread
  ON communication_events(thread_id, created_at DESC);
