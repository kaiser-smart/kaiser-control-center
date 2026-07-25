-- Generated from the production legacy schema. No data and no cross-D1 foreign keys.
CREATE TABLE IF NOT EXISTS users (  id TEXT PRIMARY KEY NOT NULL,  name TEXT NOT NULL,  email TEXT,  phone TEXT,  role TEXT NOT NULL DEFAULT 'readonly',  status TEXT NOT NULL DEFAULT 'active',  active INTEGER NOT NULL DEFAULT 1,  department TEXT,  position TEXT,  permissions_json TEXT NOT NULL DEFAULT '[]',  modules_json TEXT,  allowed_modules_json TEXT,  denied_modules_json TEXT,  created_at TEXT NOT NULL,  updated_at TEXT NOT NULL,  last_login_at TEXT, manager_id TEXT, manager_name TEXT);

CREATE TABLE IF NOT EXISTS theme_settings (  id TEXT PRIMARY KEY,  settings_json TEXT NOT NULL,  updated_at TEXT NOT NULL,  updated_by_user_id TEXT);

CREATE TABLE IF NOT EXISTS employee_cards (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, role TEXT, department TEXT, position TEXT, manager_id TEXT, manager_name TEXT, employment_status TEXT NOT NULL DEFAULT 'active', start_date TEXT, employment_type TEXT, workload REAL NOT NULL DEFAULT 1, vacation_entitlement_days REAL NOT NULL DEFAULT 20, vacation_used_days REAL NOT NULL DEFAULT 0, vacation_pending_days REAL NOT NULL DEFAULT 0, vacation_remaining_days REAL NOT NULL DEFAULT 20, current_absence_status TEXT NOT NULL DEFAULT 'v práci', sick_days_current_year REAL NOT NULL DEFAULT 0, last_absence_date TEXT, internal_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, address TEXT, workplace TEXT, weekly_hours REAL, is_hr_only INTEGER NOT NULL DEFAULT 0, source_system TEXT, source_employee_key TEXT, imported_at TEXT, imported_by_user_id TEXT);

