import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_BOX_PLUS_MANTRA } from "../src/data/dataBoxPlusMantra.js";
import { DATA_BOX_PLUS_OPERATIONAL_CONTRACT } from "../src/data/dataBoxPlusOperationalContract.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/data-box-plus-store.js", import.meta.url), "utf8");
const testApiSource = readFileSync(new URL("../functions/api/data-box-plus/mailboxes/[id]/test.js", import.meta.url), "utf8");
const connectionTestSource = storeSource.slice(
  storeSource.indexOf("export async function testDataBoxPlusMailboxConnection"),
  storeSource.indexOf("export async function listDataBoxPlusMessages")
);

assert.equal(DATA_BOX_PLUS_MANTRA.status, "Ostrý pracovní modul");
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.route, "/datove-schranky-plus");
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.sync.intervalMinutes, 60);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.sync.requiresOpenBrowser, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.messageDirections.sent.historyOnly, true);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.messageDirections.sent.aiProcessing, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.messageDirections.sent.automationMatching, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.externalSending.emailAutomatic, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.externalSending.dataBoxReplyAutomatic, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.externalSending.physicalConfirmationRequired, true);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.credentials.frontendMayReadPassword, false);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.ui.replyActionAlwaysVisible, true);
assert.equal(DATA_BOX_PLUS_OPERATIONAL_CONTRACT.ui.pdfPreviewButtonRequired, true);

assert.match(appSource, /dataBoxPlusAccessSettingsOverlay\(user\)/);
assert.match(appSource, /Přístupy datových schránek/);
assert.match(appSource, /Otestovat připojení/);
assert.match(appSource, /Heslo se po uložení nikdy nezobrazí/);
assert.match(storeSource, /export async function testDataBoxPlusMailboxConnection/);
assert.match(connectionTestSource, /fetchDataBoxMessageMetadata/);
assert.match(connectionTestSource, /Otestovat připojení DSP/);
assert.doesNotMatch(connectionTestSource, /password\s*[:,]/);
assert.match(testApiSource, /requireUserPermission\(env, request, "data-box-plus", "manage"\)/);
assert.match(testApiSource, /testDataBoxPlusMailboxConnection/);

console.log("data-box-plus operational contract and access settings ok");
