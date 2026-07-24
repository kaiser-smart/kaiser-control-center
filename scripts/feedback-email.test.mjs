import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendFeedbackReadyForVerificationNotification } from "../functions/_lib/notification-service.js";

const source = readFileSync(new URL("../functions/_lib/notification-service.js", import.meta.url), "utf8");
assert.match(source, /Smart odpady – oprava je připravená k ověření/);
assert.match(source, /Otevřít hlášení a otestovat/);
assert.match(source, /feedbackCaseUrl\(env, item\.id\)/);

let fetchCalled = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  fetchCalled = true;
  throw new Error("Fetch se bez konfigurace nesmí volat.");
};

try {
  const result = await sendFeedbackReadyForVerificationNotification({}, {
    id: "self-repair-case-test",
    caseNumber: "KSO-20260724-TEST01",
    title: "Test opravy",
    moduleKey: "feedback",
    reporterUserName: "Testovací uživatel",
    publicMessage: "Oprava je připravená."
  }, {
    recipientEmail: "user@example.test"
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.provider, "SendGrid");
  assert.equal(fetchCalled, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("feedback verification email: truthful configured-provider guard ok");
