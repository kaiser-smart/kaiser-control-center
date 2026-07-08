import assert from "node:assert/strict";
import {
  __test as communicationTest,
  communicationEmailIdentity,
  communicationSmsConfig
} from "../functions/_lib/communication-store.js";

const identity = communicationEmailIdentity({
  EMAIL_FROM: "oplustil@kaiserservis.cz",
  EMAIL_REPLY_TO: "oplustil@kaiserservis.cz"
}, {
  fromName: "Radim Opluštil"
});

assert.equal(identity.fromName, "Šarlota Kaiser");
assert.equal(identity.fromEmail, "sarlota@kaiserservis.cz");
assert.equal(identity.replyTo, "sarlota@kaiserservis.cz");
assert.equal(identity.replacedFrom, "oplustil@kaiserservis.cz");
assert.equal(identity.replacedReplyTo, "oplustil@kaiserservis.cz");

const smsConfig = communicationSmsConfig({
  TWILIO_KAISER_ACCOUNT_SID: "AC123",
  TWILIO_KAISER_AUTH_TOKEN: "secret",
  TWILIO_KAISER_MESSAGING_SERVICE_SID: "MG123",
  KSO_SMS_MODE: "test"
});

assert.equal(smsConfig.projectName, "Kaiser");
assert.equal(smsConfig.configSource, "kaiser");
assert.equal(smsConfig.mode, "test");
assert.equal(smsConfig.messagingServiceSid, "MG123");

const headers = communicationTest.communicationHeaders({
  messageId: "comm-audit-1@kso.kaiserservis.cz",
  threadId: "kso:driver-reports:driver-part-request:req-1",
  moduleKey: "driver-reports",
  entityType: "driver_part_request",
  entityId: "req-1",
  auditId: "comm-audit-1",
  subjectToken: "KSO-ABC123"
});

assert.equal(headers["X-KSO-Message-Id"], "comm-audit-1@kso.kaiserservis.cz");
assert.equal(headers["X-KSO-Thread-Id"], "kso:driver-reports:driver-part-request:req-1");
assert.equal(headers["X-KSO-Module-Key"], "driver-reports");
assert.equal(headers["X-KSO-Entity-Type"], "driver_part_request");
assert.equal(headers["X-KSO-Entity-Id"], "req-1");
assert.equal(headers["X-KSO-Audit-Id"], "comm-audit-1");
assert.equal(headers["X-KSO-Subject-Token"], "KSO-ABC123");

const candidateIds = communicationTest.candidateMessageIds({
  headers: {
    "In-Reply-To": "<comm-audit-1@kso.kaiserservis.cz>",
    References: "<other@kso.kaiserservis.cz> <comm-audit-1@kso.kaiserservis.cz>"
  }
});

assert.deepEqual(candidateIds, [
  "comm-audit-1@kso.kaiserservis.cz",
  "other@kso.kaiserservis.cz"
]);

const matchedInbound = communicationTest.inboundEmailInput({
  from: "Klient <klient@example.com>",
  to: "sarlota@kaiserservis.cz",
  subject: "Re: Šarlota Kaiser – nové hlášení závady vozidla",
  text: "Dobrý den, potvrzuji přijetí."
}, {
  thread: {
    thread_id: "kso:driver-reports:driver-part-request:req-1",
    module_key: "driver-reports",
    entity_type: "driver_part_request",
    entity_id: "req-1"
  },
  confidence: 0.95
});

assert.equal(matchedInbound.status, "reply_received");
assert.equal(matchedInbound.threadId, "kso:driver-reports:driver-part-request:req-1");
assert.equal(matchedInbound.moduleKey, "driver-reports");
assert.equal(matchedInbound.entityType, "driver_part_request");
assert.equal(matchedInbound.entityId, "req-1");
assert.equal(matchedInbound.requiresHumanReview, 1);
assert.match(matchedInbound.actionSuggestion, /nesmí odeslat odpověď bez potvrzení/);

const unmatchedInbound = communicationTest.inboundEmailInput({
  from: "Neznámý <neznamy@example.com>",
  to: "sarlota@kaiserservis.cz",
  subject: "Re: dotaz",
  text: "Kam to patří?"
}, null);

assert.equal(unmatchedInbound.status, "unmatched_reply");
assert.equal(unmatchedInbound.matchedConfidence, 0);
assert.match(unmatchedInbound.actionSuggestion, /Nespárovaná odpověď/);

assert.equal(communicationTest.stripReplySubject("Re: Fwd: Šarlota Kaiser – faktura"), "šarlota kaiser – faktura");

console.log("communication-infrastructure.test.mjs: OK");
