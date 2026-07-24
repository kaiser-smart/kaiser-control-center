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
  ON rcs_template_sync(content_sid)
  WHERE content_sid IS NOT NULL;

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_message_dispatches_idempotency
  ON rcs_message_dispatches(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_twilio_sid
  ON rcs_message_dispatches(twilio_message_sid);

CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_template
  ON rcs_message_dispatches(template_key, created_at DESC);
