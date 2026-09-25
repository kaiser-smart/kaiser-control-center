PRAGMA foreign_keys = ON;
CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(issuer, subject)
);
CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  address TEXT NOT NULL,
  credential_key TEXT NOT NULL,
  drafts_folder TEXT,
  sent_folder TEXT,
  trash_folder TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE grants (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  action TEXT NOT NULL CHECK(action IN ('read','write','send','delete','schedule')),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  PRIMARY KEY(principal_id, mailbox_id, action)
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_cipher TEXT,
  send_at INTEGER NOT NULL,
  scheduled INTEGER NOT NULL CHECK(scheduled IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('queued','sending','sent','partial','uncertain','cancelled','blocked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  result_json TEXT,
  UNIQUE(principal_id, mailbox_id, request_id)
);
CREATE INDEX outbox_due ON outbox(state, send_at);
CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  principal_id TEXT NOT NULL,
  mailbox_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL
);
