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

