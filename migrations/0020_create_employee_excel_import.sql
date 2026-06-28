ALTER TABLE employee_cards ADD COLUMN is_hr_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employee_cards ADD COLUMN source_system TEXT;
ALTER TABLE employee_cards ADD COLUMN source_employee_key TEXT;
ALTER TABLE employee_cards ADD COLUMN imported_at TEXT;
ALTER TABLE employee_cards ADD COLUMN imported_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_cards_hr_only
  ON employee_cards(is_hr_only, source_system);

CREATE INDEX IF NOT EXISTS idx_employee_cards_source_key
  ON employee_cards(source_system, source_employee_key);

CREATE TABLE IF NOT EXISTS employee_hr_profiles (
  employee_id TEXT PRIMARY KEY NOT NULL,
  source_file TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  excel_name TEXT,
  company TEXT,
  work_center TEXT,
  country TEXT,
  id_card_number TEXT,
  bank_account TEXT,
  other_bonus REAL,
  daily_shift_hours REAL,
  fte REAL,
  company_id TEXT,
  iban TEXT,
  contact_street TEXT,
  contact_country TEXT,
  cost REAL,
  personal_number TEXT,
  pension_contribution REAL,
  contract_validity TEXT,
  fixed_phone TEXT,
  transport_contribution REAL,
  marital_status TEXT,
  street TEXT,
  driver_license_number TEXT,
  house_number TEXT,
  date_of_birth TEXT,
  departure_date TEXT,
  email_notifications_enabled INTEGER,
  hourly_rate REAL,
  emergency_contact_name TEXT,
  probation_end_date TEXT,
  contact_zip TEXT,
  currency TEXT,
  birth_place TEXT,
  municipality TEXT,
  personal_email TEXT,
  personal_phone TEXT,
  id_card_valid_until TEXT,
  passport_valid_until TEXT,
  children_count INTEGER,
  computer_work TEXT,
  account_prefix TEXT,
  birth_number TEXT,
  driver_license_groups TEXT,
  state TEXT,
  citizenship TEXT,
  emergency_contact_phone TEXT,
  contract_type TEXT,
  original_created_at TEXT,
  contract_start_date TEXT,
  health_insurance_company TEXT,
  original_updated_at TEXT,
  raw_json TEXT,
  imported_at TEXT,
  imported_by_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source_filename TEXT NOT NULL,
  sheet_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  sensitive_field_count INTEGER NOT NULL DEFAULT 0,
  imported_by_user_id TEXT,
  imported_at TEXT NOT NULL,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS employee_import_batch_rows (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  employee_id TEXT,
  employee_name TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  issues_json TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_import_rows_batch
  ON employee_import_batch_rows(batch_id, source_row);
