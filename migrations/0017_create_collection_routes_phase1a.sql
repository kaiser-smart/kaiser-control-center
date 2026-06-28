CREATE TABLE IF NOT EXISTS collection_import_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'vistos',
  source_mode TEXT NOT NULL DEFAULT 'api-discovery',
  status TEXT NOT NULL DEFAULT 'waiting',
  api_status TEXT NOT NULL DEFAULT 'waiting',
  message TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_collection_import_batches_created
  ON collection_import_batches(created_at);

CREATE INDEX IF NOT EXISTS idx_collection_import_batches_status
  ON collection_import_batches(status, created_at);

CREATE TABLE IF NOT EXISTS collection_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL DEFAULT 0,
  source_entity TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  summary_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_import_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_import_rows_batch
  ON collection_import_rows(batch_id, row_number);

CREATE TABLE IF NOT EXISTS collection_customer_sites (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL DEFAULT 'vistos',
  source_customer_id TEXT NOT NULL DEFAULT '',
  source_site_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  active INTEGER NOT NULL DEFAULT 1,
  location_quality TEXT NOT NULL DEFAULT 'missing',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_status
  ON collection_customer_sites(status, active);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_customer
  ON collection_customer_sites(source_customer_id);

CREATE INDEX IF NOT EXISTS idx_collection_customer_sites_source_site
  ON collection_customer_sites(source_system, source_site_id);

CREATE TABLE IF NOT EXISTS collection_site_locations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  quality TEXT NOT NULL DEFAULT 'missing',
  status TEXT NOT NULL DEFAULT 'needs-review',
  source TEXT NOT NULL DEFAULT 'vistos-preview',
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_site_locations_site
  ON collection_site_locations(site_id);

CREATE TABLE IF NOT EXISTS collection_contract_services (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  source_contract_id TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  frequency_code TEXT NOT NULL DEFAULT '',
  stable_pattern TEXT NOT NULL DEFAULT '',
  valid_from TEXT,
  valid_to TEXT,
  status TEXT NOT NULL DEFAULT 'preview',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_contract_services_site
  ON collection_contract_services(site_id);

CREATE INDEX IF NOT EXISTS idx_collection_contract_services_waste
  ON collection_contract_services(waste_type, waste_code);

CREATE TABLE IF NOT EXISTS collection_containers (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  service_id TEXT,
  container_type TEXT NOT NULL DEFAULT '',
  volume_liters INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  waste_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id),
  FOREIGN KEY (service_id) REFERENCES collection_contract_services(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_containers_site
  ON collection_containers(site_id);

CREATE TABLE IF NOT EXISTS collection_data_issues (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  site_id TEXT,
  issue_type TEXT NOT NULL DEFAULT 'data-quality',
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES collection_import_batches(id),
  FOREIGN KEY (site_id) REFERENCES collection_customer_sites(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_data_issues_status
  ON collection_data_issues(status, severity, created_at);

CREATE INDEX IF NOT EXISTS idx_collection_data_issues_site
  ON collection_data_issues(site_id);
