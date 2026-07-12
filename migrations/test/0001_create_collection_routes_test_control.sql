CREATE TABLE IF NOT EXISTS collection_route_test_datasets (
  id TEXT PRIMARY KEY,
  dataset_key TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  source_batch_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  company_count INTEGER NOT NULL DEFAULT 0,
  site_count INTEGER NOT NULL DEFAULT 0,
  address_source TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_batch_id) REFERENCES collection_import_batches(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_datasets_key
  ON collection_route_test_datasets(dataset_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_datasets_status
  ON collection_route_test_datasets(status, updated_at);

CREATE TABLE IF NOT EXISTS collection_route_test_notification_jobs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  idempotency_key TEXT NOT NULL,
  stop_count INTEGER NOT NULL DEFAULT 0,
  sms_count INTEGER NOT NULL DEFAULT 0,
  email_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  recipient_phone TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (dataset_id) REFERENCES collection_route_test_datasets(id),
  FOREIGN KEY (run_id) REFERENCES collection_daily_route_runs(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_notification_jobs_idempotency
  ON collection_route_test_notification_jobs(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_notification_jobs_status
  ON collection_route_test_notification_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS collection_route_test_notification_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  sms_status TEXT NOT NULL DEFAULT 'pending',
  sms_claim_token TEXT NOT NULL DEFAULT '',
  sms_provider_id TEXT NOT NULL DEFAULT '',
  sms_error TEXT NOT NULL DEFAULT '',
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_claim_token TEXT NOT NULL DEFAULT '',
  email_provider_id TEXT NOT NULL DEFAULT '',
  email_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (job_id) REFERENCES collection_route_test_notification_jobs(id),
  FOREIGN KEY (stop_id) REFERENCES collection_daily_route_stops(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_route_test_notification_items_job_stop
  ON collection_route_test_notification_items(job_id, stop_id);

CREATE INDEX IF NOT EXISTS idx_collection_route_test_notification_items_pending
  ON collection_route_test_notification_items(job_id, sms_status, email_status, route_order);
