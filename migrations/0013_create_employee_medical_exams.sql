CREATE TABLE IF NOT EXISTS employee_medical_exams (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  category TEXT,
  date_of_birth TEXT,
  last_exam_date TEXT,
  next_exam_date TEXT,
  interval_months INTEGER,
  status TEXT NOT NULL DEFAULT 'missing_data',
  note TEXT,
  optional INTEGER NOT NULL DEFAULT 0,
  notification_enabled INTEGER NOT NULL DEFAULT 1,
  last_notification_key TEXT,
  last_notification_sent_at TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_medical_exams_employee
  ON employee_medical_exams(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_medical_exams_status
  ON employee_medical_exams(status, next_exam_date);
