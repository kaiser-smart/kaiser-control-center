import assert from "node:assert/strict";
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

console.log("data-box-plus chat ui flow ok");
