import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  RCS_TEMPLATE_REGISTRY,
  formatCzechDateRange,
  formatCzechDateShort,
  getRcsTemplate,
  rcsContentVariables,
  rcsTemplatePreviewList,
  rcsTextLength,
  renderRcsTemplate,
  shortenRcsText,
  twilioContentDefinition,
  validateRcsVariables
} from "../functions/_lib/rcs-template-registry.js";
import {
  __test as serviceTest,
  maskRcsRecipient,
  sendRcsTemplateMessage
} from "../functions/_lib/rcs-template-service.js";

const platformPreviewAppSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const platformPreviewStylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(platformPreviewAppSource, /data-rcs-preview-platform="android"/);
assert.match(platformPreviewAppSource, /data-rcs-preview-platform="ios"/);
assert.match(platformPreviewAppSource, /data-rcs-preview-panel="android"/);
assert.match(platformPreviewAppSource, /data-rcs-preview-panel="ios"/);
assert.match(platformPreviewAppSource, /Android obvykle zobrazí akce přes šířku karty/);
assert.match(platformPreviewStylesSource, /\.rcs-native-card--android/);
assert.match(platformPreviewStylesSource, /\.rcs-native-card--ios/);
assert.match(platformPreviewStylesSource, /\.rcs-native-card__action--android/);

const env = {
  PUBLIC_APP_URL: "https://smart-odpady.ai",
  KSO_CUSTOMER_MESSAGING_MODE: "live",
  TWILIO_KAISER_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_KAISER_API_KEY_SID: "SK00000000000000000000000000000000",
  TWILIO_KAISER_API_KEY_SECRET: "test-secret",
  TWILIO_KAISER_MESSAGING_SERVICE_SID: "MG00000000000000000000000000000000"
};

assert.equal(Object.keys(RCS_TEMPLATE_REGISTRY).length, 8);
assert.deepEqual(Object.keys(RCS_TEMPLATE_REGISTRY), [
  "leave.approved",
  "leave.pending",
  "ds.new",
  "ds.deadline",
  "task.new",
  "vehicle.fault",
  "critical.alert",
  "general.info"
]);

for (const definition of Object.values(RCS_TEMPLATE_REGISTRY)) {
  assert.equal(definition.orientation, "VERTICAL");
  assert.equal(definition.height, "MEDIUM");
  assert.ok(definition.friendlyName.startsWith("kaiser_rcs_"));
  assert.ok(definition.fallbackTemplate);
  assert.equal(definition.actions.length, 1);
  if (definition.assetFilename) {
    const rendered = renderRcsTemplate(definition.key, definition.sampleVariables, env);
    assert.ok(rendered.bannerUrl.endsWith(definition.assetFilename));
    assert.ok(rendered.title);
    assert.ok(rendered.body);
    assert.match(rendered.fallback, /Pro odhlášení odpovězte STOP\.$/);
    assert.equal(rendered.actions[0].type, "URL");
    assert.ok(rendered.actions[0].url.startsWith("https://smart-odpady.ai/"));
    assert.ok(!rendered.body.includes("{{"));
    assert.ok(rendered.body.startsWith("Ahoj "));
    assert.ok(rendered.bodyLength <= 140);
    assert.equal(rendered.bodyLength, rcsTextLength(rendered.body));
  }
}

