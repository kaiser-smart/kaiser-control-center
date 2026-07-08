CREATE TABLE IF NOT EXISTS data_box_plus_credentials (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL UNIQUE,
  slot INTEGER NOT NULL UNIQUE,
  username_ciphertext TEXT,
  username_hint TEXT,
  password_ciphertext TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'vault',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_rotated_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_credentials_slot
  ON data_box_plus_credentials(slot, active);
