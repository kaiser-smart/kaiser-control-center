import assert from "node:assert/strict";
import {
  DataBoxPlusStoreError,
  executeDataBoxPlusMessageInstruction
} from "../functions/_lib/data-box-plus-store.js";

function normalizedSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = normalizedSql(sql);
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

  run() {
    return this.database.run(this.sql, this.bindings);
  }
}

class FakeD1 {
  constructor(options = {}) {
    this.message = {
      id: "message-1",
      mailbox_id: "mailbox-1",
      isds_message_id: "isds-1",
      sender_name: "Městský úřad",
      sender_box_id: "sender-box-1",
      recipient_box_id: "recipient-box-1",
      subject: "Výzva k doplnění",
      delivered_at: "2026-07-10T06:00:00.000Z",
      received_at: "2026-07-10T06:00:00.000Z",
      status: "Nová",
      risk_level: "Běžné",
      priority: "Běžná",
      due_date: "",
      suggested_action: "Zkontrolovat",
      primary_action: "Otevřít zprávu",
      assigned_to: "",
      archive_status: "active",
      attachment_status: "Dostupná",
      summary_loaded: 1,
      summary: "Úřad žádá doplnění dokumentu.",
      summary_source: "metadata",
      facts_json: "[]"
    };
    this.actionLogs = [];
    this.rules = [];
    this.messageMutationCount = 0;
    this.failMessageUpdates = options.failMessageUpdates === true;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async first(sql, bindings) {
    if (sql.includes("FROM data_box_plus_messages") && sql.includes("WHERE id = ?")) {
      return bindings[0] === this.message.id ? { ...this.message } : null;
    }
    if (sql.includes("FROM data_box_plus_action_log") && sql.includes("result = 'waiting_confirmation'")) {
      return [...this.actionLogs]
        .reverse()
        .find((row) => row.message_id === bindings[0] && row.actor === bindings[1] && row.result === "waiting_confirmation") || null;
    }
    if (sql.includes("FROM data_box_plus_action_log") && sql.includes("WHERE id = ?")) {
      return this.actionLogs.find((row) => (
        row.id === bindings[0]
        && row.message_id === bindings[1]
        && row.actor === bindings[2]
      )) || null;
    }
    if (sql.includes("SUM(CASE WHEN status")) {
      return { new_count: 1, due_count: 0, problem_count: 0 };
    }
    return null;
  }

  async all(sql, bindings) {
    if (sql.includes("FROM data_box_plus_attachments")) return { results: [] };
    if (sql.includes("FROM data_box_plus_rules")) return { results: this.rules.map((rule) => ({ ...rule })) };
    if (sql.includes("FROM data_box_plus_action_log")) {
      const rows = this.actionLogs
        .filter((row) => row.message_id === bindings[0])
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
      return { results: rows.map((row) => ({ ...row })) };
    }
    return { results: [] };
  }

  async run(sql, bindings) {
    if (sql.includes("INSERT INTO data_box_plus_action_log") && sql.includes("'Chatový pokyn'")) {
      this.actionLogs.push({
        id: bindings[0],
        message_id: bindings[1],
        recommendation_id: null,
        actor: bindings[2],
        action_type: "Chatový pokyn",
        action_payload: bindings[3],
        created_at: bindings[4],
        result: bindings[5],
        audit_note: bindings[6]
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes("SET result = 'executing'")) {
      const row = this.actionLogs.find((item) => (
        item.id === bindings[1]
        && item.message_id === bindings[2]
        && item.actor === bindings[3]
        && item.result === "waiting_confirmation"
      ));
      if (!row) return { success: true, meta: { changes: 0 } };
      row.result = "executing";
      row.audit_note = bindings[0];
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes("SET result = 'confirmed'")) {
      const row = this.actionLogs.find((item) => item.id === bindings[1] && item.result === "executing");
      if (row) {
        row.result = "confirmed";
        row.audit_note = bindings[0];
      }
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }

    if (sql.includes("SET result = ?, audit_note = ?") && sql.includes("result = 'needs_input'")) {
      for (const row of this.actionLogs) {
        if (row.message_id === bindings[2] && row.actor === bindings[3] && row.result === "needs_input") {
          row.result = bindings[0];
          row.audit_note = bindings[1];
        }
      }
      return { success: true, meta: { changes: 0 } };
    }

    if (sql.includes("UPDATE data_box_plus_messages") && sql.includes("SET status = CASE")) {
      if (this.failMessageUpdates) throw new Error("message update unavailable");
      if (bindings[0]) this.message.status = bindings[1];
      if (bindings[2]) this.message.archive_status = bindings[3];
      if (bindings[4]) this.message.assigned_to = bindings[5];
      if (bindings[6]) this.message.due_date = bindings[7];
      if (bindings[8]) this.message.suggested_action = bindings[9];
      if (bindings[10]) this.message.primary_action = bindings[11];
      this.messageMutationCount += 1;
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes("UPDATE data_box_plus_messages") && sql.includes("SET status = 'Odesláno e-mailem'")) {
      this.message.status = "Odesláno e-mailem";
      this.message.assigned_to = bindings[0];
      this.message.suggested_action = bindings[1];
      this.messageMutationCount += 1;
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes("UPDATE data_box_plus_messages") && sql.includes("SET status = 'Odesláno datovou schránkou'")) {
      this.message.status = "Odesláno datovou schránkou";
      this.message.assigned_to = bindings[0];
      this.messageMutationCount += 1;
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes("INSERT INTO data_box_plus_rules")) {
      const existing = this.rules.find((rule) => rule.id === bindings[0]);
      if (existing) {
        existing.confirmed_count += 1;
        existing.success_count += 1;
      } else {
        this.rules.push({
          id: bindings[0],
          human_description: bindings[2],
          conditions_text: bindings[3],
          proposed_action: bindings[4],
          confirmed_count: 1,
          success_count: 1,
          reject_count: 0,
          status: "Učí se",
          type: "Učící vzor",
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      return { success: true, meta: { changes: 1 } };
    }

    return { success: true, meta: { changes: 1 } };
  }
}

const database = new FakeD1();
const env = {
  SMART_ODPADY_DB: database,
  OPENAI_API_KEY: "test-openai-key",
  DATA_BOX_PLUS_OPENAI_MODEL: "gpt-test"
};
const currentUser = { id: "user-1", name: "Radim" };
const originalFetch = globalThis.fetch;
let openAiRequestCount = 0;
let sendGridRequestCount = 0;
let lastSendGridPayload = null;
let dataBoxRequestCount = 0;
let lastDataBoxPayload = null;
let dataBoxShouldFail = false;
let currentOpenAiPlan = {
  outcome: "ready_for_confirmation",
  intent: "mark_done",
  assistantText: "Zprávu označím jako vyřízenou. Mám provést?",
  missingField: "",
  action: {
    type: "mark_done",
    summary: "Označit zprávu jako vyřízenou",
    recipientName: "",
    recipientEmail: "",
    recipientPhone: "",
    recipientDataBoxId: "",
    subject: "",
    body: "",
    assignedTo: "",
    noteText: "",
    dueDate: ""
  }
};
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === "https://data-box.test/reply") {
    dataBoxRequestCount += 1;
    lastDataBoxPayload = JSON.parse(options.body);
    if (dataBoxShouldFail) {
      return new Response(JSON.stringify({ error: "Datová schránka je dočasně nedostupná." }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ success: true, sentMessageId: "isds-sent-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (String(url).includes("api.sendgrid.com")) {
    sendGridRequestCount += 1;
    lastSendGridPayload = JSON.parse(options.body);
    return new Response("", { status: 202, headers: { "x-message-id": "sendgrid-test-1" } });
  }
  openAiRequestCount += 1;
  return new Response(JSON.stringify({
    id: "response-confirmation-test",
    output_text: JSON.stringify(currentOpenAiPlan)
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

try {
  const proposal = await executeDataBoxPlusMessageInstruction(env, database.message.id, currentUser, {
    instruction: "označ zprávu jako vyřízenou"
  });
  assert.equal(proposal.status, "waiting_confirmation");
  assert.equal(proposal.action.requiresConfirmation, true);
  assert.equal(database.message.status, "Nová");
  assert.equal(database.messageMutationCount, 0);
  assert.equal(openAiRequestCount, 1);

  const confirmationId = proposal.action.confirmationId;
  assert.ok(confirmationId);
  const confirmed = await executeDataBoxPlusMessageInstruction(env, database.message.id, currentUser, {
    instruction: "ano",
    confirmationId
  });
  assert.equal(confirmed.status, "done");
  assert.equal(confirmed.action.outcome, "done");
  assert.equal(database.message.status, "Vyřešeno");
  assert.equal(database.messageMutationCount, 1);
  assert.equal(database.rules.length, 1);
  assert.equal(database.rules[0].confirmed_count, 1);
  assert.equal(openAiRequestCount, 1);

  await assert.rejects(
    () => executeDataBoxPlusMessageInstruction(env, database.message.id, currentUser, {
      instruction: "ano",
      confirmationId
    }),
    (error) => error instanceof DataBoxPlusStoreError
      && error.code === "data_box_plus_confirmation_already_used"
  );
  assert.equal(database.messageMutationCount, 1);
  assert.equal(openAiRequestCount, 1);

  const emailDatabase = new FakeD1();
  const emailEnv = {
    ...env,
    SMART_ODPADY_DB: emailDatabase,
    EMAIL_PROVIDER: "sendgrid",
    SENDGRID_API_KEY: "test-sendgrid-key"
  };
  currentOpenAiPlan = {
    outcome: "ready_for_confirmation",
    intent: "prepare_reply",
    assistantText: "Připravím předání na faktury. Mám provést?",
    missingField: "",
    action: {
      type: "prepare_reply",
      summary: "Připravit předání na faktury",
      recipientName: "",
      recipientEmail: "faktury@kaiserservis.cz",
      recipientPhone: "",
      recipientDataBoxId: "",
      subject: "ZÁPOČET_příkaz",
      body: "Návrh odpovědi",
      assignedTo: "",
      noteText: "",
      dueDate: ""
    }
  };
  emailDatabase.message.subject = "ZÁPOČET_příkaz";
  const emailProposal = await executeDataBoxPlusMessageInstruction(emailEnv, emailDatabase.message.id, currentUser, {
    instruction: "přepsání zprávy na faktury@kaiserservis.cz"
  });
  assert.equal(emailProposal.status, "waiting_confirmation");
  assert.equal(emailProposal.action.actionType, "send_email");
  assert.equal(emailProposal.action.proposedAction.type, "send_email");
  assert.equal(sendGridRequestCount, 0);
  assert.doesNotMatch(emailProposal.notice, /návrh/i);

  const emailConfirmed = await executeDataBoxPlusMessageInstruction(emailEnv, emailDatabase.message.id, currentUser, {
    instruction: "ano",
    confirmationId: emailProposal.action.confirmationId
  });
  assert.equal(emailConfirmed.status, "done");
  assert.equal(emailDatabase.message.status, "Odesláno e-mailem");
  assert.equal(sendGridRequestCount, 1);
  assert.equal(lastSendGridPayload.personalizations[0].to[0].email, "faktury@kaiserservis.cz");
  assert.match(emailConfirmed.notice, /E-mail byl odeslán na faktury@kaiserservis\.cz/);
  await assert.rejects(
    () => executeDataBoxPlusMessageInstruction(emailEnv, emailDatabase.message.id, currentUser, {
      instruction: "ano",
      confirmationId: emailProposal.action.confirmationId
    }),
    (error) => error instanceof DataBoxPlusStoreError
      && error.code === "data_box_plus_confirmation_already_used"
  );
  assert.equal(sendGridRequestCount, 1);

  const dataBoxDatabase = new FakeD1();
  const dataBoxEnv = {
    ...env,
    SMART_ODPADY_DB: dataBoxDatabase,
    DATA_BOX_REPLY_ENDPOINT: "https://data-box.test/reply",
    DATA_BOX_REPLY_API_KEY: "test-data-box-key"
  };
  currentOpenAiPlan = {
    outcome: "ready_for_confirmation",
    intent: "send_data_box_reply",
    assistantText: "Odešlu odpověď přes datovou schránku. Mám provést?",
    missingField: "",
    action: {
      type: "send_data_box_reply",
      summary: "Odeslat odpověď přes datovou schránku",
      recipientName: "Městský úřad",
      recipientEmail: "",
      recipientPhone: "",
      recipientDataBoxId: "sender-box-1",
      subject: "Re: Výzva k doplnění",
      body: "Potvrzujeme přijetí výzvy.",
      assignedTo: "",
      noteText: "",
      dueDate: ""
    }
  };
  const dataBoxProposal = await executeDataBoxPlusMessageInstruction(dataBoxEnv, dataBoxDatabase.message.id, currentUser, {
    instruction: "odpověz datovou schránkou: Potvrzujeme přijetí výzvy."
  });
  assert.equal(dataBoxProposal.status, "waiting_confirmation");
  assert.equal(dataBoxProposal.action.actionType, "send_data_box_reply");
  assert.equal(dataBoxRequestCount, 0);
  const dataBoxConfirmed = await executeDataBoxPlusMessageInstruction(dataBoxEnv, dataBoxDatabase.message.id, currentUser, {
    instruction: "ano",
    confirmationId: dataBoxProposal.action.confirmationId
  });
  assert.equal(dataBoxConfirmed.status, "done");
  assert.equal(dataBoxDatabase.message.status, "Odesláno datovou schránkou");
  assert.equal(dataBoxRequestCount, 1);
  assert.equal(lastDataBoxPayload.recipientDataBoxId, "sender-box-1");
  assert.equal(lastDataBoxPayload.body, "Potvrzujeme přijetí výzvy.");
  assert.match(dataBoxConfirmed.notice, /odeslána do datové schránky sender-box-1/);
  await assert.rejects(
    () => executeDataBoxPlusMessageInstruction(dataBoxEnv, dataBoxDatabase.message.id, currentUser, {
      instruction: "ano",
      confirmationId: dataBoxProposal.action.confirmationId
    }),
    (error) => error instanceof DataBoxPlusStoreError
      && error.code === "data_box_plus_confirmation_already_used"
  );
  assert.equal(dataBoxRequestCount, 1);

  const failedDataBoxDatabase = new FakeD1();
  const failedDataBoxEnv = {
    ...dataBoxEnv,
    SMART_ODPADY_DB: failedDataBoxDatabase
  };
  dataBoxShouldFail = true;
  const failedDataBoxProposal = await executeDataBoxPlusMessageInstruction(
    failedDataBoxEnv,
    failedDataBoxDatabase.message.id,
    currentUser,
    { instruction: "odpověz datovou schránkou: Potvrzujeme přijetí výzvy." }
  );
  await assert.rejects(
    () => executeDataBoxPlusMessageInstruction(
      failedDataBoxEnv,
      failedDataBoxDatabase.message.id,
      currentUser,
      {
        instruction: "ano",
        confirmationId: failedDataBoxProposal.action.confirmationId
      }
    ),
    (error) => error instanceof DataBoxPlusStoreError
      && error.code === "data_box_plus_ds_send_failed"
  );
  assert.equal(failedDataBoxDatabase.message.status, "Nová");
  assert.equal(failedDataBoxDatabase.rules.length, 0);
  assert.equal(failedDataBoxDatabase.actionLogs.some((row) => row.result === "failed"), true);
  assert.equal(dataBoxRequestCount, 2);
  dataBoxShouldFail = false;

  const failedDatabase = new FakeD1({ failMessageUpdates: true });
  const failedEnv = { ...env, SMART_ODPADY_DB: failedDatabase };
  currentOpenAiPlan = {
    outcome: "ready_for_confirmation",
    intent: "mark_done",
    assistantText: "Zprávu označím jako vyřízenou. Mám provést?",
    missingField: "",
    action: {
      type: "mark_done",
      summary: "Označit zprávu jako vyřízenou",
      recipientName: "",
      recipientEmail: "",
      recipientPhone: "",
      recipientDataBoxId: "",
      subject: "",
      body: "",
      assignedTo: "",
      noteText: "",
      dueDate: ""
    }
  };
  const failedProposal = await executeDataBoxPlusMessageInstruction(failedEnv, failedDatabase.message.id, currentUser, {
    instruction: "označ zprávu jako vyřízenou"
  });
  await assert.rejects(
    () => executeDataBoxPlusMessageInstruction(failedEnv, failedDatabase.message.id, currentUser, {
      instruction: "ano",
      confirmationId: failedProposal.action.confirmationId
    }),
    (error) => error instanceof DataBoxPlusStoreError
      && error.code === "data_box_plus_confirmation_failed"
  );
  assert.equal(failedDatabase.rules.length, 0);
  assert.equal(failedDatabase.actionLogs.some((row) => row.result === "failed"), true);
  assert.equal(openAiRequestCount, 5);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("data-box-plus confirmation flow ok");
