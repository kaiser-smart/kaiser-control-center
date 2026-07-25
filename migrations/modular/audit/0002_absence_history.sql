CREATE TABLE IF NOT EXISTS absence_approval_history (
  id TEXT PRIMARY KEY NOT NULL,
  absence_request_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL,
  note TEXT,
  idempotency_key TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_absence_approval_history_idempotency
  ON absence_approval_history(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_absence_approval_history_request
  ON absence_approval_history(absence_request_id, changed_at DESC);
