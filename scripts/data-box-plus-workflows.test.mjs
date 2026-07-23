import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  DataBoxPlusStoreError,
  dataBoxPlusBytesToBase64ForTest,
  dataBoxPlusDraftInputForTest
} from "../functions/_lib/data-box-plus-store.js";
import {
  DataBoxIsdsError,
  dataBoxIsdsAccountFromCredentials,
  dataBoxIsdsCreateMessageXmlForTest,
  sendDataBoxIsdsMessage
} from "../functions/_lib/data-box-isds-client.js";

const migration = readFileSync(new URL("../migrations/0055_create_data_box_plus_workflows.sql", import.meta.url), "utf8");
const sentHistoryMigration = readFileSync(new URL("../migrations/0056_data_box_plus_sent_history_only.sql", import.meta.url), "utf8");
const sendAuditMigration = readFileSync(new URL("../migrations/0057_extend_data_box_plus_send_job_audit.sql", import.meta.url), "utf8");
const replyDraftMigration = readFileSync(new URL("../migrations/0059_add_data_box_plus_reply_drafts.sql", import.meta.url), "utf8");
const store = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const isdsClient = readFileSync(new URL("../functions/_lib/data-box-isds-client.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const messagesApi = readFileSync(new URL("../functions/api/data-box-plus/messages.js", import.meta.url), "utf8");
const draftApi = readFileSync(new URL("../functions/api/data-box-plus/drafts/index.js", import.meta.url), "utf8");
const sendApi = readFileSync(new URL("../functions/api/data-box-plus/drafts/[id]/send.js", import.meta.url), "utf8");
const draftAttachmentApi = readFileSync(new URL("../functions/api/data-box-plus/drafts/[id]/attachments/[attachmentId].js", import.meta.url), "utf8");
const bulkApi = readFileSync(new URL("../functions/api/data-box-plus/messages/bulk.js", import.meta.url), "utf8");
const archiveApi = readFileSync(new URL("../functions/api/data-box-plus/attachments/download-all.js", import.meta.url), "utf8");
const localServer = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");
const replyPdfFixture = readFileSync(new URL("./fixtures/data-box-plus-reply-test.pdf", import.meta.url), "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_drafts/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_draft_attachments/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS data_box_plus_send_jobs/);
assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_data_box_plus_send_jobs_idempotency/);
assert.match(sentHistoryMigration, /UPDATE data_box_plus_recommendations/);
assert.match(sentHistoryMigration, /status = 'closed_sent_history'/);
assert.match(sentHistoryMigration, /WHERE direction = 'sent'/);
assert.match(sentHistoryMigration, /summary_loaded = 0/);
assert.match(sendAuditMigration, /ADD COLUMN phase/);
assert.match(sendAuditMigration, /ADD COLUMN attempt_count/);
assert.match(sendAuditMigration, /ADD COLUMN last_event_at/);
assert.match(replyDraftMigration, /ADD COLUMN reply_to_message_id/);
assert.match(replyDraftMigration, /idx_data_box_plus_drafts_reply/);

const migrationDatabase = new DatabaseSync(":memory:");
migrationDatabase.exec("CREATE TABLE data_box_plus_mailboxes (id TEXT PRIMARY KEY);");
migrationDatabase.exec(migration);
migrationDatabase.exec(`
  INSERT INTO data_box_plus_mailboxes (id) VALUES ('mailbox-1');
  INSERT INTO data_box_plus_drafts (
    id, mailbox_id, owner_user_id, idempotency_key
  ) VALUES ('draft-migration', 'mailbox-1', 'user-1', 'idempotency-migration');
  INSERT INTO data_box_plus_send_jobs (
    id, draft_id, idempotency_key, request_hash, status, started_at
  ) VALUES (
    'job-migration',
    'draft-migration',
    'idempotency-migration',
    'hash-migration',
    'sending',
    '2026-07-23T08:00:00.000Z'
  );
`);
migrationDatabase.exec(sendAuditMigration);
migrationDatabase.exec("CREATE TABLE data_box_plus_messages (id TEXT PRIMARY KEY);");
migrationDatabase.exec(replyDraftMigration);
assert.deepEqual(
  migrationDatabase.prepare("PRAGMA table_info(data_box_plus_send_jobs)").all()
    .map((column) => column.name)
    .filter((name) => ["phase", "attempt_count", "last_event_at"].includes(name)),
  ["phase", "attempt_count", "last_event_at"]
);
assert.deepEqual(
  { ...migrationDatabase.prepare("SELECT phase, attempt_count, last_event_at FROM data_box_plus_send_jobs WHERE id = 'job-migration'").get() },
  {
    phase: "calling_isds",
    attempt_count: 1,
    last_event_at: "2026-07-23T08:00:00.000Z"
  }
);
assert.ok(
  migrationDatabase.prepare("PRAGMA table_info(data_box_plus_drafts)").all()
    .some((column) => column.name === "reply_to_message_id")
);
migrationDatabase.close();

assert.deepEqual(dataBoxPlusDraftInputForTest({
  mailboxId: "mailbox-1",
  recipientBoxId: "AB12CD3",
  subject: "Předmět",
  body: "Text"
}), {
  mailboxId: "mailbox-1",
  replyToMessageId: "",
  recipientBoxId: "ab12cd3",
  recipientName: "",
  subject: "Předmět",
  body: "Text"
});
assert.equal(dataBoxPlusDraftInputForTest({
  mailboxId: "mailbox-1",
  replyToMessageId: "message-1",
  recipientBoxId: "AB12CD3"
}).replyToMessageId, "message-1");
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

const createMessageXml = dataBoxIsdsCreateMessageXmlForTest({
  recipientDataBoxId: "KR7CDRY",
  subject: "Smlouva & CA",
  body: "Podepsaná smlouva",
  attachments: [{
    fileName: "smlouva.pdf",
    mimeType: "application/pdf",
    contentBase64: Buffer.from("PDF").toString("base64")
  }]
});
assert.match(createMessageXml, /<v20:CreateMessage>/);
assert.match(createMessageXml, /<v20:dbIDRecipient>kr7cdry<\/v20:dbIDRecipient>/);
assert.match(createMessageXml, /<v20:dmAnnotation>Smlouva &amp; CA<\/v20:dmAnnotation>/);
assert.match(createMessageXml, /dmFileMetaType="main" dmFileDescr="zprava\.txt"/);
assert.match(createMessageXml, /dmFileMetaType="enclosure" dmFileDescr="smlouva\.pdf"/);

const account = dataBoxIsdsAccountFromCredentials({}, {
  id: "dbp-kaiser-servis",
  username: "user",
  password: "secret"
});
let sentRequest = null;
const directResult = await sendDataBoxIsdsMessage({}, account, {
  recipientDataBoxId: "kr7cdry",
  subject: "Smlouva CA",
  body: "Text zprávy"
}, {
  fetchImpl: async (url, options) => {
    sentRequest = { url, options };
    return new Response(`<?xml version="1.0"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><CreateMessageResponse>
          <dmID>123456789</dmID>
          <dmStatus><dmStatusCode>0000</dmStatusCode><dmStatusMessage>OK</dmStatusMessage></dmStatus>
        </CreateMessageResponse></soap:Body>
      </soap:Envelope>`, { status: 200 });
  }
});
assert.equal(directResult.messageId, "123456789");
assert.match(sentRequest.url, /\/DS\/dz$/);
assert.match(sentRequest.options.headers.Authorization, /^Basic /);
assert.match(sentRequest.options.body, /<v20:CreateMessage>/);
await assert.rejects(
  () => sendDataBoxIsdsMessage({}, account, {
    recipientDataBoxId: "kr7cdry",
    subject: "Smlouva CA",
    body: "Text zprávy"
  }, {
    fetchImpl: async () => new Response(`
      <CreateMessageResponse>
        <dmStatus><dmStatusCode>1210</dmStatusCode><dmStatusMessage>Odmítnuto</dmStatusMessage></dmStatus>
      </CreateMessageResponse>`, { status: 200 })
  }),
  (error) => error instanceof DataBoxIsdsError && error.code === "data_box_isds_status_failed"
);
await assert.rejects(
  () => sendDataBoxIsdsMessage({}, account, {
    recipientDataBoxId: "kr7cdry",
    subject: "Smlouva CA",
    body: "Text zprávy"
  }, {
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    }
  }),
  /network unavailable/
);
assert.match(isdsClient, /const ISDS_TIMEOUT_MS = 25000/);
assert.match(isdsClient, /new AbortController\(\)/);
assert.match(isdsClient, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);

assert.match(store, /payload\.confirmed !== true/);
assert.match(store, /Idempotency-Key/);
assert.match(store, /const DATA_BOX_PLUS_SEND_TIMEOUT_MS = 25000/);
assert.match(store, /setTimeout\(\(\) => controller\.abort\(\), DATA_BOX_PLUS_SEND_TIMEOUT_MS\)/);
assert.match(store, /signal: controller\.signal/);
assert.match(store, /failureState = explicitIsdsFailure \? "failed" : "unknown"/);
assert.match(store, /Opakované odeslání je zablokované proti duplicitě/);
assert.match(store, /INSERT OR IGNORE INTO data_box_plus_messages/);
assert.match(store, /applyDataBoxPlusBulkAction/);
assert.match(store, /getDataBoxPlusAttachmentArchiveFiles/);
assert.match(store, /20 \* 1024 \* 1024/);
assert.match(store, /100 \* 1024 \* 1024/);
assert.match(store, /sendDataBoxIsdsMessage/);
assert.match(store, /data_box_plus_sent_history_only/);
assert.match(store, /status = 'closed_sent_history'/);
assert.ok(
  store.indexOf("INSERT INTO data_box_plus_send_jobs") < store.indexOf("phase = 'loading_attachments'"),
  "auditní send job musí vzniknout před načítáním příloh"
);
assert.ok(
  store.indexOf("phase = 'loading_attachments'") < store.indexOf("phase = 'calling_isds'"),
  "audit musí rozlišit přípravu od volání ISDS"
);
assert.match(store, /phase = 'response_received'/);
assert.match(store, /phase = 'completed'/);
assert.match(store, /attempt_count = COALESCE\(attempt_count, 0\) \+ 1/);
assert.match(store, /if \(\["sending", "unknown"\]\.includes\(cleanString\(existingJob\?\.status\)\)\)/);
assert.match(store, /data_box_plus_send_result_unknown/);
assert.match(store, /replyToMessageId: cleanString\(row\.reply_to_message_id\)/);
assert.match(store, /reply_to_message_id = \?/);
assert.match(store, /status IN \('draft', 'failed', 'sending', 'unknown'\)/);
assert.match(store, /originalMessageId: draft\.replyToMessageId/);
assert.match(store, /status = 'Odpovězeno datovou schránkou'/);
assert.match(store, /getDataBoxPlusDraftAttachmentFile/);

for (const source of [draftApi, sendApi, bulkApi]) {
  assert.match(source, /requireUserPermission\(env, request, "data-box-plus", "manage"\)/);
}
assert.match(archiveApi, /requireUserPermission\(env, request, "data-box-plus", "view"\)/);
assert.match(draftAttachmentApi, /onRequestGet/);
assert.match(draftAttachmentApi, /getDataBoxPlusDraftAttachmentFile/);
assert.match(localServer, /replyToMessageId: body\.replyToMessageId/);
assert.match(localServer, /dataBoxPlusDraftAttachmentsMatch/);
assert.match(localServer, /dataBoxPlusDraftAttachmentMatch/);
assert.match(localServer, /Content-Disposition": `inline/);
assert.match(replyPdfFixture, /^%PDF-1\.4/);
assert.match(messagesApi, /mailboxId:/);
assert.match(messagesApi, /dateFrom:/);
assert.match(messagesApi, /attachment:/);
assert.match(messagesApi, /sort:/);

assert.match(app, /data-ds-plus-compose-attachment/);
assert.match(app, /data-ds-plus-compose-send/);
assert.match(app, /data-ds-plus-bulk=/);
assert.match(app, /data-ds-plus-triage-advanced=/);
assert.match(app, /data-ds-plus-download-all=/);
assert.match(app, /sentHistoryOnly \? "" : `<p class="ds-plus-triage-row__recommendation"/);
assert.match(app, /sentHistoryOnly \? "" : dataBoxPlusSummary\(message\)/);
assert.match(app, /window\.confirm\(`Opravdu odeslat datovou zprávu/);
assert.match(app, /flushDataBoxPlusComposeDraftSave/);
assert.match(app, /data-ds-plus-reply-attachment=/);
assert.match(app, /data-ds-plus-reply-remove-attachment=/);
assert.match(app, /multiple data-ds-plus-reply-attachment/);
assert.match(app, /function dataBoxPlusReplyDraft\(messageId\)/);
assert.match(app, /flushDataBoxPlusReplyDraftSave/);
assert.match(app, /draft\.replyToMessageId === id && \["draft", "failed", "sending", "unknown"\]/);
assert.match(app, /\/api\/data-box-plus\/drafts\/\$\{encodeURIComponent\(draft\.id\)\}\/send/);
assert.doesNotMatch(
  app.slice(
    app.indexOf("async function sendDataBoxPlusReplyFromOverlay"),
    app.indexOf("async function runDataBoxPlusBulkAction")
  ),
  /\/api\/data-box-plus\/messages\/\$\{encodeURIComponent\(messageId\)\}\/reply/
);
assert.match(app, /Dokončuji uložení…/);
assert.doesNotMatch(app, /Odeslání zatím není aktivní/);

console.log("data-box-plus production workflows ok");
