-- Generated from the production legacy schema. No data and no cross-D1 foreign keys.
CREATE TABLE IF NOT EXISTS employee_work_history (id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, date_from TEXT, date_to TEXT, position TEXT, department TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS collection_import_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'vistos',
  source_mode TEXT NOT NULL DEFAULT 'api-discovery',
  status TEXT NOT NULL DEFAULT 'waiting',
  api_status TEXT NOT NULL DEFAULT 'waiting',
  message TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS collection_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL DEFAULT 0,
  source_entity TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  summary_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_import_batches(id)
);

CREATE TABLE IF NOT EXISTS collection_route_source_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT '13-excel',
  status TEXT NOT NULL DEFAULT 'preview',
  message TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS collection_route_source_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  day_code TEXT NOT NULL DEFAULT '',
  week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  sheet_count INTEGER NOT NULL DEFAULT 0,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  route_row_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_route_source_batches(id)
);

CREATE TABLE IF NOT EXISTS collection_route_source_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  source_file TEXT NOT NULL DEFAULT '',
  source_sheet TEXT NOT NULL DEFAULT '',
  source_row_number INTEGER NOT NULL DEFAULT 0,
  original_text TEXT NOT NULL DEFAULT '',
  day_code TEXT NOT NULL DEFAULT '',
  week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  container_volume INTEGER NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  mapping_status TEXT NOT NULL DEFAULT 'nenamapovano',
  mapping_issue TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  estimated_service_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_weight_tons REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_route_source_batches(id),
  FOREIGN KEY (file_id) REFERENCES collection_route_source_files(id)
);

CREATE TABLE IF NOT EXISTS collection_route_vistos_matches (
  id TEXT PRIMARY KEY,
  source_row_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nenamapovano',
  confidence TEXT NOT NULL DEFAULT '',
  contract_id TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  branch_name TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_row_id) REFERENCES collection_route_source_rows(id)
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

CREATE TABLE IF NOT EXISTS receivable_legal_handoff_packages (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_reason TEXT NOT NULL DEFAULT 'max_days_overdue',
  total_open_amount REAL NOT NULL DEFAULT 0,
  oldest_due_date TEXT,
  summary_pdf_url TEXT,
  zip_url TEXT,
  json_case_url TEXT,
  case_file_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prepared_by TEXT NOT NULL DEFAULT 'system_dry_run',
  sent_to_marketa_at TEXT
);

CREATE TABLE IF NOT EXISTS receivable_import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_preview',
  import_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview',
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  ignored_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parser_summary_json TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL DEFAULT '{}'
, content_sha256 TEXT, period_from TEXT, period_to TEXT);

CREATE TABLE IF NOT EXISTS receivable_import_rows (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  entity_kind TEXT NOT NULL,
  preview_status TEXT NOT NULL DEFAULT 'ready',
  confidence REAL NOT NULL DEFAULT 0,
  issue_code TEXT,
  issue_message TEXT,
  normalized_json TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES receivable_import_batches(id)
);

CREATE TABLE IF NOT EXISTS self_repair_case_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  label TEXT,
  content_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_tracking_gps_points (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_key TEXT NOT NULL,
  license_plate TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  speed_kmh INTEGER,
  heading INTEGER,
  address TEXT,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'tcars'
);

CREATE TABLE IF NOT EXISTS fleet_orwii_fuel_transactions (
  external_id TEXT PRIMARY KEY NOT NULL, occurred_at TEXT, fuel_type TEXT, liters REAL, unit_price REAL, total_price REAL, odometer_km REAL, license_plate TEXT, orwii_vehicle_id TEXT, fuel_chip_id TEXT, matched_vehicle_id TEXT, match_status TEXT NOT NULL DEFAULT 'unmatched', match_method TEXT, source_payload_json TEXT NOT NULL DEFAULT '{}', first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_tracking_trip_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  vehicle_key TEXT NOT NULL,
  license_plate TEXT,
  local_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  distance_km REAL NOT NULL DEFAULT 0,
  duration_minutes REAL NOT NULL DEFAULT 0,
  moving_minutes REAL NOT NULL DEFAULT 0,
  point_count INTEGER NOT NULL DEFAULT 0,
  segment_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0,
  quality_status TEXT NOT NULL DEFAULT 'insufficient',
  distance_source TEXT NOT NULL DEFAULT 'gps_geometry',
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_tracking_daily_metrics (
  vehicle_key TEXT NOT NULL,
  local_date TEXT NOT NULL,
  license_plate TEXT,
  total_km REAL NOT NULL DEFAULT 0,
  trip_count INTEGER NOT NULL DEFAULT 0,
  moving_minutes REAL NOT NULL DEFAULT 0,
  point_count INTEGER NOT NULL DEFAULT 0,
  valid_segment_count INTEGER NOT NULL DEFAULT 0,
  rejected_segment_count INTEGER NOT NULL DEFAULT 0,
  coverage_percent REAL NOT NULL DEFAULT 0,
  quality_status TEXT NOT NULL DEFAULT 'insufficient',
  first_recorded_at TEXT,
  last_recorded_at TEXT,
  distance_source TEXT NOT NULL DEFAULT 'gps_geometry',
  calculated_at TEXT NOT NULL,
  PRIMARY KEY (vehicle_key, local_date)
);

CREATE TABLE IF NOT EXISTS fleet_trip_job_allocations (
  trip_id TEXT PRIMARY KEY NOT NULL,
  pairing_run_id TEXT NOT NULL,
  vehicle_id TEXT,
  tcars_vehicle_key TEXT NOT NULL,
  route_vehicle_code TEXT,
  local_date TEXT NOT NULL,
  route_run_id TEXT,
  job_stop_id TEXT,
  allocation_status TEXT NOT NULL DEFAULT 'unclassified',
  classification TEXT NOT NULL DEFAULT 'unclassified',
  distance_km REAL NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT 'none',
  confidence TEXT NOT NULL DEFAULT 'none',
  reason_code TEXT NOT NULL DEFAULT 'unclassified',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_trip_calculated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sarlota_content_versions (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  assistant_key TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('prompt', 'knowledge_base')),
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live_snapshot', 'published_draft', 'rollback')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS collection_route_incident_communications (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  content_snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_sent',
  provider TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  confirmed_by_user_id TEXT NOT NULL DEFAULT '',
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  environment TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

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
, message_id TEXT, visibility TEXT NOT NULL DEFAULT 'public');

CREATE TABLE IF NOT EXISTS data_box_plus_archive_objects (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  isds_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('received', 'sent')),
  message_storage_key TEXT,
  message_sha256 TEXT,
  message_size_bytes INTEGER NOT NULL DEFAULT 0,
  delivery_storage_key TEXT,
  delivery_sha256 TEXT,
  delivery_size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  archived_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mailbox_id, isds_message_id, direction)
);

