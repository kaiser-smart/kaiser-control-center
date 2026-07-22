CREATE TABLE IF NOT EXISTS self_repair_case_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  feedback_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_attachments_case
  ON self_repair_case_attachments(case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_attachments_feedback
  ON self_repair_case_attachments(feedback_id, created_at);
