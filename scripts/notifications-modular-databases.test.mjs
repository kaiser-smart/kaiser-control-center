import assert from "node:assert/strict";
import { listNotifications } from "../functions/_lib/notifications-store.js";

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

  first() {
    return this.database.first(this.sql, this.bindings);
  }

  all() {
    return this.database.all(this.sql, this.bindings);
  }
}

class MessagesDatabase {
  constructor() {
    this.sql = [];
  }

  prepare(sql) {
    this.sql.push(sql);
    return new Statement(this, sql);
  }

  first(sql) {
    if (sql.includes("COUNT(*) AS total")) return { total: 1 };
    return null;
  }

  all(sql) {
    if (sql.includes("PRAGMA table_info(notification_logs)")) {
      return {
        results: [
          "module_id",
          "subject",
          "message_preview",
          "provider",
          "provider_message_id",
          "provider_status",
          "message_id",
          "thread_id",
          "audit_id",
          "from_name",
          "from_address",
          "reply_to",
          "subject_token",
          "attempts",
          "updated_at"
        ].map((name) => ({ name }))
      };
    }
    return {
      results: [{
        id: "notification-1",
        type: "absence_approval_request",
        channel: "email",
        recipient: "manager@example.test",
        related_entity_type: "absence_request",
        related_entity_id: "absence-1",
        status: "sent",
        error_message: null,
        module_id: "dovolena-nemoc",
        subject: "Žádost",
        message_preview: "Čeká na schválení",
        provider: "SendGrid",
        provider_message_id: "provider-1",
        attempts: 1,
        sent_at: "2026-07-25T10:00:00.000Z",
        created_at: "2026-07-25T10:00:00.000Z",
        updated_at: "2026-07-25T10:00:00.000Z"
      }]
    };
  }
}

class CoreDatabase {
  constructor() {
    this.sql = [];
  }

  prepare(sql) {
    this.sql.push(sql);
    return new Statement(this, sql);
  }

  first() {
    return null;
  }

  all() {
    return {
      results: [{
        id: "absence-1",
        employee_id: "employee-1",
        employee_name: "Test Employee",
        manager_id: "manager-1",
        manager_name: "Test Manager",
        note: "Test note"
      }]
    };
  }
}

const messages = new MessagesDatabase();
const core = new CoreDatabase();
let legacyCalls = 0;
const params = new URLSearchParams({
  dateFrom: "2026-07-25",
  dateTo: "2026-07-25",
  employeeId: "employee-1"
});
const result = await listNotifications({
  DB_MESSAGES: messages,
  DB_CORE: core,
  SMART_ODPADY_DB: {
    prepare() {
      legacyCalls += 1;
      throw new Error("legacy must not be used");
    }
  }
}, params);

assert.equal(result.total, 1);
assert.equal(result.items.length, 1);
assert.equal(result.items[0].employeeId, "employee-1");
assert.equal(result.items[0].employeeName, "Test Employee");
assert.equal(result.items[0].managerId, "manager-1");
assert.equal(legacyCalls, 0);
assert.equal(messages.sql.some((sql) => /JOIN\s+absence_requests/i.test(sql)), false);
assert.equal(core.sql.every((sql) => /absence_requests/i.test(sql)), true);

const degradedMessages = new MessagesDatabase();
const degraded = await listNotifications(
  { DB_MESSAGES: degradedMessages },
  new URLSearchParams({ dateFrom: "2026-07-25", dateTo: "2026-07-25" })
);
assert.equal(degraded.items.length, 1);
assert.equal(degraded.items[0].employeeId, "");
assert.equal(degraded.items[0].recipientName, "manager@example.test");

console.log("notifications modular databases tests: ok");
