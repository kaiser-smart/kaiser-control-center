import assert from "node:assert/strict";
import {
  dataBoxPlusChatDecisionForTest,
  dataBoxPlusInstructionPlanForTest
} from "../functions/_lib/data-box-plus-store.js";

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

for (const instruction of ["co?", "???", "ahoj", "test", "Jaké je tvoje poslání?"]) {
  const result = plan(instruction);
  assert.equal(result.outcome, "not_done", instruction);
  assert.equal(result.changesMessage, false, instruction);
  assert.equal(result.messageStatus, "Nová", instruction);
  assert.match(result.assistantText, /Jsem Autopilot pro tuto datovou zprávu/, instruction);
  assert.doesNotMatch(result.auditNote, /Systém provedl/, instruction);
}

const actionableCases = [
  ["archivuj jako informativní", "archive_info", "Archivováno"],
  ["označ jako vyřízené", "mark_done", "Vyřešeno"],
  ["předej to Jarce", "assign_to_user", "Předáno kolegovi"],
  ["odpověz jim", "prepare_reply", "Nová"],
  ["připomeň za 7 dní", "set_reminder", "Nová"],
  ["potřebuje kontrolu", "need_more_info", "Potřebuje upřesnit"],
  ["nelze provést", "mark_cannot_execute", "Nelze provést"]
];

for (const [instruction, intent, targetStatus] of actionableCases) {
  const result = plan(instruction, {}, { actor: "Radim" });
  assert.equal(result.intent, intent, instruction);
  assert.equal(result.outcome, "waiting_confirmation", instruction);
  assert.equal(result.requiresConfirmation, true, instruction);
  assert.equal(result.messageStatus, targetStatus, instruction);
  assert.match(result.assistantText, /Souhlasíte, abych to provedl\?/, instruction);
  assert.doesNotMatch(result.auditNote, /Systém provedl/, instruction);
}

const missingColleague = plan("předej to kolegovi");
assert.equal(missingColleague.outcome, "needs_input");
assert.equal(missingColleague.pendingIntent, "assign_to_user");
assert.equal(missingColleague.assistantText, "Komu mám zprávu předat?");

const suppliedColleague = plan("Jarce", {}, {
  pendingIntent: missingColleague.pendingIntent,
  missingField: missingColleague.missingField
});
assert.equal(suppliedColleague.intent, "assign_to_user");
assert.equal(suppliedColleague.outcome, "waiting_confirmation");
assert.equal(suppliedColleague.assignedTo, "Jarce");

const emailProposal = plan("pošli email na radim@example.cz");
assert.equal(emailProposal.intent, "send_email");
assert.equal(emailProposal.outcome, "waiting_confirmation");
assert.equal(emailProposal.externalAction, true);
assert.equal(emailProposal.emailSent, false);
assert.match(emailProposal.assistantText, /dopad mimo systém/);

const missingEmail = plan("pošli na vyz email");
assert.equal(missingEmail.outcome, "needs_input");
assert.equal(missingEmail.pendingIntent, "send_email");
assert.equal(missingEmail.changesMessage, false);

const unsupportedDataBoxSend = plan("odešli datovou zprávu úřadu");
assert.equal(unsupportedDataBoxSend.outcome, "cannot_execute");
assert.equal(unsupportedDataBoxSend.supported, false);
assert.equal(unsupportedDataBoxSend.changesMessage, false);
assert.match(unsupportedDataBoxSend.assistantText, /systém neumí provést/);

const unclearVehicleMessage = plan("???", {
  subject: "Informace o konci platnosti technické prohlídky u vozidla 3BE2831"
});
assert.equal(unclearVehicleMessage.outcome, "not_done");
assert.equal(unclearVehicleMessage.messageStatus, "Nová");

assert.equal(dataBoxPlusChatDecisionForTest("ano"), "confirm");
assert.equal(dataBoxPlusChatDecisionForTest("souhlasím"), "confirm");
assert.equal(dataBoxPlusChatDecisionForTest("proveď"), "confirm");
assert.equal(dataBoxPlusChatDecisionForTest("ne"), "reject");
assert.equal(dataBoxPlusChatDecisionForTest("archivuj"), "");

console.log("data-box-plus instruction flow ok");
