import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const pageSource = appSource.slice(
  appSource.indexOf("function selfRepairPage(moduleItem, user)"),
  appSource.indexOf("function driverReportSelectedIdFromUrl()")
);
const detailSource = appSource.slice(
  appSource.indexOf("function selfRepairCaseDetail(user)"),
  appSource.indexOf("function selfRepairTechnicalManagement(moduleItem, user)")
);
const technicalSource = appSource.slice(
  appSource.indexOf("function selfRepairTechnicalManagement(moduleItem, user)"),
  appSource.indexOf("function selfRepairPage(moduleItem, user)")
);
const filterSource = appSource.slice(
  appSource.indexOf("function applySelfRepairFilters(form)"),
  appSource.indexOf("async function updateSelfRepairCaseFromForm(form)")
);

assert.match(appSource, /const SELF_REPAIR_ACTIVE_FILTER_VALUE = "active"/);
assert.match(appSource, /const SELF_REPAIR_ARCHIVED_STATUSES = new Set\(\["closed", "rejected", "duplicate"\]\)/);
assert.match(appSource, /status: SELF_REPAIR_ACTIVE_FILTER_VALUE/);
assert.match(appSource, /selfRepairState\.cases\.find\(\(item\) => !selfRepairCaseIsArchived\(item\)\)/);

assert.match(pageSource, /selfRepairOperationalOverview\(\)/);
assert.match(pageSource, /Nahlásit problém/);
assert.match(pageSource, /Hodinová kontrola · opravy vždy potvrzuje člověk/);
assert.match(pageSource, /Žádný aktivní případ\. Teď není potřeba nic řešit\./);
assert.match(pageSource, /Obnovit seznam/);
assert.match(pageSource, /selfRepairTechnicalManagement\(moduleItem, user\)/);
assert.doesNotMatch(pageSource, /Spustit read-only kontrolu/);
assert.doesNotMatch(pageSource, /moduleRulesAutomationPanel\(\{/);

assert.match(detailSource, /Vyřízení případu/);
assert.match(detailSource, /Uložit vyřízení/);
assert.match(detailSource, /<details class="self-repair-case-history">/);
assert.match(detailSource, /Historie a technické podklady/);
assert.match(detailSource, /Historie změn/);

assert.match(technicalSource, /<details class="self-repair-technical">/);
assert.match(technicalSource, /Technická správa/);
assert.match(technicalSource, /Spustit servisní kontrolu/);
assert.match(technicalSource, /selfRepairCapabilityGrid\(\)/);
assert.match(technicalSource, /moduleRulesAutomationPanel\(\{/);
assert.match(technicalSource, /genericModuleSettingsSection\(moduleItem\)/);

assert.match(filterSource, /status: SELF_REPAIR_ACTIVE_FILTER_VALUE/);
assert.match(filterSource, /selfRepairCaseIsArchived\(item\)/);
assert.match(stylesSource, /\.self-repair-overview\s*\{/);
assert.match(stylesSource, /\.self-repair-case-history\s*\{/);
assert.match(stylesSource, /\.self-repair-technical\s*\{/);
assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]*\.self-repair-service-actions/);

console.log("Self-repair UI cleanup tests passed.");
