-- Exact-message approval is bound to an authenticated SO.ai user and account.
-- Message bodies remain encrypted and never enter ordinary audit rows.
CREATE TABLE send_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_cipher TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','cancelled')),
  scheduled INTEGER NOT NULL CHECK(scheduled IN (0,1)),
  send_at INTEGER,
  job_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  UNIQUE(principal_id,mailbox_id,request_id)
);
CREATE INDEX send_proposals_owner ON send_proposals(tenant_id,principal_id,created_at DESC);
