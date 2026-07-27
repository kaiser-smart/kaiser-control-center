import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  __test as messagingTest,
  listRecentTwilioInboundMessages,
  processCustomerInboundMessage,
  processCustomerStatusCallback,
  sendCustomerMessage,
  sendReviewedCustomerMessage
} from "../functions/_lib/customer-messaging-service.js";
import {
  __test as twilioWebhookAuthTest,
  requireTwilioWebhookAuth
} from "../functions/_lib/twilio-webhook-auth.js";
import {
  CUSTOMER_MESSAGE_TEMPLATES,
  customerTemplateOptions,
  renderCustomerMessageTemplate,
  templateAlwaysIncludesStop
} from "../functions/_lib/customer-message-templates.js";
import { sendAbsenceApprovalRcsNotification } from "../functions/_lib/notification-service.js";

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
    this.notifications = [];
    this.optOuts = [];
    this.inbound = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  run(sql, bindings) {
    if (sql.includes("INSERT INTO notification_logs")) {
      this.notifications.push({
        id: bindings[0],
        type: bindings[1],
        channel: bindings[2],
        recipient: bindings[3],
        related_entity_type: bindings[4],
        related_entity_id: bindings[5],
        status: bindings[6],
        error_message: bindings[7]
      });
      return { success: true };
    }

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

    if (sql.includes("INSERT OR IGNORE INTO customer_message_inbound")) {
      if (this.inbound.some((item) => item.twilio_message_sid === bindings[3])) {
        return { success: true, meta: { changes: 0 } };
      }
      this.inbound.push({
        id: bindings[0],
        phone: bindings[1],
        body: bindings[2],
        twilio_message_sid: bindings[3],
        raw_payload: bindings[4],
        created_at: bindings[5]
      });
      return { success: true, meta: { changes: 1 } };
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
    DB_MESSAGES: new FakeD1(),
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
    replyText: "Požadavek jsme přijali.",
    url: "https://example.test/form",
    company: "Test 1 s.r.o.",
    station: "TEST 1 · stanoviště 1",
    waste: "SKO",
    container: "1×240l",
    type: "Dovolená",
    term: "03. 08. 2026 - 07. 08. 2026"
  });
  assert.equal(templateAlwaysIncludesStop(rendered.body), true, `${key} musí obsahovat STOP větu`);
}

{
  const testEnv = env();
  const result = await sendCustomerMessage(testEnv, validInput());
  assert.equal(result.status, "pending");
  assert.equal(result.testMode, true);
  assert.equal(testEnv.DB_MESSAGES.logs.length, 1);
  assert.equal(testEnv.DB_MESSAGES.logs[0].phone, "+420777123456");
  assert.match(testEnv.DB_MESSAGES.logs[0].message_body, /Pro odhlášení odpovězte STOP\./);
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "off" });
  const reviewInput = validInput({
    template: "autopilot_reply",
    variables: { replyText: "Přesný text po lidské kontrole." },
    relatedEntityType: "rcs_sms_conversation",
    relatedEntityId: "conversation-review-1",
    eventId: "review-send:rcs-sms-review-send-test-grant",
    userId: "user-review-1",
    reason: "provozní odpověď na příchozí RCS/SMS požadavek",
    legalBasis: "odpověď na příchozí provozní požadavek",
    consent: true
  });
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ sid: "SM-REVIEWED-ONE", status: "accepted" }), { status: 201 });
  };
  try {
    const generic = await sendCustomerMessage(testEnv, reviewInput);
    assert.equal(generic.sent, false);
    assert.match(generic.errorMessage, /odesílání je vypnuté/);
    assert.equal(providerCalls, 0);

    const reviewed = await sendReviewedCustomerMessage(testEnv, reviewInput);
    assert.equal(reviewed.sent, true);
    assert.equal(reviewed.twilioMessageSid, "SM-REVIEWED-ONE");
    assert.equal(providerCalls, 1);
    assert.match(reviewed.messageBody, /Pro odhlášení odpovězte STOP\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "off" });
  await assert.rejects(
    sendReviewedCustomerMessage(testEnv, validInput({
      template: "autopilot_reply",
      variables: { replyText: "Neplatný interní rozsah." },
      relatedEntityType: "rcs_sms_conversation",
      relatedEntityId: "conversation-review-invalid",
      eventId: "ordinary-send"
    })),
    /nemá platný interní rozsah/
  );
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ sid: "SM-MUST-NOT-SEND", status: "accepted" }), { status: 201 });
  };
  try {
    const result = await sendReviewedCustomerMessage(testEnv, validInput({
      template: "autopilot_reply",
      variables: { replyText: "Globální live se nesmí použít pro review grant." },
      relatedEntityType: "rcs_sms_conversation",
      relatedEntityId: "conversation-review-live",
      eventId: "review-send:rcs-sms-review-send-live-mode"
    }));
    assert.equal(result.sent, false);
    assert.match(result.errorMessage, /vyžaduje globální režim off/);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const testEnv = env();
  await processCustomerInboundMessage(testEnv, {
    From: "+420777123456",
    Body: "STOP SMS",
    MessageSid: "SMINBOUND"
  });
  assert.equal(testEnv.DB_MESSAGES.optOuts.length, 1);
  const result = await sendCustomerMessage(testEnv, validInput({ phone: "+420777123456" }));
  assert.equal(result.status, "opted_out");
  assert.equal(result.sent, false);
}

