CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  status TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  module_id TEXT,
  subject TEXT,
  message_preview TEXT,
  provider TEXT,
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT,
  message_id TEXT,
  thread_id TEXT,
  audit_id TEXT,
  from_name TEXT,
  from_address TEXT,
  reply_to TEXT,
  subject_token TEXT,
  provider_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_related
  ON notification_logs(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type
  ON notification_logs(type, channel, created_at);
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

CREATE TABLE IF NOT EXISTS customer_message_log (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT,
  phone TEXT NOT NULL DEFAULT '',
  requested_channel TEXT NOT NULL DEFAULT 'rcs',
  used_channel TEXT NOT NULL DEFAULT 'unknown',
  template_key TEXT NOT NULL,
  message_body TEXT NOT NULL DEFAULT '',
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_message_log_phone
  ON customer_message_log(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_message_log_status
  ON customer_message_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_message_log_template
  ON customer_message_log(template_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_message_log_twilio_sid
  ON customer_message_log(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_customer_message_log_related
  ON customer_message_log(related_entity_type, related_entity_id);

CREATE TABLE IF NOT EXISTS customer_message_opt_out (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_message_opt_out_phone
  ON customer_message_opt_out(phone);

CREATE TABLE IF NOT EXISTS customer_message_inbound (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  twilio_message_sid TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_message_inbound_phone
  ON customer_message_inbound(phone, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_message_inbound_twilio_sid_unique
  ON customer_message_inbound(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL AND twilio_message_sid <> '';

CREATE TABLE IF NOT EXISTS customer_message_consent (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  consent_type TEXT NOT NULL DEFAULT 'operational_rcs',
  status TEXT NOT NULL DEFAULT 'granted',
  consent_version TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  privacy_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_origin TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_message_consent_phone
  ON customer_message_consent(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_message_consent_status
  ON customer_message_consent(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_message_consent_version
  ON customer_message_consent(consent_version, created_at DESC);

CREATE TABLE IF NOT EXISTS rcs_template_sync (
  template_key TEXT PRIMARY KEY NOT NULL,
  friendly_name TEXT NOT NULL,
  content_sid TEXT,
  content_fingerprint TEXT,
  sync_status TEXT NOT NULL DEFAULT 'content_sid_missing',
  error_message TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_template_sync_content_sid
  ON rcs_template_sync(content_sid) WHERE content_sid IS NOT NULL;

CREATE TABLE IF NOT EXISTS rcs_template_sync_locks (
  lock_name TEXT PRIMARY KEY NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rcs_message_dispatches (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  recipient_masked TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  content_sid TEXT NOT NULL,
  twilio_message_sid TEXT,
  requested_channel TEXT NOT NULL DEFAULT 'rcs',
  used_channel TEXT NOT NULL DEFAULT 'rcs_sms_auto_fallback',
  status TEXT NOT NULL DEFAULT 'reserved',
  error_message TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  recipient_phone TEXT,
  user_id TEXT,
  customer_id TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  message_body TEXT,
  variables_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_message_dispatches_idempotency
  ON rcs_message_dispatches(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_twilio_sid
  ON rcs_message_dispatches(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_template
  ON rcs_message_dispatches(template_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_recipient_phone
  ON rcs_message_dispatches(recipient_phone, created_at DESC);
