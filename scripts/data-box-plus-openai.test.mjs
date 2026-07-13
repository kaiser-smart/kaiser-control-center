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
    recipientDataBoxId: "",
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
  currentUser: { name: "Radim Opluštil", email: "oplustil@kaiserservis.cz", role: "admin" },
  knownUsers: [{ name: "Radim Opluštil", email: "oplustil@kaiserservis.cz", department: "Vedení společnosti" }],
  appContext: { name: "Kaiser Smart", modules: [{ id: "fleet", title: "Vozidla", route: "/vozovy-park" }] },
  message: {
    senderName: "Úřad",
    subject: "Výzva k doplnění",
    status: "Nová",
    summary: "Je potřeba doplnit dokument.",
    attachmentText: "Lhůta pro doplnění je 15. 7. 2026."
  },
  history: [{ role: "assistant", text: "Komu mám zprávu předat?", state: "superseded" }],
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
assert.equal(requestSnapshot.body.max_output_tokens, 3000);
assert.equal(requestSnapshot.body.text.format.type, "json_schema");
assert.equal(requestSnapshot.body.text.format.strict, true);
assert.match(requestSnapshot.body.input, /Výzva k doplnění/);
assert.match(requestSnapshot.body.input, /Potvrzené předání Radimovi/);
assert.match(requestSnapshot.body.input, /oplustil@kaiserservis\.cz/);
assert.match(requestSnapshot.body.input, /Kaiser Smart/);
assert.match(requestSnapshot.body.input, /\/vozovy-park/);
assert.match(requestSnapshot.body.input, /superseded/);
assert.match(requestSnapshot.body.instructions, /nedůvěryhodný pracovní podklad/);
assert.match(requestSnapshot.body.instructions, /skutečný úkon, ne přípravu návrhu/);
assert.match(requestSnapshot.body.instructions, /připrav odvolání/);
assert.match(requestSnapshot.body.instructions, /Nežádej uživatele, aby ti text poslal/);
assert.match(requestSnapshot.body.instructions, /neopakuj stejnou otázku/);
assert.doesNotMatch(requestSnapshot.body.input, /test-openai-key/);
assert.equal(result.provider, "OpenAI");
assert.equal(result.responseId, "resp-test");
assert.equal(result.plan.action.type, "send_email");

const fleetAnswerPlan = {
  outcome: "answer",
  intent: "fleet_lookup",
  assistantText: "Řidič Opluštil má přiřazená vozidla KS 101 a KS 204.",
  missingField: "",
  action: {
    type: "none",
    summary: "Vypsat ověřená vozidla řidiče",
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
const fleetRequests = [];
const fleetToolCalls = [];
const fleetResult = await interpretDataBoxPlusChat({
  OPENAI_API_KEY: "test-openai-key",
  DATA_BOX_PLUS_OPENAI_MODEL: "gpt-test"
}, {
  instruction: "ano",
  availableTools: ["get_current_user_profile", "search_fleet_vehicles_by_driver"],
  history: [
    { role: "user", text: "vyjmenuj vozidla u kterých je řidič Opluštil", state: "answer" },
    { role: "assistant", text: "Mohu dohledat vozidla v modulu Vozidla podle řidiče Opluštil.", state: "answer" }
  ],
  currentUser: { name: "Radim Opluštil", email: "oplustil@kaiserservis.cz" },
  appContext: { name: "Kaiser Smart", modules: [{ id: "fleet", title: "Vozidla", route: "/vozovy-park" }] },
  message: { subject: "Informativní zpráva" }
}, {
  async executeTool(call) {
    fleetToolCalls.push(call);
    return {
      ok: true,
      verified: true,
      readOnly: true,
      driverName: "Opluštil",
      count: 2,
      vehicles: [
        { label: "KS 101", licensePlate: "1AB 0101" },
        { label: "KS 204", licensePlate: "2AB 0204" }
      ]
    };
  },
  fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    fleetRequests.push(body);
    if (fleetRequests.length === 1) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: "resp-fleet-tool",
            output: [{
              type: "function_call",
              call_id: "call-fleet-1",
              name: "search_fleet_vehicles_by_driver",
              arguments: JSON.stringify({ driverName: "Opluštil" })
            }]
          };
        }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: "resp-fleet-final", output_text: JSON.stringify(fleetAnswerPlan) };
      }
    };
  }
});
assert.equal(fleetRequests.length, 2);
assert.deepEqual(fleetRequests[0].tool_choice, { type: "function", name: "search_fleet_vehicles_by_driver" });
assert.equal(fleetRequests[0].parallel_tool_calls, false);
assert.equal(fleetRequests[1].tool_choice, "none");
assert.ok(Array.isArray(fleetRequests[1].input));
assert.match(JSON.stringify(fleetRequests[1].input), /function_call_output/);
assert.match(JSON.stringify(fleetRequests[1].input), /KS 101/);
assert.deepEqual(fleetToolCalls, [{ name: "search_fleet_vehicles_by_driver", arguments: { driverName: "Opluštil" } }]);
assert.deepEqual(fleetResult.usedTools, ["search_fleet_vehicles_by_driver"]);
assert.equal(fleetResult.plan.action.type, "none");

const forcedAppealRequest = openAiTest.requestPayload("gpt-test", {
  instruction: "připrav odvolání",
  message: { subject: "Příkaz - Kaiser servis, spol. s r.o." },
  history: []
});
assert.deepEqual(forcedAppealRequest.text.format.schema.properties.outcome.enum, ["answer"]);
assert.deepEqual(forcedAppealRequest.text.format.schema.properties.action.properties.type.enum, ["prepare_reply"]);
assert.equal(forcedAppealRequest.text.format.schema.properties.action.properties.body.minLength, 1);
assert.match(forcedAppealRequest.input, /"serverIntent"/);
assert.match(forcedAppealRequest.input, /\[DOPLNIT\]/);

