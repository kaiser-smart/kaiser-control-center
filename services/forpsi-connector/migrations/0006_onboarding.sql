-- Optional personal setup. Consent, observations, proposals and approved versions
-- are separate so connecting a mailbox never silently authorizes profiling.
CREATE TABLE workflow_onboarding (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  status TEXT NOT NULL CHECK(status IN ('deferred','consented','analyzed','questioning','ready','approved')),
  scope_json TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0 CHECK(question_count BETWEEN 0 AND 20),
  answers_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX workflow_onboarding_owner ON workflow_onboarding(tenant_id,principal_id,mailbox_id,updated_at DESC);
CREATE TABLE workflow_observations (
  onboarding_id TEXT PRIMARY KEY REFERENCES workflow_onboarding(id),
  coverage_json TEXT NOT NULL,
  observations_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE workflow_proposals (
  onboarding_id TEXT PRIMARY KEY REFERENCES workflow_onboarding(id),
  version INTEGER NOT NULL DEFAULT 1,
  proposal_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE workflow_profile_versions (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(tenant_id,principal_id,mailbox_id,version)
);
CREATE UNIQUE INDEX workflow_profile_active ON workflow_profile_versions(tenant_id,principal_id,mailbox_id) WHERE active=1;
CREATE TABLE workflow_signatures (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  sender_address TEXT NOT NULL,
  full_text TEXT NOT NULL,
  short_text TEXT NOT NULL,
  revision INTEGER NOT NULL,
  approved_at INTEGER NOT NULL,
  PRIMARY KEY(tenant_id,principal_id,mailbox_id,sender_address)
);
