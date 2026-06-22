ALTER TABLE users ADD COLUMN manager_id TEXT;
ALTER TABLE users ADD COLUMN manager_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
