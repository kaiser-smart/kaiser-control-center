import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const store = readFileSync(new URL("../functions/_lib/collection-route-incidents-store.js", import.meta.url), "utf8");
const localServer = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");

for (const marker of [
  '{ id: "incidents", label: "Hlášení"',
  "data-collection-route-incident-scope=",
  "TESTOVACÍ DATA – NEODESÍLÁ OSTRÉ ZPRÁVY",
  "data-collection-route-incident-open=",
  "collection-route-incident-drawer",
  "Převzít",
  "Kontaktovat zákazníka",
  "Vyřešit",
  "data-collection-route-incident-contact-form",
  "data-collection-route-incident-resolve-form",
  "data-collection-route-incident-follow-up-form",
  "data-collection-route-incident-reopen-form",
  "Technické podrobnosti",
  "/api/collection-routes/incidents"
]) {
  assert.ok(app.includes(marker), `Chybí UI marker ${marker}`);
}

for (const type of [
  "Nádoba není přístupná",
  "Nádoba chybí",
  "Poškozená nádoba",
  "Odpad mimo nádobu",
  "Nesprávný druh odpadu",
  "Zákazník odmítl svoz",
  "Jiný problém"
]) {
  assert.ok(app.includes(type), `Chybí typ hlášení ${type}`);
}

for (const selector of [
  ".collection-route-incidents",
  ".collection-route-incident-row",
  ".collection-route-incident-drawer",
  ".collection-route-incident-dialog",
  ".collection-route-incident-phone-fields[hidden]",
  ".collection-route-incident-timeline",
  "@media (max-width: 768px)"
]) {
  assert.ok(styles.includes(selector), `Chybí CSS ${selector}`);
}

assert.match(store, /scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST[\s\S]*kso-test-simulator/);
assert.match(store, /collection_route_incident_production_contact_disabled/);
assert.match(store, /deliveredRequiresWebhook: true/);
assert.match(store, /RESOLUTION_CODES/);
assert.match(store, /idempotency_key/);
assert.doesNotMatch(app, /Doručeno[^\n]+kso-test-simulator/);
assert.match(localServer, /\/api\/collection-routes\/incidents/);
assert.match(localServer, /externalSendingEnabled: false/);
assert.doesNotMatch(localServer, /local-incident-[\s\S]{0,4000}(sendgrid|twilio)/i);

console.log("collection route incident UI tests passed");