{
  const testEnv = env();
  const payload = {
    From: "+420777123456",
    Body: "NEPOSILAT",
    MessageSid: "SMINBOUND2"
  };
  const inbound = await processCustomerInboundMessage(testEnv, payload);
  assert.equal(inbound.stopped, true);
  assert.match(inbound.reply, /Odhlášení potvrzeno/);
  const duplicate = await processCustomerInboundMessage(testEnv, payload);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reply, "");
  assert.equal(testEnv.DB_MESSAGES.inbound.length, 1);
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
    assert.equal(testEnv.DB_MESSAGES.logs[0].status, "delivered");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ sid: "SM-ABSENCE-APPROVED", status: "accepted" }),
    { status: 201 }
  );
  try {
    const result = await sendAbsenceApprovalRcsNotification(testEnv, {
      id: "absence-approved-1",
      employeeId: "employee-1",
      employeeName: "Testovací zaměstnanec",
      employeePhone: "777 123 456",
      type: "vacation",
      dateFrom: "2026-08-03",
      dateTo: "2026-08-07"
    });
    assert.equal(result.sent, true);
    assert.equal(result.status, "sent");
    assert.equal(result.providerStatus, "accepted");
    assert.equal(result.channel, "rcs_sms_auto_fallback");
    assert.equal(testEnv.DB_MESSAGES.logs[0].template_key, "absence_approved");
    assert.equal(testEnv.DB_MESSAGES.logs[0].used_channel, "rcs_sms_auto_fallback");
    assert.match(testEnv.DB_MESSAGES.logs[0].message_body, /Pro odhlášení odpovězte STOP\./);
    assert.equal(testEnv.DB_MESSAGES.notifications[0].type, "absence_approved_rcs");
    assert.equal(testEnv.DB_MESSAGES.notifications[0].channel, "rcs_sms_auto_fallback");
    assert.equal(testEnv.DB_MESSAGES.notifications[0].status, "sent");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const oldAccountSid = "AC-OLD-TEST-ACCOUNT";
  const kaiserAccountSid = "AC-KAISER-TEST-ACCOUNT";
  const testEnv = env({
    KSO_CUSTOMER_MESSAGING_MODE: "live",
    TWILIO_ACCOUNT_SID: oldAccountSid,
    TWILIO_AUTH_TOKEN: "old-token",
    TWILIO_MESSAGING_SERVICE_SID: "MG-old",
    TWILIO_STATUS_CALLBACK_URL: "https://old.example.test/api/twilio/status",
    TWILIO_KAISER_ACCOUNT_SID: kaiserAccountSid,
    TWILIO_KAISER_API_KEY_SID: "SK-KAISER-TEST-KEY",
    TWILIO_KAISER_API_KEY_SECRET: "kaiser-key-secret-ě",
    TWILIO_KAISER_MESSAGING_SERVICE_SID: "MG3709ede950d2b5ebc7b23fe8d9d004ff",
    TWILIO_KAISER_STATUS_CALLBACK_URL: "https://smart-odpady.ai/api/twilio/status"
  });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let authorization = "";
  let body = "";
  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url);
    authorization = options.headers?.Authorization || "";
    body = String(options.body || "");
    return new Response(JSON.stringify({ sid: "SM-KAISER", status: "accepted" }), { status: 201 });
  };
  try {
    const result = await sendCustomerMessage(testEnv, validInput());
    assert.equal(result.sent, true);
    assert.equal(requestUrl.endsWith(`/Accounts/${kaiserAccountSid}/Messages.json`), true);
    assert.equal(Buffer.from(authorization.replace(/^Basic\s+/, ""), "base64").toString("utf8"), "SK-KAISER-TEST-KEY:kaiser-key-secret-ě");
    assert.match(body, /MessagingServiceSid=MG3709ede950d2b5ebc7b23fe8d9d004ff/);
    assert.match(body, /StatusCallback=https%3A%2F%2Fsmart-odpady.ai%2Fapi%2Ftwilio%2Fstatus/);
    assert.doesNotMatch(body, /old\.example\.test/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const payload = { MessageSid: "SM-KAISER", MessageStatus: "read" };
  const url = "https://smart-odpady.ai/api/twilio/status";
  const signatureBase = `${url}MessageSid${payload.MessageSid}MessageStatus${payload.MessageStatus}`;
  const signature = createHmac("sha1", "kaiser-token").update(signatureBase).digest("base64");
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature
    },
    body: new URLSearchParams(payload)
  });
  const auth = await requireTwilioWebhookAuth({
    TWILIO_AUTH_TOKEN: "old-token",
    TWILIO_KAISER_AUTH_TOKEN: "kaiser-token"
  }, request, payload, new URLSearchParams(payload).toString());
  assert.equal(auth.ok, true);
  assert.equal(auth.method, "twilio_signature");
}

