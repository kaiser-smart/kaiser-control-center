ALTER TABLE absence_requests ADD COLUMN employee_email TEXT;
ALTER TABLE absence_requests ADD COLUMN employee_phone TEXT;
ALTER TABLE absence_requests ADD COLUMN manager_email TEXT;
ALTER TABLE absence_requests ADD COLUMN manager_phone TEXT;
ALTER TABLE absence_requests ADD COLUMN approver_id TEXT;
ALTER TABLE absence_requests ADD COLUMN approver_name TEXT;
ALTER TABLE absence_requests ADD COLUMN submitted_at TEXT;
ALTER TABLE absence_requests ADD COLUMN approved_at TEXT;
ALTER TABLE absence_requests ADD COLUMN rejected_at TEXT;
ALTER TABLE absence_requests ADD COLUMN rejection_reason TEXT;
ALTER TABLE absence_requests ADD COLUMN reminder_sent_at TEXT;

UPDATE absence_requests
SET status = 'pending_approval'
WHERE status = 'pending';

UPDATE absence_requests
SET submitted_at = created_at
WHERE submitted_at IS NULL;

CREATE TABLE IF NOT EXISTS absence_approval_history (
  id TEXT PRIMARY KEY NOT NULL,
  absence_request_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_absence_approval_history_request
  ON absence_approval_history(absence_request_id);

CREATE INDEX IF NOT EXISTS idx_absence_requests_manager_status
  ON absence_requests(manager_id, status);

CREATE INDEX IF NOT EXISTS idx_absence_requests_submitted
  ON absence_requests(submitted_at);

CREATE INDEX IF NOT EXISTS idx_absence_requests_reminder
  ON absence_requests(status, reminder_sent_at);

CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  related_entity_type TEXT NOT NULL,
  related_entity_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_related
  ON notification_logs(related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type
  ON notification_logs(type, channel, created_at);