CREATE TABLE IF NOT EXISTS employee_documents (id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, type TEXT, name TEXT NOT NULL, file_url TEXT, uploaded_at TEXT, uploaded_by_user_id TEXT, expires_at TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS employee_document_files (  document_id TEXT PRIMARY KEY NOT NULL,  employee_id TEXT NOT NULL,  storage_key TEXT NOT NULL,  content_type TEXT,  size_bytes INTEGER NOT NULL DEFAULT 0,  created_at TEXT NOT NULL,  updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS absence_requests ( id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, type TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL, half_day INTEGER NOT NULL DEFAULT 0, note TEXT, status TEXT NOT NULL, days_count REAL NOT NULL DEFAULT 1, manager_id TEXT, manager_name TEXT, approver_user_id TEXT, department TEXT, team TEXT, created_by_user_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL , employee_email TEXT, employee_phone TEXT, manager_email TEXT, manager_phone TEXT, approver_id TEXT, approver_name TEXT, submitted_at TEXT, approved_at TEXT, rejected_at TEXT, rejection_reason TEXT, reminder_sent_at TEXT);

CREATE TABLE IF NOT EXISTS module_feedback (  id TEXT PRIMARY KEY NOT NULL,  module_id TEXT NOT NULL,  module_name TEXT NOT NULL,  user_id TEXT NOT NULL,  user_name TEXT NOT NULL,  user_role TEXT NOT NULL,  message TEXT NOT NULL,  priority TEXT NOT NULL,  status TEXT NOT NULL,  created_at TEXT NOT NULL,  resolved_at TEXT,  resolved_by_user_id TEXT,  internal_note TEXT);

CREATE TABLE IF NOT EXISTS absence_settings (
        id TEXT PRIMARY KEY NOT NULL,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT
      );

CREATE TABLE IF NOT EXISTS employee_medical_exams (  id TEXT PRIMARY KEY NOT NULL,  employee_id TEXT NOT NULL UNIQUE,  category TEXT,  date_of_birth TEXT,  last_exam_date TEXT,  next_exam_date TEXT,  interval_months INTEGER,  status TEXT NOT NULL DEFAULT 'missing_data',  note TEXT,  optional INTEGER NOT NULL DEFAULT 0,  notification_enabled INTEGER NOT NULL DEFAULT 1,  last_notification_key TEXT,  last_notification_sent_at TEXT,  updated_by_user_id TEXT,  created_at TEXT NOT NULL,  updated_at TEXT NOT NULL, request_exam_type TEXT, request_category TEXT, medical_facility_name TEXT, medical_doctor_name TEXT, medical_facility_address TEXT, medical_facility_company_id TEXT);

CREATE TABLE IF NOT EXISTS module_rules (
  id TEXT PRIMARY KEY NOT NULL,
  module_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '{}',
  is_automation INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  schedule_cron TEXT,
  event_name TEXT,
  cloud_runner TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  last_run_status TEXT,
  last_run_message TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_boxes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  isds_id TEXT,
  mode TEXT NOT NULL DEFAULT 'pilot',
  status TEXT NOT NULL DEFAULT 'inactive',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_wim_sites (
  id TEXT PRIMARY KEY NOT NULL,
  road TEXT NOT NULL,
  km_label TEXT NOT NULL,
  location_label TEXT NOT NULL,
  orp TEXT,
  side_label TEXT NOT NULL,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  source_label TEXT,
  source_date TEXT,
  coordinate_quality TEXT NOT NULL DEFAULT 'approximate-needs-verification',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_wim_devices (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  side TEXT NOT NULL,
  km_value REAL,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_customer_sites (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL DEFAULT 'vistos',
  source_customer_id TEXT NOT NULL DEFAULT '',
  source_site_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  active INTEGER NOT NULL DEFAULT 1,
  location_quality TEXT NOT NULL DEFAULT 'missing',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_site_locations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  quality TEXT NOT NULL DEFAULT 'missing',
  status TEXT NOT NULL DEFAULT 'needs-review',
  source TEXT NOT NULL DEFAULT 'vistos-preview',
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

CREATE TABLE IF NOT EXISTS collection_contract_services (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  source_contract_id TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  frequency_code TEXT NOT NULL DEFAULT '',
  stable_pattern TEXT NOT NULL DEFAULT '',
  valid_from TEXT,
  valid_to TEXT,
  status TEXT NOT NULL DEFAULT 'preview',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

CREATE TABLE IF NOT EXISTS collection_containers (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  service_id TEXT,
  container_type TEXT NOT NULL DEFAULT '',
  volume_liters INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  waste_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id),
  FOREIGN KEY (service_id) REFERENCES collection_contract_services(id)
);

CREATE TABLE IF NOT EXISTS collection_data_issues (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  site_id TEXT,
  issue_type TEXT NOT NULL DEFAULT 'data-quality',
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

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

CREATE TABLE IF NOT EXISTS driver_part_requests (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE,
  reported_at TEXT NOT NULL,
  driver_user_id TEXT,
  driver_name TEXT NOT NULL,
  driver_phone TEXT,
  vehicle_id TEXT,
  vehicle_name TEXT,
  license_plate TEXT NOT NULL,
  vin TEXT,
  vehicle_brand TEXT NOT NULL DEFAULT 'jiné',
  defect_type TEXT NOT NULL DEFAULT 'náhradní díl',
  defect_description TEXT NOT NULL,
  damage_photo_status TEXT NOT NULL DEFAULT 'requested',
  damage_photo_requested_at TEXT,
  damage_photo_document_id TEXT,
  damage_photo_note TEXT,
  probable_part TEXT,
  probable_part_side TEXT NOT NULL DEFAULT 'unknown',
  part_identification_status TEXT NOT NULL DEFAULT 'waiting_manual_verification',
  verified_part TEXT,
  part_order_number TEXT,
  status TEXT NOT NULL,
  assigned_to_name TEXT,
  assigned_to_email TEXT,
  handed_off_to_patrik_at TEXT,
  kamil_sms_sent_at TEXT,
  ordered_at TEXT,
  ordered_by_user_id TEXT,
  delivered_at TEXT,
  delivered_by_user_id TEXT,
  service_date TEXT,
  service_time TEXT,
  service_technician TEXT,
  service_note TEXT,
  driver_sms_sent_at TEXT,
  completed_at TEXT,
  completed_by_user_id TEXT,
  canceled_at TEXT,
  canceled_by_user_id TEXT,
  note TEXT,
  patrik_email_status TEXT NOT NULL DEFAULT 'not_sent',
  patrik_email_error TEXT,
  kamil_sms_status TEXT NOT NULL DEFAULT 'not_sent',
  kamil_sms_recipient TEXT,
  kamil_sms_error TEXT,
  driver_sms_status TEXT NOT NULL DEFAULT 'not_sent',
  driver_sms_error TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL
, oe_part_number TEXT, part_name TEXT, part_verification_status TEXT NOT NULL DEFAULT 'waiting_manual_verification', part_verification_source TEXT, parts_provider_id TEXT, parts_provider_status TEXT, parts_provider_message TEXT, parts_provider_error TEXT, part_lookup_query TEXT, part_lookup_result_json TEXT, mercedes_manual_portal_url TEXT, mercedes_mypartshub_url TEXT, price_boost_status TEXT NOT NULL DEFAULT 'not_requested', price_boost_note TEXT, price_boost_checked_at TEXT, price_boost_result_json TEXT);

CREATE TABLE IF NOT EXISTS fleet_vehicle_assignments (
  vehicle_id TEXT PRIMARY KEY,
  license_plate TEXT,
  vin TEXT,
  assigned_driver_user_id TEXT,
  assigned_driver_name TEXT,
  assigned_driver_phone TEXT,
  assigned_driver_email TEXT,
  note TEXT,
  updated_by_user_id TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receivable_customers (
  id TEXT PRIMARY KEY NOT NULL,
  visto_company_id TEXT,
  company_name TEXT NOT NULL,
  ico TEXT,
  dic TEXT,
  registered_address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  preferred_contact_person TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'email',
  automation_status TEXT NOT NULL DEFAULT 'dry_run',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, visto_branch_id TEXT, billing_email TEXT, standard_due_days INTEGER, insolvency_status TEXT NOT NULL DEFAULT 'not_checked', customer_link_confidence TEXT NOT NULL DEFAULT 'NONE');

CREATE TABLE IF NOT EXISTS receivable_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  visto_invoice_id TEXT,
  invoice_number TEXT NOT NULL,
  variable_symbol TEXT,
  customer_id TEXT NOT NULL,
  issue_date TEXT,
  due_date TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  open_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  status TEXT NOT NULL DEFAULT 'unpaid',
  paid_date TEXT,
  pdf_url TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, visto_branch_id TEXT, customer_manager_id TEXT, customer_manager_name TEXT, customer_link_confidence TEXT NOT NULL DEFAULT 'NONE', data_quality_flags_json TEXT NOT NULL DEFAULT '[]', source_snapshot_batch_id TEXT,
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE TABLE IF NOT EXISTS receivable_payment_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL DEFAULT 'kb_pdf',
  bank_transaction_id TEXT,
  booking_date TEXT,
  value_date TEXT,
  transaction_type TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  variable_symbol TEXT,
  constant_symbol TEXT,
  specific_symbol TEXT,
  counterparty_name TEXT,
  counterparty_account TEXT,
  message TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, import_batch_id TEXT, data_quality_flags_json TEXT NOT NULL DEFAULT '[]', content_hash TEXT);

CREATE TABLE IF NOT EXISTS receivable_payment_matches (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  payment_transaction_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  matched_amount REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT 'manual_review',
  status TEXT NOT NULL DEFAULT 'needs_review',
  matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (invoice_id) REFERENCES receivable_invoices(id),
  FOREIGN KEY (payment_transaction_id) REFERENCES receivable_payment_transactions(id),
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE TABLE IF NOT EXISTS receivable_packages (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  total_open_amount REAL NOT NULL DEFAULT 0,
  total_overdue_amount REAL NOT NULL DEFAULT 0,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  oldest_due_date TEXT,
  max_days_overdue INTEGER NOT NULL DEFAULT 0,
  days_to_legal_handoff INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'dry_run',
  next_action_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE TABLE IF NOT EXISTS receivable_customer_payment_ratings (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  payment_morality_score REAL,
  rating TEXT NOT NULL DEFAULT 'C',
  automation_status TEXT NOT NULL DEFAULT 'dry_run',
  weighted_avg_delay REAL NOT NULL DEFAULT 0,
  p90_delay REAL NOT NULL DEFAULT 0,
  on_time_amount_rate REAL NOT NULL DEFAULT 1,
  current_overdue_balance REAL NOT NULL DEFAULT 0,
  avg_monthly_billing REAL NOT NULL DEFAULT 0,
  broken_promise_rate REAL NOT NULL DEFAULT 0,
  partial_payment_risk REAL NOT NULL DEFAULT 0,
  dispute_rate REAL NOT NULL DEFAULT 0,
  unmatched_payment_penalty REAL NOT NULL DEFAULT 0,
  variables_json TEXT NOT NULL DEFAULT '{}',
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, rating_mode TEXT NOT NULL DEFAULT 'PRE_RATING', confidence TEXT NOT NULL DEFAULT 'NONE', recommended_automation_status TEXT NOT NULL DEFAULT 'DRY_RUN_ONLY', period_from TEXT, period_to TEXT, invoice_count INTEGER NOT NULL DEFAULT 0, paid_invoice_count INTEGER NOT NULL DEFAULT 0, open_invoice_count INTEGER NOT NULL DEFAULT 0, invoice_amount_total REAL NOT NULL DEFAULT 0, paid_amount_total REAL NOT NULL DEFAULT 0, open_amount_total REAL NOT NULL DEFAULT 0, overdue_amount_total REAL NOT NULL DEFAULT 0, current_max_days_overdue INTEGER NOT NULL DEFAULT 0, unmatched_payment_rate REAL NOT NULL DEFAULT 0, penalties_json TEXT NOT NULL DEFAULT '{}', data_quality_flags_json TEXT NOT NULL DEFAULT '[]', blocking_reasons_json TEXT NOT NULL DEFAULT '[]', explanation TEXT NOT NULL DEFAULT '', calculation_version TEXT NOT NULL DEFAULT 'legacy', source_fingerprint TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE TABLE IF NOT EXISTS receivable_promises_to_pay (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  promised_date TEXT NOT NULL,
  promised_amount REAL,
  status TEXT NOT NULL DEFAULT 'active',
  source_event_id TEXT,
  detected_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id),
  FOREIGN KEY (package_id) REFERENCES receivable_packages(id)
);

CREATE TABLE IF NOT EXISTS receivable_insolvency_checks (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  ico TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'not_checked',
  found INTEGER NOT NULL DEFAULT 0,
  proceeding_reference TEXT,
  automation_stopped INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE TABLE IF NOT EXISTS receivable_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_route_driver_runs (
  id TEXT PRIMARY KEY,
  source_batch_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  route_day_code TEXT NOT NULL DEFAULT '',
  route_week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  waste_filter TEXT NOT NULL DEFAULT 'all',
  mapping_status_filter TEXT NOT NULL DEFAULT 'all',
  driver_user_id TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS collection_route_driver_problem_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES collection_route_driver_runs(id)
);

CREATE TABLE IF NOT EXISTS data_box_plus_mailboxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  isds_id TEXT,
  slot INTEGER NOT NULL DEFAULT 0,
  connection_status TEXT NOT NULL DEFAULT 'waiting',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_message TEXT,
  new_count INTEGER NOT NULL DEFAULT 0,
  due_count INTEGER NOT NULL DEFAULT 0,
  problem_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_plus_recommendations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  text TEXT NOT NULL,
  summary TEXT,
  extracted_facts TEXT NOT NULL DEFAULT '[]',
  recommended_action TEXT NOT NULL,
  risk_reason TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  evidence TEXT,
  similar_cases TEXT,
  after_confirm TEXT,
  human_reason TEXT,
  requires_confirmation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_plus_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  human_description TEXT NOT NULL,
  conditions_text TEXT,
  proposed_action TEXT,
  autonomy_level TEXT NOT NULL DEFAULT 'Čeká na potvrzení',
  confirmation_required TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  edit_count INTEGER NOT NULL DEFAULT 0,
  reject_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  status TEXT NOT NULL DEFAULT 'Učí se',
  type TEXT NOT NULL DEFAULT 'Pravidlo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_plus_credentials (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL UNIQUE,
  slot INTEGER NOT NULL UNIQUE,
  username_ciphertext TEXT,
  username_hint TEXT,
  password_ciphertext TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'vault',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_rotated_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id)
);

CREATE TABLE IF NOT EXISTS self_repair_cases (
  id TEXT PRIMARY KEY NOT NULL,
  feedback_id TEXT UNIQUE,
  source TEXT NOT NULL,
  case_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  module_key TEXT NOT NULL,
  module_name TEXT NOT NULL,
  target_repo_key TEXT NOT NULL,
  target_production_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_behavior TEXT,
  actual_behavior TEXT,
  reproduction_steps TEXT,
  source_route TEXT,
  build_version TEXT,
  build_commit TEXT,
  browser_info TEXT,
  reporter_user_id TEXT NOT NULL,
  reporter_user_name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  triage_summary TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
, case_number TEXT, workflow_status TEXT NOT NULL DEFAULT 'new', assignee_user_id TEXT, assignee_user_name TEXT, public_message TEXT, details_question TEXT, resume_workflow_status TEXT NOT NULL DEFAULT 'accepted', automation_status TEXT NOT NULL DEFAULT 'not_evaluated', screen_info TEXT, technical_context_json TEXT NOT NULL DEFAULT '{}', last_public_update_at TEXT, ready_for_verification_at TEXT, verified_at TEXT, client_request_id TEXT);

CREATE TABLE IF NOT EXISTS collection_daily_route_runs (
  id TEXT PRIMARY KEY,
  route_key TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  source_mode TEXT NOT NULL DEFAULT 'vistos-komunal-preview',
  route_date TEXT NOT NULL,
  route_day_code TEXT NOT NULL DEFAULT '',
  route_week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL,
  vehicle_registration TEXT NOT NULL DEFAULT '',
  vehicle_label TEXT NOT NULL DEFAULT '',
  driver_user_id TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  stop_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  confirmed_by_user_id TEXT NOT NULL DEFAULT '',
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT,
  started_by_user_id TEXT NOT NULL DEFAULT '',
  started_by_name TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  completed_by_user_id TEXT NOT NULL DEFAULT '',
  completed_by_name TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  reopened_by_user_id TEXT NOT NULL DEFAULT '',
  reopened_by_name TEXT NOT NULL DEFAULT '',
  reopened_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_daily_route_stops (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  route_date TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  station_name TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  container_volume INTEGER NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0,
  container_type TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  pickup_days_text TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  source_contract_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  problem_reason TEXT NOT NULL DEFAULT '',
  problem_note TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  last_event_at TEXT,
  source_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id)
);

CREATE TABLE IF NOT EXISTS vehicle_tracking_user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fleet_vehicle_external_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_id TEXT NOT NULL,
  external_system TEXT NOT NULL,
  external_key TEXT NOT NULL,
  normalized_license_plate TEXT,
  route_vehicle_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  match_method TEXT NOT NULL DEFAULT 'bootstrap_unique_plate',
  confidence TEXT NOT NULL DEFAULT 'high',
  valid_from TEXT,
  valid_to TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sarlota_user_memory (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending',
  topics_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  conversation_count INTEGER NOT NULL DEFAULT 0,
  last_conversation_id TEXT NOT NULL DEFAULT '',
  last_exchange_key TEXT NOT NULL DEFAULT '',
  first_conversation_at TEXT,
  last_conversation_at TEXT,
  consented_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS collection_route_incident_workflows (
  incident_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_user_id TEXT NOT NULL DEFAULT '',
  assigned_name TEXT NOT NULL DEFAULT '',
  assigned_at TEXT,
  unresolved_reason TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  responsible_user_id TEXT NOT NULL DEFAULT '',
  responsible_name TEXT NOT NULL DEFAULT '',
  follow_up_at TEXT,
  resolution_code TEXT NOT NULL DEFAULT '',
  customer_informed TEXT NOT NULL DEFAULT '',
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by_user_id TEXT NOT NULL DEFAULT '',
  resolved_by_name TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  reopened_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS tyre_vehicle_profiles (
  id TEXT PRIMARY KEY,
  license_plate TEXT NOT NULL,
  normalized_license_plate TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL DEFAULT '',
  driver_label TEXT NOT NULL DEFAULT '',
  odometer_km INTEGER NOT NULL DEFAULT 0,
  depot TEXT NOT NULL DEFAULT '',
  wheel_positions_json TEXT NOT NULL DEFAULT '[]',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tyre_inventory (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tyre_size TEXT NOT NULL DEFAULT '',
  load_index TEXT NOT NULL DEFAULT '',
  dot_code TEXT NOT NULL DEFAULT '',
  tyre_type TEXT NOT NULL DEFAULT '',
  purchase_price_ex REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  lifecycle_state TEXT NOT NULL DEFAULT 'sklad',
  vehicle_license_plate TEXT NOT NULL DEFAULT '',
  wheel_position TEXT NOT NULL DEFAULT '',
  mounted_at TEXT NOT NULL DEFAULT '',
  mounted_odometer_km INTEGER NOT NULL DEFAULT 0,
  current_tread_mm REAL,
  pressure_bar REAL,
  mileage_km INTEGER NOT NULL DEFAULT 0,
  defect_count INTEGER NOT NULL DEFAULT 0,
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(legacy_id)
);

CREATE TABLE IF NOT EXISTS tyre_measurements (
  id TEXT PRIMARY KEY,
  legacy_key TEXT UNIQUE,
  tyre_id TEXT NOT NULL DEFAULT '',
  vehicle_license_plate TEXT NOT NULL,
  wheel_position TEXT NOT NULL,
  tread_mm REAL NOT NULL,
  pressure_bar REAL,
  odometer_km INTEGER NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tyre_service_records (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  service_date TEXT NOT NULL,
  vehicle_license_plate TEXT NOT NULL DEFAULT '',
  technician_name TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  labor_cost REAL NOT NULL DEFAULT 0,
  material_cost REAL NOT NULL DEFAULT 0,
  tyre_cost REAL NOT NULL DEFAULT 0,
  invoice_number TEXT NOT NULL DEFAULT '',
  tyre_types_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  source_import_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(legacy_id)
);

CREATE TABLE IF NOT EXISTS tyre_service_record_tyres (
  service_record_id TEXT NOT NULL,
  tyre_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_record_id, tyre_id)
);

CREATE TABLE IF NOT EXISTS collection_route_driver_tablet_preferences (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT 'blackview-active-7',
  sound_mode TEXT NOT NULL DEFAULT 'standard',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, device_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email  ON users(email)  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_users_phone  ON users(phone)  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_user_id ON employee_cards(user_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_manager_id ON employee_cards(manager_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_department ON employee_cards(department);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_files_employee_id  ON employee_document_files(employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_document_files_storage_key  ON employee_document_files(storage_key);

CREATE INDEX IF NOT EXISTS idx_absence_requests_employee ON absence_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_absence_requests_status ON absence_requests(status);

CREATE INDEX IF NOT EXISTS idx_absence_requests_type ON absence_requests(type);

CREATE INDEX IF NOT EXISTS idx_absence_requests_created ON absence_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_module_feedback_module_id ON module_feedback(module_id);

CREATE INDEX IF NOT EXISTS idx_module_feedback_status ON module_feedback(status);

CREATE INDEX IF NOT EXISTS idx_module_feedback_priority ON module_feedback(priority);

CREATE INDEX IF NOT EXISTS idx_module_feedback_user_id ON module_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_module_feedback_created_at ON module_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_absence_requests_manager_status ON absence_requests(manager_id, status);

CREATE INDEX IF NOT EXISTS idx_absence_requests_submitted ON absence_requests(submitted_at);

CREATE INDEX IF NOT EXISTS idx_absence_requests_reminder ON absence_requests(status, reminder_sent_at);

CREATE INDEX IF NOT EXISTS idx_employee_medical_exams_employee  ON employee_medical_exams(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_medical_exams_status  ON employee_medical_exams(status, next_exam_date);

CREATE INDEX IF NOT EXISTS idx_module_rules_module_status
  ON module_rules(module_key, status);

CREATE INDEX IF NOT EXISTS idx_module_rules_type
  ON module_rules(module_key, type, is_automation);

CREATE INDEX IF NOT EXISTS idx_module_rules_updated
  ON module_rules(module_key, updated_at);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_sites_road
  ON vehicle_wim_sites(road, km_label);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_sites_status
  ON vehicle_wim_sites(status);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_devices_site
  ON vehicle_wim_devices(site_id);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_status
  ON collection_customer_sites(status, active);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_customer
  ON collection_customer_sites(source_customer_id);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_source_site
  ON collection_customer_sites(source_system, source_site_id);

CREATE INDEX IF NOT EXISTS idx_collection_site_locations_site
  ON collection_site_locations(site_id);

CREATE INDEX IF NOT EXISTS idx_collection_contract_services_site
  ON collection_contract_services(site_id);

CREATE INDEX IF NOT EXISTS idx_collection_contract_services_waste
  ON collection_contract_services(waste_type, waste_code);

CREATE INDEX IF NOT EXISTS idx_collection_containers_site
  ON collection_containers(site_id);

CREATE INDEX IF NOT EXISTS idx_collection_data_issues_status
  ON collection_data_issues(status, severity, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_data_issues_site
  ON collection_data_issues(site_id);

CREATE INDEX IF NOT EXISTS idx_employee_cards_hr_only
  ON employee_cards(is_hr_only, source_system);

CREATE INDEX IF NOT EXISTS idx_employee_cards_source_key
  ON employee_cards(source_system, source_employee_key);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_status
  ON driver_part_requests(status);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_license_plate
  ON driver_part_requests(license_plate);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_driver_user
  ON driver_part_requests(driver_user_id);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_assignments_license_plate
  ON fleet_vehicle_assignments(license_plate);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_assignments_driver_user
  ON fleet_vehicle_assignments(assigned_driver_user_id);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_assignments_driver_name
  ON fleet_vehicle_assignments(assigned_driver_name);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_verification_status
  ON driver_part_requests(part_verification_status);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_vehicle_brand
  ON driver_part_requests(vehicle_brand);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_customers_visto_company
  ON receivable_customers(visto_company_id)
  WHERE visto_company_id IS NOT NULL AND visto_company_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_customers_ico
  ON receivable_customers(ico);

CREATE INDEX IF NOT EXISTS idx_receivable_customers_status
  ON receivable_customers(automation_status, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_invoices_visto_invoice
  ON receivable_invoices(visto_invoice_id)
  WHERE visto_invoice_id IS NOT NULL AND visto_invoice_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_customer_status
  ON receivable_invoices(customer_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_variable_symbol
  ON receivable_invoices(variable_symbol);

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_due
  ON receivable_invoices(due_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_transactions_source_bank_id
  ON receivable_payment_transactions(source, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL AND bank_transaction_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_vs
  ON receivable_payment_transactions(variable_symbol, booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_booking
  ON receivable_payment_transactions(booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_counterparty
  ON receivable_payment_transactions(counterparty_account, counterparty_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_matches_invoice_transaction
  ON receivable_payment_matches(invoice_id, payment_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_matches_transaction_auto
  ON receivable_payment_matches(payment_transaction_id)
  WHERE status IN ('matched', 'auto_matched');

CREATE INDEX IF NOT EXISTS idx_receivable_payment_matches_customer
  ON receivable_payment_matches(customer_id, status, matched_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_packages_customer
  ON receivable_packages(customer_id);

CREATE INDEX IF NOT EXISTS idx_receivable_packages_status
  ON receivable_packages(status, max_days_overdue);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_customer
  ON receivable_customer_payment_ratings(customer_id, calculated_at);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_rating
  ON receivable_customer_payment_ratings(rating, calculated_at);

CREATE INDEX IF NOT EXISTS idx_receivable_promises_customer_status
  ON receivable_promises_to_pay(customer_id, status, promised_date);

CREATE INDEX IF NOT EXISTS idx_receivable_insolvency_checks_customer
  ON receivable_insolvency_checks(customer_id, checked_at);

CREATE INDEX IF NOT EXISTS idx_receivable_insolvency_checks_found
  ON receivable_insolvency_checks(found, checked_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_batch
  ON collection_route_driver_runs(source_batch_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_driver
  ON collection_route_driver_runs(driver_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_runs_route_key
  ON collection_route_driver_runs(route_key, status);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_problem_reports_run
  ON collection_route_driver_problem_reports(run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_recommendations_status
  ON data_box_plus_recommendations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_credentials_slot
  ON data_box_plus_credentials(slot, active);

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_snapshot_customer
  ON receivable_invoices(source_snapshot_batch_id, customer_id, issue_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_import_batch
  ON receivable_payment_transactions(import_batch_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_version
  ON receivable_customer_payment_ratings(customer_id, calculation_version, period_to, calculated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_source
  ON receivable_customer_payment_ratings(customer_id, calculation_version, period_to, source_fingerprint)
  WHERE source_fingerprint <> '';

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_status
  ON self_repair_cases(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_risk
  ON self_repair_cases(risk_level, updated_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_module
  ON self_repair_cases(module_key, updated_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_reporter
  ON self_repair_cases(reporter_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_fingerprint
  ON self_repair_cases(fingerprint, last_seen_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_cloud_monitor_active_fingerprint
  ON self_repair_cases(fingerprint)
  WHERE source = 'cloud_monitor'
    AND status NOT IN ('rejected', 'duplicate', 'closed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_runs_key
  ON collection_daily_route_runs(route_key);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_runs_date_status
  ON collection_daily_route_runs(route_date, status, vehicle_code);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_runs_driver
  ON collection_daily_route_runs(driver_user_id, status, route_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_source
  ON collection_daily_route_stops(run_id, source_row_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_stops_date_source
  ON collection_daily_route_stops(route_date, source_row_id);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_order
  ON collection_daily_route_stops(run_id, route_order);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_stops_run_status
  ON collection_daily_route_stops(run_id, status, route_order);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_user_preferences_updated_at
  ON vehicle_tracking_user_preferences(updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_external
  ON fleet_vehicle_external_aliases(external_system, external_key);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_vehicle
  ON fleet_vehicle_external_aliases(vehicle_id, external_system, status);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_route
  ON fleet_vehicle_external_aliases(route_vehicle_code, status);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_external_aliases_plate
  ON fleet_vehicle_external_aliases(normalized_license_plate, external_system, status);

CREATE INDEX IF NOT EXISTS idx_sarlota_user_memory_user
  ON sarlota_user_memory(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_sarlota_user_memory_updated
  ON sarlota_user_memory(updated_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_workflows_status
  ON collection_route_incident_workflows(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_workflows_assigned
  ON collection_route_incident_workflows(assigned_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_inventory_vehicle
  ON tyre_inventory(vehicle_license_plate, lifecycle_state);

CREATE INDEX IF NOT EXISTS idx_tyre_inventory_tread
  ON tyre_inventory(current_tread_mm);

CREATE INDEX IF NOT EXISTS idx_tyre_measurements_vehicle_date
  ON tyre_measurements(vehicle_license_plate, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_service_records_date
  ON tyre_service_records(service_date DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_service_records_vehicle
  ON tyre_service_records(vehicle_license_plate, service_date DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_measurements_tyre_date
  ON tyre_measurements(tyre_id, measured_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_service_record_tyres_tyre
  ON tyre_service_record_tyres(tyre_id, service_record_id);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_preferences_updated
  ON collection_route_driver_tablet_preferences(updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_case_number
  ON self_repair_cases(case_number);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_workflow
  ON self_repair_cases(workflow_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_cases_assignee
  ON self_repair_cases(assignee_user_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_client_request
  ON self_repair_cases(client_request_id)
  WHERE client_request_id IS NOT NULL;