{
  const url = "https://smart-odpady.ai/api/twilio/inbound";
  const signedUrl = "https://smart-odpady.ai:443/api/twilio/inbound";
  const form = new URLSearchParams();
  form.append("MessageSid", "SM-RCS-UNICODE");
  form.append("MessagingServiceSid", "MG-RCS-TEST");
  form.append("From", "rcs:+420604542004");
  form.append("To", "rcs:kaiser_servis_test_agent");
  form.append("Body", " Čekám na odpoved ");
  form.append("ChannelMetadata", JSON.stringify({ type: "rcs", provider: "google" }));
  form.append("RepeatedValue", "zeta");
  form.append("RepeatedValue", "alpha");
  form.append("RepeatedValue", "alpha");
  const rawBody = form.toString();
  const { payload, signatureParams } = twilioWebhookAuthTest.parseTwilioFormBody(rawBody);
  const signatureBase = Object.keys(signatureParams)
    .sort()
    .reduce((base, key) => {
      const values = Array.isArray(signatureParams[key])
        ? Array.from(new Set(signatureParams[key])).sort()
        : [signatureParams[key]];
      return values.reduce((value, item) => `${value}${key}${item}`, base);
    }, signedUrl);
  const signature = createHmac("sha1", "kaiser-token").update(signatureBase).digest("base64");
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-twilio-signature": signature
    },
    body: rawBody
  });
  const auth = await requireTwilioWebhookAuth(
    { TWILIO_KAISER_AUTH_TOKEN: "kaiser-token" },
    request,
    payload,
    rawBody,
    signatureParams
  );
  assert.equal(payload.Body, " Čekám na odpoved ");
  assert.deepEqual(signatureParams.RepeatedValue, ["zeta", "alpha", "alpha"]);
  assert.equal(auth.ok, true);
  assert.equal(auth.method, "twilio_signature");
}

{
  const url = "https://smart-odpady.ai/api/twilio/inbound";
  const payload = { From: "+420700000000", Body: "Test", MessageSid: "SM-SECONDARY-TOKEN" };
  const signatureBase = Object.keys(payload)
    .sort()
    .reduce((base, key) => `${base}${key}${payload[key]}`, url);
  const signature = createHmac("sha1", "account-token")
    .update(signatureBase)
    .digest("base64");
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature
    }
  });
  const auth = await requireTwilioWebhookAuth(
    {
      TWILIO_KAISER_AUTH_TOKEN: "different-token",
      TWILIO_AUTH_TOKEN: "account-token"
    },
    request,
    payload,
    new URLSearchParams(payload).toString(),
    payload
  );
  assert.equal(auth.ok, true);
  assert.equal(auth.method, "twilio_signature");
}

{
  const rawBody = JSON.stringify({ MessageSid: "SM-JSON", MessageStatus: "delivered" });
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const url = `https://smart-odpady.ai/api/twilio/status?bodySHA256=${bodyHash}`;
  const signature = createHmac("sha1", "kaiser-token").update(url).digest("base64");
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-twilio-signature": signature
    },
    body: rawBody
  });
  const payload = JSON.parse(rawBody);
  const auth = await requireTwilioWebhookAuth(
    { TWILIO_KAISER_AUTH_TOKEN: "kaiser-token" },
    request,
    payload,
    rawBody,
    payload
  );
  assert.equal(auth.ok, true);
  assert.equal(auth.method, "twilio_signature");
}

