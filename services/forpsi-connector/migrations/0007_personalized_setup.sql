-- Additive development migration. Rollback uses the database backup taken before applying.
ALTER TABLE workflow_lists ADD COLUMN scanned_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_lists ADD COLUMN scan_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_lists ADD COLUMN semantic_examined_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_lists ADD COLUMN semantic_status TEXT NOT NULL DEFAULT 'unavailable';
ALTER TABLE workflow_list_items ADD COLUMN semantic_evidence_json TEXT;

CREATE TABLE workflow_sync_cursors (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  next_due INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_run INTEGER,
  last_outcome TEXT,
  PRIMARY KEY(tenant_id,principal_id,mailbox_id)
);