CREATE TABLE IF NOT EXISTS data_box_plus_archive_backfills (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('received', 'sent')),
  range_from TEXT NOT NULL,
  range_to TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 1,
  page_limit INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  messages_discovered INTEGER NOT NULL DEFAULT 0,
  messages_archived INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mailbox_id, direction, range_to)
);

CREATE INDEX IF NOT EXISTS idx_employee_work_history_employee_id ON employee_work_history(employee_id);

CREATE INDEX IF NOT EXISTS idx_collection_import_batches_created
  ON collection_import_batches(created_at);

CREATE INDEX IF NOT EXISTS idx_collection_import_batches_status
  ON collection_import_batches(status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_import_rows_batch
  ON collection_import_rows(batch_id, row_number);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_batches_created
  ON collection_route_source_batches(created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_files_batch
  ON collection_route_source_files(batch_id);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_rows_batch_filters
  ON collection_route_source_rows(batch_id, day_code, week_mode, vehicle_code);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_rows_mapping
  ON collection_route_source_rows(batch_id, mapping_status);

CREATE INDEX IF NOT EXISTS idx_collection_route_vistos_matches_row
  ON collection_route_vistos_matches(source_row_id);

CREATE INDEX IF NOT EXISTS idx_employee_import_rows_batch
  ON employee_import_batch_rows(batch_id, source_row);

CREATE INDEX IF NOT EXISTS idx_receivable_legal_handoff_customer
  ON receivable_legal_handoff_packages(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_legal_handoff_status
  ON receivable_legal_handoff_packages(status, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_import_batches_kind_created
  ON receivable_import_batches(import_kind, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_import_batches_status
  ON receivable_import_batches(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_import_rows_batch_row
  ON receivable_import_rows(batch_id, row_number);

CREATE INDEX IF NOT EXISTS idx_receivable_import_rows_status
  ON receivable_import_rows(preview_status, entity_kind);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_evidence_case
  ON self_repair_case_evidence(case_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_tracking_gps_points_dedupe
  ON vehicle_tracking_gps_points(vehicle_key, recorded_at, latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_gps_points_route
  ON vehicle_tracking_gps_points(vehicle_key, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_occurred_at ON fleet_orwii_fuel_transactions(occurred_at);

CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_matched_vehicle ON fleet_orwii_fuel_transactions(matched_vehicle_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_match_status ON fleet_orwii_fuel_transactions(match_status, occurred_at);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_trip_summaries_period
  ON vehicle_tracking_trip_summaries(local_date DESC, vehicle_key);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_trip_summaries_vehicle
  ON vehicle_tracking_trip_summaries(vehicle_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_daily_metrics_period
  ON vehicle_tracking_daily_metrics(local_date DESC, total_km DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_period
  ON fleet_trip_job_allocations(local_date DESC, route_vehicle_code, classification);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_vehicle
  ON fleet_trip_job_allocations(vehicle_id, local_date DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_allocations_route
  ON fleet_trip_job_allocations(route_run_id, job_stop_id);

CREATE INDEX IF NOT EXISTS idx_sarlota_content_versions_document
  ON sarlota_content_versions(document_id, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_incident_communications_idempotency
  ON collection_route_incident_communications(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_communications_incident
  ON collection_route_incident_communications(incident_id, created_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_attachments_case
  ON self_repair_case_attachments(case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_attachments_feedback
  ON self_repair_case_attachments(feedback_id, created_at);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_archive_objects_mailbox
  ON data_box_plus_archive_objects(mailbox_id, status, direction);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_archive_backfills_queue
  ON data_box_plus_archive_backfills(status, updated_at, mailbox_id);
