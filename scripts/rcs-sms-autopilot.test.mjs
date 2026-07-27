import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  RCS_SMS_INTENTS,
  RCS_SMS_TOOLS,
  RCS_SMS_TOOL_ARGUMENT_SCHEMAS,
  __test as openAiTest,
  classifyRcsSmsMessage,
  validateRcsSmsToolArguments
} from "../functions/_lib/rcs-sms-autopilot-openai.js";
import {
  __test as serviceTest,
  hasImmediateDanger,
  ingestAndScheduleRcsSmsAutopilot,
  isRcsSmsStopMessage,
  processRcsSmsAutopilotMessage,
  runRcsSmsAutopilotRetry
} from "../functions/_lib/rcs-sms-autopilot-service.js";
import {
  RcsSmsReviewSendError,
  cancelRcsSmsReviewSend,
  confirmRcsSmsReviewSend,
  prepareRcsSmsReviewSendGrant
} from "../functions/_lib/rcs-sms-review-send-service.js";
import { __test as toolsTest } from "../functions/_lib/rcs-sms-autopilot-tools.js";
import {
  __test as storeTest,
  getRcsSmsConversationDetail,
  getRcsSmsMessageForProcessing
} from "../functions/_lib/rcs-sms-autopilot-store.js";
import {
  createRcsTaskReplyGrants,
  reserveRcsDispatch
} from "../functions/_lib/rcs-template-store.js";
import {
  isImmutableRcsSmsAutopilotRule,
  isToggleableRcsSmsAutopilotAutomation
} from "../functions/_lib/rcs-sms-autopilot-rule-guard.js";
import {
  __test as uiTest,
  rcsSmsAutopilotContent,
  rcsSmsAutopilotState
} from "../src/rcsSmsAutopilot.js";
import { modules } from "../src/data/modules.js";
import { hasPermission } from "../src/permissions.js";
import { loadRcsSmsInboxData } from "../functions/api/rcs-sms-autopilot.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }
}

function applyMigration(database, name) {
  database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}

{
  const minimalMessagesSqlite = new DatabaseSync(":memory:");
  minimalMessagesSqlite.exec(`
    CREATE TABLE rcs_sms_conversations (
      id TEXT PRIMARY KEY,
      phone TEXT,
      channel TEXT,
      status TEXT,
      last_outbound_message_sid TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_activity_at TEXT
    );
    CREATE TABLE rcs_sms_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      direction TEXT,
      channel TEXT,
      body TEXT,
      status TEXT,
      reply_text TEXT,
      created_at TEXT
    );
    INSERT INTO rcs_sms_conversations (
      id, phone, channel, status, created_at, updated_at, last_activity_at
    ) VALUES (
      'conversation-minimal', '+420700000000', 'sms', 'human_takeover',
      '2026-07-27T10:00:00.000Z', '2026-07-27T10:00:00.000Z', '2026-07-27T10:00:00.000Z'
    );
    INSERT INTO rcs_sms_messages (
      id, conversation_id, direction, channel, body, status, reply_text, created_at
    ) VALUES (
      'message-minimal', 'conversation-minimal', 'inbound', 'sms',
      'Přijatá zpráva', 'replied', 'Uložený návrh', '2026-07-27T10:00:00.000Z'
    );
  `);
  const originalOptionalConsoleError = console.error;
  console.error = () => {};
  try {
    const minimalDetail = await getRcsSmsConversationDetail({
      DB_MESSAGES: new D1Database(minimalMessagesSqlite)
    }, "conversation-minimal");
    assert.equal(minimalDetail.messages.length, 1);
    assert.equal(minimalDetail.messages[0].body, "Přijatá zpráva");
    assert.equal(minimalDetail.messages[0].replyText, "Uložený návrh");
    assert.deepEqual(minimalDetail.requests, []);
    assert.deepEqual(minimalDetail.toolRuns, []);
    assert.deepEqual(minimalDetail.events, []);
  } finally {
    console.error = originalOptionalConsoleError;
    minimalMessagesSqlite.close();
  }
}

for (const message of [
  "STOP",
  "stop sms",
  "KONEC",
  "ODHLÁSIT",
  "NECHCI",
  "NEPOSÍLAT SMS"
]) {
  assert.equal(isRcsSmsStopMessage(message), true, `${message} musí skončit před OpenAI`);
}
assert.equal(isRcsSmsStopMessage("Prosím nezastavujte svoz"), false);
assert.equal(hasImmediateDanger("Hoří nám nádoba, volám hasiče."), true);
assert.equal(hasImmediateDanger("Kdy přijede svoz?"), false);
assert.equal(serviceTest.modeFromEnv({}), "off");
assert.equal(serviceTest.modeFromEnv({ RCS_SMS_AUTOPILOT_MODE: "invalid" }), "off");
assert.equal(serviceTest.modeFromEnv({ RCS_SMS_AUTOPILOT_MODE: "review" }), "review");
assert.deepEqual(serviceTest.reviewPilotUserIds({
  RCS_SMS_AUTOPILOT_REVIEW_USER_IDS: " user-1, user-2;user-1 "
}), ["user-1", "user-2"]);
assert.equal(serviceTest.reviewPilotAllowsContext({
  RCS_SMS_AUTOPILOT_REVIEW_USER_IDS: "user-1"
}, {
  senderType: "employee",
  userId: "user-1"
}), true);
assert.equal(serviceTest.reviewPilotAllowsContext({
  RCS_SMS_AUTOPILOT_REVIEW_USER_IDS: ""
}, {
  senderType: "employee",
  userId: "user-1"
}), false);
assert.equal(serviceTest.reviewPilotAllowsContext({
  RCS_SMS_AUTOPILOT_REVIEW_USER_IDS: "user-1"
}, {
  senderType: "customer",
  userId: "user-1"
}), false);
assert.equal(serviceTest.effectiveModeFromRuntime(
  { RCS_SMS_AUTOPILOT_MODE: "live" },
  { autopilotEnabled: false, outboundEnabled: false }
), "off");
assert.equal(serviceTest.effectiveModeFromRuntime(
  { RCS_SMS_AUTOPILOT_MODE: "live" },
  { autopilotEnabled: true, outboundEnabled: false }
), "review");
assert.equal(serviceTest.effectiveModeFromRuntime(
  { RCS_SMS_AUTOPILOT_MODE: "live" },
  { autopilotEnabled: true, outboundEnabled: true }
), "live");

