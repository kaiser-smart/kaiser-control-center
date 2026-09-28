-- A current ChatGPT assessment belongs to one fixed personal list, never to
-- the mailbox or an onboarding profile. Both columns are additive and nullable
-- for all previously saved lists.
ALTER TABLE workflow_lists ADD COLUMN analysis_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_lists ADD COLUMN analysis_nonce TEXT;
