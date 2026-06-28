CREATE TABLE IF NOT EXISTS employee_cards (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  department TEXT,
  position TEXT,
  manager_id TEXT,
  manager_name TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT,
  employment_type TEXT,
  workload REAL NOT NULL DEFAULT 1,
  vacation_entitlement_days REAL NOT NULL DEFAULT 20,
  vacation_used_days REAL NOT NULL DEFAULT 0,
  vacation_pending_days REAL NOT NULL DEFAULT 0,
  vacation_remaining_days REAL NOT NULL DEFAULT 20,
  current_absence_status TEXT NOT NULL DEFAULT 'v práci',
  sick_days_current_year REAL NOT NULL DEFAULT 0,
  last_absence_date TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_cards_user_id
  ON employee_cards(user_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_manager_id
  ON employee_cards(manager_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_department
  ON employee_cards(department);

CREATE TABLE IF NOT EXISTS employee_work_history (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  date_from TEXT,
  date_to TEXT,
  position TEXT,
  department TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_work_history_employee_id
  ON employee_work_history(employee_id);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  type TEXT,
  name TEXT NOT NULL,
  file_url TEXT,
  uploaded_at TEXT,
  uploaded_by_user_id TEXT,
  expires_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id
  ON employee_documents(employee_id);