assert.equal(new Set(RCS_SMS_TOOLS).size, RCS_SMS_TOOLS.length);
assert.equal(new Set(RCS_SMS_INTENTS).size, RCS_SMS_INTENTS.length);
assert.deepEqual(Object.keys(RCS_SMS_TOOL_ARGUMENT_SCHEMAS), [...RCS_SMS_TOOLS]);
assert.equal(openAiTest.functionTools().length, RCS_SMS_TOOLS.length);
for (const tool of openAiTest.functionTools()) {
  assert.equal(tool.type, "function");
  assert.equal(tool.strict, true);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(tool.parameters.properties.arguments.additionalProperties, false);
  assert.deepEqual(
    new Set(tool.parameters.required),
    new Set(Object.keys(tool.parameters.properties)),
    `${tool.name} musí mít ve strict schématu všechna pole povinná`
  );
  assert.deepEqual(
    new Set(tool.parameters.properties.arguments.required),
    new Set(Object.keys(tool.parameters.properties.arguments.properties)),
    `${tool.name} musí mít všechny argumenty povinné`
  );
}

for (const toolName of RCS_SMS_TOOLS) {
  const fields = Object.keys(RCS_SMS_TOOL_ARGUMENT_SCHEMAS[toolName]);
  const args = Object.fromEntries(fields.map((name) => [name, ""]));
  assert.equal(validateRcsSmsToolArguments(toolName, args).ok, true, `${toolName} musí mít platné přesné schéma`);
  assert.equal(
    validateRcsSmsToolArguments(toolName, { ...args, arbitrary: "blocked" }).ok,
    false,
    `${toolName} nesmí přijmout vlastní pole`
  );
}
assert.equal(validateRcsSmsToolArguments("invented_tool", {}).ok, false);
assert.equal(toolsTest.GRANT_REQUIRED_TOOLS.has("accept_task"), true);
assert.equal(toolsTest.GRANT_REQUIRED_TOOLS.has("add_task_note"), true);
assert.equal(toolsTest.CONFIRMATION_REQUIRED_INTENTS.has("change_date"), true);
assert.equal(toolsTest.CONFIRMATION_REQUIRED_INTENTS.has("service_order"), true);
assert.equal(toolsTest.READ_TOOLS_REQUIRING_FUTURE_CONNECTOR.has("get_collection_schedule"), true);
assert.equal(toolsTest.REQUEST_TOOLS.has("create_missed_collection_report"), true);
assert.equal(toolsTest.requestScopeVerified(
  "create_missed_collection_report",
  { customerId: "customer-1" },
  { customerId: "customer-1" }
), true);
assert.equal(toolsTest.requestScopeVerified(
  "create_missed_collection_report",
  { customerId: "customer-2" },
  { customerId: "customer-1" }
), false);
assert.equal(toolsTest.requestScopeVerified(
  "create_vehicle_report",
  { vehicleId: "vehicle-1" },
  { relatedEntityType: "vehicle", relatedEntityId: "vehicle-1" }
), true);
assert.equal(toolsTest.taskReplyIdentityVerified({
  senderType: "employee",
  userId: "user-1",
  lastOutboundUserId: "user-1"
}), true);
assert.equal(toolsTest.taskReplyIdentityVerified({
  senderType: "employee",
  userId: "user-2",
  lastOutboundUserId: "user-1"
}), false);

