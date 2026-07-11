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
const filterMatchingSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusMessageMatchesFilter"),
  appSource.indexOf("function dataBoxPlusFilteredMessages")
);
const tabsSource = appSource.match(/const DATA_BOX_PLUS_TABS = \[[\s\S]*?\];/)?.[0] || "";
const autopilotSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusAutopilotPanel()"),
  appSource.indexOf("function dataBoxPlusFilteredRules")
);
const rulesSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusRulesPanel()"),
  appSource.indexOf("function dataBoxPlusMailboxValue")
);
const settingsSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusSettingsPanel()"),
  appSource.indexOf("function dataBoxPlusAutopilotHelp()")
);
const autopilotHelpSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusAutopilotHelp()"),
  appSource.indexOf("function dataBoxPlusFacts")
);
const activePanelSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusActivePanel()"),
  appSource.indexOf("function dataBoxPlusPage")
);

assert.match(appSource, /activeTab: "messages"/);
assert.deepEqual(
  [...tabsSource.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)].map((match) => match.slice(1)),
  [["messages", "Zprávy"], ["autopilot", "Autopilot"], ["settings", "Nastavení"]]
);
assert.doesNotMatch(tabsSource, /K doplnění|Pravidla a učení|Archiv|Manuál/);
assert.match(filterOptionsSource, /\["new", "Nové"\]/);
assert.doesNotMatch(filterOptionsSource, /\["confirmations", "K doplnění"\]/);
assert.match(filterOptionsSource, /\["problem", "Vyžaduje zásah"\]/);
assert.match(filterOptionsSource, /\["archive", "Archivované"\]/);
assert.match(filterOptionsSource, /\["all", "Vše"\]/);
assert.doesNotMatch(filterOptionsSource, /Nepřečtené/);
assert.ok(filterOptionsSource.indexOf('["new", "Nové"]') < filterOptionsSource.indexOf('["all", "Vše"]'));
assert.match(filterMatchingSource, /filter === "problem"[\s\S]*Potřebuje upřesnit[\s\S]*Potřebuje adresáta[\s\S]*Chybí vozidlo[\s\S]*Chybí příloha[\s\S]*Nelze provést/);
assert.doesNotMatch(filterMatchingSource, /filter === "confirmations"/);
assert.match(messageRowSource, /data-ds-plus-open=/);
assert.match(messageRowSource, /data-ds-plus-chat=/);
assert.doesNotMatch(messageRowSource, /dataBoxPlusCompactWorkflow|dataBoxPlusRenderWorkflowAction|Pravděpodobně|Bez další akce|Potřebuje pokyn/);
assert.match(appSource, /function dataBoxPlusIsUnresolvedMessage/);
assert.doesNotMatch(appSource, /dataBoxPlusMarkMessageRead|dataBoxPlusReadMessageIds/);
assert.match(styles, /\.ds-plus-message-row--unresolved[\s\S]*background: #1976d2/);
assert.match(autopilotSource, /dataBoxPlusAutopilotHelp\(\)/);
assert.match(autopilotHelpSource, /Jak Datové schránky Plus používat/);
assert.doesNotMatch(appSource, /function dataBoxPlusManualPanel/);
assert.doesNotMatch(appSource, /function dataBoxPlusConfirmationsPanel/);
assert.doesNotMatch(appSource, /function dataBoxPlusArchivePanel/);
assert.match(settingsSource, /Technická správa[\s\S]*data-ds-plus-tab="rules"[\s\S]*Otevřít pravidla a automatizace/);
assert.match(rulesSource, /Seznam pravidel a automatizace[\s\S]*data-ds-plus-tab="settings"[\s\S]*Zpět do Nastavení/);
assert.match(activePanelSource, /activeTab === "rules"/);
assert.doesNotMatch(activePanelSource, /confirmations|archive|manual/);
assert.match(styles, /\.ds-plus-collapsible-panel\s*\{/);

assert.match(composeSource, /data-ds-plus-compose-recipient/);
assert.match(composeSource, /data-ds-plus-compose-form/);
assert.match(appSource, /Návrh nové datové zprávy je připravený v tomto okně/);
assert.match(styles, /\.ds-plus-command-pagination\s*\{/);
assert.match(styles, /\.ds-plus-compose-footer\s*\{/);

console.log("data-box-plus message list and compose flow ok");
