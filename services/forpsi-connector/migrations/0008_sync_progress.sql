-- Additive, isolated-development migration. Restore the pre-migration D1 export to roll back data.
ALTER TABLE workflow_sync_cursors ADD COLUMN scan_before_uid INTEGER;
ALTER TABLE workflow_sync_cursors ADD COLUMN scan_uid_validity TEXT;
ALTER TABLE workflow_lists ADD COLUMN semantic_context_status TEXT NOT NULL DEFAULT 'not_analyzed';

-- The OAuth subject must be explicitly linked to a pre-existing SO.ai principal.
-- Email addresses and model-supplied user IDs are never used as identity links.
CREATE TABLE principal_identity_links (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  tenant_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(issuer,subject)
);

CREATE TABLE mailbox_verified_aliases (
  tenant_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  address TEXT NOT NULL,
  verified_at INTEGER NOT NULL CHECK(verified_at > 0),
  verification_source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(tenant_id,mailbox_id,address)
);
