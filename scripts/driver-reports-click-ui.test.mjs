import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Chybí začátek: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Chybí konec: ${end}`);
  return source.slice(startIndex, endIndex);
}

const driverReportForm = sourceBetween(appSource, "function driverReportCreateForm", "function driverReportOrderForm");
const driverReportEntry = sourceBetween(appSource, "function driverReportCreateEntry", "function driverReportActiveQueue");
const aiLayer = sourceBetween(appSource, "function renderAiAssistantLayer", "function renderAiAssistantLayerOnly");

assert.match(driverReportForm, /1\. SPZ vozidla/);
assert.match(driverReportForm, /2\. Popis problému/);
assert.match(driverReportForm, /3 odeslat/);
assert.match(appSource, /source: "manual"/);
assert.doesNotMatch(driverReportForm, /Šarlota|fotku|fotka/i);

assert.match(driverReportEntry, /id="nove-hlaseni"/);
assert.match(driverReportEntry, /Nové hlášení z vozidla/);
assert.match(driverReportEntry, /driverReportCreateForm\(user, \{ compact: true \}\)/);
assert.doesNotMatch(appSource, /function driverReportMobileEntry/);
assert.doesNotMatch(appSource, /function driverReportDesktopEntryCard/);

assert.match(aiLayer, /\|\| isDriverReportsPath\(\)/);
assert.match(appSource, /isDriverReportsPath\(path\).*closeAiAssistant\(\{ renderAfter: false \}\)/s);

assert.match(stylesSource, /\.driver-report-click-entry \{/);
assert.match(stylesSource, /\.driver-report-click-entry__head \{/);
assert.match(stylesSource, /\.ui-system-v2 \.driver-report-form \.driver-report-pitstop-submit \{\s+min-height: 52px;/);
assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.driver-report-click-entry \{/);
assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.driver-report-desktop-workspace,[\s\S]*?display: none;/);

console.log("Driver reports click UI: ok");
