ALTER TABLE notification_logs ADD COLUMN module_id TEXT;
ALTER TABLE notification_logs ADD COLUMN subject TEXT;
ALTER TABLE notification_logs ADD COLUMN message_preview TEXT;
ALTER TABLE notification_logs ADD COLUMN provider TEXT;
ALTER TABLE notification_logs ADD COLUMN provider_message_id TEXT;
ALTER TABLE notification_logs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_logs ADD COLUMN updated_at TEXT;
