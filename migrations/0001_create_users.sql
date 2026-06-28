CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'readonly',
  status TEXT NOT NULL DEFAULT 'active',
  active INTEGER NOT NULL DEFAULT 1,
  department TEXT,
  position TEXT,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  modules_json TEXT,
  allowed_modules_json TEXT,
  denied_modules_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_users_phone
  ON users(phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_status
  ON users(status);
