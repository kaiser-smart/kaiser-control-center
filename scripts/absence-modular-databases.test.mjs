import assert from "node:assert/strict";
import {
  __test,
  absenceRequestApiStatus,
  retryFailedAbsenceHistoryWorkflows
} from "../functions/_lib/absence-requests-store.js";
import { absenceSettingsApiStatus } from "../functions/_lib/absence-settings-store.js";

class Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  run() {
    return this.database.run(this.sql, this.bindings);
  }

  first() {
    return this.database.first(this.sql, this.bindings);
  }

  all() {
    return this.database.all(this.sql, this.bindings);
  }
}

class CoreDatabase {
  constructor() {
    this.workflows = [];
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  run(sql, bindings) {
    if (sql.includes("INSERT INTO cross_database_workflows")) {
      const idempotencyKey = bindings[2];
      if (!this.workflows.some((item) => item.idempotency_key === idempotencyKey)) {
        this.workflows.push({
          id: bindings[0],
          workflow_type: bindings[1],
          idempotency_key: idempotencyKey,
          status: "pending",
          attempt_count: 0,
          last_error: null,
          next_attempt_at: null,
          payload_json: bindings[3],
          updated_at: "2026-07-25T12:00:00.000Z"
        });
      }
      return { success: true };
    }

    if (sql.includes("UPDATE cross_database_workflows")) {
      const workflow = this.workflows.find((item) => item.id === bindings[4]);
      workflow.status = bindings[0];
      workflow.attempt_count += 1;
      workflow.last_error = bindings[1];
      workflow.next_attempt_at = bindings[2];
      return { success: true };
    }

    return { success: true };
  }

  first(sql, bindings) {
    if (sql.includes("WHERE idempotency_key = ?")) {
      return this.workflows.find((item) => item.idempotency_key === bindings[0]) || null;
    }
    if (sql.includes("WHERE id = ?")) {
      return this.workflows.find((item) => item.id === bindings[0]) || null;
    }
    return null;
  }

  all(sql, bindings) {
    if (sql.includes("workflow_type = 'absence_history_append'")) {
      return {
        results: this.workflows
          .filter((item) => (
            item.status === "failed"
            && (!item.next_attempt_at || item.next_attempt_at <= bindings[0])
          ))
          .slice(0, bindings[1])
      };
    }
    return { results: [] };
  }
}

class AuditDatabase {
  constructor({ failHistory = false } = {}) {
    this.failHistory = failHistory;
    this.histories = [];
    this.attempts = [];
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  run(sql, bindings) {
    if (sql.includes("INSERT INTO absence_approval_history")) {
      if (this.failHistory) throw new Error("audit unavailable");
      const idempotencyKey = bindings[8];
      if (!this.histories.some((item) => item.idempotencyKey === idempotencyKey)) {
        this.histories.push({ id: bindings[0], idempotencyKey });
      }
      return { success: true };
    }

    if (sql.includes("INSERT INTO workflow_attempts")) {
      this.attempts.push({
        workflowId: bindings[1],
        status: bindings[4]
      });
      return { success: true };
    }

    return { success: true };
  }

  first() {
    return null;
  }

  all() {
    return { results: [] };
  }
}

const legacyOnly = { SMART_ODPADY_DB: { name: "legacy" } };
assert.equal(absenceRequestApiStatus(legacyOnly), "waiting");
assert.equal(absenceSettingsApiStatus(legacyOnly), "waiting");

const core = new CoreDatabase();
const audit = new AuditDatabase();
const env = { DB_CORE: core, DB_AUDIT: audit };
assert.equal(absenceRequestApiStatus(env), "ready");
assert.equal(absenceSettingsApiStatus(env), "ready");

const changedAt = "2026-07-25T12:00:00.000Z";
const first = await __test.appendHistorySafely(
  env,
  "absence-1",
  "draft",
  "pending_approval",
  { id: "user-1", name: "Test User" },
  "Test",
  changedAt
);
const repeated = await __test.appendHistorySafely(
  env,
  "absence-1",
  "draft",
  "pending_approval",
  { id: "user-1", name: "Test User" },
  "Test",
  changedAt
);

assert.equal(first.ok, true);
assert.equal(repeated.ok, true);
assert.equal(audit.histories.length, 1);
assert.equal(core.workflows.length, 1);
assert.equal(core.workflows[0].status, "completed");

const failedCore = new CoreDatabase();
const failedAudit = new AuditDatabase({ failHistory: true });
const failed = await __test.appendHistorySafely(
  { DB_CORE: failedCore, DB_AUDIT: failedAudit },
  "absence-2",
  "pending_approval",
  "approved",
  { id: "manager-1", name: "Manager" },
  "Schváleno",
  "2026-07-25T12:05:00.000Z"
);

assert.equal(failed.ok, false);
assert.equal(failedCore.workflows.length, 1);
assert.equal(failedCore.workflows[0].status, "failed");
assert.equal(failedCore.workflows[0].attempt_count, 1);
assert.match(failedCore.workflows[0].last_error, /audit unavailable/);
assert.ok(failedCore.workflows[0].next_attempt_at);

failedAudit.failHistory = false;
const retry = await retryFailedAbsenceHistoryWorkflows(
  { DB_CORE: failedCore, DB_AUDIT: failedAudit },
  { now: "2026-07-26T00:00:00.000Z" }
);
assert.equal(retry.status, "completed");
assert.equal(retry.selected, 1);
assert.equal(retry.completed, 1);
assert.equal(failedCore.workflows[0].status, "completed");
assert.equal(failedAudit.histories.length, 1);

console.log("absence modular databases tests: ok");
