import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dataBoxPlusInstructionPlanForTest } from "../functions/_lib/data-box-plus-store.js";

const message = {
  id: "dbp-test-message",
  mailbox_id: "dbp-kaiser-servis",
  sender_name: "Test odesílatel",
  subject: "Testovací datová zpráva",
  status: "Nová"
};

function plan(instruction, overrides = {}, context = {}) {
  return dataBoxPlusInstructionPlanForTest(instruction, { ...message, ...overrides }, [], context);
}

const helpText = "Napište mi, co mám s touto datovou zprávou udělat. Můžu ji archivovat, označit jako vyřízenou, připravit odpověď nebo předat kolegovi.";

for (const instruction of ["co?", "???", "ahoj", "test", "Jaké je tvoje poslání?", "ano", "souhlasím", "proveď"]) {
  const result = plan(instruction);
  assert.equal(result.outcome, "not_done", instruction);
  assert.equal(result.changesMessage, false, instruction);
  assert.equal(result.messageStatus, "Nová", instruction);
  assert.equal(result.assistantText, helpText, instruction);
  assert.doesNotMatch(result.auditNote, /Systém provedl/, instruction);
}

const safeCases = [
  ["archivuj jako informativní", "archive_info", "Archivováno"],
  ["označ jako vyřízené", "mark_done", "Vyřešeno"],
  ["předej to Jarce", "assign_to_user", "Předáno kolegovi"],
  ["připomeň zítra", "set_reminder", "Nová"],
  ["dej do k doplnění", "need_more_info", "Potřebuje upřesnit"],
  ["přidej poznámku kontrola hotová", "internal_note", "Nová"],
  ["přidej úkol", "create_task", "Rozpracováno"]
];

for (const [instruction, intent, targetStatus] of safeCases) {
  const result = plan(instruction, {}, { actor: "Radim" });
  assert.equal(result.intent, intent, instruction);
  assert.equal(result.outcome, "done", instruction);
  assert.equal(result.requiresConfirmation, false, instruction);
  assert.equal(result.changesMessage, true, instruction);
  assert.equal(result.messageStatus, targetStatus, instruction);
  assert.match(result.assistantText, /^Hotovo\./, instruction);
}

assert.equal(plan("archivuj jako informativní").assistantText, "Hotovo. Zpráva byla archivována jako informativní.");
assert.match(plan("připomeň zítra").dueDate, /^\d{4}-\d{2}-\d{2}$/);

const missingColleague = plan("předej kolegovi");
assert.equal(missingColleague.outcome, "needs_input");
assert.equal(missingColleague.pendingIntent, "assign_to_user");
assert.equal(missingColleague.assistantText, "Chybí adresát. Komu mám zprávu interně předat?");
assert.doesNotMatch(missingColleague.assistantText, /^Hotovo\./);

const suppliedColleague = plan("Jarce", {}, {
  pendingIntent: missingColleague.pendingIntent,
  missingField: missingColleague.missingField
});
assert.equal(suppliedColleague.intent, "assign_to_user");
assert.equal(suppliedColleague.outcome, "done");
assert.equal(suppliedColleague.assignedTo, "Jarce");

const missingNote = plan("přidej poznámku");
assert.equal(missingNote.outcome, "needs_input");
assert.equal(missingNote.assistantText, "Jakou interní poznámku mám ke zprávě přidat?");

const replyDraft = plan("odpověz jim");
assert.equal(replyDraft.intent, "prepare_reply");
assert.equal(replyDraft.outcome, "draft_ready");
assert.equal(replyDraft.changesMessage, false);
assert.equal(replyDraft.sendsEmail, false);
assert.equal(replyDraft.emailSent, false);
assert.equal(replyDraft.assistantText, "Připravím návrh odpovědi. Odeslání musí potvrdit člověk.");
assert.match(replyDraft.draftText, /Návrh odpovědi před odesláním/);

const emailDraft = plan("pošli email na radim@example.cz");
assert.equal(emailDraft.intent, "prepare_reply");
assert.equal(emailDraft.outcome, "draft_ready");
assert.equal(emailDraft.recipientEmail, "radim@example.cz");
assert.equal(emailDraft.sendsEmail, false);
assert.equal(emailDraft.emailSent, false);

const missingEmail = plan("pošli email");
assert.equal(missingEmail.outcome, "needs_input");
assert.equal(missingEmail.pendingIntent, "send_email");
assert.equal(missingEmail.changesMessage, false);
assert.equal(missingEmail.assistantText, "Chybí adresát. Komu to mám předat nebo přeposlat?");
assert.doesNotMatch(missingEmail.assistantText, /^Hotovo\./);

const suppliedEmail = plan("radim@example.cz", {}, {
  pendingIntent: missingEmail.pendingIntent,
  missingField: missingEmail.missingField
});
assert.equal(suppliedEmail.outcome, "draft_ready");
assert.equal(suppliedEmail.recipientEmail, "radim@example.cz");
assert.equal(suppliedEmail.sendsEmail, false);

const dataBoxDraft = plan("odešli datovou zprávu úřadu");
assert.equal(dataBoxDraft.outcome, "draft_ready");
assert.equal(dataBoxDraft.intent, "prepare_reply");
assert.equal(dataBoxDraft.changesMessage, false);

const deleteAttempt = plan("smaž zprávu");
assert.equal(deleteAttempt.outcome, "cannot_execute");
assert.equal(deleteAttempt.changesMessage, false);

const unclearVehicleMessage = plan("???", {
  subject: "Informace o konci platnosti technické prohlídky u vozidla 3BE2831"
});
assert.equal(unclearVehicleMessage.outcome, "not_done");
assert.equal(unclearVehicleMessage.messageStatus, "Nová");

const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const executeSource = storeSource.match(/export async function executeDataBoxPlusMessageInstruction[\s\S]+?\n}\nfunction recommendationConfirmAction/)?.[0] || "";
assert.ok(executeSource, "execution source must be present");
assert.doesNotMatch(executeSource, /sendDataBoxPlusMessageEmail/);
assert.doesNotMatch(executeSource, /dataBoxPlusChatDecision|waiting_confirmation/);
assert.match(executeSource, /plan\.outcome === "done"/);

console.log("data-box-plus instruction flow ok");