assert.throws(() => getRcsTemplate("unknown.template"), /Neznámý templateKey/);
const neutralLeave = renderRcsTemplate(
  "leave.approved",
  { ...RCS_TEMPLATE_REGISTRY["leave.approved"].sampleVariables, firstName: "" },
  env
);
assert.equal(neutralLeave.body, "Dovolená 1.–8. srpna 2026 je schválená.");
assert.ok(!neutralLeave.body.includes("Ahoj ,"));
assert.equal(formatCzechDateRange("2026-08-01", "2026-08-08"), "1.–8. srpna 2026");
assert.equal(formatCzechDateRange("30. 7. 2026", "2. 8. 2026"), "30. července–2. srpna 2026");
assert.equal(formatCzechDateShort("2026-07-31"), "31. července 2026");
const longSubject = "Žádost o doplnění velmi dlouhého podání včetně několika příloh a dalších podkladů";
const shortenedSubject = shortenRcsText(longSubject, 45);
assert.equal(rcsTextLength(shortenedSubject), 45);
assert.ok(shortenedSubject.endsWith("…"));
assert.ok(!shortenRcsText("Český vícebajtový řetězec 👩‍🔧 a další text", 20).includes("\uFFFD"));
assert.equal(shortenRcsText("Text &amp; pokračování", 11), "Text &amp;…");
const pendingLeave = renderRcsTemplate(
  "leave.pending",
  RCS_TEMPLATE_REGISTRY["leave.pending"].sampleVariables,
  env
);
assert.equal(pendingLeave.bannerUrl, "https://smart-odpady.ai/rcs/templates/leave-pending.png");
assert.throws(
  () => validateRcsVariables(
    getRcsTemplate("general.info"),
    { ...RCS_TEMPLATE_REGISTRY["general.info"].sampleVariables, payload: "nepovolený" },
    env
  ),
  /Nepovolené proměnné/
);
assert.throws(
  () => renderRcsTemplate("general.info", {
    message: "Bezpečný text",
    detailUrl: "https://example.com/cizi-detail"
  }, env),
  /povolenou doménu KSO/
);
assert.throws(
  () => renderRcsTemplate("general.info", {
    message: "Bezpečný text",
    detailUrl: "https://smart-odpady.ai/"
  }, env),
  /konkrétní detail/
);

const escaped = renderRcsTemplate("general.info", {
  message: "<script>alert(1)</script>",
  detailUrl: "https://smart-odpady.ai/nastaveni?x=%3Cscript%3E"
}, env);
assert.equal(escaped.body, "<script>alert(1)</script>");
assert.ok(!escaped.body.includes("{{"));
assert.equal(escaped.actions[0].url, "https://smart-odpady.ai/nastaveni?x=%3Cscript%3E");

const twilioDefinition = twilioContentDefinition("ds.new", env);
assert.equal(twilioDefinition.types["twilio/card"].orientation, "VERTICAL");
assert.equal(twilioDefinition.types["twilio/card"].height, "MEDIUM");
assert.equal(twilioDefinition.types["twilio/card"].media.length, 1);
assert.match(twilioDefinition.types["twilio/card"].body, /\{\{1\}\}/);
assert.match(twilioDefinition.types["twilio/text"].body, /Pro odhlášení odpovězte STOP\.$/);
assert.deepEqual(Object.keys(twilioDefinition.variables), ["1", "2", "3"]);
assert.equal(twilioDefinition.variables["1"], "Ahoj Radime, přišla zpráva od Magistrát města Brna: Oznámení.");
assert.ok(twilioDefinition.variables["2"].startsWith("Ahoj Radime, nová datová zpráva"));

const contentVariables = rcsContentVariables("critical.alert", {
  firstName: "Radime",
  alertMessage: "Pozor",
  detailUrl: "https://smart-odpady.ai/nastaveni"
}, env);
assert.deepEqual(contentVariables, {
  "1": "Ahoj Radime, Pozor",
  "2": "Ahoj Radime, Pozor",
  "3": "https://smart-odpady.ai/nastaveni"
});

