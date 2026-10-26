-- Additive only. Apply to DB_CORE after backup and local schema tests.
CREATE TABLE IF NOT EXISTS repair_queue (
  case_id TEXT PRIMARY KEY NOT NULL REFERENCES self_repair_cases(id),
  reporter_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','validated','deploying','deployed','rolled_back','failed','needs_decision')),
  run_id TEXT,
  lease_hash TEXT,
  lease_until TEXT,
  base_sha TEXT,
  patch_sha TEXT,
  result_sha TEXT,
  deployment_id TEXT,
  rollback_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS repair_queue_run ON repair_queue(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS repair_queue_pending ON repair_queue(state, created_at);
CREATE TABLE IF NOT EXISTS repair_queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  state TEXT NOT NULL,
  run_id TEXT,
  detail TEXT NOT NULL,
  result_sha TEXT,
  deployment_id TEXT,
  rollback_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS repair_queue_created AFTER INSERT ON repair_queue BEGIN
  INSERT INTO repair_queue_events(case_id,state,run_id,detail,created_at)
  VALUES(new.case_id,new.state,new.run_id,new.detail,new.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS repair_queue_changed AFTER UPDATE ON repair_queue BEGIN
  INSERT INTO repair_queue_events(case_id,state,run_id,detail,result_sha,deployment_id,rollback_id,created_at)
  VALUES(new.case_id,new.state,new.run_id,new.detail,new.result_sha,new.deployment_id,new.rollback_id,new.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS repair_queue_daily_limit BEFORE INSERT ON repair_queue
WHEN (SELECT count(*) FROM repair_queue WHERE reporter_id=new.reporter_id AND created_at > datetime('now','-1 day')) >= 20
BEGIN SELECT RAISE(ABORT, 'repair_daily_limit'); END;
