import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  notifyNewDataBoxMessage,
  processDataBoxRcsStatusCallback
} from "../functions/_lib/data-box-rcs-notifications.js";
import { createSessionCookie } from "../functions/_lib/auth.js";
import { onRequestGet as getDataBoxMessageEndpoint } from "../functions/api/data-box-plus/messages/[id].js";

class D1Statement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.owner, this.sql, values);
  }

  async all() {
    return { results: this.owner.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.owner.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.owner.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }
}

function openDatabase({ trneckovaPhone = "+420777222333" } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0001_create_users.sql",
    "../migrations/0002_add_user_manager.sql",
    "../migrations/0029_create_data_box_plus_tables.sql",
    "../migrations/0032_create_customer_messaging.sql",
    "../migrations/0045_create_data_box_rcs_notifications.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  const now = "2026-07-24T08:00:00.000Z";
  const insertUser = sqlite.prepare(`
    INSERT INTO users (
      id, name, email, phone, role, status, active, permissions_json,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, 'admin', 'active', 1, '[]', ?, ?, ?)
  `);
  insertUser.run("radim-oplustil", "Radim Opluštil", "radim@example.test", "+420777111222", now, now, now);
  insertUser.run("alena-trneckova", "Ing. Alena Trnečková", "alena@example.test", trneckovaPhone || null, now, now, now);
  sqlite.prepare(`
    INSERT INTO users (
      id, name, email, phone, role, status, active, permissions_json,
      created_at, updated_at, last_login_at
    ) VALUES ('readonly-no-access', 'Uživatel bez přístupu', 'readonly@example.test', '+420777333444',
      'readonly', 'active', 1, '[]', ?, ?, ?)
  `).run(now, now, now);
  sqlite.prepare(`
    INSERT INTO data_box_plus_mailboxes (id, name, company, isds_id, slot)
    VALUES ('mailbox-1', 'Kaiser servis', 'Kaiser servis', 'abc1234', 1)
  `).run();
  sqlite.prepare(`
    INSERT INTO data_box_plus_messages (
      id, mailbox_id, isds_message_id, direction, sender_name, subject, delivered_at
    ) VALUES ('message-1', 'mailbox-1', 'isds-1001', 'received', 'Česká správa', 'Nové rozhodnutí', '2026-07-24T08:15:00.000Z')
  `).run();
  return { sqlite, d1: new D1Database(sqlite) };
}

function environment(d1) {
  return {
    SMART_ODPADY_DB: d1,
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_MESSAGING_SERVICE_SID: "MG00000000000000000000000000000000",
    TWILIO_RCS_SENDER_ID: "rcs:kaiser_test",
    TWILIO_DATA_BOX_RCS_CONTENT_SID: "HX00000000000000000000000000000000",
    TWILIO_STATUS_CALLBACK_URL: "https://smart-odpady.ai/api/twilio/status",
    KSO_CUSTOMER_MESSAGING_MODE: "live",
    PUBLIC_APP_URL: "https://smart-odpady.ai"
  };
}

function messageInput() {
  return {
    messageId: "message-1",
    direction: "received",
    mailboxName: "Kaiser servis",
    senderName: "Česká správa",
    subject: "Nové rozhodnutí",
    deliveredAt: "2026-07-24T08:15:00.000Z"
  };
}

