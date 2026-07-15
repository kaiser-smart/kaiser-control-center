import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runCollectionRouteIncidentReminderAutomation } from "../functions/_lib/collection-routes-incident-reminder-runner.js";
import { __test as endpointTest } from "../functions/api/internal/collection-routes/test-incident-reminders.js";

assert.equal(endpointTest.safeTokenEqual("secret", "secret"), true);
assert.equal(endpointTest.safeTokenEqual("secret", "different"), false);
assert.equal(endpointTest.safeTokenEqual("", ""), false);
assert.equal(endpointTest.requestToken(new Request("https://example.test", {
  headers: { Authorization: "Bearer runner-secret" }
})), "runner-secret");

assert.deepEqual(
  await runCollectionRouteIncidentReminderAutomation({}, {}),
  {
    status: "skipped",
    reason: "missing-runner-token",
    protectedTestOnly: true,
    customerCommunication: "disabled"
  }
);

{
  let request = null;
  const result = await runCollectionRouteIncidentReminderAutomation({
    COLLECTION_ROUTES_RUNNER_TOKEN: "runner-secret",
    APP_BASE_URL: "https://smart-odpady.ai/"
  }, {
    scheduledTime: 123,
    cron: "*/5 * * * *"
  }, {
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ checked: 2, sent: 1, failed: 0, skipped: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  assert.equal(request.url, "https://smart-odpady.ai/api/internal/collection-routes/test-incident-reminders");
  assert.equal(request.options.headers.Authorization, "Bearer runner-secret");
  assert.equal(request.body.limit, 10);
  assert.equal(result.status, "completed");
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.sms, "disabled");
  assert.equal(result.rcs, "disabled");
}

{
  const result = await runCollectionRouteIncidentReminderAutomation({
    COLLECTION_ROUTES_RUNNER_TOKEN: "runner-secret"
  }, {}, {
    fetchImpl: async () => new Response(JSON.stringify({ error: "test failure" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "test failure");
  assert.equal(result.protectedTestOnly, true);
}

const workerSource = readFileSync(new URL("../workers/module-automation-runner.js", import.meta.url), "utf8");
const wranglerSource = readFileSync(new URL("../wrangler.module-automation-runner.toml", import.meta.url), "utf8");
for (const marker of [
  "COLLECTION_ROUTE_INCIDENT_REMINDER_CRON",
  "*/5 * * * *",
  "runCollectionRouteIncidentReminderAutomation",
  "protected-test-email-only",
  "realCustomerCommunication: \"disabled\"",
  "rcs: \"disabled\""
]) {
  assert.ok(workerSource.includes(marker), `Cloudový runner postrádá ochranný marker: ${marker}`);
}
assert.ok(wranglerSource.includes('crons = ["*/5 * * * *"'), "Wrangler musí spouštět TEST připomínky každých pět minut.");

console.log("collection routes incident reminder runner tests: ok");
