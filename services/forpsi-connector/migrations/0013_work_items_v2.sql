-- Additive: V1 cases/commitments and grants retain their existing meaning.
CREATE TABLE brain_work_heads_v2 (
  case_id TEXT PRIMARY KEY REFERENCES brain_cases(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  guard_revision INTEGER NOT NULL DEFAULT 0,
  published_revision TEXT,
  ever_published INTEGER NOT NULL DEFAULT 0 CHECK(ever_published IN (0,1)),
  mutation_token TEXT,
  analysis_lease_until INTEGER NOT NULL DEFAULT 0,
  analysis_token TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE brain_work_authorities_v2 (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  capability TEXT NOT NULL CHECK(capability IN ('facts.review','work.manage','signals.manage_shared')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(tenant_id,principal_id,mailbox_id,capability)
);
CREATE TABLE brain_entities_v2 (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('person','team','organization','external')),
  label TEXT NOT NULL,
  address TEXT,
  principal_id TEXT REFERENCES principals(id),
  verified_by TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,address)
);
CREATE TABLE brain_work_events_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL,
  logical_event_id TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_work_events_case_v2 ON brain_work_events_v2(case_id,created_at,id);
CREATE TABLE brain_work_facts_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE TABLE brain_fact_decisions_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES brain_work_events_v2(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_work_facts_case_v2 ON brain_work_facts_v2(case_id,created_at,id);
CREATE INDEX brain_fact_decisions_case_v2 ON brain_fact_decisions_v2(case_id,revision,id);
CREATE TABLE brain_work_signals_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE TABLE brain_projection_runs_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  run_kind TEXT NOT NULL DEFAULT 'projection' CHECK(run_kind IN ('projection','extraction')),
  input_revision INTEGER NOT NULL,
  input_digest TEXT NOT NULL,
  resolver_version TEXT NOT NULL,
  decision_revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','validated','published','failed','aborted')),
  candidate_revision TEXT,
  published_revision TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  failure_code TEXT
);
CREATE INDEX brain_work_signals_case_v2 ON brain_work_signals_v2(case_id,created_at,id);
CREATE INDEX brain_projection_runs_case_v2 ON brain_projection_runs_v2(case_id,started_at,id);
CREATE TABLE brain_projection_revisions_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  input_revision INTEGER NOT NULL,
  input_digest TEXT NOT NULL,
  decision_revision INTEGER NOT NULL,
  guard_revision INTEGER NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  document_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE brain_work_overrides_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  scope TEXT NOT NULL CHECK(scope IN ('personal','shared')),
  revision INTEGER NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_work_overrides_principal_v2 ON brain_work_overrides_v2(tenant_id,principal_id,case_id,revision);
CREATE TABLE brain_condition_evaluations_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  created_at INTEGER NOT NULL
);
CREATE TABLE brain_view_manifests_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  filter_digest TEXT NOT NULL,
  authorization_digest TEXT NOT NULL,
  guard_digest TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK(json_valid(document_json)),
  expires_at INTEGER NOT NULL
);
CREATE INDEX brain_condition_evaluations_case_v2 ON brain_condition_evaluations_v2(case_id,created_at,id);
CREATE INDEX brain_view_expiry_v2 ON brain_view_manifests_v2(expires_at);
CREATE TABLE brain_work_commands_v2 (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  request_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(principal_id,request_id)
);
-- Normal write paths append; correction is a new decision, never an UPDATE.
CREATE TRIGGER brain_events_immutable_v2 BEFORE UPDATE ON brain_work_events_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_WORK_EVENT'); END;
CREATE TRIGGER brain_facts_immutable_v2 BEFORE UPDATE ON brain_work_facts_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_WORK_FACT'); END;
CREATE TRIGGER brain_decisions_immutable_v2 BEFORE UPDATE ON brain_fact_decisions_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_FACT_DECISION'); END;
CREATE TRIGGER brain_revisions_immutable_v2 BEFORE UPDATE ON brain_projection_revisions_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_WORK_REVISION'); END;
CREATE TRIGGER brain_signals_immutable_v2 BEFORE UPDATE ON brain_work_signals_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_ATTENTION_SIGNAL'); END;
CREATE TRIGGER brain_overrides_immutable_v2 BEFORE UPDATE ON brain_work_overrides_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_WORK_OVERRIDE'); END;
CREATE TRIGGER brain_conditions_immutable_v2 BEFORE UPDATE ON brain_condition_evaluations_v2 BEGIN
  SELECT RAISE(ABORT,'IMMUTABLE_CONDITION_EVALUATION'); END;
CREATE TABLE brain_work_identity_decisions_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_work_identity_case_v2 ON brain_work_identity_decisions_v2(case_id,created_at);
CREATE TRIGGER brain_work_identity_immutable_v2 BEFORE UPDATE ON brain_work_identity_decisions_v2
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_WORK_IDENTITY'); END;
CREATE TABLE brain_signal_selections_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id) ON DELETE CASCADE,
  source_message_id TEXT NOT NULL REFERENCES brain_messages(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_signal_selection_case_v2 ON brain_signal_selections_v2(case_id,revision);
CREATE TRIGGER brain_signal_selection_immutable_v2 BEFORE UPDATE ON brain_signal_selections_v2
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_SIGNAL_SELECTION'); END;
