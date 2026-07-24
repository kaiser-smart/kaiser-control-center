ALTER TABLE self_repair_cases ADD COLUMN case_number TEXT;
ALTER TABLE self_repair_cases ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE self_repair_cases ADD COLUMN assignee_user_id TEXT;
ALTER TABLE self_repair_cases ADD COLUMN assignee_user_name TEXT;
ALTER TABLE self_repair_cases ADD COLUMN public_message TEXT;
ALTER TABLE self_repair_cases ADD COLUMN details_question TEXT;
ALTER TABLE self_repair_cases ADD COLUMN resume_workflow_status TEXT NOT NULL DEFAULT 'accepted';
ALTER TABLE self_repair_cases ADD COLUMN automation_status TEXT NOT NULL DEFAULT 'not_evaluated';
ALTER TABLE self_repair_cases ADD COLUMN screen_info TEXT;
ALTER TABLE self_repair_cases ADD COLUMN technical_context_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE self_repair_cases ADD COLUMN last_public_update_at TEXT;
ALTER TABLE self_repair_cases ADD COLUMN ready_for_verification_at TEXT;
ALTER TABLE self_repair_cases ADD COLUMN verified_at TEXT;
ALTER TABLE self_repair_cases ADD COLUMN client_request_id TEXT;

UPDATE self_repair_cases
SET case_number = 'KSO-' || upper(substr(replace(id, 'self-repair-case-', ''), 1, 8))
WHERE case_number IS NULL OR trim(case_number) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_case_number
  ON self_repair_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_workflow
  ON self_repair_cases(workflow_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_self_repair_cases_assignee
  ON self_repair_cases(assignee_user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_repair_cases_client_request
  ON self_repair_cases(client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE self_repair_case_attachments ADD COLUMN message_id TEXT;
ALTER TABLE self_repair_case_attachments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

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

CREATE INDEX IF NOT EXISTS idx_self_repair_case_messages_case
  ON self_repair_case_messages(case_id, created_at);

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

CREATE INDEX IF NOT EXISTS idx_feedback_case_notifications_user
  ON feedback_case_notifications(user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS self_repair_codex_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_by_user_name TEXT NOT NULL,
  runner_name TEXT,
  external_task_id TEXT,
  external_task_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_self_repair_codex_jobs_case
  ON self_repair_codex_jobs(case_id, created_at);
