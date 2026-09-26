-- Connector-owned, personal workflow state. No native Forpsi message is changed.
CREATE TABLE workflow_lists (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  folder TEXT NOT NULL,
  view TEXT NOT NULL DEFAULT 'recent' CHECK(view IN ('recent','priority')),
  known_remaining_priority INTEGER NOT NULL DEFAULT 0,
  older_unscanned INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX workflow_lists_owner ON workflow_lists(tenant_id,principal_id,active,created_at DESC);
CREATE TABLE workflow_list_items (
  list_id TEXT NOT NULL REFERENCES workflow_lists(id),
  number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 50),
  reference_json TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  message_key TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at TEXT,
  priority TEXT NOT NULL DEFAULT 'review' CHECK(priority IN ('high','review')),
  priority_reason TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'unclassified' CHECK(content_type IN ('unclassified','newsletter')),
  PRIMARY KEY(list_id,number)
);
CREATE TABLE workflow_states (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  thread_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('todo','waiting','snoozed','done')),
  due_date TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Prague',
  note TEXT NOT NULL DEFAULT '',
  last_processed_key TEXT,
  last_processed_at TEXT,
  latest_inbound_key TEXT,
  latest_inbound_at TEXT,
  latest_inbound_reference_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(tenant_id,principal_id,mailbox_id,thread_key)
);
CREATE INDEX workflow_states_due ON workflow_states(tenant_id,principal_id,mailbox_id,state,due_date);
CREATE TABLE workflow_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  list_id TEXT NOT NULL REFERENCES workflow_lists(id),
  item_number INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('reply','forward')),
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX workflow_drafts_owner ON workflow_drafts(tenant_id,principal_id,mailbox_id,list_id);
CREATE TABLE workflow_shortcuts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  name TEXT NOT NULL,
  phrases_json TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id,principal_id,mailbox_id,name)
);
