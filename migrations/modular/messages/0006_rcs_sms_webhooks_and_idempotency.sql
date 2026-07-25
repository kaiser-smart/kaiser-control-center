CREATE TABLE IF NOT EXISTS rcs_sms_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio',
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'ignored')),
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  payload_r2_object_key TEXT,
  payload_checksum TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_webhook_events_idempotency
  ON rcs_sms_webhook_events(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_webhook_events_provider_event
  ON rcs_sms_webhook_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND provider_event_id <> '';
CREATE INDEX IF NOT EXISTS idx_rcs_sms_webhook_events_retry
  ON rcs_sms_webhook_events(status, next_attempt_at, attempt_count);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_webhook_events_sid
  ON rcs_sms_webhook_events(twilio_message_sid, received_at DESC);

CREATE TABLE IF NOT EXISTS rcs_sms_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_idempotency_keys_retry
  ON rcs_sms_idempotency_keys(status, next_attempt_at, attempt_count);
CREATE INDEX IF NOT EXISTS idx_rcs_sms_idempotency_keys_expiry
  ON rcs_sms_idempotency_keys(expires_at);
