-- Generated from the production legacy schema. No data and no cross-D1 foreign keys.
CREATE TABLE IF NOT EXISTS absence_approval_history (id TEXT PRIMARY KEY NOT NULL, absence_request_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, changed_by_user_id TEXT, changed_by_name TEXT, changed_at TEXT NOT NULL, note TEXT);

CREATE TABLE IF NOT EXISTS employee_document_audit_logs (  id TEXT PRIMARY KEY NOT NULL,  employee_id TEXT NOT NULL,  document_type TEXT NOT NULL,  action TEXT NOT NULL,  performed_by_user_id TEXT,  performed_at TEXT NOT NULL,  metadata TEXT);

CREATE TABLE IF NOT EXISTS module_rule_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS module_automation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  message TEXT,
  error_code TEXT,
  triggered_by TEXT,
  dedupe_key TEXT
);

CREATE TABLE IF NOT EXISTS module_automation_runner_runs (
  id TEXT PRIMARY KEY NOT NULL,
  module_key TEXT NOT NULL,
  runner_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  scheduled_at TEXT,
  finished_at TEXT,
  triggered_by TEXT,
  status TEXT NOT NULL,
  rules_total INTEGER NOT NULL DEFAULT 0,
  dry_run_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT,
  d1_binding TEXT,
  database_name TEXT,
  cron TEXT,
  time_zone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_box_ai_evaluations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  label TEXT,
  priority TEXT,
  confidence REAL,
  summary TEXT,
  suggested_action TEXT,
  result_json TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_sync_runs (
  id TEXT PRIMARY KEY,
  data_box_id TEXT,
  trigger_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  messages_found INTEGER NOT NULL DEFAULT 0,
  messages_created INTEGER NOT NULL DEFAULT 0,
  messages_updated INTEGER NOT NULL DEFAULT 0,
  attachments_found INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  message TEXT,
  dedupe_key TEXT UNIQUE,
  created_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS data_box_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_wim_alert_events (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  vehicle_id TEXT,
  driver_id TEXT,
  license_plate TEXT,
  driver_phone_masked TEXT,
  distance_km REAL,
  heading_degrees REAL,
  approach_side TEXT,
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  error_code TEXT,
  dedupe_key TEXT,
  triggered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS driver_part_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT,
  notification_channel TEXT,
  notification_recipient TEXT,
  notification_status TEXT,
  notification_error TEXT
);

CREATE TABLE IF NOT EXISTS driver_report_partslink24_searches (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  vehicle_id TEXT,
  vehicle_name TEXT,
  license_plate TEXT,
  vin_masked TEXT NOT NULL,
  vehicle_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  message TEXT,
  workflow_url TEXT,
  workflow_inputs_json TEXT,
  result_json TEXT,
  runner_kind TEXT NOT NULL DEFAULT 'github_actions_manual',
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receivable_ai_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  action TEXT NOT NULL DEFAULT 'wait',
  scheduled_at TEXT,
  channel TEXT,
  template_key TEXT,
  tone TEXT NOT NULL DEFAULT 'friendly',
  reason TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  requires_human_approval INTEGER NOT NULL DEFAULT 0,
  marketa_alert INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 1,
  blocked_rules_json TEXT NOT NULL DEFAULT '[]',
  message_preview TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS receivable_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  customer_id TEXT,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_route_driver_stop_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS data_box_plus_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'background',
  mailbox_count INTEGER NOT NULL DEFAULT 0,
  messages_found INTEGER NOT NULL DEFAULT 0,
  messages_downloaded INTEGER NOT NULL DEFAULT 0,
  attachments_downloaded INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS self_repair_case_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_user_name TEXT,
  changed_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_tracking_history_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  points_written INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
, fleet_aliases_seen INTEGER NOT NULL DEFAULT 0, fleet_aliases_written INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS collection_daily_route_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stop_id TEXT,
  event_type TEXT NOT NULL,
  before_status TEXT NOT NULL DEFAULT '',
  after_status TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS fleet_orwii_fuel_sync_runs (
  id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, requested_from TEXT, requested_to TEXT, transaction_count INTEGER NOT NULL DEFAULT 0, matched_count INTEGER NOT NULL DEFAULT 0, unmatched_count INTEGER NOT NULL DEFAULT 0, ambiguous_count INTEGER NOT NULL DEFAULT 0, error_code TEXT, error_message TEXT, started_by_user_id TEXT, started_by_name TEXT
, reprocessed_count INTEGER NOT NULL DEFAULT 0, stored_transaction_count INTEGER NOT NULL DEFAULT 0, stored_matched_count INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS vehicle_tracking_analytics_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  vehicles_processed INTEGER NOT NULL DEFAULT 0,
  points_processed INTEGER NOT NULL DEFAULT 0,
  trips_written INTEGER NOT NULL DEFAULT 0,
  daily_rows_written INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS fleet_trip_job_pairing_runs (
  id TEXT PRIMARY KEY NOT NULL,
  dedupe_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  scheduled_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'cloudflare-cron',
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  aliases_required INTEGER NOT NULL DEFAULT 0,
  aliases_ready INTEGER NOT NULL DEFAULT 0,
  trips_seen INTEGER NOT NULL DEFAULT 0,
  candidate_trips INTEGER NOT NULL DEFAULT 0,
  unclassified_trips INTEGER NOT NULL DEFAULT 0,
  actual_route_runs INTEGER NOT NULL DEFAULT 0,
  actual_stops INTEGER NOT NULL DEFAULT 0,
  candidate_coverage_percent REAL NOT NULL DEFAULT 0,
  job_pair_coverage_percent REAL NOT NULL DEFAULT 0,
  total_distance_km REAL NOT NULL DEFAULT 0,
  candidate_distance_km REAL NOT NULL DEFAULT 0,
  quality_reasons_json TEXT NOT NULL DEFAULT '[]',
  gate_status TEXT NOT NULL DEFAULT 'blocked',
  dashboard_activation_allowed INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS sarlota_content_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  assistant_key TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  before_fingerprint TEXT NOT NULL DEFAULT '',
  after_fingerprint TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_route_incident_audit (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  before_status TEXT NOT NULL DEFAULT '',
  after_status TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS tyre_import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tyre_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_route_driver_tablet_audio_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT '',
  route_session_id TEXT NOT NULL DEFAULT '',
  driver_user_id TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT 'blackview-active-7',
  intro_version TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  sound_event TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS self_repair_codex_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_by_user_name TEXT NOT NULL,
  runner_name TEXT,
  external_task_id TEXT,
  external_task_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_absence_approval_history_request ON absence_approval_history(absence_request_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_audit_employee  ON employee_document_audit_logs(employee_id, performed_at);

CREATE INDEX IF NOT EXISTS idx_module_rule_audit_rule
  ON module_rule_audit_log(rule_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_module_rule_audit_module
  ON module_rule_audit_log(module_key, changed_at);

CREATE INDEX IF NOT EXISTS idx_module_automation_runs_rule
  ON module_automation_runs(rule_id, started_at);

CREATE INDEX IF NOT EXISTS idx_module_automation_runs_module
  ON module_automation_runs(module_key, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_module_automation_runs_dedupe
  ON module_automation_runs(module_key, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS idx_module_automation_runner_runs_module
  ON module_automation_runner_runs(module_key, started_at);

CREATE INDEX IF NOT EXISTS idx_module_automation_runner_runs_status
  ON module_automation_runner_runs(status, started_at);

CREATE INDEX IF NOT EXISTS idx_data_box_ai_evaluations_message
  ON data_box_ai_evaluations(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_sync_runs_started
  ON data_box_sync_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_audit_log_entity
  ON data_box_audit_log(entity_type, entity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_site
  ON vehicle_wim_alert_events(site_id, triggered_at);

CREATE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_vehicle
  ON vehicle_wim_alert_events(vehicle_id, triggered_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_wim_alert_events_dedupe
  ON vehicle_wim_alert_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS idx_driver_part_request_events_request
  ON driver_part_request_events(request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_request
  ON driver_report_partslink24_searches(request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_vehicle
  ON driver_report_partslink24_searches(vehicle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partslink24_searches_created_by
  ON driver_report_partslink24_searches(created_by_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_ai_decisions_customer
  ON receivable_ai_decisions(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_ai_decisions_dry_run
  ON receivable_ai_decisions(dry_run, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_receivable_audit_entity
  ON receivable_audit_log(entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_audit_customer
  ON receivable_audit_log(customer_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_idempotency
  ON collection_route_driver_stop_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_run
  ON collection_route_driver_stop_events(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_stop_events_stop
  ON collection_route_driver_stop_events(run_id, source_row_id, action);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_sync_runs_started
  ON data_box_plus_sync_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_audit_case
  ON self_repair_case_audit_log(case_id, changed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_route_events_idempotency
  ON collection_daily_route_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_events_run
  ON collection_daily_route_events(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_daily_route_events_stop
  ON collection_daily_route_events(stop_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_orwii_fuel_single_running
ON fleet_orwii_fuel_sync_runs(status)
WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_analytics_runs_started
  ON vehicle_tracking_analytics_runs(started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_trip_job_pairing_runs_dedupe
  ON fleet_trip_job_pairing_runs(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_fleet_trip_job_pairing_runs_started
  ON fleet_trip_job_pairing_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sarlota_content_audit_document
  ON sarlota_content_audit_log(document_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_incident_audit_idempotency
  ON collection_route_incident_audit(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_audit_incident
  ON collection_route_incident_audit(incident_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tyre_audit_log_created
  ON tyre_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tyre_audit_entity_date
  ON tyre_audit_log(entity_type, entity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_idempotency
  ON collection_route_driver_tablet_audio_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_session
  ON collection_route_driver_tablet_audio_events(route_session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_created
  ON collection_route_driver_tablet_audio_events(created_at);

CREATE INDEX IF NOT EXISTS idx_self_repair_codex_jobs_case
  ON self_repair_codex_jobs(case_id, created_at);
