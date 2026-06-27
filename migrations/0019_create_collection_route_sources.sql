CREATE TABLE IF NOT EXISTS collection_route_source_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT '13-excel',
  status TEXT NOT NULL DEFAULT 'preview',
  message TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_batches_created
  ON collection_route_source_batches(created_at);

CREATE TABLE IF NOT EXISTS collection_route_source_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  day_code TEXT NOT NULL DEFAULT '',
  week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  sheet_count INTEGER NOT NULL DEFAULT 0,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  route_row_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_route_source_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_files_batch
  ON collection_route_source_files(batch_id);

CREATE TABLE IF NOT EXISTS collection_route_source_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  source_file TEXT NOT NULL DEFAULT '',
  source_sheet TEXT NOT NULL DEFAULT '',
  source_row_number INTEGER NOT NULL DEFAULT 0,
  original_text TEXT NOT NULL DEFAULT '',
  day_code TEXT NOT NULL DEFAULT '',
  week_mode TEXT NOT NULL DEFAULT '',
  vehicle_code TEXT NOT NULL DEFAULT '',
  waste_type TEXT NOT NULL DEFAULT '',
  waste_code TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  container_volume INTEGER NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  mapping_status TEXT NOT NULL DEFAULT 'nenamapovano',
  mapping_issue TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preview',
  estimated_service_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_weight_tons REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES collection_route_source_batches(id),
  FOREIGN KEY (file_id) REFERENCES collection_route_source_files(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_rows_batch_filters
  ON collection_route_source_rows(batch_id, day_code, week_mode, vehicle_code);

CREATE INDEX IF NOT EXISTS idx_collection_route_source_rows_mapping
  ON collection_route_source_rows(batch_id, mapping_status);

CREATE TABLE IF NOT EXISTS collection_route_vistos_matches (
  id TEXT PRIMARY KEY,
  source_row_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nenamapovano',
  confidence TEXT NOT NULL DEFAULT '',
  contract_id TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  branch_name TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_row_id) REFERENCES collection_route_source_rows(id)
);

CREATE INDEX IF NOT EXISTS idx_collection_route_vistos_matches_row
  ON collection_route_vistos_matches(source_row_id);
