import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canReuseSyncedMessage, loadSyncMessageRows, syncMessageKey } from "../functions/_lib/data-box-plus-sync-policy.js";

const message = { isdsMessageId: "123", direction: "received", senderName: "Sender", senderBoxId: "sender1", recipientName: "Recipient", recipientBoxId: "target1", subject: "Envelope", deliveredAt: "2026-09-25T08:00:00Z", acceptedAt: "2026-09-25T08:01:00Z", hasAttachments: true };
const row = { id: "stored", isds_message_id: "123", direction: "received", sender_name: "Sender", sender_box_id: "sender1", recipient_name: "Recipient", recipient_box_id: "target1", subject: "Envelope", delivered_at: message.deliveredAt, received_at: message.acceptedAt, attachment_status: "Stažená", status: "Vyřešeno", assigned_to: "owner", archive_status: "archived" };
assert.equal(canReuseSyncedMessage(row, message), true);
assert.equal(canReuseSyncedMessage(null, message), false);
for (const field of ["isdsMessageId", "direction", "senderName", "senderBoxId", "recipientName", "recipientBoxId", "subject", "deliveredAt", "acceptedAt"]) {
  assert.equal(canReuseSyncedMessage(row, { ...message, [field]: "changed" }), false, field);
}
for (const attachment_status of ["Čeká na doručení", "Nepodařilo se stáhnout", "Text zatím nenačten", "Dostupná", ""]) {
  assert.equal(canReuseSyncedMessage({ ...row, attachment_status }, message), false, attachment_status);
}
assert.equal(canReuseSyncedMessage({ ...row, attachment_status: "Dostupná" }, { ...message, hasAttachments: false }), true);
assert.equal(canReuseSyncedMessage({ ...row, direction: "sent" }, { ...message, direction: "sent" }), true);

const source = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const upsertSource = source.slice(source.indexOf("async function upsertMessage("), source.indexOf("async function sha256Hex("));
const upsert = new Function("canReuseSyncedMessage", `
  const cleanString = value => String(value ?? "").trim();
  const normalizeDirection = value => value === "sent" ? "sent" : "received";
  const messageRecordId = () => "message";
  ${upsertSource}
  return upsertMessage;
`)(canReuseSyncedMessage);
let reads = 0;
const db = { prepare(sql) {
  assert.match(sql, /^SELECT/);
  reads++;
  return { bind() { return this; }, async first() { return row; } };
} };
const original = structuredClone(row);
for (let i = 0; i < 200; i++) assert.deepEqual(await upsert(db, {}, {}, { id: "box" }, message), { state: "skipped", attachmentsDownloaded: 0 });
assert.equal(reads, 200);
assert.deepEqual(row, original, "An unchanged envelope must not reset completed work, assignment or archive state");

// Header completion must not disable the abort deadline for a stalled body.
const client = readFileSync(new URL("../functions/_lib/data-box-isds-client.js", import.meta.url), "utf8");
const requestSource = client.slice(client.indexOf("async function withTimeout("), client.indexOf("function createMessageFileXml("));
let expire, cleared = false, bodyStarted = false;
const soap = new Function("setTimeout", "clearTimeout", `
  const ISDS_TIMEOUT_MS = 25000;
  const soapEnvelope = () => "request";
  const authHeader = () => "test";
  const assertIsdsStatus = () => {};
  ${requestSource}
  return soapRequest;
`)((callback) => { expire = callback; return 1; }, () => { cleared = true; });
const request = soap({ infoEndpointUrl: "https://isds.invalid" }, "test", "", undefined, async (_, { signal }) => ({
  status: 200,
  text: () => { bodyStarted = true; return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("body aborted")), { once: true })); }
}));
await Promise.resolve(); await Promise.resolve();
assert.equal(bodyStarted, true);
assert.equal(cleared, false, "Deadline remains active while reading the body");
expire();
await assert.rejects(request, /body aborted/);
assert.equal(cleared, true);
console.log("DZ sync: unchanged messages avoid writes; changed/pending messages retry; full-body timeout verified");

let batchReads = 0;
const many = Array.from({ length: 200 }, (_, i) => ({ ...message, isdsMessageId: String(i) }));
const stored = await loadSyncMessageRows({ prepare(sql) {
  assert.match(sql, /WHERE mailbox_id = \? AND isds_message_id IN/);
  return { bind(box, ...ids) {
    assert.equal(box, "box"); assert.ok(ids.length <= 80);
    return { async all() {
      batchReads++;
      return { results: ids.map(id => ({ ...row, isds_message_id: id })) };
    } };
  } };
} }, "box", many);
assert.equal(batchReads, 3);
const forbiddenDb = { prepare() { throw new Error("Unchanged envelopes must not issue per-message queries"); } };
for (const item of many) {
  assert.deepEqual(await upsert(forbiddenDb, {}, {}, { id: "box" }, item, {
    existing: stored.get(syncMessageKey(item.isdsMessageId, item.direction))
  }), { state: "skipped", attachmentsDownloaded: 0 });
}
assert.equal(stored.get(syncMessageKey("0", "sent")), undefined, "Directions never collide");
console.log("200 unchanged messages handled in three reads, no writes or external calls");

const syncSource = source.slice(source.indexOf("export async function runDataBoxPlusSync("), source.indexOf("export async function listDataBoxPlusMailboxes("));
const sync = new Function(`
 const dataBoxPlusDatabase = () => ({ prepare: () => ({ bind() { return this; }, run: async () => ({}) }) });
 const cleanString = v => String(v ?? "");
 const numberValue = v => Number(v || 0);
 const closeStaleSyncRuns = async () => {};
 const createSyncRun = async () => "run";
 const dataBoxPlusAccountConfigs = async env => env.accounts;
 const ensureDataBoxPlusMailboxes = async () => {};
 const ensureMailbox = async (_, account) => ({id: account.id});
 const fetchDataBoxMessageMetadata = async (_, account) => {
   if (account.fail) throw new Error("ISDS unavailable");
   return { messages: [] };
 };
 const loadSyncMessageRows = async () => new Map();
 const updateMailboxCounters = async () => {};
 const finishSyncRun = async () => {};
 ${syncSource.replace("export async function", "async function")}
 return runDataBoxPlusSync;
`)();
assert.equal((await sync({accounts:[{id:"one"},{id:"two",fail:true}]})).status,"partial","Healthy mailboxes with no new messages still count as success");
assert.equal((await sync({accounts:[{id:"one",fail:true}]})).status,"failed");
assert.equal((await sync({accounts:[{id:"one"}]})).status,"success");
console.log("Sync audit distinguishes partial mailbox failures from no-change success");
