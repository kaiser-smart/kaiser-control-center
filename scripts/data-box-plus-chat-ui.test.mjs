import assert from "node:assert/strict";
import {
  dataBoxPlusConversationEntries,
  dataBoxPlusHistoryChatEntries,
  dataBoxPlusLatestActionState,
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

const pending = dataBoxPlusPendingChatEntries([], "předej na faktury", "request-1");
assert.equal(pending[0].role, "user");
assert.equal(pending[0].text, "předej na faktury");
assert.equal(pending[1].role, "assistant");
assert.equal(pending[1].pending, true);

const resolved = dataBoxPlusResolvePendingChatEntries(pending, "request-1", "Hotovo. Předáno fakturám.", "audit-2");
assert.equal(resolved[1].text, "Hotovo. Předáno fakturám.");
assert.equal(resolved[1].pending, false);
assert.equal(resolved[1].auditId, "audit-2");

const merged = dataBoxPlusConversationEntries([
  ...history,
  {
    id: "audit-2",
    actionType: "Chatový pokyn",
    createdAt: "2026-07-10T05:01:00.000Z",
    payload: {
      originalInstruction: "předej na faktury",
      assistantText: "Hotovo. Předáno fakturám."
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

const waitingState = dataBoxPlusLatestActionState([{
  id: "audit-waiting",
  actionType: "Chatový pokyn",
  result: "waiting_confirmation",
  createdAt: "2026-07-10T05:02:00.000Z",
  payload: {
    intent: "archive_info",
    understoodAs: "archivace informativní zprávy",
    performedAction: "Nebylo provedeno nic",
    proposedAction: { actionSummary: "archivovat zprávu jako informativní" }
  }
}]);
assert.equal(waitingState.label, "Čeká na potvrzení");
assert.equal(waitingState.tone, "confirmation");
assert.equal(waitingState.actionText, "archivovat zprávu jako informativní");

const notDoneState = dataBoxPlusLatestActionState([{
  id: "audit-smalltalk",
  actionType: "Chatový pokyn",
  result: "not_done",
  createdAt: "2026-07-10T05:03:00.000Z",
  payload: {
    intent: "smalltalk",
    understoodAs: "obecná zpráva",
    performedAction: "Nebylo provedeno nic"
  }
}]);
assert.equal(notDoneState.label, "Informativní");
assert.equal(notDoneState.actionText, "Nebylo provedeno nic.");

const liveResolved = dataBoxPlusResolvePendingChatEntries(
  dataBoxPlusPendingChatEntries([], "označ jako vyřízené", "request-live"),
  "request-live",
  "Rozumím tomu takto: označit zprávu jako vyřízenou. Souhlasíte?",
  "audit-live",
  false,
  {
    createdAt: "2026-07-10T05:04:00.000Z",
    outcome: "waiting_confirmation",
    intent: "mark_done",
    statusLabel: "Čeká na potvrzení",
    understoodAs: "označení jako vyřízené",
    performedAction: "Označeno jako vyřízené",
    proposedAction: { actionSummary: "označit zprávu jako vyřízenou" }
  }
);
const liveState = dataBoxPlusLatestActionState([], liveResolved);
assert.equal(liveState.label, "Čeká na potvrzení");
assert.equal(liveState.understoodAs, "označení jako vyřízené");
assert.equal(liveState.actionText, "označit zprávu jako vyřízenou");

console.log("data-box-plus chat ui flow ok");
