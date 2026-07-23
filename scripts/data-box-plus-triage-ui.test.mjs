import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const runtimeConfigSource = readFileSync(new URL("../src/data/runtimeConfig.js", import.meta.url), "utf8");
const buildSource = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
const serveSource = readFileSync(new URL("../scripts/serve.mjs", import.meta.url), "utf8");
const deploySource = readFileSync(new URL("../scripts/deploy-pages-production.mjs", import.meta.url), "utf8");
const triageModuleSource = readFileSync(new URL("../src/data/dataBoxPlusTriage.js", import.meta.url), "utf8");

const triageRenderSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusTriageMailboxOptions()"),
  appSource.indexOf("function dataBoxPlusAutopilotPanel()")
);
const triageClickSource = appSource.slice(
  appSource.indexOf('const dataBoxPlusTriageMailbox = event.target.closest("[data-ds-plus-triage-mailbox]")'),
  appSource.indexOf('const dataBoxPlusCommandPage = event.target.closest("[data-ds-plus-command-page]")')
);
const loaderSource = appSource.slice(
  appSource.indexOf("async function loadDataBoxPlusData(options = {})"),
  appSource.indexOf("function ensureDataBoxPlusData()")
);

assert.doesNotMatch(runtimeConfigSource, /dataBoxPlusTriagePreview/);
assert.doesNotMatch(buildSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW|dataBoxPlusTriagePreview/);
assert.doesNotMatch(serveSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW|dataBoxPlusTriagePreview/);
assert.doesNotMatch(deploySource, /DATA_BOX_PLUS_TRIAGE_PREVIEW/);
assert.match(deploySource, /runtimeConfigSource\.includes\("dataBoxPlusTriagePreview"\)/);
assert.match(appSource, /function dataBoxPlusWorkingInboxActive\(\) \{\s+return true;/);
assert.doesNotMatch(appSource, /dataBoxPlusTriagePreviewActive|dataBoxPlusTriagePreviewEnabled/);
assert.doesNotMatch(triageModuleSource, /PREVIEW_USER_IDS|PRODUCTION_HOSTS|LOCAL_HOSTS/);
assert.match(triageModuleSource, /dbp-kaiser-servis/);
assert.match(triageModuleSource, /dbp-kaiser-holding/);
assert.match(appSource, /if \(dataBoxPlusWorkingInboxActive\(user\)\) \{\s+return dataBoxPlusTriagePage\(moduleItem, user\);/);
assert.match(appSource, /function suspendAiAssistantForDataBoxPlusTriage\(\)/);
assert.match(appSource, /closeAiAssistant\(\{ renderAfter: false, launcherVisible: false \}\)/);
assert.match(appSource, /elevenLabsAssistant\.stopVoiceAudio\?\.\(\)/);
assert.match(appSource, /speechRecognition\.stop\(\{ status: false \}\)/);
assert.match(appSource, /syncDataBoxPlusTriageAssistantBoundary\(path, user\)/);
assert.match(appSource, /dataBoxPlusWorkingInboxActive\(user\) && normalizePath\(window\.location\.pathname\) === DATA_BOX_PLUS_ROUTE/);
assert.doesNotMatch(appSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW_ENABLED/);
assert.match(appSource, /url\.searchParams\.delete\("open"\)/);
assert.match(appSource, /const sarlotaDeepLink = workingInboxRoute \? false : prepareSarlotaDeepLinkPanel\(\)/);

assert.match(triageRenderSource, /Vyber datovou schránku/);
assert.match(triageRenderSource, /K vyřízení/);
assert.match(triageRenderSource, /Čeká na někoho/);
assert.match(triageRenderSource, /Hotové/);
assert.match(triageRenderSource, /Přijaté/);
assert.match(triageRenderSource, /Odeslané/);
assert.match(triageRenderSource, /Koncepty/);
assert.match(triageRenderSource, /data-ds-plus-draft-open=/);
assert.match(triageRenderSource, /data-ds-plus-draft-delete=/);
assert.match(triageRenderSource, /Archiv/);
assert.doesNotMatch(triageRenderSource, /Blokováno|blokováno/);
assert.doesNotMatch(triageRenderSource, /Testovací režim|pilot/);
assert.match(triageRenderSource, /Automatické načítání/);
assert.match(triageRenderSource, /automaticky každou celou hodinu/);
assert.match(triageRenderSource, /max\. 150 zpráv/);
assert.match(triageRenderSource, /data-ds-plus-triage-mailbox=/);
assert.match(triageRenderSource, /data-ds-plus-triage-mailbox-select/);
assert.match(triageRenderSource, /data-ds-plus-triage-folder=/);
assert.match(triageRenderSource, /data-ds-plus-triage-queue=/);
assert.match(triageRenderSource, /data-ds-plus-triage-open=/);
assert.match(triageRenderSource, />Otevřít<\/button>/);
assert.match(triageRenderSource, /＋ Nová datová zpráva/);
assert.match(triageRenderSource, /data-ds-plus-compose-open/);
assert.match(triageRenderSource, /dataBoxPlusComposeOverlay\(\)/);
assert.doesNotMatch(triageRenderSource, /↻ Načíst zprávy|data-ds-plus-service-sync/);
assert.match(triageRenderSource, /tabindex="-1" data-ds-plus-triage-close/);
assert.match(triageRenderSource, /data-ds-plus-triage-close-button/);
assert.match(triageRenderSource, /Otevřít náhled/);
assert.match(triageRenderSource, /Stáhnout/);
assert.match(triageRenderSource, /Stáhnout všechny přílohy/);
assert.match(triageRenderSource, /data-ds-plus-triage-select=/);
assert.match(triageRenderSource, /data-ds-plus-bulk=/);
assert.match(triageRenderSource, /data-ds-plus-triage-advanced=/);
assert.match(triageRenderSource, /data-ds-plus-open-url=/);
assert.doesNotMatch(triageRenderSource, /data-ds-plus-chat=|data-ds-plus-confirm=|data-ds-plus-dismiss=/);
assert.doesNotMatch(triageRenderSource, /data-ds-plus-pilot-action=/);
assert.doesNotMatch(triageRenderSource, /dataBoxPlusTechnicalInfo\(message\)/);
assert.doesNotMatch(triageRenderSource, /apiJson\(|method:\s*"POST"|localStorage|sessionStorage/);

assert.match(triageClickSource, /const detailLoaded = await loadDataBoxPlusMessageDetail\(messageId\)/);
assert.match(triageClickSource, /if \(!detailLoaded\)[\s\S]*triageSelectedMessageId = ""/);
assert.match(triageClickSource, /triageDetailError = dataBoxPlusState\.notice/);
assert.match(appSource, /event\.key === "Tab" && dataBoxPlusState\.triageSelectedMessageId/);
assert.match(appSource, /\.ds-plus-triage-detail\[role='dialog'\]/);
assert.doesNotMatch(triageClickSource, /apiJson\(|method:\s*"POST"|confirmDataBoxPlusRecommendation|runDataBoxPlusInstruction/);
assert.match(loaderSource, /dataBoxPlusWorkingInboxActive\(\)[\s\S]*readDataBoxPlusTriageSnapshot\(apiJson\)/);
assert.match(triageModuleSource, /requestJson\("\/api\/data-box-plus\/status", \{ method: "GET" \}\)/);
assert.match(triageModuleSource, /requestJson\("\/api\/data-box-plus\/messages\?limit=150", \{ method: "GET" \}\)/);
assert.match(triageModuleSource, /requestJson\("\/api\/data-box-plus\/drafts\?status=all", \{ method: "GET" \}\)/);

assert.match(stylesSource, /\.ds-plus-triage-mailboxes\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-folders\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-queues\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-row\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-filters\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-bulk\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-detail-overlay\s*\{[\s\S]*justify-content: flex-end/);
assert.match(stylesSource, /\.ds-plus-triage-detail__footer\s*\{[\s\S]*position: sticky/);
assert.match(stylesSource, /@media \(max-width: 768px\)[\s\S]*\.ds-plus-triage-row/);
assert.match(stylesSource, /@media \(max-width: 520px\)[\s\S]*\.ds-plus-triage-mailboxes/);
assert.match(stylesSource, /body:has\(\.ds-plus-triage-production\) \.ai-assistant-layer[\s\S]*display: none !important/);
assert.doesNotMatch(stylesSource, /ds-plus-triage-preview/);

console.log("data-box-plus triage UI corridor ok");
