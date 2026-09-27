-- Additive presentation metadata. Existing lists retain unknown attachment status.
ALTER TABLE workflow_list_items ADD COLUMN attachment_count INTEGER;
