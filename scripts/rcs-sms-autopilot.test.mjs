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
  runRcsSmsAutopilotRetry
} from "../functions/_lib/rcs-sms-autopilot-service.js";
import { __test as toolsTest } from "../functions/_lib/rcs-sms-autopilot-tools.js";
import {
  __test as storeTest,
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
  const sqlite = new DatabaseSync(":memory:");
  for (const migrationName of [
    "0001_create_users.sql",
    "0004_create_employee_cards.sql",
    "0015_create_module_rules.sql",
    "0016_create_module_automation_runner_runs.sql",
    "0027_create_receivables_core.sql",
    "0032_create_customer_messaging.sql",
    "0062_create_rcs_template_center.sql",
    "0063_create_rcs_sms_autopilot.sql"
  ]) {
    applyMigration(sqlite, migrationName);
  }
  sqlite.prepare(`
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
  sqlite.prepare(`
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
    SMART_ODPADY_DB: new D1Database(sqlite),
    RCS_SMS_AUTOPILOT_MODE: "off",
    KSO_CUSTOMER_MESSAGING_MODE: "off"
  };
  assert.equal(
    await serviceTest.automationRuleActive(integrationEnv, serviceTest.ASYNC_RULE_ID),
    false
  );
  sqlite.prepare("UPDATE module_rules SET status = 'active' WHERE id = ?")
    .run(serviceTest.ASYNC_RULE_ID);
  assert.equal(
    await serviceTest.automationRuleActive(integrationEnv, serviceTest.ASYNC_RULE_ID),
    true
  );
  sqlite.prepare("UPDATE module_rules SET status = 'inactive' WHERE id = ?")
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
    sqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_action_grants WHERE outbound_message_sid = ?").get("SM_GRANT_AUTOPILOT_TEST").total,
    3
  );
  sqlite.prepare(`
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
    integrationEnv.SMART_ODPADY_DB,
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
  const stored = sqlite.prepare(
    "SELECT status, sender_type, related_outbound_message_sid, processing_attempts FROM rcs_sms_messages WHERE twilio_message_sid = ?"
  ).get("SM_INBOUND_AUTOPILOT_TEST");
  assert.equal(stored.status, "autopilot_disabled");
  assert.equal(stored.sender_type, "employee");
  assert.equal(stored.related_outbound_message_sid, "SM_OUTBOUND_AUTOPILOT_TEST");
  assert.equal(stored.processing_attempts, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_tool_runs").get().total, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'").get().total, 0);
  sqlite.prepare(`
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

  integrationEnv.RCS_SMS_AUTOPILOT_MODE = "live";
  const blankPending = [];
  await ingestAndScheduleRcsSmsAutopilot(integrationEnv, {
    From: "+420999123456",
    Body: "",
    MessageSid: "SM_INBOUND_AUTOPILOT_BLANK"
  }, (promise) => blankPending.push(promise));
  await Promise.all(blankPending);
  const blankStored = sqlite.prepare(
    "SELECT status, response_mode FROM rcs_sms_messages WHERE twilio_message_sid = ?"
  ).get("SM_INBOUND_AUTOPILOT_BLANK");
  assert.equal(blankStored.status, "awaiting_field");
  assert.equal(blankStored.response_mode, "none");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE direction = 'outbound'").get().total,
    0,
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
    sqlite.prepare("SELECT COUNT(*) AS total FROM rcs_sms_messages WHERE twilio_message_sid = ?").get("SM_INBOUND_AUTOPILOT_TEST").total,
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
    sqlite.prepare("SELECT status FROM rcs_sms_messages WHERE twilio_message_sid = ?").get("SM_INBOUND_AUTOPILOT_STOP").status,
    "blocked"
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS total FROM customer_message_opt_out WHERE phone = ?").get("+420888123456").total,
    1
  );
  const runner = await runRcsSmsAutopilotRetry(integrationEnv, {
    scheduledTime: Date.parse("2026-07-25T10:15:00.000Z"),
    triggeredBy: "test"
  });
  assert.equal(runner.mode, "off");
  assert.equal(runner.status, "skipped");
  assert.equal(sqlite.prepare(
    "SELECT status FROM module_automation_runner_runs WHERE module_key = 'rcs-sms-autopilot' ORDER BY started_at DESC LIMIT 1"
  ).get().status, "skipped");
  sqlite.close();
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

const moduleItem = modules.find((item) => item.id === "rcs-sms-autopilot");
assert.equal(moduleItem?.route, "/rcs-sms-konverzace");
assert.equal(moduleItem?.status, "Výchozí vypnuto");
assert.equal(uiTest.modeLabel("off"), "Vypnuto");
assert.equal(uiTest.statusLabel("human_takeover"), "Předáno člověku");

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
  mode: "off",
  counts: { conversations: 1 },
  openAi: { configured: false },
  twilio: { twilioConfigured: false },
  asyncProcessing: { active: false },
  retryRunner: { active: false, cron: "*/5 * * * *" },
  outboundEffects: "disabled"
};
const ui = rcsSmsAutopilotContent({ canManage: true, rulesHtml: "<section>rules</section>" });
assert.match(ui, /Společná schránka odpovědí/);
assert.match(ui, /Pravdivý provozní stav/);
assert.match(ui, /Seznam pravidel|rules/);
assert.doesNotMatch(ui, /<script>alert/);
assert.match(ui, /&lt;script&gt;alert/);

const [
  migration,
  inboundSource,
  workerSource,
  appSource,
  cssSource,
  envExample
] = await Promise.all([
  readFile(new URL("../migrations/0063_create_rcs_sms_autopilot.sql", import.meta.url), "utf8"),
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
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_rcs_sms_messages_twilio_sid/);
assert.match(migration, /'rcs-sms-autopilot-async-processing'[\s\S]*?'inactive'/);
assert.match(migration, /'rcs-sms-autopilot-retry-runner'[\s\S]*?'inactive'/);

const authIndex = inboundSource.indexOf("const auth = await requireTwilioWebhookAuth");
const storeIndex = inboundSource.indexOf("const result = await processCustomerInboundMessage");
const autopilotIndex = inboundSource.indexOf("await ingestAndScheduleRcsSmsAutopilot");
assert.ok(authIndex >= 0 && storeIndex > authIndex && autopilotIndex > storeIndex);
assert.match(inboundSource, /context\?\.waitUntil/);
assert.match(workerSource, /rcs_sms_autopilot_retry\.failed_isolated/);
assert.match(appSource, /toggleOnly: true/);
assert.match(appSource, /rcs-sms-autopilot-retry-runner/);
assert.match(cssSource, /@media \(max-width: 1180px\)/);
assert.match(cssSource, /@media \(max-width: 900px\)/);
assert.match(cssSource, /@media \(max-width: 560px\)/);
assert.match(envExample, /RCS_SMS_AUTOPILOT_MODE=off/);
assert.doesNotMatch(envExample, /VITE_RCS_SMS_AUTOPILOT/);

console.log("RCS/SMS Autopilot tests passed.");