assert.equal(openAiTest.draftDocumentRequest({
  instruction: "připrav",
  history: [
    { role: "user", text: "připrav odvolání" },
    { role: "assistant", text: "Mám připravit odvolání, nebo mi pošlete jeho text?" }
  ]
}), true);

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

const misclassifiedForward = {
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
const correctedForward = dataBoxPlusOpenAiPlanForTest(misclassifiedForward, {
  id: "message-forward",
  mailbox_id: "dbp-kaiser-technology",
  sender_name: "Kaiser technology",
  subject: "ZÁPOČET_příkaz",
  status: "Nová"
}, { name: "Radim" }, "přepsání zprávy na faktury@kaiserservis.cz");
assert.equal(correctedForward.actionType, "send_email");
assert.equal(correctedForward.outcome, "waiting_confirmation");
assert.equal(correctedForward.requiresConfirmation, true);
assert.equal(correctedForward.recipientEmail, "faktury@kaiserservis.cz");
assert.match(correctedForward.assistantText, /Odešlu datovou zprávu e-mailem/);
assert.doesNotMatch(correctedForward.assistantText, /návrh/i);

const selfForward = dataBoxPlusOpenAiPlanForTest(misclassifiedForward, {
  id: "message-self-forward",
  subject: "Kapacita Datového trezoru",
  status: "Nová"
}, { name: "Radim Opluštil", email: "oplustil@kaiserservis.cz" }, "přepošli na můj mail");
assert.equal(selfForward.actionType, "send_email");
assert.equal(selfForward.outcome, "waiting_confirmation");
assert.equal(selfForward.recipientEmail, "oplustil@kaiserservis.cz");
assert.equal(selfForward.recipientName, "Radim Opluštil");
assert.doesNotMatch(selfForward.assistantText, /Komu|chybí/i);

const explicitDraft = dataBoxPlusOpenAiPlanForTest(misclassifiedForward, {
  id: "message-draft",
  subject: "ZÁPOČET_příkaz",
  status: "Nová"
}, { name: "Radim" }, "připrav návrh odpovědi bez odeslání");
assert.equal(explicitDraft.actionType, "prepare_reply");
assert.equal(explicitDraft.outcome, "draft_ready");
assert.equal(explicitDraft.requiresConfirmation, false);

const appealDraft = dataBoxPlusOpenAiPlanForTest({
  outcome: "answer",
  intent: "prepare_appeal",
  assistantText: "Připravil jsem návrh odvolání.",
  missingField: "",
  action: {
    type: "prepare_reply",
    summary: "Připravit odvolání proti příkazu",
    recipientName: "",
    recipientEmail: "",
    recipientPhone: "",
    recipientDataBoxId: "",
    subject: "Odvolání proti příkazu",
    body: "Odvolání proti příkazu\n\nKaiser servis, spol. s r.o. podává v zákonné lhůtě odvolání.\n\n[DOPLNIT: konkrétní odvolací důvody]",
    assignedTo: "",
    noteText: "",
    dueDate: ""
  }
}, {
  id: "message-appeal-draft",
  subject: "Příkaz - Kaiser servis, spol. s r.o.",
  status: "Nová"
}, { name: "Radim Opluštil" }, "připrav odvolání");
assert.equal(appealDraft.actionType, "prepare_reply");
assert.equal(appealDraft.outcome, "draft_ready");
assert.equal(appealDraft.requiresConfirmation, false);
assert.match(appealDraft.draftText, /Odvolání proti příkazu/);
assert.match(appealDraft.assistantText, /^Návrh odpovědi je připravený\. Nic nebylo odesláno\./);
assert.match(appealDraft.assistantText, /Kaiser servis, spol\. s r\.o\. podává v zákonné lhůtě odvolání/);

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
    recipientDataBoxId: "",
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

const hallucinatedAssignment = dataBoxPlusOpenAiPlanForTest({
  outcome: "ready_for_confirmation",
  intent: "assign_to_user",
  assistantText: "Předám zprávu Lucii Ježkové. Mám provést?",
  missingField: "",
  action: {
    type: "assign_to_user",
    summary: "Předat Lucii Ježkové",
    recipientName: "Lucie Ježková",
    recipientEmail: "",
    recipientPhone: "",
    recipientDataBoxId: "",
    subject: "",
    body: "",
    assignedTo: "Lucie Ježková",
    noteText: "",
    dueDate: ""
  }
}, { status: "Nová" }, { name: "Radim Opluštil" }, "nic");
assert.equal(hallucinatedAssignment.actionType, "none");
assert.equal(hallucinatedAssignment.outcome, "answer");
assert.equal(hallucinatedAssignment.requiresConfirmation, false);
assert.doesNotMatch(hallucinatedAssignment.assistantText, /Lucii|Mám provést/);

const revivedArchive = dataBoxPlusOpenAiPlanForTest({
  outcome: "ready_for_confirmation",
  intent: "archive_info",
  assistantText: "Mohu ji archivovat jako informativní. Mám provést?",
  missingField: "",
  action: {
    type: "archive_info",
    summary: "Archivovat zprávu",
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
}, { status: "Nová" }, { name: "Radim Opluštil" }, "ano");
assert.equal(revivedArchive.actionType, "none");
assert.equal(revivedArchive.outcome, "answer");
assert.equal(revivedArchive.requiresConfirmation, false);

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
