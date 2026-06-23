CREATE TABLE IF NOT EXISTS absence_requests (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  type TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  half_day INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL,
  days_count REAL NOT NULL DEFAULT 1,
  manager_id TEXT,
  manager_name TEXT,
  approver_user_id TEXT,
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
