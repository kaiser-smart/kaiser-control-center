import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../workers/data-box-automation-runner.js";
import {
  dataBoxAutomationDedupeKey,
  dataBoxAutomationReceivedMessage,
  messageMatchesRule,
  normalizeAction
} from "../functions/_lib/data-box-automation-runner.js";

const runnerSource = readFileSync(new URL("../functions/_lib/data-box-automation-runner.js", import.meta.url), "utf8");
const actionStoreSource = readFileSync(new URL("../functions/_lib/data-box-actions-store.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

assert.equal(dataBoxAutomationReceivedMessage({ direction: "received" }), true);
assert.equal(dataBoxAutomationReceivedMessage({ direction: "sent" }), false);
assert.equal(dataBoxAutomationReceivedMessage({}), true);

const emailRule = {
  actions: JSON.stringify({
    type: "SEND_EMAIL",
    recipients: ["Faktury@KaiserServis.cz"]
  })
};
assert.deepEqual(normalizeAction(emailRule), {
  type: "SEND_EMAIL",
  recipients: ["Faktury@KaiserServis.cz"],
  allowAutomaticArchive: false
});

const unsafeArchive = normalizeAction({
  actions: JSON.stringify({ type: "ARCHIVE", allowAutomaticArchive: true })
});
assert.equal(unsafeArchive.allowAutomaticArchive, false);

const safeArchive = normalizeAction({
  actions: JSON.stringify({
    type: "ARCHIVE",
    allowAutomaticArchive: true,
    safetyClassification: "informational"
  })
});
assert.equal(safeArchive.allowAutomaticArchive, true);

assert.equal(
  dataBoxAutomationDedupeKey("email", "message-1", "Faktury@KaiserServis.cz"),
  "data-box:email:message-1:faktury@kaiserservis.cz"
);
assert.equal(dataBoxAutomationDedupeKey("archive", "message-1"), "data-box:archive:message-1");

const subjectRule = {
  conditions: JSON.stringify({ subjectContains: "faktura" })
};
assert.equal(messageMatchesRule({
  id: "received-1",
  direction: "received",
  subject: "Nová faktura"
}, subjectRule), true);
assert.equal(messageMatchesRule({
  id: "sent-1",
  direction: "sent",
  subject: "Nová faktura"
}, subjectRule), false);

assert.match(runnerSource, /listDataBoxMessages\(env, \{ limit: 100, direction: "received" \}\)/);
assert.match(runnerSource, /Žádný e-mail nebyl automaticky odeslán/);
assert.match(runnerSource, /action\.allowAutomaticArchive/);
assert.match(runnerSource, /prepareDataBoxAction\(env, message, "email"/);
assert.doesNotMatch(runnerSource, /sendDataBoxMessageEmail/);
assert.doesNotMatch(runnerSource, /sendDataBoxReply/);
assert.match(actionStoreSource, /wasCreated: false/);
assert.match(actionStoreSource, /wasCreated: true/);
assert.match(appSource, /Automatické odeslání e-mailu bez ručního potvrzení/);
assert.match(appSource, /Další běh je v následující celou hodinu/);

const response = await worker.fetch();
const readiness = await response.json();
assert.equal(readiness.emailSending, "manual_confirmation_only");
assert.equal(readiness.dataBoxSending, "manual_confirmation_only");
assert.equal(readiness.sentMessageAiProcessing, "disabled");
assert.equal(readiness.automaticArchive, "explicit_informational_allowlist_only");
assert.match(readiness.message, /sám je neodesílá/);

console.log("data-box safe automation runner tests passed");
