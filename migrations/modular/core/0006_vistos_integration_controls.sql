-- Explicit grants extend the existing user/permission registry; no role grants seeded.
CREATE TABLE IF NOT EXISTS vistos_company_access (
  user_id TEXT NOT NULL, installation TEXT NOT NULL, company_id TEXT NOT NULL,
  PRIMARY KEY(user_id,installation,company_id)
);
CREATE TABLE IF NOT EXISTS vistos_integration_contracts (
  installation TEXT PRIMARY KEY, revision TEXT NOT NULL, contract_json TEXT NOT NULL,
  approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vistos_allocation_confirmations (
  allocation_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, revision TEXT NOT NULL,
  installation TEXT NOT NULL, company_id TEXT NOT NULL, invoice_source_id TEXT NOT NULL,
  bank_account TEXT NOT NULL, currency_id TEXT NOT NULL, amount_decimal TEXT NOT NULL,
  transaction_amount_decimal TEXT NOT NULL, bank_date TEXT NOT NULL,
  confirmation_method TEXT NOT NULL CHECK(confirmation_method IN ('human','verified_source_link')),
  confirmed_by TEXT NOT NULL, confirmed_at TEXT NOT NULL, fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed'
);
CREATE INDEX IF NOT EXISTS vistos_allocation_transaction ON vistos_allocation_confirmations(transaction_id,status);
CREATE TABLE IF NOT EXISTS vistos_payment_commands (
  id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL, revision TEXT NOT NULL, operation_kind TEXT NOT NULL,
  installation TEXT NOT NULL, company_id TEXT NOT NULL, invoice_source_id TEXT NOT NULL,
  previous_invoice_id TEXT, payment_source_id TEXT, state TEXT NOT NULL,
  fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, expected_json TEXT NOT NULL DEFAULT '{}',
  lease_owner TEXT, lease_until TEXT, sent_at TEXT, error_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(allocation_id,revision,operation_kind)
);
CREATE INDEX IF NOT EXISTS vistos_command_scope_state ON vistos_payment_commands(installation,company_id,state);
CREATE TABLE IF NOT EXISTS vistos_finance_locks (
  resource TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vistos_command_events (
  id TEXT PRIMARY KEY, command_id TEXT NOT NULL, company_id TEXT NOT NULL, actor TEXT NOT NULL,
  before_state TEXT, after_state TEXT NOT NULL, fingerprint TEXT NOT NULL,
  error_code TEXT, created_at TEXT NOT NULL, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS vistos_execution_confirmations (
  evidence_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, job_id TEXT NOT NULL, actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('human_confirmed','cannot_determine')),
  reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vistos_user_preferences (
  user_id TEXT PRIMARY KEY, columns_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vistos_request_budget (
  resource TEXT PRIMARY KEY, bucket TEXT NOT NULL, requests INTEGER NOT NULL
);
