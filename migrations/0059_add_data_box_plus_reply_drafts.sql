ALTER TABLE data_box_plus_drafts
  ADD COLUMN reply_to_message_id TEXT REFERENCES data_box_plus_messages(id);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_drafts_reply
  ON data_box_plus_drafts(owner_user_id, reply_to_message_id, status, updated_at DESC);
