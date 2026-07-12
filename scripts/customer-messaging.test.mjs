import assert from "node:assert/strict";
import {
  __test as messagingTest,
  processCustomerInboundMessage,
  processCustomerStatusCallback,
  sendCustomerMessage
} from "../functions/_lib/customer-messaging-service.js";
import {
  CUSTOMER_MESSAGE_TEMPLATES,
  customerTemplateOptions,
  renderCustomerMessageTemplate,
  templateAlwaysIncludesStop
} from "../functions/_lib/customer-message-templates.js";

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  run() {
    return this.db.run(this.sql, this.bindings);
  }

  first() {
    return this.db.first(this.sql, this.bindings);
  }

  all() {
    return this.db.all(this.sql, this.bindings);
  }
}

class FakeD1 {
  constructor() {
    this.logs = [];
    this.optOuts = [];
    this.inbound = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  run(sql, bindings) {
    if (sql.includes("INSERT INTO customer_message_log")) {
      this.logs.push({
        id: bindings[0],
        customer_id: bindings[1],
        phone: bindings[2],
        requested_channel: bindings[3],
        used_channel: bindings[4],
        template_key: bindings[5],
        message_body: bindings[6],
        twilio_message_sid: bindings[7],
        status: bindings[8],
        error_message: bindings[9],
        related_entity_type: bindings[10],
        related_entity_id: bindings[11],
        reason: bindings[12],
        metadata_json: bindings[13],
        created_at: bindings[14],
        updated_at: bindings[15]
      });
      return { success: true };
    }

    if (
      sql.includes("UPDATE customer_message_log") &&
      sql.includes("used_channel = COALESCE(?, used_channel)") &&
      sql.includes("twilio_message_sid = COALESCE(?, twilio_message_sid)")
    ) {
      const id = bindings.at(-1);
      const log = this.logs.find((item) => item.id === id);
      if (log) {
        if (bindings[0]) log.used_channel = bindings[0];
        if (bindings[1]) log.twilio_message_sid = bindings[1];
        if (bindings[2]) log.status = bindings[2];
        if (bindings[3]) log.error_message = bindings[3];
        if (bindings[4]) log.metadata_json = bindings[5];
        log.updated_at = bindings[6];
      }
      return { success: true };
    }

    if (sql.includes("UPDATE customer_message_log") && sql.includes("status = ?") && sql.includes("metadata_json = ?")) {
      const id = bindings.at(-1);
      const log = this.logs.find((item) => item.id === id);
      if (log) {
        log.status = bindings[0] || log.status;
        if (bindings[1]) log.used_channel = bindings[1];
        if (bindings[2]) log.error_message = bindings[2];
        if (bindings[3]) log.metadata_json = bindings[3];
        log.updated_at = bindings[4];
      }
      return { success: true };
    }

    if (sql.includes("INSERT INTO customer_message_opt_out")) {
      const existing = this.optOuts.find((item) => item.phone === bindings[1]);
      if (existing) {
        existing.source = bindings[2];
        existing.reason = bindings[3];
      } else {
        this.optOuts.push({
          id: bindings[0],
          phone: bindings[1],
          source: bindings[2],
          reason: bindings[3],
          created_at: bindings[4]
        });
      }
      return { success: true };
    }

    if (sql.includes("DELETE FROM customer_message_opt_out")) {
      this.optOuts = this.optOuts.filter((item) => item.phone !== bindings[0]);
      return { success: true };
    }

    if (sql.includes("INSERT INTO customer_message_inbound")) {
      this.inbound.push({
        id: bindings[0],
        phone: bindings[1],
        body: bindings[2],
        twilio_message_sid: bindings[3],
        raw_payload: bindings[4],
        created_at: bindings[5]
      });
      return { success: true };
    }

    return { success: true };
  }

  first(sql, bindings) {
    if (sql.includes("FROM customer_message_opt_out")) {
      return this.optOuts.find((item) => item.phone === bindings[0]) || null;
    }

    if (sql.includes("FROM customer_message_log") && sql.includes("message_body")) {
      return this.logs.find((item) => (
        item.phone === bindings[0] &&
        item.message_body === bindings[1] &&
        ["pending", "sent", "delivered", "fallback"].includes(item.status)
      )) || null;
    }

    if (sql.includes("FROM customer_message_log") && sql.includes("twilio_message_sid")) {
      return this.logs.find((item) => item.twilio_message_sid === bindings[0]) || null;
    }

    if (sql.includes("COUNT(*) AS total")) {
      return { total: this.logs.length };
    }

    return null;
  }

  all(sql) {
    if (sql.includes("FROM customer_message_log")) {
      return { results: this.logs };
    }
    if (sql.includes("FROM customer_message_opt_out")) {
      return { results: this.optOuts };
    }
    return { results: [] };
  }
}

function env(overrides = {}) {
  return {
    SMART_ODPADY_DB: new FakeD1(),
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_MESSAGING_SERVICE_SID: "MG00000000000000000000000000000000",
    TWILIO_RCS_SENDER_ID: "rcs_sender",
    TWILIO_STATUS_CALLBACK_URL: "https://example.test/api/twilio/status",
    KSO_CUSTOMER_MESSAGING_MODE: "test",
    ...overrides
  };
}

function validInput(overrides = {}) {
  return {
    phone: "777 123 456",
    template: "request_received",
    variables: {},
    channelPreference: "rcs",
    customerId: "customer-1",
    jobId: "job-1",
    reason: "provozní požadavek zákazníka",
    legalBasis: "oprávněný zájem",
    ...overrides
  };
}

assert.equal(messagingTest.normalizeCustomerPhone("777 123 456"), "+420777123456");
assert.equal(messagingTest.normalizeCustomerPhone("+420777123456"), "+420777123456");
assert.equal(messagingTest.normalizeCustomerPhone("abc"), "");
assert.equal(customerTemplateOptions().some((template) => template.key === "data_box_forward"), false);
assert.match(
  renderCustomerMessageTemplate("data_box_forward", { message: "Prosím o kontrolu datové zprávy." }).body,
  /Prosím o kontrolu datové zprávy\./
);

for (const key of Object.keys(CUSTOMER_MESSAGE_TEMPLATES)) {
  const rendered = renderCustomerMessageTemplate(key, {
    date: "10. 7. 2026",
    time: "09:00",
    address: "Praha 1",
    message: "Posádka dorazí později.",
    url: "https://example.test/form",
    company: "Test 1 s.r.o.",
    station: "TEST 1 · stanoviště 1",
    waste: "SKO",
    container: "1×240l"
  });
  assert.equal(templateAlwaysIncludesStop(rendered.body), true, `${key} musí obsahovat STOP větu`);
}

{
  const testEnv = env();
  const result = await sendCustomerMessage(testEnv, validInput());
  assert.equal(result.status, "pending");
  assert.equal(result.testMode, true);
  assert.equal(testEnv.SMART_ODPADY_DB.logs.length, 1);
  assert.equal(testEnv.SMART_ODPADY_DB.logs[0].phone, "+420777123456");
  assert.match(testEnv.SMART_ODPADY_DB.logs[0].message_body, /Pro odhlášení odpovězte STOP\./);
}

{
  const testEnv = env();
  await processCustomerInboundMessage(testEnv, {
    From: "+420777123456",
    Body: "STOP SMS",
    MessageSid: "SMINBOUND"
  });
  assert.equal(testEnv.SMART_ODPADY_DB.optOuts.length, 1);
  const result = await sendCustomerMessage(testEnv, validInput({ phone: "+420777123456" }));
  assert.equal(result.status, "opted_out");
  assert.equal(result.sent, false);
}

{
  const testEnv = env();
  const inbound = await processCustomerInboundMessage(testEnv, {
    From: "+420777123456",
    Body: "NEPOSILAT",
    MessageSid: "SMINBOUND2"
  });
  assert.equal(inbound.stopped, true);
  assert.match(inbound.reply, /Odhlášení potvrzeno/);
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ sid: "SM123", status: "accepted" }), { status: 201 });
  try {
    const result = await sendCustomerMessage(testEnv, validInput());
    assert.equal(result.sent, true);
    assert.equal(result.twilioMessageSid, "SM123");
    const callback = await processCustomerStatusCallback(testEnv, {
      MessageSid: "SM123",
      MessageStatus: "delivered",
      ChannelPrefix: "rcs"
    });
    assert.equal(callback.matched, true);
    assert.equal(testEnv.SMART_ODPADY_DB.logs[0].status, "delivered");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const database = testEnv.SMART_ODPADY_DB;
  const originalRun = database.run.bind(database);
  database.run = (sql, bindings) => {
    if (sql.includes("UPDATE customer_message_log")) throw new Error("audit unavailable");
    return originalRun(sql, bindings);
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ sid: "SM-AUDIT-WARNING", status: "accepted" }), { status: 201 });
  console.error = () => {};
  try {
    const result = await sendCustomerMessage(testEnv, validInput());
    assert.equal(result.sent, true);
    assert.equal(result.twilioMessageSid, "SM-AUDIT-WARNING");
    assert.match(result.auditWarning, /přijatá poskytovatelem/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

{
  const testEnv = env({ TWILIO_ACCOUNT_SID: "", KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const result = await sendCustomerMessage(testEnv, validInput());
  assert.equal(result.status, "blocked");
  assert.match(result.errorMessage, /TWILIO_ACCOUNT_SID/);
}

{
  const testEnv = env();
  const result = await sendCustomerMessage(testEnv, validInput({ phone: "neni telefon" }));
  assert.equal(result.status, "blocked");
  assert.match(result.errorMessage, /telefon/);
}

{
  const testEnv = env();
  const result = await sendCustomerMessage(testEnv, validInput({ reason: "marketingová nabídka", legalBasis: "souhlas" }));
  assert.equal(result.status, "blocked");
  assert.match(result.errorMessage, /provozní nebo transakční/);
}

console.log("customer-messaging.test.mjs: OK");
