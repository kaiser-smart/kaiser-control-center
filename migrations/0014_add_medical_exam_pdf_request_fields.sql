ALTER TABLE employee_cards ADD COLUMN address TEXT;
ALTER TABLE employee_cards ADD COLUMN workplace TEXT;
ALTER TABLE employee_cards ADD COLUMN weekly_hours REAL;

ALTER TABLE employee_medical_exams ADD COLUMN request_exam_type TEXT;
ALTER TABLE employee_medical_exams ADD COLUMN request_category TEXT;
ALTER TABLE employee_medical_exams ADD COLUMN medical_facility_name TEXT;
ALTER TABLE employee_medical_exams ADD COLUMN medical_doctor_name TEXT;
ALTER TABLE employee_medical_exams ADD COLUMN medical_facility_address TEXT;
ALTER TABLE employee_medical_exams ADD COLUMN medical_facility_company_id TEXT;

CREATE TABLE IF NOT EXISTS employee_document_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by_user_id TEXT,
  performed_at TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_document_audit_employee
  ON employee_document_audit_logs(employee_id, performed_at);
