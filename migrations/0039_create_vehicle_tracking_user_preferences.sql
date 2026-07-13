CREATE TABLE IF NOT EXISTS vehicle_tracking_user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicle_tracking_user_preferences_updated_at
  ON vehicle_tracking_user_preferences(updated_at);
