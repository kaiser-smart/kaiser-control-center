import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  beginCrossDatabaseWorkflow,
  recordWorkflowAttempt,
  updateCrossDatabaseWorkflow
} from "../functions/_lib/cross-database-workflows.js";

class Statement {
  constructor(sqlite, sql, values = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.sqlite, this.sql, values);
  }
  async run() {
    return { success: true, meta: this.sqlite.prepare(this.sql).run(...this.values) };
  }
  async first() {
    return this.sqlite.prepare(this.sql).get(...this.values) || null;
  }
}

class D1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }
  prepare(sql) {
    return new Statement(this.sqlite, sql);
  }
}

const core = new DatabaseSync(":memory:");
core.exec(readFileSync(new URL("../migrations/modular/core/0001_core_foundation.sql", import.meta.url), "utf8"));
const audit = new DatabaseSync(":memory:");
audit.exec(readFileSync(new URL("../migrations/modular/audit/0001_audit_foundation.sql", import.meta.url), "utf8"));
const env = { DB_CORE: new D1(core), DB_AUDIT: new D1(audit) };

const first = await beginCrossDatabaseWorkflow(env, {
  id: "workflow-1",
  workflowType: "message-and-audit",
  idempotencyKey: "message-1",
  payload: { messageId: "message-1" },
  compensation: { operation: "mark_message_failed" }
});
const repeated = await beginCrossDatabaseWorkflow(env, {
  id: "workflow-duplicate-id",
  workflowType: "message-and-audit",
  idempotencyKey: "message-1"
});
assert.equal(first.id, "workflow-1");
assert.equal(repeated.id, "workflow-1");
assert.equal(core.prepare("SELECT COUNT(*) AS count FROM cross_database_workflows").get().count, 1);

const failed = await updateCrossDatabaseWorkflow(env, first.id, {
  status: "failed",
  lastError: "audit unavailable",
  nextAttemptAt: "2026-07-25T13:00:00.000Z"
});
assert.equal(failed.status, "failed");
assert.equal(failed.attempt_count, 1);
assert.equal(failed.last_error, "audit unavailable");

await recordWorkflowAttempt(env, {
  id: "attempt-1",
  workflowId: first.id,
  databaseDomain: "audit",
  operationName: "insert_audit",
  status: "failed",
  errorMessage: "audit unavailable"
});
assert.equal(audit.prepare("SELECT COUNT(*) AS count FROM workflow_attempts").get().count, 1);

const completed = await updateCrossDatabaseWorkflow(env, first.id, { status: "completed" });
assert.equal(completed.status, "completed");
assert.equal(completed.attempt_count, 2);
assert.ok(completed.completed_at);

console.log("cross-database workflow tests: ok");
