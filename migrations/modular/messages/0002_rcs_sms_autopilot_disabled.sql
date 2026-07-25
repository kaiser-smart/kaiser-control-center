CREATE TABLE IF NOT EXISTS rcs_sms_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'unknown',
  user_id TEXT,
  employee_id TEXT,
  customer_id TEXT,
  contact_name TEXT,
  channel TEXT NOT NULL DEFAULT 'sms',
  last_outbound_message_sid TEXT,
  last_outbound_template_key TEXT,
  last_event_id TEXT,
  open_intent TEXT,
  awaiting_field TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  human_takeover INTEGER NOT NULL DEFAULT 0,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_conversations_phone
  ON rcs_sms_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_conversations_status
  ON rcs_sms_conversations(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_conversations_contact
  ON rcs_sms_conversations(contact_type, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  twilio_message_sid TEXT,
  related_outbound_message_sid TEXT,
  body TEXT NOT NULL DEFAULT '',
  media_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'received',
  sender_type TEXT NOT NULL DEFAULT 'unknown',
  intent TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  response_mode TEXT,
  reply_text TEXT,
  requested_tool TEXT,
  tool_arguments_json TEXT NOT NULL DEFAULT '{}',
  requires_human INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  openai_response_id TEXT,
  openai_model TEXT,
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  error_code TEXT,
  error_message TEXT,
  received_at TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_messages_twilio_sid
  ON rcs_sms_messages(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL AND twilio_message_sid <> '';
CREATE INDEX IF NOT EXISTS idx_rcs_sms_messages_conversation
  ON rcs_sms_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_messages_retry
  ON rcs_sms_messages(status, next_retry_at, processing_attempts);

CREATE TABLE IF NOT EXISTS rcs_sms_action_grants (
  id TEXT PRIMARY KEY NOT NULL,
  outbound_message_sid TEXT NOT NULL,
  phone TEXT NOT NULL,
  action_name TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_by_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_action_grants_idempotency
  ON rcs_sms_action_grants(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_action_grants_lookup
  ON rcs_sms_action_grants(outbound_message_sid, phone, action_name, status);

CREATE TABLE IF NOT EXISTS rcs_sms_requests (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  contact_type TEXT NOT NULL DEFAULT 'unknown',
  user_id TEXT,
  customer_id TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  assigned_to_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_requests_idempotency
  ON rcs_sms_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_requests_status
  ON rcs_sms_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_tool_runs (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  execution_mode TEXT NOT NULL DEFAULT 'automatic',
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_tool_runs_idempotency
  ON rcs_sms_tool_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_tool_runs_message
  ON rcs_sms_tool_runs(message_id, started_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_events (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  detail TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_events_conversation
  ON rcs_sms_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_events_created
  ON rcs_sms_events(created_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_runtime_config (
  id TEXT PRIMARY KEY NOT NULL,
  autopilot_enabled INTEGER NOT NULL DEFAULT 0,
  outbound_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO rcs_sms_runtime_config
  (id, autopilot_enabled, outbound_enabled)
VALUES ('production', 0, 0);
