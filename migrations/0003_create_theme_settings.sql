CREATE TABLE IF NOT EXISTS theme_settings (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);
