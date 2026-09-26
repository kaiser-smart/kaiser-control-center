-- SO.ai-only signature settings. No native Forpsi settings are changed.
CREATE TABLE composition_profiles (
  mailbox_id TEXT PRIMARY KEY REFERENCES mailboxes(id),
  sender_name TEXT NOT NULL,
  signature_text TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  change_id TEXT NOT NULL
);
-- Durable at-most-once APPEND reservation. Never store message bodies/recipients here.
CREATE TABLE draft_attempts (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  principal_id TEXT NOT NULL REFERENCES principals(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','saved','uncertain')),
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(mailbox_id,principal_id,request_id)
);
