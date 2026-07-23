CREATE TABLE IF NOT EXISTS collection_route_driver_tablet_preferences (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT 'blackview-active-7',
  sound_mode TEXT NOT NULL DEFAULT 'standard',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_preferences_updated
  ON collection_route_driver_tablet_preferences(updated_at);

CREATE TABLE IF NOT EXISTS collection_route_driver_tablet_audio_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT '',
  route_session_id TEXT NOT NULL DEFAULT '',
  driver_user_id TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT 'blackview-active-7',
  intro_version TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  sound_event TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope = 'test'),
  idempotency_key TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_idempotency
  ON collection_route_driver_tablet_audio_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_session
  ON collection_route_driver_tablet_audio_events(route_session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_route_driver_tablet_audio_created
  ON collection_route_driver_tablet_audio_events(created_at);