{
  const payload = { MessageSid: "SM-RCS-INVALID", Body: "Čekám na odpoved" };
  const rawBody = new URLSearchParams(payload).toString();
  const request = new Request("https://smart-odpady.ai/api/twilio/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "invalid-signature"
    },
    body: rawBody
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const auth = await requireTwilioWebhookAuth(
      { TWILIO_KAISER_AUTH_TOKEN: "kaiser-token" },
      request,
      payload,
      rawBody
    );
    assert.equal(auth.ok, false);
    assert.equal(auth.responseStatus, 401);
  } finally {
    console.warn = originalWarn;
  }
}

{
  const payload = { MessageSid: "SM-KAISER", MessageStatus: "read" };
  const url = "https://smart-odpady.ai/api/twilio/status?secret=shared-status-secret";
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "invalid-signature"
    },
    body: new URLSearchParams(payload)
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const auth = await requireTwilioWebhookAuth({
      TWILIO_AUTH_TOKEN: "old-token",
      TWILIO_KAISER_STATUS_WEBHOOK_TOKEN: "shared-status-secret"
    }, request, payload, new URLSearchParams(payload).toString());
    assert.equal(auth.ok, true);
    assert.equal(auth.method, "shared_secret");
  } finally {
    console.warn = originalWarn;
  }
}

{
  const testEnv = env({ KSO_CUSTOMER_MESSAGING_MODE: "live" });
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const database = testEnv.DB_MESSAGES;
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

{
  let capturedUrl = "";
  let capturedAuthorization = "";
  const recent = new Date(Date.now() - 60_000).toISOString();
  const stale = new Date(Date.now() - (96 * 60 * 60 * 1000)).toISOString();
  const result = await listRecentTwilioInboundMessages({
    TWILIO_KAISER_ACCOUNT_SID: "AC_KAISER",
    TWILIO_KAISER_API_KEY_SID: "SK_KAISER",
    TWILIO_KAISER_API_KEY_SECRET: "secret-test-only",
    TWILIO_KAISER_MESSAGING_SERVICE_SID: "MG_KAISER",
    TWILIO_RCS_SENDER_ID: "rcs:kaiser-agent"
  }, {
    lookbackHours: 72,
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedAuthorization = init.headers.Authorization;
      return new Response(JSON.stringify({
        messages: [
          {
            sid: "SM_RCS_RECENT",
            direction: "inbound",
            from: "rcs:+420700000001",
            to: "rcs:kaiser-agent",
            body: "RCS odpověď",
            status: "received",
            messaging_service_sid: null,
            date_sent: recent,
            num_media: "0"
          },
          {
            sid: "SM_SMS_RECENT",
            direction: "inbound",
            from: "+420700000002",
            to: "+420800000000",
            body: "SMS odpověď",
            status: "received",
            messaging_service_sid: "MG_KAISER",
            date_sent: recent,
            num_media: "1"
          },
          {
            sid: "SM_OTHER_SERVICE",
            direction: "inbound",
            from: "+420700000003",
            to: "+420800000001",
            body: "Cizí služba",
            messaging_service_sid: "MG_OTHER",
            date_sent: recent
          },
          {
            sid: "SM_OUTBOUND",
            direction: "outbound-api",
            from: "+420800000000",
            to: "+420700000004",
            body: "Odchozí",
            messaging_service_sid: "MG_KAISER",
            date_sent: recent
          },
          {
            sid: "SM_STALE",
            direction: "inbound",
            from: "+420700000005",
            to: "+420800000000",
            body: "Stará",
            messaging_service_sid: "MG_KAISER",
            date_sent: stale
          }
        ]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.match(capturedUrl, /Accounts\/AC_KAISER\/Messages\.json/);
  assert.match(capturedUrl, /PageSize=100/);
  assert.match(capturedAuthorization, /^Basic /);
  assert.doesNotMatch(capturedAuthorization, /secret-test-only/);
  assert.deepEqual(result.map((message) => message.MessageSid), [
    "SM_RCS_RECENT",
    "SM_SMS_RECENT"
  ]);
  assert.equal(result[0].ChannelPrefix, "rcs");
  assert.equal(result[1].ChannelPrefix, "sms");
  assert.equal(result[1].NumMedia, 1);
}

await assert.rejects(
  listRecentTwilioInboundMessages({
    TWILIO_KAISER_ACCOUNT_SID: "AC_KAISER",
    TWILIO_KAISER_AUTH_TOKEN: "token-test-only",
    TWILIO_KAISER_MESSAGING_SERVICE_SID: "MG_KAISER"
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      message: "Provider authorization failed"
    }), { status: 401, headers: { "Content-Type": "application/json" } })
  }),
  /Provider authorization failed/
);

console.log("customer-messaging.test.mjs: OK");