const previews = rcsTemplatePreviewList(env, []);
assert.equal(previews.length, 8);
const expectedMobileCopy = {
  "leave.approved": ["Dovolená schválena", "Ahoj Radime, dovolená 1.–8. srpna 2026 je schválená.", "Zobrazit detail"],
  "leave.pending": ["Žádost čeká", "Ahoj Radime, žádost o dovolenou 1.–8. srpna 2026 čeká na schválení.", "Zobrazit žádost"],
  "ds.new": ["Nová datová zpráva", "Ahoj Radime, přišla zpráva od Magistrát města Brna: Oznámení.", "Otevřít zprávu"],
  "ds.deadline": ["Blíží se termín", "Ahoj Radime, zprávu „Výzva k doplnění“ je potřeba vyřídit do 31. července 2026.", "Vyřídit zprávu"],
  "task.new": ["Nový úkol", "Ahoj Radime, nový úkol: Zkontrolovat svozovou trasu. Termín 31. července 2026.", "Otevřít úkol"],
  "vehicle.fault": ["Nové hlášení vozidla", "Ahoj Radime, u Mercedes 01 bylo nahlášeno: Kontrola brzdového systému.", "Otevřít hlášení"],
  "critical.alert": ["Důležité upozornění", "Ahoj Radime, Provozní událost vyžaduje tvoji pozornost.", "Zobrazit detail"],
  "general.info": ["Zpráva od Šarloty", "Ahoj Radime, V KSO je pro tebe nová provozní informace.", "Zobrazit detail"]
};
for (const preview of previews) {
  const [title, body, action] = expectedMobileCopy[preview.key];
  assert.equal(preview.sampleTitle, title);
  assert.equal(preview.sampleBody, body);
  assert.equal(preview.actions[0].title, action);
  assert.match(preview.sampleFallback, /Pro odhlášení odpovězte STOP\.$/);
}
assert.equal(previews.find((item) => item.key === "leave.pending").syncStatus, "content_sid_missing");
assert.equal(previews.find((item) => item.key === "leave.pending").enabled, false);
assert.ok(previews.find((item) => item.key === "leave.pending").sampleBody);
assert.equal(previews.find((item) => item.key === "ds.new").syncStatus, "content_sid_missing");
assert.ok(previews.every((item) => item.bodyLength <= 140));
assert.ok(previews.every((item) => item.actionStatus === "ok"));
const localPreviews = rcsTemplatePreviewList({ PUBLIC_APP_URL: "http://127.0.0.1:5173" }, []);
assert.ok(localPreviews.find((item) => item.key === "general.info").sampleVariables.detailUrl.startsWith("http://127.0.0.1:5173/"));
const boundedAlert = renderRcsTemplate("critical.alert", {
  firstName: "Radime",
  alertMessage: "Velmi důležité provozní upozornění ".repeat(8),
  detailUrl: "https://smart-odpady.ai/nastaveni"
}, env);
assert.ok(boundedAlert.bodyLength <= 140);
assert.ok(boundedAlert.body.endsWith("…"));
assert.throws(() => renderRcsTemplate("critical.alert", {
  firstName: "R".repeat(180),
  alertMessage: "Pozor",
  detailUrl: "https://smart-odpady.ai/nastaveni"
}, env), /překračuje limit 140 znaků/);

assert.equal(maskRcsRecipient("+420777123456"), "+420 *** **56");
assert.equal(
  await serviceTest.idempotencyKey("event-1", "general.info", "+420777123456"),
  await serviceTest.idempotencyKey("event-1", "general.info", "+420777123456")
);
assert.notEqual(
  await serviceTest.idempotencyKey("event-1", "general.info", "+420777123456"),
  await serviceTest.idempotencyKey("event-2", "general.info", "+420777123456")
);

function validSend(overrides = {}) {
  return {
    templateKey: "general.info",
    recipient: "+420777123456",
    variables: {
      message: "Test centrální RCS karty.",
      detailUrl: "https://smart-odpady.ai/nastaveni"
    },
    eventId: "test-event-1",
    ...overrides
  };
}

const syncRow = {
  templateKey: "general.info",
  contentSid: "HX00000000000000000000000000000000",
  syncStatus: "ready"
};

