CREATE TABLE IF NOT EXISTS absence_settings (
  id TEXT PRIMARY KEY NOT NULL,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);
