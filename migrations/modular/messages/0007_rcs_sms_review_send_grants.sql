CREATE TABLE IF NOT EXISTS rcs_sms_review_send_grants (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  inbound_message_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT,
  recipient_phone TEXT NOT NULL,
  recipient_phone_hash TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('rcs', 'sms')),
  intent TEXT,
  reply_text TEXT NOT NULL,
  reply_text_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmation_pending'
    CHECK (status IN (
      'confirmation_pending',
      'claimed',
      'cancelled',
      'expired',
      'provider_accepted',
      'failed'
    )),
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  cancelled_at TEXT,
  provider_message_sid TEXT,
  provider_status TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_review_send_grants_active
  ON rcs_sms_review_send_grants(conversation_id)
  WHERE status IN ('confirmation_pending', 'claimed');

CREATE INDEX IF NOT EXISTS idx_rcs_sms_review_send_grants_message
  ON rcs_sms_review_send_grants(inbound_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcs_sms_review_send_grants_expiry
  ON rcs_sms_review_send_grants(status, expires_at);
