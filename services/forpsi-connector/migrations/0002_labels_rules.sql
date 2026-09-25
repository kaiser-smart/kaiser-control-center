CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(mailbox_id, name)
);
CREATE TABLE message_labels (
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  uid_validity TEXT NOT NULL,
  uid INTEGER NOT NULL,
  PRIMARY KEY(label_id, folder, uid_validity, uid)
);
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  definition_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
