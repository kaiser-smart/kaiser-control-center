-- Mail Brain is additive. Existing worklists, drafts, grants and outbox remain intact.
CREATE TABLE brain_consents (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  lookback_days INTEGER NOT NULL DEFAULT 90 CHECK(lookback_days BETWEEN 1 AND 90),
  inbox_folder TEXT NOT NULL DEFAULT 'INBOX',
  sent_folder TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY(tenant_id,principal_id,mailbox_id)
);

CREATE TABLE brain_sync_cursors (
  tenant_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  folder TEXT NOT NULL,
  uid_validity TEXT,
  next_before_uid INTEGER,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','complete','failed')),
  scanned_count INTEGER NOT NULL DEFAULT 0,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  last_complete_at INTEGER,
  error_code TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,mailbox_id,folder)
);

CREATE TABLE brain_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  thread_key TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'todo' CHECK(state IN ('todo','decision','waiting','information','done')),
  owner_principal_id TEXT REFERENCES principals(id),
  category TEXT NOT NULL DEFAULT 'unclassified',
  next_action TEXT,
  reason TEXT,
  reason_message_id TEXT,
  reason_quote TEXT,
  decision_source TEXT NOT NULL DEFAULT 'ai' CHECK(decision_source IN ('company','user','learned','ai')),
  decision_rule_id TEXT,
  merged_into_case_id TEXT REFERENCES brain_cases(id) ON DELETE SET NULL,
  mutation_token TEXT,
  amount_minor INTEGER,
  currency TEXT,
  snoozed_until INTEGER,
  latest_at INTEGER NOT NULL,
  done_at INTEGER,
  analysis_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK(analysis_status IN ('unreviewed','evidence_backed','partial')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id,mailbox_id,thread_key)
);
CREATE INDEX brain_cases_attention ON brain_cases(tenant_id,mailbox_id,state,snoozed_until,latest_at);

CREATE TABLE brain_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  case_id TEXT NOT NULL REFERENCES brain_cases(id),
  message_key TEXT NOT NULL,
  reference_json TEXT NOT NULL,
  folder TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipients_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  authored_text TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  size_bytes INTEGER,
  content_hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  UNIQUE(tenant_id,mailbox_id,message_key)
);
CREATE INDEX brain_messages_case ON brain_messages(case_id,received_at,id);
CREATE INDEX brain_messages_mailbox ON brain_messages(tenant_id,mailbox_id,received_at);
CREATE VIRTUAL TABLE brain_message_fts USING fts5(subject,body_text,content='brain_messages',content_rowid='rowid');
CREATE TRIGGER brain_message_fts_insert AFTER INSERT ON brain_messages BEGIN
  INSERT INTO brain_message_fts(rowid,subject,body_text) VALUES (new.rowid,new.subject,new.authored_text);
END;
CREATE TRIGGER brain_message_fts_delete AFTER DELETE ON brain_messages BEGIN
  INSERT INTO brain_message_fts(brain_message_fts,rowid,subject,body_text)
  VALUES ('delete',old.rowid,old.subject,old.authored_text);
END;
CREATE TRIGGER brain_message_fts_update AFTER UPDATE OF subject,authored_text ON brain_messages BEGIN
  INSERT INTO brain_message_fts(brain_message_fts,rowid,subject,body_text)
  VALUES ('delete',old.rowid,old.subject,old.authored_text);
  INSERT INTO brain_message_fts(rowid,subject,body_text) VALUES (new.rowid,new.subject,new.authored_text);
END;

CREATE TABLE brain_commitments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id),
  message_id TEXT NOT NULL REFERENCES brain_messages(id),
  actor TEXT NOT NULL CHECK(actor IN ('us','them')),
  action_text TEXT NOT NULL,
  due_date TEXT,
  due_status TEXT NOT NULL CHECK(due_status IN ('resolved','ambiguous','unknown')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','fulfilled','cancelled')),
  evidence_quote TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(message_id,actor,action_text,evidence_quote)
);
CREATE INDEX brain_commitments_due ON brain_commitments(tenant_id,status,due_date);

CREATE TABLE brain_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES brain_messages(id),
  part_index INTEGER NOT NULL,
  filename TEXT NOT NULL,
  declared_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  verified_type TEXT,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','safe','blocked','unavailable')),
  extracted_json TEXT,
  evidence_json TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(message_id,part_index)
);

CREATE TABLE brain_case_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES brain_cases(id),
  actor_principal_id TEXT REFERENCES principals(id),
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX brain_case_events_case ON brain_case_events(case_id,created_at);

CREATE TABLE brain_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mailbox_id TEXT REFERENCES mailboxes(id),
  owner_principal_id TEXT REFERENCES principals(id),
  source TEXT NOT NULL CHECK(source IN ('company','user','learned')),
  category TEXT NOT NULL,
  sender_address TEXT,
  action TEXT NOT NULL CHECK(action IN ('prioritize','deprioritize','assign','forward')),
  destination TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  approved_by TEXT REFERENCES principals(id),
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX brain_rules_precedence ON brain_rules(tenant_id,mailbox_id,source,enabled);

CREATE TABLE brain_action_observations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  case_id TEXT NOT NULL REFERENCES brain_cases(id),
  category TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  action TEXT NOT NULL,
  destination TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('approved','corrected','rejected')),
  created_at INTEGER NOT NULL,
  UNIQUE(principal_id,case_id,action,destination)
);
CREATE INDEX brain_observations_pattern ON brain_action_observations(tenant_id,principal_id,mailbox_id,category,sender_address,action,destination,created_at);

CREATE TABLE brain_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  case_id TEXT NOT NULL REFERENCES brain_cases(id),
  case_revision INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_cipher TEXT NOT NULL,
  approval_proposal_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(principal_id,case_id,request_id)
);
CREATE INDEX brain_drafts_case ON brain_drafts(case_id,created_at);
