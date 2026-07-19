CREATE TABLE IF NOT EXISTS sarlota_content_documents (
  id TEXT PRIMARY KEY NOT NULL,
  assistant_key TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('prompt', 'knowledge_base')),
  title TEXT NOT NULL,
  draft_content TEXT NOT NULL DEFAULT '',
  draft_fingerprint TEXT NOT NULL DEFAULT '',
  draft_base_live_fingerprint TEXT NOT NULL DEFAULT '',
  draft_status TEXT NOT NULL DEFAULT 'draft' CHECK (draft_status IN ('draft', 'published', 'conflict')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assistant_key, content_kind)
);

CREATE TABLE IF NOT EXISTS sarlota_content_versions (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  assistant_key TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('prompt', 'knowledge_base')),
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live_snapshot', 'published_draft', 'rollback')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES sarlota_content_documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_sarlota_content_versions_document
  ON sarlota_content_versions(document_id, version_number DESC);

CREATE TABLE IF NOT EXISTS sarlota_content_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  assistant_key TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  before_fingerprint TEXT NOT NULL DEFAULT '',
  after_fingerprint TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES sarlota_content_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sarlota_content_audit_document
  ON sarlota_content_audit_log(document_id, created_at DESC);
