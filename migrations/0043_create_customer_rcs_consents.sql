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