{
  const updates = [];
  let request = null;
  const result = await sendRcsTemplateMessage(env, validSend(), { id: "admin-1", name: "Admin" }, {
    syncRow,
    isOptedOut: async () => false,
    reserveDispatch: async (_env, input) => ({
      created: true,
      dispatch: { id: "dispatch-1", ...input }
    }),
    updateDispatch: async (_env, id, patch) => updates.push({ id, patch }),
    fetch: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ sid: "SM00000000000000000000000000000000", status: "accepted" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(result.sent, true);
  assert.equal(result.contentSid, syncRow.contentSid);
  assert.ok(request.url.endsWith("/Messages.json"));
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("ContentSid"), syncRow.contentSid);
  assert.equal(body.get("MessagingServiceSid"), env.TWILIO_KAISER_MESSAGING_SERVICE_SID);
  assert.equal(JSON.parse(body.get("ContentVariables"))["1"], "Test centrální RCS karty.");
  assert.equal(updates.at(-1).patch.status, "accepted");
}

{
  const result = await sendRcsTemplateMessage(env, validSend(), { id: "admin-1", name: "Admin" }, {
    syncRow,
    isOptedOut: async () => false,
    reserveDispatch: async () => ({
      created: false,
      dispatch: { id: "dispatch-existing", status: "accepted" }
    })
  });
  assert.equal(result.sent, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.status, "blocked_duplicate");
}

await assert.rejects(
  () => sendRcsTemplateMessage(env, validSend({ recipient: "není telefon" }), {}, { syncRow }),
  /platné telefonní číslo/
);
await assert.rejects(
  () => sendRcsTemplateMessage(env, validSend({ debug: true }), {}, { syncRow }),
  /nepovolená pole/
);
await assert.rejects(
  () => sendRcsTemplateMessage(env, validSend(), {}, { syncRow: { syncStatus: "content_sid_missing", contentSid: "" } }),
  /Content SID/
);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(appSource, /RCS šablony/);
assert.match(appSource, /data-rcs-template-sync/);
assert.match(appSource, /data-rcs-template-test-form/);
assert.match(appSource, /Mobilní náhled celé karty/);
assert.match(appSource, /rcs-native-card__action/);
assert.match(appSource, /Body: <strong>.*\/ 140 znaků/);
assert.match(appSource, /Příliš dlouhé/);
assert.match(appSource, /template\.actionStatus === "missing"/);
assert.match(appSource, /function settingsManagementSection[\s\S]*rcsTemplateCenterSection\(true\)/);
assert.match(appSource, /rcsTestRecipientForPhone\(recipient\)/);
assert.match(appSource, /Telefon není dohledaný v Uživatelích\/Zaměstnancích/);
assert.match(appSource, /variables:\s*\{\s*\.\.\.template\.sampleVariables,\s*firstName\s*\}/s);
assert.doesNotMatch(appSource, /value="\+420604542004"/);

const migration = readFileSync(new URL("../migrations/0062_create_rcs_template_center.sql", import.meta.url), "utf8");
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_message_dispatches_idempotency/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS rcs_template_sync_locks/);
assert.match(migration, /recipient_masked TEXT NOT NULL/);
assert.match(migration, /content_sid TEXT NOT NULL/);

const database = new DatabaseSync(":memory:");
database.exec(migration);
database.prepare(`
  INSERT INTO rcs_message_dispatches (
    id, idempotency_key, event_id, template_key, recipient_masked,
    recipient_hash, content_sid
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run("dispatch-1", "same-event", "event-1", "general.info", "+420 *** **56", "hash", syncRow.contentSid);
assert.throws(() => database.prepare(`
  INSERT INTO rcs_message_dispatches (
    id, idempotency_key, event_id, template_key, recipient_masked,
    recipient_hash, content_sid
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run("dispatch-2", "same-event", "event-1", "general.info", "+420 *** **56", "hash", syncRow.contentSid), /UNIQUE constraint failed/);
database.close();

console.log("rcs-template-center.test.mjs: OK");
