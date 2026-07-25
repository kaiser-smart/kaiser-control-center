CREATE TABLE IF NOT EXISTS absence_requests (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  type TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  half_day INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'days',
  start_time TEXT,
  end_time TEXT,
  hours REAL,
  note TEXT,
  status TEXT NOT NULL,
  days_count REAL NOT NULL DEFAULT 1,
  manager_id TEXT,
  manager_name TEXT,
  employee_email TEXT,
  employee_phone TEXT,
  manager_email TEXT,
  manager_phone TEXT,
  approver_user_id TEXT,
  approver_id TEXT,
  approver_name TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  reminder_sent_at TEXT,
  department TEXT,
  team TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_absence_requests_employee
  ON absence_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_absence_requests_status
  ON absence_requests(status);
CREATE INDEX IF NOT EXISTS idx_absence_requests_type
  ON absence_requests(type);
CREATE INDEX IF NOT EXISTS idx_absence_requests_created
  ON absence_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_absence_requests_manager_status
  ON absence_requests(manager_id, status);
CREATE INDEX IF NOT EXISTS idx_absence_requests_submitted
  ON absence_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_absence_requests_reminder
  ON absence_requests(status, reminder_sent_at);

CREATE TABLE IF NOT EXISTS absence_settings (
  id TEXT PRIMARY KEY NOT NULL,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);
