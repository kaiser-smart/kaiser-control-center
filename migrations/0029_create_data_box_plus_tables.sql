CREATE TABLE IF NOT EXISTS data_box_plus_mailboxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  isds_id TEXT,
  slot INTEGER NOT NULL DEFAULT 0,
  connection_status TEXT NOT NULL DEFAULT 'waiting',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_message TEXT,
  new_count INTEGER NOT NULL DEFAULT 0,
  due_count INTEGER NOT NULL DEFAULT 0,
  problem_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES data_box_plus_mailboxes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_messages_isds
  ON data_box_plus_messages(mailbox_id, isds_message_id, direction);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_messages_list
  ON data_box_plus_messages(status, risk_level, delivered_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_data_box_plus_attachments_message
  ON data_box_plus_attachments(message_id);

CREATE TABLE IF NOT EXISTS data_box_plus_recommendations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  text TEXT NOT NULL,
  summary TEXT,
  extracted_facts TEXT NOT NULL DEFAULT '[]',
  recommended_action TEXT NOT NULL,
  risk_reason TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  evidence TEXT,
  similar_cases TEXT,
  after_confirm TEXT,
  human_reason TEXT,
  requires_confirmation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_recommendations_status
  ON data_box_plus_recommendations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS data_box_plus_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  human_description TEXT NOT NULL,
  conditions_text TEXT,
  proposed_action TEXT,
  autonomy_level TEXT NOT NULL DEFAULT 'Čeká na potvrzení',
  confirmation_required TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  edit_count INTEGER NOT NULL DEFAULT 0,
  reject_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  status TEXT NOT NULL DEFAULT 'Učí se',
  type TEXT NOT NULL DEFAULT 'Pravidlo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  FOREIGN KEY (message_id) REFERENCES data_box_plus_messages(id),
  FOREIGN KEY (recommendation_id) REFERENCES data_box_plus_recommendations(id)
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_action_log_message
  ON data_box_plus_action_log(message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_box_plus_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'background',
  mailbox_count INTEGER NOT NULL DEFAULT 0,
  messages_found INTEGER NOT NULL DEFAULT 0,
  messages_downloaded INTEGER NOT NULL DEFAULT 0,
  attachments_downloaded INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_box_plus_sync_runs_started
  ON data_box_plus_sync_runs(started_at DESC);

INSERT OR IGNORE INTO data_box_plus_rules (
  id,
  name,
  human_description,
  conditions_text,
  proposed_action,
  autonomy_level,
  confirmation_required,
  success_count,
  confirmed_count,
  edit_count,
  reject_count,
  status,
  type
)
VALUES
  (
    'dbp-rule-registr-smluv',
    'Registr smluv bez akce',
    'Když přijde potvrzení z Registru smluv a neobsahuje výzvu ani lhůtu, připrav archivaci.',
    'Odesílatel nebo předmět obsahuje Registr smluv.',
    'Označit jako informativní a připravit archivaci.',
    'Autonomní po schválení',
    'První měsíc potvrzuje člověk.',
    0,
    0,
    0,
    0,
    'Učí se',
    'Pravidlo'
  ),
  (
    'dbp-rule-finance-reminders',
    'Upomínky a faktury na účetní',
    'Když zpráva obsahuje fakturu nebo upomínku, připrav předání účetnímu oddělení.',
    'Předmět nebo příloha obsahuje faktura, upomínka nebo předžalobní.',
    'Připravit e-mail pro faktury.',
    'Čeká na potvrzení',
    'Finanční požadavek vždy potvrzuje člověk.',
    0,
    0,
    0,
    0,
    'Učí se',
    'Pravidlo'
  ),
  (
    'dbp-rule-legal-risk',
    'Právní zprávy pod kontrolou',
    'Když přijde soud, exekutor nebo právní řízení, označ zprávu jako rizikovou a připrav předání.',
    'Odesílatel nebo předmět obsahuje soud, exekutor, exekuce, usnesení nebo právní.',
    'Předat právníkovi / GT Brno.',
    'Vyžaduje pozornost',
    'Právní zprávu vždy potvrzuje Radim nebo Martin.',
    0,
    0,
    0,
    0,
    'Rizikové',
    'Pravidlo'
  );
