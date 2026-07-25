CREATE TABLE IF NOT EXISTS ai_action_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  assistant_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input TEXT,
  result TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_id ON ai_action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_assistant_id ON ai_action_logs(assistant_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_action_type ON ai_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_status ON ai_action_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created_at ON ai_action_logs(created_at);

CREATE TABLE IF NOT EXISTS fleet_vehicle_technical_profile_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fleet_vehicle_technical_profile_events (
  id, profile_id, event_type, actor_name, source_note, payload_json, created_at
) VALUES
  ('fleet-tech-event-3bn3558-20260718', 'fleet-tech-3bn3558', 'confirmed', 'Radim Opluštil', 'Provozní údaje potvrzené 2026-07-18.', '{"vehicleCode":"A","licensePlate":"3BN 3558"}', '2026-07-18T00:00:00.000Z'),
  ('fleet-tech-event-1bp8373-20260718', 'fleet-tech-1bp8373', 'confirmed', 'Radim Opluštil', 'Provozní údaje potvrzené 2026-07-18.', '{"vehicleCode":"B","licensePlate":"1BP 8373"}', '2026-07-18T00:00:00.000Z'),
  ('fleet-tech-event-3be2831-20260718', 'fleet-tech-3be2831', 'confirmed', 'Radim Opluštil', 'Provozní údaje potvrzené 2026-07-18.', '{"vehicleCode":"C","licensePlate":"3BE 2831"}', '2026-07-18T00:00:00.000Z');
