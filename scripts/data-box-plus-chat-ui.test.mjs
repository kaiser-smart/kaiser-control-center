import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dataBoxPlusConversationEntries,
  dataBoxPlusHistoryChatEntries,
  dataBoxPlusPendingChatEntries,
  dataBoxPlusResolvePendingChatEntries
} from "../src/data/dataBoxPlusChat.js";

const history = [{
  id: "audit-1",
  actionType: "Chatový pokyn",
  createdAt: "2026-07-10T05:00:00.000Z",
  auditNote: "Fallback odpověď",
  payload: {
    originalInstruction: "archivuj",
    assistantText: "Hotovo. Archivováno."
  }
}];

assert.deepEqual(
  dataBoxPlusHistoryChatEntries(history).map(({ role, text }) => ({ role, text })),
  [
    { role: "user", text: "archivuj" },
    { role: "assistant", text: "Hotovo. Archivováno." }
  ]
);

const waitingConfirmation = dataBoxPlusHistoryChatEntries([{
  id: "audit-confirm",
  actionType: "Chatový pokyn",
  result: "waiting_confirmation",
  createdAt: "2026-07-10T05:00:30.000Z",
  payload: {
    originalInstruction: "pošli e-mail Radimovi",
    outcome: "waiting_confirmation",
    assistantText: "E-mail je připravený. Mám provést?",
    proposedAction: {
      confirmationId: "audit-confirm",
      type: "send_email",
      summary: "Odeslat e-mail Radimovi",
      recipientEmail: "radim@example.cz",
      subject: "Kontrola zprávy",
      body: "Prosím o kontrolu."
    }
  }
}]);
assert.equal(waitingConfirmation[1].outcome, "waiting_confirmation");
assert.equal(waitingConfirmation[1].confirmationId, "audit-confirm");
assert.equal(waitingConfirmation[1].proposedAction.type, "send_email");

const usedConfirmation = dataBoxPlusHistoryChatEntries([{
  id: "audit-used",
  actionType: "Chatový pokyn",
  result: "confirmed",
  createdAt: "2026-07-10T05:00:40.000Z",
  payload: {
    originalInstruction: "pošli e-mail Radimovi",
    outcome: "waiting_confirmation",
    assistantText: "E-mail je připravený. Mám provést?",
    proposedAction: { confirmationId: "audit-used", type: "send_email" }
  }
}]);
assert.equal(usedConfirmation[1].outcome, "confirmed");
assert.equal(usedConfirmation[1].proposedAction, undefined);

const legacySmalltalk = dataBoxPlusHistoryChatEntries([{
  id: "legacy-smalltalk",
  actionType: "Chatový pokyn",
  result: "done",
  createdAt: "2026-07-10T05:01:00.000Z",
  auditNote: "Radim zadal: „???“. Systém provedl: Chybí vozidlo. Nový stav: Chybí vozidlo.",
  payload: { originalInstruction: "???" }
}]);
assert.equal(
  legacySmalltalk[1].text,
  "Napište mi, co mám s touto datovou zprávou udělat. Můžu ji archivovat, označit jako vyřízenou, připravit odpověď nebo předat kolegovi."
);

const legacyAction = dataBoxPlusHistoryChatEntries([{
  id: "legacy-action",
  actionType: "Chatový pokyn",
  result: "done",
  createdAt: "2026-07-10T05:02:00.000Z",
  auditNote: "Radim zadal pokyn. Systém provedl: Interní předání osobě Jarce. Nový stav: Předáno kolegovi.",
  payload: { originalInstruction: "předej Jarce" }
}]);
assert.equal(legacyAction[1].text, "Hotovo. Interní předání osobě Jarce.");

const legacyMissingRecipient = dataBoxPlusHistoryChatEntries([{
  id: "legacy-missing-recipient",
  actionType: "Chatový pokyn",
  result: "done",
  createdAt: "2026-07-10T05:02:30.000Z",
  auditNote: "Radim zadal pokyn. Systém provedl: Adresát chybí. Nový stav: Potřebuje adresáta.",
  payload: { originalInstruction: "předej kolegovi" }
}]);
assert.equal(legacyMissingRecipient[1].text, "Chybí adresát. Komu to mám předat nebo přeposlat?");
assert.doesNotMatch(legacyMissingRecipient[1].text, /^Hotovo\./);

const draftHistory = dataBoxPlusHistoryChatEntries([{
  id: "draft",
  actionType: "Chatový pokyn",
  result: "draft_ready",
  createdAt: "2026-07-10T05:03:00.000Z",
  payload: {
    originalInstruction: "odpověz jim",
    outcome: "draft_ready",
    assistantText: "intent: prepare_reply"
  }
}]);
assert.equal(draftHistory[1].text, "Připravím návrh odpovědi. Odeslání musí potvrdit člověk.");

