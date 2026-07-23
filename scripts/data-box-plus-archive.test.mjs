import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dataBoxIsdsAccountFromCredentials,
  fetchDataBoxMessageMetadataPage,
  fetchDataBoxMessageSignedArchive
} from "../functions/_lib/data-box-isds-client.js";

const account = dataBoxIsdsAccountFromCredentials({
  DATA_BOX_ISDS_ENABLED: "true"
}, {
  slot: 12,
  id: "future-mailbox",
  label: "Budoucí firemní schránka",
  username: "user",
  password: "secret",
  enabled: true
});
assert.equal(account.configured, true);
assert.equal(account.slot, 12);

const listCalls = [];
const listPage = await fetchDataBoxMessageMetadataPage({}, account, {
  direction: "sent",
  fromTime: "2009-01-01T00:00:00.000Z",
  toTime: "2026-07-23T18:00:00.000Z",
  offset: 101,
  limit: 2,
  fetchImpl: async (_url, options) => {
    listCalls.push(options.body);
    return new Response(`<?xml version="1.0"?>
      <Envelope><Body><GetListOfSentMessagesResponse>
        <dmStatus><dmStatusCode>0000</dmStatusCode></dmStatus>
        <dmRecords>
          <dmRecord><dmID>9001</dmID><dmAnnotation>První</dmAnnotation></dmRecord>
          <dmRecord><dmID>9002</dmID><dmAnnotation>Druhá</dmAnnotation></dmRecord>
        </dmRecords>
      </GetListOfSentMessagesResponse></Body></Envelope>`, { status: 200 });
  }
});
assert.equal(listPage.messages.length, 2);
assert.equal(listPage.nextOffset, 103);
assert.equal(listPage.hasMore, true);
assert.match(listCalls[0], /<v20:dmOffset>101<\/v20:dmOffset>/);
assert.match(listCalls[0], /<v20:dmLimit>2<\/v20:dmLimit>/);
assert.match(listCalls[0], /2009-01-01T00:00:00.000Z/);

const signedCalls = [];
const messageBytes = new TextEncoder().encode("signed-message-zfo");
const deliveryBytes = new TextEncoder().encode("signed-delivery-zfo");
const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");
const archive = await fetchDataBoxMessageSignedArchive({}, account, {
  isdsMessageId: "9001",
  direction: "sent"
}, {
  fetchImpl: async (_url, options) => {
    signedCalls.push(options.body);
    const delivery = options.body.includes("GetSignedDeliveryInfo");
    return new Response(`<Envelope><Body><dmStatusCode>0000</dmStatusCode><dmSignature>${
      delivery ? toBase64(deliveryBytes) : toBase64(messageBytes)
    }</dmSignature></Body></Envelope>`, { status: 200 });
  }
});
assert.equal(new TextDecoder().decode(archive.messageZfo), "signed-message-zfo");
assert.equal(new TextDecoder().decode(archive.deliveryZfo), "signed-delivery-zfo");
assert.match(signedCalls[0], /SignedSentMessageDownload/);
assert.match(signedCalls[1], /GetSignedDeliveryInfo/);

const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../migrations/0058_create_data_box_plus_owned_archive.sql", import.meta.url), "utf8");
const contractSource = readFileSync(new URL("../src/data/dataBoxPlusOperationalContract.js", import.meta.url), "utf8");
assert.doesNotMatch(storeSource, /EXPECTED_MAILBOX_COUNT/);
assert.match(storeSource, /mailboxScope: "all-current-and-future"/);
assert.match(storeSource, /SignedArchive/);
assert.match(storeSource, /sha256/);
assert.match(migrationSource, /data_box_plus_archive_objects/);
assert.match(migrationSource, /data_box_plus_archive_backfills/);
assert.match(contractSource, /all-current-and-future-company-mailboxes/);
assert.match(contractSource, /sent:[\s\S]*aiProcessing: false/);

console.log("data-box-plus owned archive pagination, ZFO and dynamic mailbox corridor ok");
