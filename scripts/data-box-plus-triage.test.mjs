import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DATA_BOX_PLUS_TRIAGE_MAILBOXES,
  DATA_BOX_PLUS_TRIAGE_QUEUES,
  dataBoxPlusTriageCounts,
  dataBoxPlusTriageItem,
  dataBoxPlusTriageItems,
  dataBoxPlusTriagePresentation,
  dataBoxPlusTriagePreviewEnabled,
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

assert.equal(dataBoxPlusTriagePreviewEnabled(true, "localhost"), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "127.0.0.1"), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "::1"), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(false, "localhost"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "smart-odpady.ai", "radim-oplustil"), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "SMART-ODPADY.AI", " RADIM-OPLUSTIL "), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "www.smart-odpady.ai", "radim-oplustil"), true);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "smart-odpady.ai"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "smart-odpady.ai", "martin"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(false, "smart-odpady.ai", "radim-oplustil"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "kaiser-control-center.pages.dev", "radim-oplustil"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "preview.kaiser-control-center.pages.dev", "radim-oplustil"), false);
assert.equal(dataBoxPlusTriagePreviewEnabled(true, "evil.example", "radim-oplustil"), false);

const readCalls = [];
const requestSpy = async (path, options) => {
  readCalls.push({ path, options });
  return path.endsWith("/status") ? { mailboxes: [] } : { messages: [] };
};
const readResults = await readDataBoxPlusTriageSnapshot(requestSpy);
assert.equal(readResults.length, 5);
assert.deepEqual(readCalls, [
  { path: "/api/data-box-plus/messages?limit=150", options: { method: "GET" } }
]);
assert.deepEqual(readResults[0], {
  apiStatus: "ready",
  mailboxes: DATA_BOX_PLUS_TRIAGE_MAILBOXES
});
assert.deepEqual(readResults.slice(2), [{ recommendations: [] }, { rules: [] }, { syncRuns: [] }]);

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
assert.equal(item.readOnly, true);
assert.equal(item.persisted, false);

const messages = [
  message({ id: "todo", status: "Nová" }),
  message({ id: "handed", assignedTo: "Účetní" }),
  message({ id: "done", status: "Archivováno" }),
  message({ id: "sent", direction: "sent", status: "Nová" }),
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
assert.doesNotMatch(triageSource, /\/api\/data-box-plus\/status/);
assert.match(messagesEndpointSource, /listDataBoxPlusMessages/);
assert.doesNotMatch(messagesEndpointSource, /ensureDataBoxPlusMailboxes|\.run\(/);
assert.match(listMessagesStoreSource, /SELECT \*\s+FROM data_box_plus_messages/);
assert.doesNotMatch(listMessagesStoreSource, /ensureDataBoxPlusMailboxes|\.run\(/);
assert.match(detailStoreSource, /SELECT \* FROM data_box_plus_messages WHERE id = \?/);
assert.doesNotMatch(detailStoreSource, /ensureDataBoxPlusMailboxes|\.run\(/);

console.log("data-box-plus triage derivation ok");
