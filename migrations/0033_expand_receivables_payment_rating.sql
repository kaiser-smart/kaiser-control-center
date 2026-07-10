ALTER TABLE receivable_customers ADD COLUMN visto_branch_id TEXT;
ALTER TABLE receivable_customers ADD COLUMN billing_email TEXT;
ALTER TABLE receivable_customers ADD COLUMN standard_due_days INTEGER;
ALTER TABLE receivable_customers ADD COLUMN insolvency_status TEXT NOT NULL DEFAULT 'not_checked';
ALTER TABLE receivable_customers ADD COLUMN customer_link_confidence TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE receivable_invoices ADD COLUMN visto_branch_id TEXT;
ALTER TABLE receivable_invoices ADD COLUMN customer_manager_id TEXT;
ALTER TABLE receivable_invoices ADD COLUMN customer_manager_name TEXT;
ALTER TABLE receivable_invoices ADD COLUMN customer_link_confidence TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE receivable_invoices ADD COLUMN data_quality_flags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE receivable_invoices ADD COLUMN source_snapshot_batch_id TEXT;

ALTER TABLE receivable_payment_transactions ADD COLUMN import_batch_id TEXT;
ALTER TABLE receivable_payment_transactions ADD COLUMN data_quality_flags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE receivable_payment_transactions ADD COLUMN content_hash TEXT;

ALTER TABLE receivable_import_batches ADD COLUMN content_sha256 TEXT;
ALTER TABLE receivable_import_batches ADD COLUMN period_from TEXT;
ALTER TABLE receivable_import_batches ADD COLUMN period_to TEXT;

ALTER TABLE receivable_customer_payment_ratings ADD COLUMN rating_mode TEXT NOT NULL DEFAULT 'PRE_RATING';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN confidence TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN recommended_automation_status TEXT NOT NULL DEFAULT 'DRY_RUN_ONLY';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN period_from TEXT;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN period_to TEXT;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN invoice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN paid_invoice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN open_invoice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN invoice_amount_total REAL NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN paid_amount_total REAL NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN open_amount_total REAL NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN overdue_amount_total REAL NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN current_max_days_overdue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN unmatched_payment_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN penalties_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN data_quality_flags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN blocking_reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN calculation_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE receivable_customer_payment_ratings ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_receivable_invoices_snapshot_customer
  ON receivable_invoices(source_snapshot_batch_id, customer_id, issue_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payment_transactions_import_batch
  ON receivable_payment_transactions(import_batch_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_version
  ON receivable_customer_payment_ratings(customer_id, calculation_version, period_to, calculated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_customer_payment_ratings_source
  ON receivable_customer_payment_ratings(customer_id, calculation_version, period_to, source_fingerprint)
  WHERE source_fingerprint <> '';
