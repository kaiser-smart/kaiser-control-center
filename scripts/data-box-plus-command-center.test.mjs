import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const composeSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusComposeOverlay()"),
  appSource.indexOf("function dataBoxPlusShortAssistantText")
);
const messageRowSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusMessageRow(message)"),
  appSource.indexOf("function dataBoxPlusMessagesPanel()")
);
const filterOptionsSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusFilterOptions()"),
  appSource.indexOf("function dataBoxPlusMessageMatchesFilter")
);

assert.match(appSource, /activeTab: "messages"/);
assert.doesNotMatch(appSource.match(/const DATA_BOX_PLUS_TABS = \[[\s\S]*?\];/)?.[0] || "", /Řídicí centrum/);
assert.match(filterOptionsSource, /\["unread", "Nepřečtené"\]/);
assert.match(filterOptionsSource, /\["all", "Vše"\]/);
assert.ok(filterOptionsSource.indexOf('["unread", "Nepřečtené"]') < filterOptionsSource.indexOf('["all", "Vše"]'));
assert.match(messageRowSource, /data-ds-plus-open=/);
assert.match(messageRowSource, /data-ds-plus-chat=/);
assert.doesNotMatch(messageRowSource, /dataBoxPlusCompactWorkflow|dataBoxPlusRenderWorkflowAction|Pravděpodobně|Bez další akce|Potřebuje pokyn/);
assert.match(appSource, /function dataBoxPlusIsUnreadMessage/);
assert.match(appSource, /dataBoxPlusMarkMessageRead\(dataBoxPlusState\.selectedMessageId\)/);
assert.match(styles, /\.ds-plus-message-row--unread[\s\S]*background: #1976d2/);

assert.match(composeSource, /data-ds-plus-compose-recipient/);
assert.match(composeSource, /data-ds-plus-compose-form/);
assert.match(appSource, /Návrh nové datové zprávy je připravený v tomto okně/);
assert.match(styles, /\.ds-plus-command-pagination\s*\{/);
assert.match(styles, /\.ds-plus-compose-footer\s*\{/);

console.log("data-box-plus message list and compose flow ok");
