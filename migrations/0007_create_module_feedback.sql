CREATE TABLE IF NOT EXISTS module_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  module_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  internal_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_feedback_module_id ON module_feedback(module_id);
CREATE INDEX IF NOT EXISTS idx_module_feedback_status ON module_feedback(status);
CREATE INDEX IF NOT EXISTS idx_module_feedback_priority ON module_feedback(priority);
CREATE INDEX IF NOT EXISTS idx_module_feedback_user_id ON module_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_module_feedback_created_at ON module_feedback(created_at);
