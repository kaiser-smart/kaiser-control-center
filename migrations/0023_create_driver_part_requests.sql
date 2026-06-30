CREATE TABLE IF NOT EXISTS driver_part_requests (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE,
  reported_at TEXT NOT NULL,
  driver_user_id TEXT,
  driver_name TEXT NOT NULL,
  driver_phone TEXT,
  vehicle_id TEXT,
  vehicle_name TEXT,
  license_plate TEXT NOT NULL,
  vin TEXT,
  vehicle_brand TEXT NOT NULL DEFAULT 'jiné',
  defect_type TEXT NOT NULL DEFAULT 'náhradní díl',
  defect_description TEXT NOT NULL,
  damage_photo_status TEXT NOT NULL DEFAULT 'requested',
  damage_photo_requested_at TEXT,
  damage_photo_document_id TEXT,
  damage_photo_note TEXT,
  probable_part TEXT,
  probable_part_side TEXT NOT NULL DEFAULT 'unknown',
  part_identification_status TEXT NOT NULL DEFAULT 'waiting_manual_verification',
  verified_part TEXT,
  part_order_number TEXT,
  status TEXT NOT NULL,
  assigned_to_name TEXT,
  assigned_to_email TEXT,
  handed_off_to_patrik_at TEXT,
  kamil_sms_sent_at TEXT,
  ordered_at TEXT,
  ordered_by_user_id TEXT,
  delivered_at TEXT,
  delivered_by_user_id TEXT,
  service_date TEXT,
  service_time TEXT,
  service_technician TEXT,
  service_note TEXT,
  driver_sms_sent_at TEXT,
  completed_at TEXT,
  completed_by_user_id TEXT,
  canceled_at TEXT,
  canceled_by_user_id TEXT,
  note TEXT,
  patrik_email_status TEXT NOT NULL DEFAULT 'not_sent',
  patrik_email_error TEXT,
  kamil_sms_status TEXT NOT NULL DEFAULT 'not_sent',
  kamil_sms_recipient TEXT,
  kamil_sms_error TEXT,
  driver_sms_status TEXT NOT NULL DEFAULT 'not_sent',
  driver_sms_error TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_status
  ON driver_part_requests(status);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_license_plate
  ON driver_part_requests(license_plate);

CREATE INDEX IF NOT EXISTS idx_driver_part_requests_driver_user
  ON driver_part_requests(driver_user_id);

CREATE TABLE IF NOT EXISTS driver_part_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT,
  notification_channel TEXT,
  notification_recipient TEXT,
  notification_status TEXT,
  notification_error TEXT,
  FOREIGN KEY (request_id) REFERENCES driver_part_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_part_request_events_request
  ON driver_part_request_events(request_id, created_at);
