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

CREATE INDEX IF NOT EXISTS idx_customer_message_inbound_twilio_sid
  ON customer_message_inbound(twilio_message_sid);
