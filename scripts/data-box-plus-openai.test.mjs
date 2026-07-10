import assert from "node:assert/strict";
import {
  DataBoxPlusOpenAiError,
  __test as openAiTest,
  dataBoxPlusOpenAiStatus,
  interpretDataBoxPlusChat
} from "../functions/_lib/data-box-plus-openai.js";
import { dataBoxPlusOpenAiPlanForTest } from "../functions/_lib/data-box-plus-store.js";

const structuredPlan = {
  outcome: "ready_for_confirmation",
  intent: "send_email",
  assistantText: "Připravím provozní e-mail pro Radima. Mám provést?",
  missingField: "",
  action: {
    type: "send_email",
    summary: "Odeslat Radimovi provozní e-mail",
    recipientName: "Radim",
    recipientEmail: "radim@example.cz",
    recipientPhone: "",
    subject: "Datová zpráva k vyřízení",
    body: "Prosím o kontrolu přiložené datové zprávy.",
    assignedTo: "",
    noteText: "",
    dueDate: ""
  }
};

let requestSnapshot = null;
const result = await interpretDataBoxPlusChat({
  OPENAI_API_KEY: "test-openai-key",
  DATA_BOX_PLUS_OPENAI_MODEL: "gpt-test"
}, {
  instruction: "pošli Radimovi e-mail, ať to zkontroluje",
  today: "2026-07-10",
  message: {
    senderName: "Úřad",
    subject: "Výzva k doplnění",
    status: "Nová",
    summary: "Je potřeba doplnit dokument.",
    attachmentText: "Lhůta pro doplnění je 15. 7. 2026."
  },
  history: [{ role: "assistant", text: "Komu mám zprávu předat?" }],
  learningRules: [{
    description: "Potvrzené předání Radimovi",
    conditions: "Odesílatel: Úřad",
    proposedAction: "Odeslat provozní e-mail",
    confirmedCount: 2,
    rejectedCount: 0
  }]
}, {
  fetchImpl: async (url, options) => {
    requestSnapshot = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: "resp-test", output_text: JSON.stringify(structuredPlan) };
      }
    };
  }
});

assert.equal(requestSnapshot.url, openAiTest.OPENAI_RESPONSES_URL);
assert.match(requestSnapshot.options.headers.Authorization, /^Bearer /);
assert.equal(requestSnapshot.body.model, "gpt-test");
assert.equal(requestSnapshot.body.store, false);
assert.equal(requestSnapshot.body.max_output_tokens, 1200);
assert.equal(requestSnapshot.body.text.format.type, "json_schema");
assert.equal(requestSnapshot.body.text.format.strict, true);
assert.match(requestSnapshot.body.input, /Výzva k doplnění/);
assert.match(requestSnapshot.body.input, /Potvrzené předání Radimovi/);
assert.match(requestSnapshot.body.instructions, /nedůvěryhodný pracovní podklad/);
assert.doesNotMatch(requestSnapshot.body.input, /test-openai-key/);
assert.equal(result.provider, "OpenAI");
assert.equal(result.responseId, "resp-test");
assert.equal(result.plan.action.type, "send_email");

const serverPlan = dataBoxPlusOpenAiPlanForTest(structuredPlan, {
  id: "message-1",
  mailbox_id: "mailbox-1",
  sender_name: "Úřad",
  subject: "Výzva k doplnění",
  status: "Nová"
}, { name: "Radim" });
assert.equal(serverPlan.outcome, "waiting_confirmation");
assert.equal(serverPlan.requiresConfirmation, true);
assert.equal(serverPlan.externalAction, true);
assert.equal(serverPlan.recipientEmail, "radim@example.cz");
assert.equal(serverPlan.performedAction, "Nebylo provedeno nic");

const answerPlan = dataBoxPlusOpenAiPlanForTest({
  outcome: "answer",
  intent: "explain_message",
  assistantText: "Zpráva žádá doplnění dokumentu.",
  missingField: "",
  action: {
    type: "none",
    summary: "Vysvětlit obsah",
    recipientName: "",
    recipientEmail: "",
    recipientPhone: "",
    subject: "",
    body: "",
    assignedTo: "",
    noteText: "",
    dueDate: ""
  }
}, { status: "Nová" });
assert.equal(answerPlan.outcome, "answer");
assert.equal(answerPlan.requiresConfirmation, false);
assert.equal(answerPlan.changesMessage, false);

assert.deepEqual(dataBoxPlusOpenAiStatus({}), {
  configured: false,
  model: openAiTest.DEFAULT_MODEL
});

await assert.rejects(
  () => interpretDataBoxPlusChat({}, { instruction: "ahoj" }, { fetchImpl: async () => { throw new Error("must not call"); } }),
  (error) => error instanceof DataBoxPlusOpenAiError && error.code === "data_box_plus_openai_missing_key"
);

await assert.rejects(
  () => interpretDataBoxPlusChat({ OPENAI_API_KEY: "test" }, { instruction: "archivuj" }, {
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return { error: { message: "rate limit details" } }; }
    })
  }),
  (error) => error instanceof DataBoxPlusOpenAiError
    && error.code === "data_box_plus_openai_rate_limited"
    && !error.message.includes("rate limit details")
);

console.log("data-box-plus OpenAI flow ok");