{
  const { sqlite, d1 } = openDatabase();
  const calls = [];
  const fetch = async (_url, options) => {
    const body = Object.fromEntries(options.body);
    calls.push(body);
    return Response.json({ sid: `SM${calls.length}`, status: "accepted" }, { status: 201 });
  };
  const first = await notifyNewDataBoxMessage(environment(d1), messageInput(), { fetch });
  assert.equal(first.length, 2);
  assert.equal(first.every((item) => item.status === "provider_sent" && item.sent), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].ContentSid, "HX00000000000000000000000000000000");
  const variables = JSON.parse(calls[0].ContentVariables);
  assert.equal(variables["1"], "Kaiser servis");
  assert.equal(variables["2"], "Česká správa");
  assert.equal(variables["3"], "Nové rozhodnutí");
  assert.equal(variables["5"], "message-1");

  const second = await notifyNewDataBoxMessage(environment(d1), messageInput(), { fetch });
  assert.equal(second.length, 2);
  assert.equal(second.every((item) => item.status === "blocked_duplicate" && item.duplicate), true);
  assert.equal(calls.length, 2, "Druhé zpracování nesmí volat poskytovatele.");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_box_plus_rcs_notifications").get().count, 2);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM data_box_plus_rcs_notification_events WHERE status = 'blocked_duplicate'").get().count,
    2
  );

  const delivered = await processDataBoxRcsStatusCallback(environment(d1), {
    MessageSid: "SM1",
    MessageStatus: "delivered",
    ChannelPrefix: "rcs"
  });
  assert.equal(delivered.matched, true);
  assert.equal(delivered.status, "delivered");
  const read = await processDataBoxRcsStatusCallback(environment(d1), {
    MessageSid: "SM1",
    MessageStatus: "read",
    ChannelPrefix: "rcs"
  });
  assert.equal(read.status, "read");
  const lateDelivered = await processDataBoxRcsStatusCallback(environment(d1), {
    MessageSid: "SM1",
    MessageStatus: "delivered",
    ChannelPrefix: "rcs"
  });
  assert.equal(lateDelivered.status, "read", "Pozdní callback nesmí snížit doložený stav přečteno.");
  assert.equal(
    sqlite.prepare("SELECT status FROM data_box_plus_rcs_notifications WHERE provider_message_id = 'SM1'").get().status,
    "read"
  );

  const endpointEnv = { ...environment(d1), AUTH_SESSION_SECRET: "test-session-secret" };
  const adminCookie = await createSessionCookie(endpointEnv, { id: "radim-oplustil", role: "admin" });
  const adminResponse = await getDataBoxMessageEndpoint({
    request: new Request("https://smart-odpady.ai/api/data-box-plus/messages/message-1", {
      headers: { Cookie: adminCookie }
    }),
    env: endpointEnv,
    params: { id: "message-1" }
  });
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  assert.equal(adminPayload.message.notifications.length, 2);

  const unauthorizedCookie = await createSessionCookie(endpointEnv, { id: "readonly-no-access", role: "readonly" });
  const unauthorizedResponse = await getDataBoxMessageEndpoint({
    request: new Request("https://smart-odpady.ai/api/data-box-plus/messages/message-1", {
      headers: { Cookie: unauthorizedCookie }
    }),
    env: endpointEnv,
    params: { id: "message-1" }
  });
  assert.equal(unauthorizedResponse.status, 403, "Deep-link API nesmí vydat zprávu neoprávněnému uživateli.");
}

{
  const { sqlite, d1 } = openDatabase({ trneckovaPhone: "" });
  const calls = [];
  const fetch = async () => {
    calls.push(true);
    return Response.json({ sid: "SM-RADIM", status: "accepted" }, { status: 201 });
  };
  const result = await notifyNewDataBoxMessage(environment(d1), messageInput(), { fetch });
  assert.equal(calls.length, 1, "Chybějící telefon Trnečkové nesmí zablokovat Radima.");
  assert.equal(result.find((item) => item.recipientKey === "radim-oplustil").status, "provider_sent");
  assert.equal(result.find((item) => item.recipientKey === "alena-trneckova").status, "skipped_missing_phone");
  assert.match(
    sqlite.prepare("SELECT error_message FROM data_box_plus_rcs_notifications WHERE recipient_key = 'alena-trneckova'").get().error_message,
    /telefonní číslo/
  );
}

{
  const { sqlite, d1 } = openDatabase();
  let call = 0;
  const fetch = async () => {
    call += 1;
    if (call === 2) {
      return Response.json({ code: 63018, message: "RCS provider rejected the message" }, { status: 400 });
    }
    return Response.json({ sid: "SM-OK", status: "accepted" }, { status: 201 });
  };
  const result = await notifyNewDataBoxMessage(environment(d1), messageInput(), { fetch });
  const failed = result.find((item) => item.recipientKey === "alena-trneckova");
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "63018");
  assert.equal(failed.errorMessage, "RCS provider rejected the message");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM data_box_plus_action_log WHERE result = 'failed'").get().count,
    1
  );
}

{
  const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const endpointSource = readFileSync(new URL("../functions/api/data-box-plus/messages/[id].js", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
  const notificationSource = readFileSync(new URL("../functions/_lib/data-box-rcs-notifications.js", import.meta.url), "utf8");
  const templateSpec = readFileSync(new URL("../docs/DATA_BOX_RCS_TEMPLATE.md", import.meta.url), "utf8");
  const cardAsset = readFileSync(
    new URL("../public/notifications/kaiser-sarlota-rcs-data-message-v1.png", import.meta.url)
  );
  assert.match(notificationSource, /encodeURIComponent\(messageId\)/);
  assert.match(notificationSource, /TWILIO_KAISER_STATUS_CALLBACK_URL/);
  assert.match(appSource, /applyDataBoxPlusMessageDeepLink/);
  assert.match(endpointSource, /requireUserPermission\(env, request, "data-box-plus", "view"\)/);
  assert.match(endpointSource, /hasPermission\(user, "data-box-plus", "manage"\)/);
  assert.match(storeSource, /created && direction === "received"/);
  assert.match(templateSpec, /Pro odhlášení odpovězte STOP\./);
  assert.match(templateSpec, /datove-schranky-plus\?message=\{\{5\}\}/);
  assert.match(templateSpec, /https:\/\/smart-odpady\.ai\/notifications\/kaiser-sarlota-rcs-data-message-v1\.png/);
  assert.equal(cardAsset.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(cardAsset.readUInt32BE(16), 1200);
  assert.equal(cardAsset.readUInt32BE(20), 600);
  assert.doesNotMatch(appSource, /mock.*RCS|RCS.*mock/i);
}

console.log("data-box RCS notifications ok");
