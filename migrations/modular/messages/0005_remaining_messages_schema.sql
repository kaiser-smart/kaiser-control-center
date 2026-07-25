-- Generated from the production legacy schema. No data and no cross-D1 foreign keys.
CREATE TABLE IF NOT EXISTS notification_logs (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, channel TEXT NOT NULL, recipient TEXT, related_entity_type TEXT NOT NULL, related_entity_id TEXT, status TEXT NOT NULL, error_message TEXT, sent_at TEXT, created_at TEXT NOT NULL, message_id TEXT, thread_id TEXT, audit_id TEXT, from_name TEXT, from_address TEXT, reply_to TEXT, subject_token TEXT, provider_status TEXT);

CREATE TABLE IF NOT EXISTS data_box_messages (
  id TEXT PRIMARY KEY,
  data_box_id TEXT NOT NULL,
  isds_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('received', 'sent')),
  subject TEXT,
  sender_name TEXT,
  sender_box_id TEXT,
  recipient_name TEXT,
  recipient_box_id TEXT,
  delivered_at TEXT,
  accepted_at TEXT,
  read_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  has_attachments INTEGER NOT NULL DEFAULT 0,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  ai_status TEXT NOT NULL DEFAULT 'not_evaluated',
  source TEXT NOT NULL DEFAULT 'cloud_metadata',
  isds_state TEXT,
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'metadata_only',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_messages(id)
);

CREATE TABLE IF NOT EXISTS "data_box_actions" (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  data_box_id TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('archive', 'email', 'reply', 'review', 'ai_boost')),
  status TEXT NOT NULL CHECK (status IN ('prepared', 'requires_confirmation', 'confirmed', 'sent', 'archived', 'blocked', 'failed', 'skipped')),
  recipient TEXT,
  subject TEXT,
  body_preview TEXT,
  dedupe_key TEXT NOT NULL,
  requested_by_user_id TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  completed_at TEXT,
  provider TEXT,
  provider_message_id TEXT,
  result_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_messages(id)
);

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
  raw_payload TEXT NOT NULL DEFAULT '{}'
);

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
  raw_payload TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS data_box_plus_messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  isds_message_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'received',
  sender_name TEXT,
  sender_box_id TEXT,
  recipient_name TEXT,
  recipient_box_id TEXT,
  subject TEXT,
  delivered_at TEXT,
  received_at TEXT,
  message_type TEXT NOT NULL DEFAULT 'Oznámení ISDS',
  status TEXT NOT NULL DEFAULT 'Nové',
  risk_level TEXT NOT NULL DEFAULT 'Střední',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,
  suggested_action TEXT,
  priority_reason TEXT,
  primary_action TEXT,
  assigned_to TEXT,
  archive_status TEXT NOT NULL DEFAULT 'active',
  attachment_status TEXT NOT NULL DEFAULT 'Dostupná',
  facts_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  summary_source TEXT,
  summary_loaded INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'isds',
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_box_plus_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  storage_status TEXT NOT NULL DEFAULT 'Dostupná',
  text_extraction_status TEXT NOT NULL DEFAULT 'Čeká na zpracování',
  extracted_text TEXT,
  error_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id)
);

CREATE TABLE IF NOT EXISTS data_box_plus_action_log (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  recommendation_id TEXT,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  created_at TEXT NOT NULL,
  result TEXT,
  audit_note TEXT,
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id)
);

CREATE TABLE IF NOT EXISTS communication_threads (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  module_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  audit_id TEXT,
  subject_token TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to_user_id TEXT,
  assigned_to_name TEXT,
  assigned_to_email TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  last_event_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communication_messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT,
  audit_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'webhook')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound', 'status_callback', 'system')),
  module_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  message_id TEXT,
  provider TEXT,
  provider_message_id TEXT,
  provider_status TEXT,
  from_name TEXT,
  from_address TEXT,
  reply_to TEXT,
  to_address TEXT,
  cc_address TEXT,
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  matched_confidence REAL NOT NULL DEFAULT 0,
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  action_suggestion TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES communication_threads(thread_id)
);

CREATE TABLE IF NOT EXISTS communication_unmatched_replies (
  id TEXT PRIMARY KEY NOT NULL,
  communication_message_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body_preview TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'manual_queue',
  assigned_to_user_id TEXT,
  assigned_to_name TEXT,
  reason TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (communication_message_id) REFERENCES communication_messages(id)
);

