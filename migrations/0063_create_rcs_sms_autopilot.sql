CREATE TABLE IF NOT EXISTS rcs_sms_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (contact_type IN ('employee', 'customer', 'unknown', 'opted_out')),
  user_id TEXT,
  employee_id TEXT,
  customer_id TEXT,
  contact_name TEXT,
  channel TEXT NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('rcs', 'sms')),
  last_outbound_message_sid TEXT,
  last_outbound_template_key TEXT,
  last_event_id TEXT,
  open_intent TEXT,
  awaiting_field TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ai_processing', 'awaiting_field', 'awaiting_confirmation', 'human_takeover', 'closed', 'blocked', 'error')),
  human_takeover INTEGER NOT NULL DEFAULT 0,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE rcs_message_dispatches ADD COLUMN recipient_phone TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN user_id TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN customer_id TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN related_entity_type TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN related_entity_id TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN message_body TEXT;
ALTER TABLE rcs_message_dispatches ADD COLUMN variables_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_recipient_phone
  ON rcs_message_dispatches(recipient_phone, created_at DESC);

DELETE FROM customer_message_inbound
WHERE twilio_message_sid IS NOT NULL
  AND twilio_message_sid <> ''
  AND rowid NOT IN (
    SELECT MIN(rowid)
    FROM customer_message_inbound
    WHERE twilio_message_sid IS NOT NULL
      AND twilio_message_sid <> ''
    GROUP BY twilio_message_sid
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_message_inbound_twilio_sid_unique
  ON customer_message_inbound(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL AND twilio_message_sid <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_conversations_phone
  ON rcs_sms_conversations(phone);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_conversations_status
  ON rcs_sms_conversations(status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_conversations_contact
  ON rcs_sms_conversations(contact_type, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('inbound', 'outbound', 'system')),
  channel TEXT NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('rcs', 'sms')),
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES rcs_sms_conversations(id)
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
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired', 'revoked')),
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES rcs_sms_conversations(id),
  FOREIGN KEY (message_id) REFERENCES rcs_sms_messages(id)
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
  finished_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES rcs_sms_conversations(id),
  FOREIGN KEY (message_id) REFERENCES rcs_sms_messages(id)
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES rcs_sms_conversations(id),
  FOREIGN KEY (message_id) REFERENCES rcs_sms_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_events_conversation
  ON rcs_sms_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_events_created
  ON rcs_sms_events(created_at DESC);

INSERT OR IGNORE INTO module_rules (
  id,
  module_key,
  title,
  description,
  type,
  status,
  conditions_json,
  actions_json,
  is_automation,
  trigger_type,
  schedule_cron,
  event_name,
  cloud_runner,
  created_by_user_id,
  created_at,
  updated_by_user_id,
  updated_at
) VALUES
  (
    'rcs-sms-autopilot-twilio-signature',
    'rcs-sms-autopilot',
    'Ověření Twilio webhooku',
    'Každá příchozí RCS/SMS odpověď musí mít platný Twilio podpis nebo schválený serverový webhook secret.',
    'rule',
    'active',
    '{"source":"twilio","signatureRequired":true}',
    '{"onFailure":"reject_without_processing"}',
    0,
    'webhook',
    NULL,
    'twilio_inbound',
    'functions/_lib/twilio-webhook-auth.js',
    'system',
    CURRENT_TIMESTAMP,
    'system',
    CURRENT_TIMESTAMP
  ),
  (
    'rcs-sms-autopilot-fixed-rules',
    'rcs-sms-autopilot',
    'STOP, duplicity a bezpečnost před AI',
    'STOP, prázdné zprávy, duplicity, blokované kontakty a bezprostřední nebezpečí se zpracují před OpenAI.',
    'rule',
    'active',
    '{"beforeOpenAI":true}',
    '{"stop":"unsubscribe","duplicate":"ignore","danger":"human_takeover"}',
    0,
    'event',
    NULL,
    'rcs_sms_received',
    'functions/api/twilio/inbound.js',
    'system',
    CURRENT_TIMESTAMP,
    'system',
    CURRENT_TIMESTAMP
  ),
  (
    'rcs-sms-autopilot-async-processing',
    'rcs-sms-autopilot',
    'Asynchronní zpracování příchozí odpovědi',
    'Webhook zprávu nejdřív idempotentně uloží a další práci předá serverovému waitUntil.',
    'automation',
    'inactive',
    '{"mode":"live","requiresStoredInbound":true}',
    '{"process":"classify_validate_execute_reply"}',
    1,
    'webhook',
    NULL,
    'rcs_sms_received',
    'Cloudflare Pages Functions waitUntil',
    'system',
    CURRENT_TIMESTAMP,
    'system',
    CURRENT_TIMESTAMP
  ),
  (
    'rcs-sms-autopilot-retry-runner',
    'rcs-sms-autopilot',
    'Obnova nedokončeného zpracování',
    'Cloudový runner obnoví pouze uložené zprávy čekající na zpracování a používá idempotentní nástroje.',
    'automation',
    'inactive',
    '{"mode":"live","maxAttempts":3}',
    '{"retry":"received_or_failed_messages"}',
    1,
    'time',
    '*/5 * * * *',
    NULL,
    'kaiser-module-automation-runner',
    'system',
    CURRENT_TIMESTAMP,
    'system',
    CURRENT_TIMESTAMP
  );
