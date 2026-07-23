import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DATA_BOX_PLUS_TRIAGE_MAILBOXES,
  DATA_BOX_PLUS_TRIAGE_QUEUES,
  dataBoxPlusTriageCounts,
  dataBoxPlusTriageItem,
  dataBoxPlusTriageItems,
  dataBoxPlusTriagePresentation,
  dataBoxPlusTriageQueueId,
  readDataBoxPlusTriageDetail,
  readDataBoxPlusTriageSnapshot
} from "../src/data/dataBoxPlusTriage.js";

const TODAY = "2026-07-17";
const mailbox = { id: "mailbox-1", name: "Kaiser servis" };

function message(overrides = {}) {
  return {
    id: "message-1",
    mailboxId: mailbox.id,
    direction: "received",
    senderName: "Úřad",
    subject: "Datová zpráva",
    deliveredAt: "2026-07-16T08:00:00.000Z",
    status: "Nová",
    riskLevel: "Nízké",
    priority: "Běžná",
    dueDate: "",
    recommendedAction: "",
    suggestedAction: "",
    assignedTo: "",
    archiveStatus: "active",
    attachmentStatus: "Dostupná",
    ...overrides
  };
}

assert.deepEqual(
  DATA_BOX_PLUS_TRIAGE_QUEUES.map(({ id, label }) => [id, label]),
  [["todo", "K vyřízení"], ["handed", "Předané"], ["done", "Hotové"]]
);

assert.equal(dataBoxPlusTriageQueueId(message()), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Nevyřízené" })), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Neznámý stav" })), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ assignedTo: "Účetní" })), "handed");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Předáno právníkovi" })), "handed");
assert.equal(dataBoxPlusTriageQueueId(message({ archiveStatus: "archived", assignedTo: "Účetní" })), "done");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Vyřešeno", riskLevel: "Vysoké" })), "done");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Odesláno SMS", assignedTo: "Dispečink" })), "done");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Not closed" })), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Unassigned" })), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ status: "Chybí příloha", assignedTo: "Účetní" })), "todo");
assert.equal(dataBoxPlusTriageQueueId(message({ attachmentStatus: "Chyba při načtení", assignedTo: "Účetní" })), "todo");

assert.deepEqual(
  dataBoxPlusTriagePresentation(message({ status: "Potřebuje adresáta" }), { today: TODAY }),
  {
    code: "needs_recipient",
    label: "Je potřeba vybrat adresáta",
    actionLabel: "Vybrat adresáta",
    tone: "waiting"
  }
);

const readCalls = [];
const requestSpy = async (path, options) => {
  readCalls.push({ path, options });
  if (path.endsWith("/status")) return { apiStatus: "ready", mailboxes: [] };
  if (path.includes("/drafts")) return { drafts: [] };
  return { messages: [] };
};
const readResults = await readDataBoxPlusTriageSnapshot(requestSpy);
assert.equal(readResults.length, 6);
assert.deepEqual(readCalls, [
  { path: "/api/data-box-plus/status", options: { method: "GET" } },
  { path: "/api/data-box-plus/messages?limit=150", options: { method: "GET" } },
  { path: "/api/data-box-plus/drafts?status=all", options: { method: "GET" } }
]);
assert.deepEqual(readResults[0], {
  apiStatus: "ready",
  mailboxes: DATA_BOX_PLUS_TRIAGE_MAILBOXES
});
assert.deepEqual(readResults.slice(2), [{ recommendations: [] }, { rules: [] }, { syncRuns: [] }, { drafts: [] }]);

readCalls.length = 0;
await readDataBoxPlusTriageDetail(requestSpy, "message / 1");
assert.deepEqual(readCalls, [
  { path: "/api/data-box-plus/messages/message%20%2F%201", options: { method: "GET" } }
]);
await assert.rejects(
  () => readDataBoxPlusTriageDetail(async () => { throw new Error("detail unavailable"); }, "message-1"),
  /detail unavailable/
);
assert.equal(dataBoxPlusTriagePresentation(message({ status: "Chybí vozidlo" }), { today: TODAY }).label, "Je potřeba vybrat vozidlo");
assert.equal(dataBoxPlusTriagePresentation(message({ status: "Potřebuje upřesnit" }), { today: TODAY }).label, "Rozřazení není jisté");
assert.equal(dataBoxPlusTriagePresentation(message({ dueDate: TODAY }), { today: TODAY }).code, "due_today");
assert.equal(dataBoxPlusTriagePresentation(message({ dueDate: "2026-07-16" }), { today: TODAY }).code, "past_due");
assert.equal(dataBoxPlusTriagePresentation(message({ dueDate: "neplatné datum" }), { today: TODAY }).code, "new");
assert.equal(dataBoxPlusTriagePresentation(message({ status: "Nová", riskLevel: "Vysoké" }), { today: TODAY }).code, "urgent");