const technicalHistory = dataBoxPlusHistoryChatEntries([{
  id: "technical",
  actionType: "Chatový pokyn",
  result: "not_done",
  createdAt: "2026-07-10T05:04:00.000Z",
  payload: {
    originalInstruction: "něco",
    assistantText: "intent: unknown"
  }
}]);
assert.doesNotMatch(technicalHistory[1].text, /intent|result|no_action|changedState/i);

const pending = dataBoxPlusPendingChatEntries([], "předej Jarce", "request-1");
assert.equal(pending[0].role, "user");
assert.equal(pending[0].text, "předej Jarce");
assert.equal(pending[1].role, "assistant");
assert.equal(pending[1].pending, true);

const resolved = dataBoxPlusResolvePendingChatEntries(
  pending,
  "request-1",
  "Hotovo. Zpráva byla předána Jarce.",
  "audit-2",
  false,
  { outcome: "done", intent: "assign_to_user" }
);
assert.equal(resolved[1].text, "Hotovo. Zpráva byla předána Jarce.");
assert.equal(resolved[1].pending, false);
assert.equal(resolved[1].auditId, "audit-2");

const resolvedConfirmation = dataBoxPlusResolvePendingChatEntries(
  dataBoxPlusPendingChatEntries([], "pošli SMS", "request-confirm"),
  "request-confirm",
  "SMS je připravená. Mám provést?",
  "audit-confirm-local",
  false,
  {
    outcome: "waiting_confirmation",
    proposedAction: {
      confirmationId: "audit-confirm-local",
      type: "send_sms",
      recipientPhone: "+420777000111",
      body: "Prosím o kontrolu zprávy."
    }
  }
);
assert.equal(resolvedConfirmation[1].proposedAction.type, "send_sms");
assert.equal(resolvedConfirmation[1].outcome, "waiting_confirmation");

const merged = dataBoxPlusConversationEntries([
  ...history,
  {
    id: "audit-2",
    actionType: "Chatový pokyn",
    createdAt: "2026-07-10T05:05:00.000Z",
    payload: {
      originalInstruction: "předej Jarce",
      assistantText: "Hotovo. Zpráva byla předána Jarce."
    }
  }
], resolved);
assert.equal(merged.length, 4);
assert.deepEqual(merged.map((entry) => entry.role), ["user", "assistant", "user", "assistant"]);

const failed = dataBoxPlusResolvePendingChatEntries(
  dataBoxPlusPendingChatEntries([], "nejasný pokyn", "request-2"),
  "request-2",
  "Zprávu se nepodařilo zpracovat.",
  "",
  true
);
assert.equal(failed[0].text, "nejasný pokyn");
assert.equal(failed[1].error, true);

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const composeOverlaySource = appSource.slice(
  appSource.indexOf("function dataBoxPlusComposeOverlay()"),
  appSource.indexOf("function dataBoxPlusChatSuggestions")
);
const detailOverlaySource = appSource.slice(
  appSource.indexOf("function dataBoxPlusDetailOverlay()"),
  appSource.indexOf("function dataBoxPlusChatOverlay()")
);
assert.doesNotMatch(composeOverlaySource, /dataBoxPlusChatPanel\(message\)/);
assert.match(detailOverlaySource, /ds-plus-detail-section--chat[\s\S]*dataBoxPlusChatPanel\(message\)/);
assert.match(appSource, /E-mail nebo SMS odešle jen po potvrzení/);
const compactChatStyles = styles.slice(styles.lastIndexOf("/* Datove schranky Plus: simple message chat. */"));
assert.match(compactChatStyles, /width:\s*min\(600px, calc\(100vw - 48px\)\)/);
assert.match(compactChatStyles, /max-height:\s*min\(680px, calc\(100dvh - 48px\)\)/);
assert.match(compactChatStyles, /grid-template-rows:\s*auto minmax\(0, auto\)/);
assert.match(compactChatStyles, /max-height:\s*min\(360px, calc\(100dvh - 250px\)\)/);
assert.match(compactChatStyles, /overflow-y:\s*auto/);
assert.match(compactChatStyles, /\.ds-plus-chat-confirmation/);
assert.match(compactChatStyles, /\.ds-plus-detail-section--chat/);
assert.match(compactChatStyles, /@media \(max-width: 720px\)[\s\S]*height:\s*100dvh/);
assert.doesNotMatch(compactChatStyles.split("@media (max-width: 720px)")[0], /height:\s*100dvh/);

console.log("data-box-plus chat ui flow ok");