{
  let capturedRequest = null;
  const result = await classifyRcsSmsMessage({
    RCS_SMS_AUTOPILOT_OPENAI_API_KEY: "test-only-key",
    RCS_SMS_AUTOPILOT_OPENAI_MODEL: "test-model"
  }, {
    message: { body: "Ano", channel: "rcs", mediaCount: 0 },
    context: {
      senderType: "employee",
      userId: "user-1",
      contactName: "Radim",
      lastOutboundTemplateKey: "task_assignment",
      lastOutboundBody: "Přijmeš úkol?"
    },
    history: []
  }, {
    fetchImpl: async (_url, init) => {
      capturedRequest = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: "resp-test-1",
        output: [{
          type: "function_call",
          call_id: "call-test-1",
          name: "accept_task",
          arguments: JSON.stringify({
            intent: "confirmation",
            confidence: 0.97,
            responseMode: "confirmation",
            replyText: "Díky, úkol čeká na serverové ověření.",
            arguments: { taskId: "task-1" },
            requiresHuman: false,
            reason: "Odpověď navazuje na původní úkol."
          })
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(result.plan.senderType, "employee", "typ odesílatele musí určit backend");
  assert.equal(result.plan.requestedTool.name, "accept_task");
  assert.deepEqual(result.plan.requestedTool.arguments, { taskId: "task-1" });
  assert.equal(capturedRequest.store, false);
  assert.equal(capturedRequest.model, "test-model");
  assert.equal(capturedRequest.tools.length, RCS_SMS_TOOLS.length);
  assert.equal(capturedRequest.tools.every((tool) => tool.strict === true), true);
  assert.equal(capturedRequest.tool_choice, "required");
  assert.equal(capturedRequest.parallel_tool_calls, false);
  assert.match(capturedRequest.instructions, /nedůvěryhodný podklad/);
  assert.equal(capturedRequest.input.includes("test-only-key"), false);
}

{
  const lowConfidence = openAiTest.normalizePlan({
    output: [{
      type: "function_call",
      name: "none",
      arguments: JSON.stringify({
        intent: "unclear",
        confidence: 0.5,
        responseMode: "automatic",
        replyText: "Nevím.",
        arguments: {},
        requiresHuman: false,
        reason: "Nízká jistota."
      })
    }]
  }, "unknown");
  assert.equal(lowConfidence.requiresHuman, true);
  assert.equal(lowConfidence.responseMode, "human");
}

assert.throws(
  () => openAiTest.normalizePlan({
    output: [{
      type: "function_call",
      name: "accept_task",
      arguments: JSON.stringify({
        intent: "confirmation",
        confidence: 1,
        responseMode: "automatic",
        replyText: "Hotovo.",
        arguments: { taskId: "task-1", role: "admin" },
        requiresHuman: false,
        reason: ""
      })
    }]
  }, "employee"),
  (error) => error?.code === "tool_arguments_unknown_field"
);

assert.throws(
  () => openAiTest.normalizePlan({
    output: [
      { type: "function_call", name: "none", arguments: "{}" },
      { type: "function_call", name: "handoff_to_human", arguments: "{}" }
    ]
  }, "employee"),
  (error) => error?.code === "rcs_sms_openai_empty_output"
);

assert.equal(storeTest.channelFromPayload({ From: "rcs:+420777123456" }), "rcs");
assert.equal(storeTest.channelFromPayload({ From: "+420777123456" }), "sms");
assert.equal(
  storeTest.replyToSidFromPayload({ OriginalRepliedMessageSid: "SM_ORIGINAL" }),
  "SM_ORIGINAL"
);
assert.equal(storeTest.mediaFromPayload({
  NumMedia: "2",
  MediaContentType0: "image/jpeg",
  MediaContentType1: "image/png"
}).length, 2);

{
  const coreSqlite = new DatabaseSync(":memory:");
  const messagesSqlite = new DatabaseSync(":memory:");
  const auditSqlite = new DatabaseSync(":memory:");
  for (const migrationName of [
    "modular/core/0003_remaining_core_schema.sql",
    "modular/core/0005_rcs_sms_autopilot_rules_disabled.sql"
  ]) {
    applyMigration(coreSqlite, migrationName);
  }
  for (const migrationName of [
    "modular/messages/0001_messages_foundation.sql",
    "modular/messages/0002_rcs_sms_autopilot_disabled.sql",
    "modular/messages/0003_notification_logs_legacy_compatibility.sql",
    "modular/messages/0006_rcs_sms_webhooks_and_idempotency.sql",
    "modular/messages/0007_rcs_sms_review_send_grants.sql"
  ]) {
    applyMigration(messagesSqlite, migrationName);
  }
  applyMigration(auditSqlite, "modular/audit/0003_remaining_audit_schema.sql");
  coreSqlite.prepare(`
    INSERT INTO users (
      id, name, email, phone, role, status, active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)
  `).run(
    "user-autopilot-test",
    "Testovací uživatel",
    "autopilot@example.test",
    "+420777123456",
    "dispecer",
    "2026-07-25T08:00:00.000Z",
    "2026-07-25T08:00:00.000Z"
  );
  messagesSqlite.prepare(`
    INSERT INTO customer_message_log (
      id, phone, used_channel, template_key, message_body,
      twilio_message_sid, status, related_entity_type, related_entity_id,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'rcs_sms_auto_fallback', ?, ?, ?, 'delivered', ?, ?, ?, ?, ?)
  `).run(
    "outbound-autopilot-test",
    "+420777123456",
    "task_assignment",
    "Prosím potvrď přijetí úkolu.",
    "SM_OUTBOUND_AUTOPILOT_TEST",
    "task",
    "task-autopilot-test",
    JSON.stringify({ eventId: "event-autopilot-test", variables: { taskId: "task-autopilot-test" } }),
    "2026-07-25T09:00:00.000Z",
    "2026-07-25T09:00:00.000Z"
  );
  const integrationEnv = {
    DB_CORE: new D1Database(coreSqlite),
    DB_MESSAGES: new D1Database(messagesSqlite),
    DB_AUDIT: new D1Database(auditSqlite),
    RCS_SMS_AUTOPILOT_MODE: "off",
    KSO_CUSTOMER_MESSAGING_MODE: "off"
  };
  assert.equal(
    await serviceTest.automationRuleActive(integrationEnv, serviceTest.ASYNC_RULE_ID),
    false
  );
  coreSqlite.prepare("UPDATE module_rules SET status = 'active' WHERE id = ?")
    .run(serviceTest.ASYNC_RULE_ID);
  assert.equal(
    await serviceTest.automationRuleActive(integrationEnv, serviceTest.ASYNC_RULE_ID),
    true
  );
  coreSqlite.prepare("UPDATE module_rules SET status = 'inactive' WHERE id = ?")
    .run(serviceTest.ASYNC_RULE_ID);
  const reservedDispatch = await reserveRcsDispatch(integrationEnv, {
    idempotencyKey: "reserve-autopilot-test",
    eventId: "event-reserve-autopilot-test",
    templateKey: "task.new",
    recipientPhone: "+420777123456",
    recipientMasked: "+420 *** **56",
    recipientHash: "reserve-hash-test",
    userId: "user-autopilot-test",
    relatedEntityType: "task",
    relatedEntityId: "task-reserve-autopilot-test",
    messageBody: "Nový úkol: test rezervace.",
    variables: { taskTitle: "Test rezervace" },
    contentSid: "HX_RESERVE_AUTOPILOT_TEST",
    actorUserId: "admin-test",
    actorName: "Admin Test"
  });
  assert.equal(reservedDispatch.created, true);
  assert.equal(reservedDispatch.dispatch.recipientPhone, "+420777123456");
  assert.equal(reservedDispatch.dispatch.relatedEntityId, "task-reserve-autopilot-test");
  const createdGrants = await createRcsTaskReplyGrants(integrationEnv, {
    outboundMessageSid: "SM_GRANT_AUTOPILOT_TEST",
    phone: "+420777123456",
    taskId: "task-reserve-autopilot-test",
    createdByUserId: "admin-test",
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  });
  assert.deepEqual(createdGrants, { created: 3, total: 3 });
  assert.equal(
    messagesSqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_action_grants WHERE outbound_message_sid = ?").get("SM_GRANT_AUTOPILOT_TEST").total,
    3
  );
  messagesSqlite.prepare(`
    INSERT INTO rcs_message_dispatches (
      id, idempotency_key, event_id, template_key, recipient_phone,
      recipient_masked, recipient_hash, user_id, related_entity_type,
      related_entity_id, message_body, variables_json, content_sid,
      twilio_message_sid, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'task.new', ?, ?, ?, ?, 'task', ?, ?, ?, ?, ?, 'accepted', ?, ?)
  `).run(
    "rcs-dispatch-autopilot-test",
    "rcs-dispatch-autopilot-idempotency",
    "event-rcs-task-autopilot",
    "+420777123456",
    "+420 *** **56",
    "hash-test",
    "user-autopilot-test",
    "task-rcs-autopilot-test",
    "Nový úkol: zkontrolovat svoz.",
    JSON.stringify({ taskTitle: "Zkontrolovat svoz" }),
    "HX_AUTOPILOT_TEST",
    "SM_RCS_OUTBOUND_AUTOPILOT_TEST",
    "2026-07-25T09:30:00.000Z",
    "2026-07-25T09:30:00.000Z"
  );
  const exactRcsOutbound = await storeTest.resolveLastOutbound(
    integrationEnv.DB_MESSAGES,
    "+420777123456",
    { OriginalRepliedMessageSid: "SM_RCS_OUTBOUND_AUTOPILOT_TEST" }
  );
  assert.equal(exactRcsOutbound.templateKey, "task.new");
  assert.equal(exactRcsOutbound.relatedEntityId, "task-rcs-autopilot-test");
  assert.equal(exactRcsOutbound.variables.taskTitle, "Zkontrolovat svoz");
  const pending = [];
  const inboundPayload = {
    From: "rcs:+420777123456",
    Body: "Ano, beru úkol.",
    MessageSid: "SM_INBOUND_AUTOPILOT_TEST",
    OriginalRepliedMessageSid: "SM_OUTBOUND_AUTOPILOT_TEST",
    ChannelPrefix: "rcs"
  };
  const first = await ingestAndScheduleRcsSmsAutopilot(
    integrationEnv,
    inboundPayload,
    (promise) => pending.push(promise)
  );
  assert.equal(first.duplicate, false);
  assert.equal(first.scheduled, true);
  await Promise.all(pending);
  const stored = messagesSqlite.prepare(
    "SELECT status, sender_type, related_outbound_message_sid, processing_attempts FROM rcs_sms_messages WHERE twilio_message_sid = ?"
  ).get("SM_INBOUND_AUTOPILOT_TEST");
  assert.equal(stored.status, "autopilot_disabled");
  assert.equal(stored.sender_type, "employee");
  assert.equal(stored.related_outbound_message_sid, "SM_OUTBOUND_AUTOPILOT_TEST");
  assert.equal(stored.processing_attempts, 1);
  assert.equal(messagesSqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_tool_runs").get().total, 0);
  assert.equal(messagesSqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'").get().total, 0);
  messagesSqlite.prepare(`
    UPDATE rcs_sms_conversations
    SET last_outbound_message_sid = 'SM_RCS_OUTBOUND_AUTOPILOT_TEST'
    WHERE id = ?
  `).run(first.conversationId);
  const originalReplyContext = await getRcsSmsMessageForProcessing(
    integrationEnv,
    first.message.id
  );
  assert.equal(
    originalReplyContext.context.lastOutboundMessageSid,
    "SM_OUTBOUND_AUTOPILOT_TEST",
    "zpracování musí zůstat navázané na původní odpovězenou zprávu, ne na pozdější dispatch konverzace"
  );
  assert.equal(originalReplyContext.context.relatedEntityId, "task-autopilot-test");

  messagesSqlite.prepare(`
    UPDATE rcs_sms_runtime_config
    SET autopilot_enabled = 1, outbound_enabled = 0
    WHERE id = 'production'
  `).run();
  coreSqlite.prepare("UPDATE module_rules SET status = 'active' WHERE id = ?")
    .run(serviceTest.ASYNC_RULE_ID);
  integrationEnv.RCS_SMS_AUTOPILOT_MODE = "review";
  integrationEnv.RCS_SMS_AUTOPILOT_REVIEW_USER_IDS = "different-user";
  let forbiddenOpenAiCalls = 0;
  const excludedReview = await ingestAndScheduleRcsSmsAutopilot(integrationEnv, {
    From: "rcs:+420777123456",
    Body: "Prosím připrav návrh odpovědi.",
    MessageSid: "SM_INBOUND_REVIEW_EXCLUDED"
  });
  assert.equal(excludedReview.scheduled, false);
  const excludedResult = await processRcsSmsAutopilotMessage(
    integrationEnv,
    excludedReview.message.id,
    {
      fetchImpl: async () => {
        forbiddenOpenAiCalls += 1;
        throw new Error("OpenAI se mimo pilot nesmí zavolat.");
      }
    }
  );
  assert.equal(excludedResult.status, "human_takeover");
  assert.equal(excludedResult.reviewPilotExcluded, true);
  assert.equal(forbiddenOpenAiCalls, 0);
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_messages WHERE twilio_message_sid = ?"
  ).get("SM_INBOUND_REVIEW_EXCLUDED").status, "human_takeover");
  assert.equal(messagesSqlite.prepare(
    "SELECT COUNT(*) AS total FROM rcs_sms_events WHERE event_type = 'review_pilot_scope_blocked'"
  ).get().total, 1);

  messagesSqlite.prepare(`
    UPDATE rcs_sms_conversations
    SET status = 'open', human_takeover = 0
    WHERE phone = '+420777123456'
  `).run();
  integrationEnv.RCS_SMS_AUTOPILOT_REVIEW_USER_IDS = "user-autopilot-test";
  integrationEnv.RCS_SMS_AUTOPILOT_OPENAI_API_KEY = "review-pilot-test-only";
  const allowedReview = await ingestAndScheduleRcsSmsAutopilot(integrationEnv, {
    From: "rcs:+420777123456",
    Body: "Kdy mám úkol převzít?",
    MessageSid: "SM_INBOUND_REVIEW_ALLOWED"
  });
  const allowedResult = await processRcsSmsAutopilotMessage(
    integrationEnv,
    allowedReview.message.id,
    {
      fetchImpl: async () => new Response(JSON.stringify({
        id: "resp-review-pilot",
        output: [{
          type: "function_call",
          call_id: "call-review-pilot",
          name: "get_conversation_context",
          arguments: JSON.stringify({
            intent: "question_about_previous_message",
            confidence: 0.94,
            responseMode: "human",
            replyText: "Návrh odpovědi je připravený ke kontrole.",
            arguments: {},
            requiresHuman: true,
            reason: "Review pilot ukládá pouze návrh."
          })
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
  );
  assert.equal(
    allowedResult.status,
    "review_ready",
    `Review návrh musí projít strict validací: ${JSON.stringify(allowedResult)}`
  );
  const allowedStored = messagesSqlite.prepare(`
    SELECT status, response_mode, openai_response_id
    FROM rcs_sms_messages
    WHERE twilio_message_sid = ?
  `).get("SM_INBOUND_REVIEW_ALLOWED");
  assert.equal(allowedStored.status, "review_ready");
  assert.equal(allowedStored.response_mode, "human");
  assert.equal(allowedStored.openai_response_id, "resp-review-pilot");
  assert.equal(messagesSqlite.prepare(
    "SELECT COUNT(*) AS total FROM rcs_sms_tool_runs"
  ).get().total, 0);
  assert.equal(messagesSqlite.prepare(
    "SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'"
  ).get().total, 0);

  const reviewActor = {
    id: "admin-review-test",
    name: "Admin Review",
    role: "admin"
  };
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      allowedReview.conversationId,
      { replyText: "Tento text se nesmí připravit." },
      { id: "dispatcher-review-test", name: "Dispečer", role: "dispecer" }
    ),
    (error) => (
      error instanceof RcsSmsReviewSendError
      && error.code === "rcs_sms_review_approver_forbidden"
    )
  );
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      allowedReview.conversationId,
      { replyText: " " },
      reviewActor
    ),
    (error) => error?.code === "rcs_sms_review_reply_empty"
  );
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      allowedReview.conversationId,
      { replyText: "x".repeat(1201) },
      reviewActor
    ),
    (error) => error?.code === "rcs_sms_review_reply_too_long"
  );
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      allowedReview.conversationId,
      { replyText: "Bezpečný návrh.", arbitrary: "blocked" },
      reviewActor
    ),
    (error) => error?.code === "rcs_sms_review_payload_invalid"
  );
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      "conversation-unknown-test",
      { replyText: "Bezpečný návrh." },
      reviewActor,
      {
        getRuntimeConfig: async () => ({
          autopilotEnabled: true,
          outboundEnabled: false
        }),
        getCandidate: async () => ({
          conversation: {
            id: "conversation-unknown-test",
            contactType: "unknown",
            userId: "",
            phone: "+420700000000",
            channel: "sms"
          },
          message: {
            id: "message-unknown-test",
            direction: "inbound",
            status: "review_ready",
            senderType: "unknown",
            channel: "sms"
          }
        })
      }
    ),
    (error) => error?.code === "rcs_sms_review_candidate_invalid"
  );

  const cancelledGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Toto oprávnění bude zrušené." },
    reviewActor
  );
  assert.match(cancelledGrant.preview, /Pro odhlášení odpovězte STOP\.$/);
  assert.equal(cancelledGrant.toolExecution, "disabled");
  assert.equal(cancelledGrant.recipient, "+420 *** **56");
  const cancelled = await cancelRcsSmsReviewSend(
    integrationEnv,
    allowedReview.conversationId,
    { grantId: cancelledGrant.grantId },
    reviewActor
  );
  assert.equal(cancelled.cancelled, true);
  assert.equal(
    messagesSqlite.prepare(
      "SELECT status FROM rcs_sms_review_send_grants WHERE id = ?"
    ).get(cancelledGrant.grantId).status,
    "cancelled"
  );

  const replacedAdminGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "První správce připravil tento text." },
    reviewActor
  );
  const managementActor = {
    id: "management-review-test",
    name: "Management Review",
    role: "management"
  };
  const replacingManagementGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Druhý správce připravil novější text." },
    managementActor
  );
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_review_send_grants WHERE id = ?"
  ).get(replacedAdminGrant.grantId).status, "cancelled");
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_review_send_grants WHERE id = ?"
  ).get(replacingManagementGrant.grantId).status, "confirmation_pending");
  await cancelRcsSmsReviewSend(
    integrationEnv,
    allowedReview.conversationId,
    { grantId: replacingManagementGrant.grantId },
    managementActor
  );

  const claimedLockGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Odeslání je právě atomicky spotřebované." },
    reviewActor
  );
  messagesSqlite.prepare(`
    UPDATE rcs_sms_review_send_grants
    SET status = 'claimed', claimed_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), claimedLockGrant.grantId);
  await assert.rejects(
    prepareRcsSmsReviewSendGrant(
      integrationEnv,
      allowedReview.conversationId,
      { replyText: "Současné druhé oprávnění nesmí vzniknout." },
      managementActor
    ),
    (error) => error?.code === "rcs_sms_review_send_in_progress"
  );
  messagesSqlite.prepare(`
    UPDATE rcs_sms_review_send_grants
    SET status = 'failed', error_message = 'Test lock cleanup.'
    WHERE id = ?
  `).run(claimedLockGrant.grantId);

  const tamperedGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Přesný člověkem upravený text." },
    reviewActor
  );
  const tamperedRow = messagesSqlite.prepare(`
    SELECT conversation_id, inbound_message_id, actor_user_id,
           recipient_phone_hash, reply_text_hash, status
    FROM rcs_sms_review_send_grants
    WHERE id = ?
  `).get(tamperedGrant.grantId);
  assert.equal(tamperedRow.conversation_id, allowedReview.conversationId);
  assert.equal(tamperedRow.inbound_message_id, allowedReview.message.id);
  assert.equal(tamperedRow.actor_user_id, reviewActor.id);
  assert.equal(tamperedRow.recipient_phone_hash.length, 64);
  assert.equal(tamperedRow.reply_text_hash.length, 64);
  assert.equal(tamperedRow.status, "confirmation_pending");
  messagesSqlite.prepare(
    "UPDATE rcs_sms_review_send_grants SET reply_text = ? WHERE id = ?"
  ).run("Podvržený text.", tamperedGrant.grantId);
  await assert.rejects(
    confirmRcsSmsReviewSend(
      integrationEnv,
      allowedReview.conversationId,
      {
        grantId: tamperedGrant.grantId,
        confirm: "send-one-reviewed-reply"
      },
      reviewActor
    ),
    (error) => error?.code === "rcs_sms_review_grant_content_mismatch"
  );

  const failedGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Odpověď, kterou poskytovatel odmítne." },
    reviewActor
  );
  let providerCalls = 0;
  await assert.rejects(
    confirmRcsSmsReviewSend(
      integrationEnv,
      allowedReview.conversationId,
      {
        grantId: failedGrant.grantId,
        confirm: "send-one-reviewed-reply"
      },
      reviewActor,
      {
        claimGrant: async () => false,
        sendMessage: async () => {
          providerCalls += 1;
          return { sent: true };
        }
      }
    ),
    (error) => error?.code === "rcs_sms_review_atomic_claim_failed"
  );
  assert.equal(providerCalls, 0, "Bez atomické spotřeby se Twilio nesmí zavolat.");
  const failedSend = await confirmRcsSmsReviewSend(
    integrationEnv,
    allowedReview.conversationId,
    {
      grantId: failedGrant.grantId,
      confirm: "send-one-reviewed-reply"
    },
    reviewActor,
    {
      sendMessage: async () => {
        providerCalls += 1;
        return {
          sent: false,
          status: "failed",
          errorMessage: "Provider test failure."
        };
      }
    }
  );
  assert.equal(failedSend.sent, false);
  assert.equal(failedSend.retry, "disabled");
  assert.equal(providerCalls, 1);
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_messages WHERE id = ?"
  ).get(allowedReview.message.id).status, "review_ready");
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_review_send_grants WHERE id = ?"
  ).get(failedGrant.grantId).status, "failed");

  const sentGrant = await prepareRcsSmsReviewSendGrant(
    integrationEnv,
    allowedReview.conversationId,
    { replyText: "Přesný finální text po lidské kontrole." },
    reviewActor
  );
  await assert.rejects(
    confirmRcsSmsReviewSend(
      integrationEnv,
      allowedReview.conversationId,
      { grantId: sentGrant.grantId, confirm: "yes" },
      reviewActor
    ),
    (error) => error?.code === "rcs_sms_review_confirmation_required"
  );
  let sentPayload = null;
  const sentResult = await confirmRcsSmsReviewSend(
    integrationEnv,
    allowedReview.conversationId,
    {
      grantId: sentGrant.grantId,
      confirm: "send-one-reviewed-reply"
    },
    reviewActor,
    {
      sendMessage: async (_env, input) => {
        providerCalls += 1;
        sentPayload = input;
        return {
          sent: true,
          status: "accepted",
          twilioMessageSid: "SM_REVIEW_SEND_TEST",
          messageBody: "Přesný finální text po lidské kontrole. Pro odhlášení odpovězte STOP."
        };
      }
    }
  );
  assert.equal(sentResult.sent, true);
  assert.equal(sentResult.retry, "disabled");
  assert.equal(sentPayload.template, "autopilot_reply");
  assert.equal(sentPayload.variables.replyText, "Přesný finální text po lidské kontrole.");
  assert.equal(sentPayload.channelPreference, "rcs");
  assert.equal(sentPayload.eventId, `review-send:${sentGrant.grantId}`);
  assert.equal(messagesSqlite.prepare(`
    SELECT sender_type, response_mode, status
    FROM rcs_sms_messages
    WHERE twilio_message_sid = 'SM_REVIEW_SEND_TEST'
  `).get().sender_type, "human");
  assert.equal(messagesSqlite.prepare(
    "SELECT status, response_mode FROM rcs_sms_messages WHERE id = ?"
  ).get(allowedReview.message.id).status, "replied");
  assert.equal(messagesSqlite.prepare(
    "SELECT status, human_takeover FROM rcs_sms_conversations WHERE id = ?"
  ).get(allowedReview.conversationId).human_takeover, 0);
  assert.equal(messagesSqlite.prepare(
    "SELECT status FROM rcs_sms_review_send_grants WHERE id = ?"
  ).get(sentGrant.grantId).status, "provider_accepted");
  await assert.rejects(
    confirmRcsSmsReviewSend(
      integrationEnv,
      allowedReview.conversationId,
      {
        grantId: sentGrant.grantId,
        confirm: "send-one-reviewed-reply"
      },
      reviewActor,
      {
        sendMessage: async () => {
          providerCalls += 1;
          return { sent: true };
        }
      }
    ),
    (error) => error?.code === "rcs_sms_review_grant_not_pending"
  );
  assert.equal(providerCalls, 2, "Spotřebovaný grant nesmí vyvolat druhé odeslání.");
  assert.equal(messagesSqlite.prepare(
    "SELECT COUNT(*) AS total FROM rcs_sms_tool_runs"
  ).get().total, 0, "Ruční review odpověď nesmí provést žádný provozní nástroj.");

  messagesSqlite.prepare(`
    UPDATE rcs_sms_runtime_config
    SET autopilot_enabled = 0, outbound_enabled = 0
    WHERE id = 'production'
  `).run();
  coreSqlite.prepare("UPDATE module_rules SET status = 'inactive' WHERE id = ?")
    .run(serviceTest.ASYNC_RULE_ID);
  integrationEnv.RCS_SMS_AUTOPILOT_MODE = "off";
  integrationEnv.RCS_SMS_AUTOPILOT_REVIEW_USER_IDS = "";
  delete integrationEnv.RCS_SMS_AUTOPILOT_OPENAI_API_KEY;

  integrationEnv.RCS_SMS_AUTOPILOT_MODE = "live";
  const outboundBeforeInactiveRule = messagesSqlite.prepare(
    "SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'"
  ).get().total;
  const blankPending = [];
  await ingestAndScheduleRcsSmsAutopilot(integrationEnv, {
    From: "+420999123456",
    Body: "",
    MessageSid: "SM_INBOUND_AUTOPILOT_BLANK"
  }, (promise) => blankPending.push(promise));
  await Promise.all(blankPending);
  const blankStored = messagesSqlite.prepare(
    "SELECT status, response_mode FROM rcs_sms_messages WHERE twilio_message_sid = ?"
  ).get("SM_INBOUND_AUTOPILOT_BLANK");
  assert.equal(blankStored.status, "awaiting_field");
  assert.equal(blankStored.response_mode, "none");
  assert.equal(
    messagesSqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'").get().total,
    outboundBeforeInactiveRule,
    "live ENV bez aktivního asynchronního pravidla nesmí odeslat ani pevnou odpověď"
  );
  integrationEnv.RCS_SMS_AUTOPILOT_MODE = "off";

  const duplicate = await ingestAndScheduleRcsSmsAutopilot(
    integrationEnv,
    inboundPayload,
    () => assert.fail("Duplicitní webhook se nesmí znovu naplánovat.")
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.scheduled, false);
  assert.equal(
    messagesSqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE twilio_message_sid = ?").get("SM_INBOUND_AUTOPILOT_TEST").total,
    1
  );

  const stopPending = [];
  await ingestAndScheduleRcsSmsAutopilot(integrationEnv, {
    From: "+420888123456",
    Body: "ODHLÁSIT",
    MessageSid: "SM_INBOUND_AUTOPILOT_STOP"
  }, (promise) => stopPending.push(promise));
  await Promise.all(stopPending);
  assert.equal(
    messagesSqlite.prepare("SELECT status FROM rcs_sms_messages WHERE twilio_message_sid = ?").get("SM_INBOUND_AUTOPILOT_STOP").status,
    "blocked"
  );
  assert.equal(
    messagesSqlite.prepare("SELECT COUNT(*) AS total FROM customer_message_opt_out WHERE phone = ?").get("+420888123456").total,
    1
  );
  const runner = await runRcsSmsAutopilotRetry(integrationEnv, {
    scheduledTime: Date.parse("2026-07-25T10:15:00.000Z"),
    triggeredBy: "test"
  });
  assert.equal(runner.mode, "off");
  assert.equal(runner.status, "skipped");
  assert.equal(auditSqlite.prepare(
    "SELECT status FROM module_automation_runner_runs WHERE module_key = 'rcs-sms-autopilot' ORDER BY started_at DESC LIMIT 1"
  ).get().status, "skipped");
  assert.equal(messagesSqlite.prepare(
    "SELECT autopilot_enabled FROM rcs_sms_runtime_config WHERE id = 'production'"
  ).get().autopilot_enabled, 0);
  coreSqlite.close();
  messagesSqlite.close();
  auditSqlite.close();
}

assert.equal(isImmutableRcsSmsAutopilotRule(
  "rcs-sms-autopilot",
  "rcs-sms-autopilot-twilio-signature"
), true);
assert.equal(isImmutableRcsSmsAutopilotRule(
  "rcs-sms-autopilot",
  "rcs-sms-autopilot-fixed-rules"
), true);
assert.equal(isToggleableRcsSmsAutopilotAutomation(
  "rcs-sms-autopilot",
  "rcs-sms-autopilot-retry-runner"
), true);

assert.equal(hasPermission({ role: "kancelar", active: true }, "rcs-sms-autopilot", "manage"), true);
assert.equal(hasPermission({ role: "dispecer", active: true }, "rcs-sms-autopilot", "manage"), true);
assert.equal(hasPermission({ role: "garazmistr", active: true }, "rcs-sms-autopilot", "view"), true);
assert.equal(hasPermission({ role: "garazmistr", active: true }, "rcs-sms-autopilot", "manage"), false);
assert.equal(hasPermission({ role: "ridic", active: true }, "rcs-sms-autopilot", "view"), false);
assert.equal(hasPermission({ role: "readonly", active: true }, "rcs-sms-autopilot", "view"), false);

const originalConsoleError = console.error;
console.error = () => {};
try {
  const inboxWithUnavailableStatus = await loadRcsSmsInboxData(
    {},
    new URLSearchParams(),
    {
      loadConversations: async () => ({
        items: [{ id: "conversation-visible" }],
        total: 1,
        page: 1,
        pageSize: 50
      }),
      loadStatus: async () => {
        throw new Error("forced status failure");
      }
    }
  );
  assert.equal(inboxWithUnavailableStatus.items.length, 1);
  assert.equal(inboxWithUnavailableStatus.total, 1);
  assert.equal(inboxWithUnavailableStatus.status, null);
  assert.equal(inboxWithUnavailableStatus.statusApiStatus, "waiting");
  assert.equal(inboxWithUnavailableStatus.apiStatus, "ready");
} finally {
  console.error = originalConsoleError;
}

const moduleItem = modules.find((item) => item.id === "rcs-sms-autopilot");
assert.equal(moduleItem?.route, "/rcs-sms-konverzace");
assert.equal(moduleItem?.title, "Zprávy RCS a SMS");
assert.equal(moduleItem?.status, "Aktivní");
assert.equal(uiTest.modeLabel("off"), "Vypnuto");
assert.equal(uiTest.statusLabel("waiting"), "Čeká na odpověď");
assert.equal(uiTest.conversationUiStatus({ status: "closed" }), "resolved");
assert.equal(uiTest.conversationUiStatus({ status: "human_takeover" }), "waiting");

rcsSmsAutopilotState.items = [{
  id: "conversation-1",
  contactName: "<script>alert(1)</script>",
  phone: "+420777123456",
  contactType: "unknown",
  channel: "sms",
  status: "human_takeover",
  latestMessage: {
    body: "Test",
    createdAt: "2026-07-25T10:00:00.000Z"
  }
}];
rcsSmsAutopilotState.total = 1;
rcsSmsAutopilotState.loaded = true;
rcsSmsAutopilotState.status = {
  mode: "review",
  counts: { conversations: 1 },
  openAi: { configured: false },
  twilio: { twilioConfigured: false },
  asyncProcessing: { active: true },
  reviewPilot: {
    enabled: true,
    configuredUserCount: 1,
    failClosed: true
  },
  retryRunner: { active: false, cron: "*/5 * * * *" },
  outboundEffects: "disabled",
  manualReviewSend: "one_time_admin_grant_only"
};
const ui = rcsSmsAutopilotContent({ canManage: true });
assert.match(ui, /Hledat jméno, telefon nebo zprávu/);
assert.match(ui, /Čekají na odpověď/);
assert.match(ui, /Vyberte konverzaci vlevo/);
assert.doesNotMatch(ui, /Pravdivý provozní stav|Seznam pravidel|OpenAI|Cloud runner|cron/);
assert.doesNotMatch(ui, /<script>alert/);
assert.match(ui, /&lt;script&gt;alert/);

rcsSmsAutopilotState.selectedId = "conversation-1";
rcsSmsAutopilotState.detail = {
  conversation: {
    id: "conversation-1",
    phone: "+420777123456",
    contactName: "Testovací uživatel",
    contactType: "employee",
    channel: "rcs",
    status: "human_takeover",
    humanTakeover: true
  },
  messages: [{
    id: "message-review-ui",
    direction: "inbound",
    channel: "rcs",
    body: "Prosím o odpověď.",
    status: "review_ready",
    replyText: "Návrh <b>ke kontrole</b>.",
    intent: "general_request",
    requestedTool: "none"
  }],
  requests: [],
  toolRuns: [],
  events: [],
  originalOutbound: null
};
rcsSmsAutopilotState.reviewDraft = {
  conversationId: "conversation-1",
  messageId: "message-review-ui",
  originalText: "Návrh <b>ke kontrole</b>.",
  text: "Návrh <b>ke kontrole</b>.",
  dirty: false,
  grant: null
};
const reviewUi = rcsSmsAutopilotContent({ canManage: true, canApprove: true });
assert.match(reviewUi, /Šarlota navrhuje odpověď/);
assert.match(reviewUi, /Napište odpověď/);
assert.match(reviewUi, /Vložit připravenou odpověď/);
assert.match(reviewUi, /Odešle se jako/);
assert.match(reviewUi, /Informace o kontaktu/);
assert.match(reviewUi, /Označit jako vyřešené/);
assert.doesNotMatch(reviewUi, /<b>ke kontrole<\/b>/);
assert.match(reviewUi, /&lt;b&gt;ke kontrole&lt;\/b&gt;/);

rcsSmsAutopilotState.detail.messages = [
  {
    id: "message-replied-ui",
    direction: "inbound",
    channel: "rcs",
    body: "Přijatá zpráva zákazníka.",
    status: "replied",
    replyText: "Uložený návrh Šarloty."
  },
  {
    id: "message-outbound-ui",
    direction: "outbound",
    channel: "rcs",
    body: "Skutečně odeslaná odpověď.",
    status: "accepted",
    senderType: "human"
  }
];
rcsSmsAutopilotState.reviewDraft = {
  conversationId: "conversation-1",
  messageId: "",
  originalText: "",
  text: "",
  dirty: false,
  grant: null
};
const repliedUi = rcsSmsAutopilotContent({ canManage: true, canApprove: true });
assert.match(repliedUi, /Přijatá zpráva zákazníka/);
assert.match(repliedUi, /Šarlota · návrh odpovědi/);
assert.match(repliedUi, /Uložený návrh Šarloty/);
assert.match(repliedUi, /Skutečně odeslaná odpověď/);
assert.doesNotMatch(repliedUi, /Šarlota navrhuje odpověď/);

rcsSmsAutopilotState.detail.messages = [{
  id: "message-review-ui",
  direction: "inbound",
  channel: "rcs",
  body: "Prosím o odpověď.",
  status: "review_ready",
  replyText: "Návrh <b>ke kontrole</b>.",
  intent: "general_request",
  requestedTool: "none"
}];
rcsSmsAutopilotState.reviewDraft = {
  conversationId: "conversation-1",
  messageId: "message-review-ui",
  originalText: "Návrh <b>ke kontrole</b>.",
  text: "Návrh <b>ke kontrole</b>.",
  dirty: false,
  grant: null
};
rcsSmsAutopilotState.reviewDraft.grant = {
  grantId: "grant-ui-test",
  recipient: "+420 *** **56",
  channel: "rcs",
  expiresAt: "2026-07-25T12:03:00.000Z",
  preview: "Návrh ke kontrole. Pro odhlášení odpovězte STOP."
};
const confirmationUi = rcsSmsAutopilotContent({ canManage: true, canApprove: true });
assert.match(confirmationUi, /Odeslat tuto odpověď/);
assert.match(confirmationUi, /\+420 \*\*\* \*\*56/);
assert.doesNotMatch(confirmationUi, /Žádný nástroj se nespustí/);

const [
  messageMigration,
  reviewGrantMigration,
  ruleMigration,
  inboundSource,
  workerSource,
  appSource,
  cssSource,
  envExample
] = await Promise.all([
  readFile(new URL("../migrations/modular/messages/0002_rcs_sms_autopilot_disabled.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/modular/messages/0007_rcs_sms_review_send_grants.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/modular/core/0005_rcs_sms_autopilot_rules_disabled.sql", import.meta.url), "utf8"),
  readFile(new URL("../functions/api/twilio/inbound.js", import.meta.url), "utf8"),
  readFile(new URL("../workers/module-automation-runner.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8")
]);

for (const table of [
  "rcs_sms_conversations",
  "rcs_sms_messages",
  "rcs_sms_action_grants",
  "rcs_sms_requests",
  "rcs_sms_tool_runs",
  "rcs_sms_events"
]) {
  assert.match(messageMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(messageMigration, /UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_messages_twilio_sid/);
assert.match(reviewGrantMigration, /CREATE TABLE IF NOT EXISTS rcs_sms_review_send_grants/);
assert.match(reviewGrantMigration, /WHERE status IN \('confirmation_pending', 'claimed'\)/);
assert.match(ruleMigration, /'rcs-sms-autopilot-async-processing'[\s\S]*?'inactive'/);
assert.match(ruleMigration, /'rcs-sms-autopilot-retry-runner'[\s\S]*?'inactive'/);

const authIndex = inboundSource.indexOf("const auth = await requireTwilioWebhookAuth");
const storeIndex = inboundSource.indexOf("const result = await processCustomerInboundMessage");
const autopilotIndex = inboundSource.indexOf("await ingestAndScheduleRcsSmsAutopilot");
assert.ok(authIndex >= 0 && storeIndex > authIndex && autopilotIndex > storeIndex);
assert.match(inboundSource, /context\?\.waitUntil/);
assert.match(workerSource, /rcs_sms_autopilot_retry\.failed_isolated/);
assert.match(appSource, /Zprávy RCS a SMS/);
assert.match(appSource, /Odpovědi zákazníků a uživatelů na jednom místě/);
assert.doesNotMatch(appSource.slice(
  appSource.indexOf('if (moduleItem.id === RCS_SMS_AUTOPILOT_MODULE_KEY)'),
  appSource.indexOf("const title = isDashboard")
), /toggleOnly: true|rcs-sms-autopilot-retry-runner|RCS\/SMS Autopilot Šarlota/);
assert.match(cssSource, /@media \(max-width: 1180px\)/);
assert.match(cssSource, /@media \(max-width: 900px\)/);
assert.match(cssSource, /@media \(max-width: 560px\)/);
assert.match(cssSource, /\.rcs-inbox-send-confirmation/);
assert.match(cssSource, /env\(safe-area-inset-bottom\)/);
assert.match(cssSource, /\.rcs-inbox-workspace\.has-selection \.rcs-inbox-sidebar/);
assert.match(
  cssSource,
  /@media \(max-width: 560px\)[\s\S]*?\.rcs-inbox-composer[\s\S]*?position: sticky/
);
assert.match(envExample, /RCS_SMS_AUTOPILOT_MODE=off/);
assert.doesNotMatch(envExample, /VITE_RCS_SMS_AUTOPILOT/);

console.log("RCS/SMS Autopilot tests passed.");
