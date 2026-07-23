import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DataBoxPlusStoreError,
  dataBoxPlusBytesToBase64ForTest,
  dataBoxPlusDraftInputForTest
} from "../functions/_lib/data-box-plus-store.js";

const migration = readFileSync(new URL("../migrations/0055_create_data_box_plus_workflows.sql", import.meta.url), "utf8");
const store = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const messagesApi = readFileSync(new URL("../functions/api/data-box-plus/messages.js", import.meta.url), "utf8");
const draftApi = readFileSync(new URL("../functions/api/data-box-plus/drafts/index.js", import.meta.url), "utf8");
const sendApi = readFileSync(new URL("../functions/api/data-box-plus/drafts/[id]/send.js", import.meta.url), "utf8");
const bulkApi = readFileSync(new URL("../functions/api/data-box-plus/messages/bulk.js", import.meta.url), "utf8");
const archiveApi = readFileSync(new URL("../functions/api/data-box-plus/attachments/download-all.js", import.meta.url), "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_drafts/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_draft_attachments/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_send_jobs/);
assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_idempotency/);

assert.deepEqual(dataBoxPlusDraftInputForTest({
  mailboxId: "mailbox-1",
  recipientBoxId: "AB12CD3",
  subject: "Předmět",
  body: "Text"
}), {
  mailboxId: "mailbox-1",
  recipientBoxId: "ab12cd3",
  recipientName: "",
  subject: "Předmět",
  body: "Text"
});
assert.throws(
  () => dataBoxPlusDraftInputForTest({ recipientBoxId: "wrong" }),
  (error) => error instanceof DataBoxPlusStoreError && error.code === "data_box_plus_recipient_invalid"
);
assert.throws(
  () => dataBoxPlusDraftInputForTest({ subject: "x".repeat(256) }),
  (error) => error instanceof DataBoxPlusStoreError && error.code === "data_box_plus_subject_too_long"
);
const binaryFixture = Uint8Array.from({ length: 60_001 }, (_, index) => index % 251);
assert.equal(
  dataBoxPlusBytesToBase64ForTest(binaryFixture),
  Buffer.from(binaryFixture).toString("base64"),
  "chunked base64 must preserve large attachment bytes"
);

assert.match(store, /payload\.confirmed !== true/);
assert.match(store, /Idempotency-Key/);
assert.match(store, /status = 'unknown'/);
assert.match(store, /Opakované odeslání je zablokované proti duplicitě/);
assert.match(store, /INSERT OR IGNORE INTO data_box_plus_messages/);
assert.match(store, /applyDataBoxPlusBulkAction/);
assert.match(store, /getDataBoxPlusAttachmentArchiveFiles/);
assert.match(store, /50 \* 1024 \* 1024/);
assert.match(store, /100 \* 1024 \* 1024/);

for (const source of [draftApi, sendApi, bulkApi]) {
  assert.match(source, /requireUserPermission\(env, request, "data-box-plus", "manage"\)/);
}
assert.match(archiveApi, /requireUserPermission\(env, request, "data-box-plus", "view"\)/);
assert.match(messagesApi, /mailboxId:/);
assert.match(messagesApi, /dateFrom:/);
assert.match(messagesApi, /attachment:/);
assert.match(messagesApi, /sort:/);

assert.match(app, /data-ds-plus-compose-attachment/);
assert.match(app, /data-ds-plus-compose-send/);
assert.match(app, /data-ds-plus-bulk=/);
assert.match(app, /data-ds-plus-triage-advanced=/);
assert.match(app, /data-ds-plus-download-all=/);
assert.match(app, /window\.confirm\(`Opravdu odeslat datovou zprávu/);
assert.doesNotMatch(app, /Odeslání zatím není aktivní/);

console.log("data-box-plus production workflows ok");
