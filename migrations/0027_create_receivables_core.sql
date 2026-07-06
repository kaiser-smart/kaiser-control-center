CREATE TABLE IF NOT EXISTS receivable_customers (
  id TEXT PRIMARY KEY NOT NULL,
  visto_company_id TEXT,
  company_name TEXT NOT NULL,
  ico TEXT,
  dic TEXT,
  registered_address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  preferred_contact_person TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'email',
  automation_status TEXT NOT NULL DEFAULT 'dry_run',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_customers_visto_company
  ON receivable_customers(visto_company_id)
  WHERE visto_company_id IS NOT NULL AND visto_company_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_customers_ico
  ON receivable_customers(ico);

CREATE INDEX IF NOT EXISTS idx_receivable_customers_status
  ON receivable_customers(automation_status, updated_at);

CREATE TABLE IF NOT EXISTS receivable_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  visto_invoice_id TEXT,
  invoice_number TEXT NOT NULL,
  variable_symbol TEXT,
  customer_id TEXT NOT NULL,
  issue_date TEXT,
  due_date TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  open_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  status TEXT NOT NULL DEFAULT 'unpaid',
  paid_date TEXT,
  pdf_url TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_invoices_visto_invoice
  ON receivable_invoices(visto_invoice_id)
  WHERE visto_invoice_id IS NOT NULL AND visto_invoice_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_customer_status
  ON receivable_invoices(customer_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_variable_symbol
  ON receivable_invoices(variable_symbol);

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_due
  ON receivable_invoices(due_date, status);

CREATE TABLE IF NOT EXISTS receivable_payment_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL DEFAULT 'kb_pdf',
  bank_transaction_id TEXT,
  booking_date TEXT,
  value_date TEXT,
  transaction_type TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  variable_symbol TEXT,
  constant_symbol TEXT,
  specific_symbol TEXT,
  counterparty_name TEXT,
  counterparty_account TEXT,
  message TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_transactions_source_bank_id
  ON receivable_payment_transactions(source, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL AND bank_transaction_id <> '';

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_vs
  ON receivable_payment_transactions(variable_symbol, booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_booking
  ON receivable_payment_transactions(booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_counterparty
  ON receivable_payment_transactions(counterparty_account, counterparty_name);

CREATE TABLE IF NOT EXISTS receivable_payment_matches (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL,
  payment_transaction_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  matched_amount REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT 'manual_review',
  status TEXT NOT NULL DEFAULT 'needs_review',
  matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (invoice_id) REFERENCES receivable_invoices(id),
  FOREIGN KEY (payment_transaction_id) REFERENCES receivable_payment_transactions(id),
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_matches_invoice_transaction
  ON receivable_payment_matches(invoice_id, payment_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_payment_matches_transaction_auto
  ON receivable_payment_matches(payment_transaction_id)
  WHERE status IN ('matched', 'auto_matched');

CREATE INDEX IF NOT EXISTS idx_receivable_payment_matches_customer
  ON receivable_payment_matches(customer_id, status, matched_at);

CREATE TABLE IF NOT EXISTS receivable_packages (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  total_open_amount REAL NOT NULL DEFAULT 0,
  total_overdue_amount REAL NOT NULL DEFAULT 0,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  oldest_due_date TEXT,
  max_days_overdue INTEGER NOT NULL DEFAULT 0,
  days_to_legal_handoff INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'dry_run',
  next_action_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_packages_customer
  ON receivable_packages(customer_id);

CREATE INDEX IF NOT EXISTS idx_receivable_packages_status
  ON receivable_packages(status, max_days_overdue);

CREATE TABLE IF NOT EXISTS receivable_customer_payment_ratings (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  payment_morality_score REAL,
  rating TEXT NOT NULL DEFAULT 'C',
  automation_status TEXT NOT NULL DEFAULT 'dry_run',
  weighted_avg_delay REAL NOT NULL DEFAULT 0,
  p90_delay REAL NOT NULL DEFAULT 0,
  on_time_amount_rate REAL NOT NULL DEFAULT 1,
  current_overdue_balance REAL NOT NULL DEFAULT 0,
  avg_monthly_billing REAL NOT NULL DEFAULT 0,
  broken_promise_rate REAL NOT NULL DEFAULT 0,
  partial_payment_risk REAL NOT NULL DEFAULT 0,
  dispute_rate REAL NOT NULL DEFAULT 0,
  unmatched_payment_penalty REAL NOT NULL DEFAULT 0,
  variables_json TEXT NOT NULL DEFAULT '{}',
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_customer
  ON receivable_customer_payment_ratings(customer_id, calculated_at);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_rating
  ON receivable_customer_payment_ratings(rating, calculated_at);

CREATE TABLE IF NOT EXISTS receivable_communication_events (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  case_id TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound',
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT,
  template_key TEXT,
  case_header_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_decision_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id),
  FOREIGN KEY (package_id) REFERENCES receivable_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_communication_events_customer
  ON receivable_communication_events(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_communication_events_case
  ON receivable_communication_events(case_id, created_at);

CREATE TABLE IF NOT EXISTS receivable_promises_to_pay (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  promised_date TEXT NOT NULL,
  promised_amount REAL,
  status TEXT NOT NULL DEFAULT 'active',
  source_event_id TEXT,
  detected_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id),
  FOREIGN KEY (package_id) REFERENCES receivable_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_promises_customer_status
  ON receivable_promises_to_pay(customer_id, status, promised_date);

CREATE TABLE IF NOT EXISTS receivable_inbox_messages (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT,
  case_id TEXT,
  message_id TEXT,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body_text TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classification TEXT NOT NULL DEFAULT 'not_classified',
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_inbox_messages_customer
  ON receivable_inbox_messages(customer_id, received_at);

CREATE INDEX IF NOT EXISTS idx_receivable_inbox_messages_classification
  ON receivable_inbox_messages(classification, received_at);

CREATE TABLE IF NOT EXISTS receivable_ai_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  action TEXT NOT NULL DEFAULT 'wait',
  scheduled_at TEXT,
  channel TEXT,
  template_key TEXT,
  tone TEXT NOT NULL DEFAULT 'friendly',
  reason TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  requires_human_approval INTEGER NOT NULL DEFAULT 0,
  marketa_alert INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 1,
  blocked_rules_json TEXT NOT NULL DEFAULT '[]',
  message_preview TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id TEXT,
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id),
  FOREIGN KEY (package_id) REFERENCES receivable_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_ai_decisions_customer
  ON receivable_ai_decisions(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_ai_decisions_dry_run
  ON receivable_ai_decisions(dry_run, scheduled_at);

CREATE TABLE IF NOT EXISTS receivable_insolvency_checks (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  ico TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'not_checked',
  found INTEGER NOT NULL DEFAULT 0,
  proceeding_reference TEXT,
  automation_stopped INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_insolvency_checks_customer
  ON receivable_insolvency_checks(customer_id, checked_at);

CREATE INDEX IF NOT EXISTS idx_receivable_insolvency_checks_found
  ON receivable_insolvency_checks(found, checked_at);

CREATE TABLE IF NOT EXISTS receivable_legal_handoff_packages (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  package_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_reason TEXT NOT NULL DEFAULT 'max_days_overdue',
  total_open_amount REAL NOT NULL DEFAULT 0,
  oldest_due_date TEXT,
  summary_pdf_url TEXT,
  zip_url TEXT,
  json_case_url TEXT,
  case_file_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prepared_by TEXT NOT NULL DEFAULT 'system_dry_run',
  sent_to_marketa_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES receivable_customers(id),
  FOREIGN KEY (package_id) REFERENCES receivable_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_receivable_legal_handoff_customer
  ON receivable_legal_handoff_packages(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_legal_handoff_status
  ON receivable_legal_handoff_packages(status, created_at);

CREATE TABLE IF NOT EXISTS receivable_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  customer_id TEXT,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receivable_audit_entity
  ON receivable_audit_log(entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_audit_customer
  ON receivable_audit_log(customer_id, created_at);

CREATE TABLE IF NOT EXISTS receivable_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO receivable_settings (key, value_json, updated_by_user_id)
VALUES
  ('mode', '{"dryRun":true,"autonomyEnabled":false}', 'migration-0027'),
  ('working_hours', '{"timezone":"Europe/Prague","days":["mon","tue","wed","thu","fri"],"sendFrom":"09:00","sendTo":"15:30","hardStop":"16:00"}', 'migration-0027'),
  ('sender', '{"email":"fakturace@kaiserservis.cz","name":"Kaiser servis - fakturace","replyTo":"fakturace@kaiserservis.cz"}', 'migration-0027'),
  ('legal_handoff', '{"daysOverdue":60,"enabled":true}', 'migration-0027'),
  ('communication_limits', '{"emailDays":1,"smsDays":7,"whatsappDays":7,"voiceDays":14,"maxCustomerActionsPerDay":1}', 'migration-0027'),
  ('banned_words', '["dluh","dlužník","vymáhání","sankce","penále","exekuce","právní kroky","poslední výzva","okamžitě uhraďte"]', 'migration-0027');
