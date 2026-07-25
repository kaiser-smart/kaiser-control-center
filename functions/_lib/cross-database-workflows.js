import { getAuditDatabase, getCoreDatabase } from "./databases.js";

const VALID_STATUS = new Set(["pending", "completed", "failed", "compensating", "compensated"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function randomUuid() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function beginCrossDatabaseWorkflow(env, input = {}) {
  const db = getCoreDatabase(env);
  const id = cleanString(input.id) || randomUuid();
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) throw new TypeError("Cross-database workflow vyžaduje idempotency_key.");

  await db.prepare(`
    INSERT INTO cross_database_workflows (
      id, workflow_type, idempotency_key, status, attempt_count,
      payload_json, compensation_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    id,
    cleanString(input.workflowType) || "unspecified",
    idempotencyKey,
    JSON.stringify(input.payload || {}),
    JSON.stringify(input.compensation || {})
  ).run();

  return db.prepare(`
    SELECT * FROM cross_database_workflows WHERE idempotency_key = ? LIMIT 1
  `).bind(idempotencyKey).first();
}

export async function updateCrossDatabaseWorkflow(env, id, update = {}) {
  const status = cleanString(update.status);
  if (!VALID_STATUS.has(status)) throw new TypeError(`Neplatný stav workflow: ${status}`);
  const db = getCoreDatabase(env);
  await db.prepare(`
    UPDATE cross_database_workflows
    SET status = ?,
        attempt_count = attempt_count + 1,
        last_error = ?,
        next_attempt_at = ?,
        completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    status,
    cleanString(update.lastError) || null,
    cleanString(update.nextAttemptAt) || null,
    status,
    cleanString(id)
  ).run();
  return db.prepare("SELECT * FROM cross_database_workflows WHERE id = ? LIMIT 1").bind(cleanString(id)).first();
}

export async function recordWorkflowAttempt(env, input = {}) {
  const db = getAuditDatabase(env);
  await db.prepare(`
    INSERT INTO workflow_attempts (
      id, workflow_id, database_domain, operation_name, status,
      error_message, started_at, finished_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanString(input.id) || randomUuid(),
    cleanString(input.workflowId),
    cleanString(input.databaseDomain),
    cleanString(input.operationName),
    cleanString(input.status) || "pending",
    cleanString(input.errorMessage) || null,
    cleanString(input.startedAt) || new Date().toISOString(),
    cleanString(input.finishedAt) || null,
    JSON.stringify(input.metadata || {})
  ).run();
}
