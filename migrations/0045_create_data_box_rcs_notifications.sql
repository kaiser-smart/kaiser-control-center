CREATE TABLE IF NOT EXISTS data_box_plus_rcs_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_user_id TEXT,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'rcs',
  template_key TEXT NOT NULL DEFAULT 'data_box_new_message',
  idempotency_key TEXT NOT NULL,
  provider_message_id TEXT,
  provider_status TEXT,
  used_channel TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  last_attempt_at TEXT,
  provider_status_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id),
  FOREIGN KEY (recipient_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_dedupe
  ON data_box_plus_rcs_notifications(message_id, recipient_key, channel);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_idempotency
  ON data_box_plus_rcs_notifications(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_provider
  ON data_box_plus_rcs_notifications(provider_message_id);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_message
  ON data_box_plus_rcs_notifications(message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_box_plus_rcs_notification_events (
  id TEXT PRIMARY KEY NOT NULL,
  notification_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (notification_id) REFERENCES data_box_plus_rcs_notifications(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_events
  ON data_box_plus_rcs_notification_events(notification_id, created_at DESC);
