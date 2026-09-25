ALTER TABLE mailboxes ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE mailboxes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mailboxes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mailboxes ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE mailboxes ADD COLUMN last_change_id TEXT;
ALTER TABLE mailboxes ADD COLUMN verified_at INTEGER;
ALTER TABLE mailboxes ADD COLUMN verification_json TEXT;
CREATE UNIQUE INDEX mailbox_address_per_tenant ON mailboxes(tenant_id, address COLLATE NOCASE);
CREATE TABLE mailbox_credentials (
  mailbox_id TEXT PRIMARY KEY REFERENCES mailboxes(id),
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
