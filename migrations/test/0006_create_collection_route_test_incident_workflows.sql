CREATE TABLE IF NOT EXISTS collection_route_test_incident_scenarios (
  scenario_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  candidate_within_24h INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO collection_route_test_incident_scenarios (
  scenario_key, name, description, candidate_within_24h, config_json
) VALUES (
  'route_within_24h',
  'TEST A · jiný vůz jede kolem do 24 hodin',
  'Řízená TEST varianta ověřující bezplatný náhradní svoz v zítřejší trase.',
  1,
  '{"vehicleCode":"B","vehicleRegistration":"1BP 8373","vehicleLabel":"Vůz B · 1BP 8373","candidateOffsetMinutes":1080,"etaOffsetMinutes":1140,"distanceMeters":1350,"detourSeconds":420,"capacityStatus":"test-safe","wasteCompatibility":"SKO"}'
);

INSERT OR IGNORE INTO collection_route_test_incident_scenarios (
  scenario_key, name, description, candidate_within_24h, config_json
) VALUES (
  'next_standard_pickup',
  'TEST B · žádný vůz nejede kolem do 24 hodin',
  'Řízená TEST varianta ověřující omluvu a připomínku 30 minut před standardním svozem.',
  0,
  '{"nextStandardOffsetDays":7,"nextStandardHour":8,"nextStandardMinute":30,"testReminderOffsetMinutes":2,"policyReminderMinutesBefore":30}'
);

CREATE TABLE IF NOT EXISTS collection_route_test_incident_workflows (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared-test',
  test_scenario TEXT,
  dispatcher_employee_id TEXT NOT NULL DEFAULT '',
  dispatcher_name TEXT NOT NULL DEFAULT '',
  dispatcher_email TEXT NOT NULL DEFAULT '',
  dispatcher_availability TEXT NOT NULL DEFAULT '',
  recovery_branch TEXT NOT NULL DEFAULT 'dispatcher-only',
  candidate_route_label TEXT NOT NULL DEFAULT '',
  candidate_vehicle_code TEXT NOT NULL DEFAULT '',
  candidate_vehicle_registration TEXT NOT NULL DEFAULT '',
  candidate_route_date TEXT,
  candidate_eta_at TEXT,
  candidate_distance_meters INTEGER NOT NULL DEFAULT 0,
  candidate_detour_seconds INTEGER NOT NULL DEFAULT 0,
  recovery_stop_id TEXT NOT NULL DEFAULT '',
  next_standard_pickup_at TEXT,
  policy_reminder_due_at TEXT,
  test_reminder_due_at TEXT,
  reminder_status TEXT NOT NULL DEFAULT 'not-required',
  dispatcher_email_status TEXT NOT NULL DEFAULT 'not-required',
  customer_email_status TEXT NOT NULL DEFAULT 'not-required',
  ai_status TEXT NOT NULL DEFAULT 'not-run',
  ai_model TEXT NOT NULL DEFAULT '',
  escalation_status TEXT NOT NULL DEFAULT 'not-required',
  message_subject TEXT NOT NULL DEFAULT '',
  message_body TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (incident_id) REFERENCES collection_route_test_incidents(id),
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id),
  FOREIGN KEY (test_scenario) REFERENCES collection_route_test_incident_scenarios(scenario_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_incident_workflows_incident
  ON collection_route_test_incident_workflows(incident_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_incident_workflows_idempotency
  ON collection_route_test_incident_workflows(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_workflows_dispatcher
  ON collection_route_test_incident_workflows(dispatcher_employee_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_workflows_reminder
  ON collection_route_test_incident_workflows(reminder_status, test_reminder_due_at);

CREATE TABLE IF NOT EXISTS collection_route_test_incident_actions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  dedupe_key TEXT NOT NULL,
  claim_token TEXT NOT NULL DEFAULT '',
  logical_recipient_name TEXT NOT NULL DEFAULT '',
  logical_recipient_email TEXT NOT NULL DEFAULT '',
  actual_recipient TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workflow_id) REFERENCES collection_route_test_incident_workflows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_incident_actions_dedupe
  ON collection_route_test_incident_actions(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_actions_due
  ON collection_route_test_incident_actions(status, due_at, action_type);

CREATE TABLE IF NOT EXISTS collection_route_test_recovery_stops (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  source_stop_id TEXT NOT NULL,
  route_date TEXT NOT NULL,
  vehicle_code TEXT NOT NULL DEFAULT '',
  vehicle_registration TEXT NOT NULL DEFAULT '',
  vehicle_label TEXT NOT NULL DEFAULT '',
  planned_eta_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned-test',
  free_of_charge INTEGER NOT NULL DEFAULT 1,
  route_overlay INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workflow_id) REFERENCES collection_route_test_incident_workflows(id),
  FOREIGN KEY (source_stop_id) REFERENCES collection_daily_route_stops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_recovery_stops_workflow
  ON collection_route_test_recovery_stops(workflow_id);

CREATE TABLE IF NOT EXISTS collection_route_test_incident_conversation (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'recorded-test',
  escalation_required INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workflow_id) REFERENCES collection_route_test_incident_workflows(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_incident_conversation_idempotency
  ON collection_route_test_incident_conversation(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_incident_conversation_workflow
  ON collection_route_test_incident_conversation(workflow_id, created_at);

CREATE TABLE IF NOT EXISTS collection_route_test_incident_email_guard (
  guard_key TEXT PRIMARY KEY,
  max_count INTEGER NOT NULL DEFAULT 6,
  claimed_count INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO collection_route_test_incident_email_guard (
  guard_key, max_count, claimed_count, description
) VALUES (
  'physical-tablet-test-20260715',
  6,
  0,
  'Pevný ochranný limit schváleného fyzického TESTU: nejvýše šest e-mailových pokusů a jen na COLLECTION_ROUTES_TEST_EMAIL_TO.'
);
