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

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_workflows_status
  ON collection_route_incident_workflows(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_workflows_assigned
  ON collection_route_incident_workflows(assigned_user_id, status, updated_at DESC);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_incident_audit_idempotency
  ON collection_route_incident_audit(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_audit_incident
  ON collection_route_incident_audit(incident_id, created_at);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_incident_communications_idempotency
  ON collection_route_incident_communications(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_incident_communications_incident
  ON collection_route_incident_communications(incident_id, created_at);
