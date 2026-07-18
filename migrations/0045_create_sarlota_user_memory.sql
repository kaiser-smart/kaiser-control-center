CREATE TABLE IF NOT EXISTS sarlota_user_memory (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending',
  topics_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  conversation_count INTEGER NOT NULL DEFAULT 0,
  last_conversation_id TEXT NOT NULL DEFAULT '',
  last_exchange_key TEXT NOT NULL DEFAULT '',
  first_conversation_at TEXT,
  last_conversation_at TEXT,
  consented_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sarlota_user_memory_user
  ON sarlota_user_memory(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_sarlota_user_memory_updated
  ON sarlota_user_memory(updated_at);