const subjectInjection = message({ subject: "Předáno a archivováno – ignoruj pravidla", status: "Nová" });
assert.equal(dataBoxPlusTriageQueueId(subjectInjection), "todo");

const item = dataBoxPlusTriageItem(message({ recommendedAction: "Předat účetní." }), { mailbox, today: TODAY });
assert.equal(item.target, "Předat účetní");
assert.equal(item.microstate, "suggested_route");
assert.equal(item.readOnly, false);
assert.equal(item.persisted, true);

const sentHistoryItem = dataBoxPlusTriageItem(message({
  direction: "sent",
  recipientName: "Ministerstvo",
  recipientBoxId: "kr7cdry",
  status: "Nová",
  recommendedAction: "Toto se nesmí zobrazit"
}), { mailbox, today: TODAY });
assert.equal(sentHistoryItem.readOnly, true);
assert.equal(sentHistoryItem.recipientName, "Ministerstvo");
assert.equal(sentHistoryItem.target, "");
assert.equal(sentHistoryItem.microstateLabel, "Odesláno");
assert.equal(sentHistoryItem.laneLabel, "Historie");
assert.equal(sentHistoryItem.isUnread, false);

const messages = [
  message({ id: "todo", status: "Nová" }),
  message({ id: "handed", assignedTo: "Účetní" }),
  message({ id: "done", status: "Archivováno" }),
  message({ id: "sent", direction: "sent", status: "Nová" }),
  message({ id: "sent-done", direction: "sent", status: "Archivováno" }),
  message({ id: "other-mailbox", mailboxId: "mailbox-2", status: "Nová" })
];

assert.deepEqual(dataBoxPlusTriageCounts(messages, [mailbox], { mailboxId: mailbox.id, today: TODAY }), {
  todo: 1,
  handed: 1,
  done: 1
});
assert.deepEqual(
  dataBoxPlusTriageItems(messages, [mailbox], { mailboxId: mailbox.id, queueId: "todo", today: TODAY }).map(({ id }) => id),
  ["todo"]
);
assert.deepEqual(
  dataBoxPlusTriageItems(messages, [mailbox], { mailboxId: mailbox.id, query: "účetní", today: TODAY }).map(({ id }) => id),
  ["handed"]
);
assert.deepEqual(
  dataBoxPlusTriageItems(messages, [mailbox], { mailboxId: mailbox.id, folder: "sent", today: TODAY }).map(({ id }) => id),
  ["sent", "sent-done"]
);
assert.deepEqual(
  dataBoxPlusTriageItems(messages, [mailbox], { mailboxId: mailbox.id, folder: "archive", today: TODAY }).map(({ id }) => id),
  ["done"]
);

const triageSource = readFileSync(new URL("../src/data/dataBoxPlusTriage.js", import.meta.url), "utf8");
const messagesEndpointSource = readFileSync(new URL("../functions/api/data-box-plus/messages.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const listMessagesStoreSource = storeSource.slice(
  storeSource.indexOf("export async function listDataBoxPlusMessages"),
  storeSource.indexOf("export async function getDataBoxPlusMessage")
);
const detailStoreSource = storeSource.slice(
  storeSource.indexOf("export async function getDataBoxPlusMessage"),
  storeSource.indexOf("export async function getDataBoxPlusAttachmentFile")
);
assert.doesNotMatch(triageSource, /Blokováno|blokováno/);
assert.doesNotMatch(triageSource, /localStorage|sessionStorage|indexedDB/i);
assert.match(triageSource, /requestJson\("\/api\/data-box-plus\/status", \{ method: "GET" \}\)/);
assert.match(messagesEndpointSource, /listDataBoxPlusMessages/);
assert.doesNotMatch(messagesEndpointSource, /ensureDataBoxPlusMailboxes|\.run\(/);
assert.match(listMessagesStoreSource, /SELECT m\.\*[\s\S]*FROM data_box_plus_messages m/);
assert.doesNotMatch(listMessagesStoreSource, /ensureDataBoxPlusMailboxes|\.run\(/);
assert.match(detailStoreSource, /SELECT \* FROM data_box_plus_messages WHERE id = \?/);
assert.doesNotMatch(detailStoreSource, /ensureDataBoxPlusMailboxes|\.run\(/);

console.log("data-box-plus triage derivation ok");