CREATE TABLE IF NOT EXISTS communication_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT,
  module_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  thread_id TEXT,
  communication_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  detail TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_message_log (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT,
  phone TEXT NOT NULL DEFAULT '',
  requested_channel TEXT NOT NULL DEFAULT 'rcs',
  used_channel TEXT NOT NULL DEFAULT 'unknown',
  template_key TEXT NOT NULL,
  message_body TEXT NOT NULL DEFAULT '',
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_message_opt_out (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_message_inbound (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  twilio_message_sid TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_message_consent (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  consent_type TEXT NOT NULL DEFAULT 'operational_rcs',
  status TEXT NOT NULL DEFAULT 'granted',
  consent_version TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  privacy_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_origin TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS data_box_plus_drafts (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  recipient_box_id TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  idempotency_key TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT, reply_to_message_id TEXT REFERENCES data_box_plus_messages(id)
);

CREATE TABLE IF NOT EXISTS data_box_plus_draft_attachments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (draft_id) REFERENCES data_box_plus_drafts(id)
);

CREATE TABLE IF NOT EXISTS data_box_plus_send_jobs (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  provider_message_id TEXT,
  response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT, phase TEXT NOT NULL DEFAULT 'prepared', attempt_count INTEGER NOT NULL DEFAULT 0, last_event_at TEXT,
  FOREIGN KEY (draft_id) REFERENCES data_box_plus_drafts(id)
);

CREATE TABLE IF NOT EXISTS self_repair_case_messages (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  message_type TEXT NOT NULL,
  body TEXT NOT NULL,
  author_user_id TEXT,
  author_user_name TEXT,
  author_role TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_case_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_box_plus_rcs_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_user_id TEXT,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'rcs',
  template_key TEXT NOT NULL DEFAULT 'data_box_new_message',
  idempotency_key TEXT NOT NULL,
  provider_message_id TEXT,
  provider_status TEXT,
  used_channel TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  last_attempt_at TEXT,
  provider_status_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id)
);

CREATE TABLE IF NOT EXISTS data_box_plus_rcs_notification_events (
  id TEXT PRIMARY KEY NOT NULL,
  notification_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (notification_id) REFERENCES data_box_plus_rcs_notifications(id)
);

CREATE TABLE IF NOT EXISTS rcs_template_sync (
  template_key TEXT PRIMARY KEY NOT NULL,
  friendly_name TEXT NOT NULL,
  content_sid TEXT,
  content_fingerprint TEXT,
  sync_status TEXT NOT NULL DEFAULT 'content_sid_missing',
  error_message TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rcs_template_sync_locks (
  lock_name TEXT PRIMARY KEY NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rcs_message_dispatches (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  recipient_masked TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  content_sid TEXT NOT NULL,
  twilio_message_sid TEXT,
  requested_channel TEXT NOT NULL DEFAULT 'rcs',
  used_channel TEXT NOT NULL DEFAULT 'rcs_sms_auto_fallback',
  status TEXT NOT NULL DEFAULT 'reserved',
  error_message TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_related ON notification_logs(related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(type, channel, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_messages_isds_id
  ON data_box_messages(data_box_id, isds_message_id)
  WHERE isds_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_box_messages_list
  ON data_box_messages(data_box_id, direction, status, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_attachments_message
  ON data_box_attachments(message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_actions_dedupe
  ON data_box_actions(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_data_box_actions_message
  ON data_box_actions(message_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_actions_status
  ON data_box_actions(status, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receivable_communication_events_customer
  ON receivable_communication_events(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_communication_events_case
  ON receivable_communication_events(case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_receivable_inbox_messages_customer
  ON receivable_inbox_messages(customer_id, received_at);

CREATE INDEX IF NOT EXISTS idx_receivable_inbox_messages_classification
  ON receivable_inbox_messages(classification, received_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_messages_isds
  ON data_box_plus_messages(mailbox_id, isds_message_id, direction);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_messages_list
  ON data_box_plus_messages(status, risk_level, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_attachments_message
  ON data_box_plus_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_action_log_message
  ON data_box_plus_action_log(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_thread
  ON notification_logs(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_logs_message
  ON notification_logs(message_id);

CREATE INDEX IF NOT EXISTS idx_communication_threads_entity
  ON communication_threads(module_key, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_communication_threads_status
  ON communication_threads(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_communication_messages_thread
  ON communication_messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_communication_messages_entity
  ON communication_messages(module_key, entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_communication_messages_message
  ON communication_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_provider
  ON communication_messages(provider, provider_message_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_status
  ON communication_messages(status, created_at);

CREATE INDEX IF NOT EXISTS idx_communication_unmatched_replies_status
  ON communication_unmatched_replies(status, received_at);

CREATE INDEX IF NOT EXISTS idx_communication_events_created
  ON communication_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_events_thread
  ON communication_events(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_log_phone
  ON customer_message_log(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_log_status
  ON customer_message_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_log_template
  ON customer_message_log(template_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_log_twilio_sid
  ON customer_message_log(twilio_message_sid);

CREATE INDEX IF NOT EXISTS idx_customer_message_log_related
  ON customer_message_log(related_entity_type, related_entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_message_opt_out_phone
  ON customer_message_opt_out(phone);

CREATE INDEX IF NOT EXISTS idx_customer_message_inbound_phone
  ON customer_message_inbound(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_inbound_twilio_sid
  ON customer_message_inbound(twilio_message_sid);

CREATE INDEX IF NOT EXISTS idx_customer_message_consent_phone
  ON customer_message_consent(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_consent_status
  ON customer_message_consent(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_message_consent_version
  ON customer_message_consent(consent_version, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_drafts_idempotency
  ON data_box_plus_drafts(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_drafts_owner
  ON data_box_plus_drafts(owner_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_draft_attachments_draft
  ON data_box_plus_draft_attachments(draft_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_draft
  ON data_box_plus_send_jobs(draft_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_idempotency
  ON data_box_plus_send_jobs(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_drafts_reply
  ON data_box_plus_drafts(owner_user_id, reply_to_message_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_self_repair_case_messages_case
  ON self_repair_case_messages(case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_case_notifications_user
  ON feedback_case_notifications(user_id, read_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_dedupe
  ON data_box_plus_rcs_notifications(message_id, recipient_key, channel);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_idempotency
  ON data_box_plus_rcs_notifications(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_provider
  ON data_box_plus_rcs_notifications(provider_message_id);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_message
  ON data_box_plus_rcs_notifications(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_rcs_notification_events
  ON data_box_plus_rcs_notification_events(notification_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_template_sync_content_sid
  ON rcs_template_sync(content_sid)
  WHERE content_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_message_dispatches_idempotency
  ON rcs_message_dispatches(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_twilio_sid
  ON rcs_message_dispatches(twilio_message_sid);

CREATE INDEX IF NOT EXISTS idx_rcs_message_dispatches_template
  ON rcs_message_dispatches(template_key, created_at DESC);
