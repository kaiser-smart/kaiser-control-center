ALTER TABLE data_box_plus_send_jobs
  ADD COLUMN phase TEXT NOT NULL DEFAULT 'prepared';

ALTER TABLE data_box_plus_send_jobs
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE data_box_plus_send_jobs
  ADD COLUMN last_event_at TEXT;

UPDATE data_box_plus_send_jobs
SET
  phase = CASE status
    WHEN 'sent' THEN 'completed'
    WHEN 'unknown' THEN 'unknown'
    WHEN 'failed' THEN 'failed'
    WHEN 'sending' THEN 'calling_isds'
    ELSE 'prepared'
  END,
  last_event_at = COALESCE(finished_at, started_at, created_at),
  attempt_count = CASE WHEN started_at IS NOT NULL AND started_at <> '' THEN 1 ELSE 0 END;
