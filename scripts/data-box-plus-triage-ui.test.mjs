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

assert.match(runtimeConfigSource, /dataBoxPlusTriagePreview: false/);
assert.match(buildSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW/);
assert.match(serveSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW/);
assert.match(deploySource, /DATA_BOX_PLUS_TRIAGE_PREVIEW = "true"/);
assert.match(deploySource, /runtimeConfigSource\.includes\('\"dataBoxPlusTriagePreview\": true'\)/);
assert.match(appSource, /function dataBoxPlusTriagePreviewActive\(user = authState\.user \? currentUser\(\) : null\)/);
assert.match(appSource, /dataBoxPlusTriagePreviewEnabled\(\s*runtimeConfig\.dataBoxPlusTriagePreview,\s*window\.location\.hostname,\s*user\?\.id/);
assert.match(triageModuleSource, /new Set\(\["localhost", "127\.0\.0\.1", "::1"\]\)/);
assert.match(triageModuleSource, /new Set\(\["smart-odpady\.ai", "www\.smart-odpady\.ai"\]\)/);
assert.match(triageModuleSource, /new Set\(\["radim-oplustil"\]\)/);
assert.match(triageModuleSource, /dbp-kaiser-servis/);
assert.match(triageModuleSource, /dbp-kaiser-holding/);
assert.match(appSource, /if \(dataBoxPlusTriagePreviewActive\(user\)\) \{\s+return dataBoxPlusTriagePage\(moduleItem, user\);/);
assert.match(appSource, /function suspendAiAssistantForDataBoxPlusTriage\(\)/);
assert.match(appSource, /closeAiAssistant\(\{ renderAfter: false, launcherVisible: false \}\)/);
assert.match(appSource, /elevenLabsAssistant\.stopVoiceAudio\?\.\(\)/);
assert.match(appSource, /speechRecognition\.stop\(\{ status: false \}\)/);
assert.match(appSource, /syncDataBoxPlusTriageAssistantBoundary\(path, user\)/);
assert.match(appSource, /dataBoxPlusTriagePreviewActive\(user\) && normalizePath\(window\.location\.pathname\) === DATA_BOX_PLUS_ROUTE/);
assert.doesNotMatch(appSource, /DATA_BOX_PLUS_TRIAGE_PREVIEW_ENABLED/);
assert.match(appSource, /url\.searchParams\.delete\("open"\)/);
assert.match(appSource, /const sarlotaDeepLink = triagePreviewRoute \? false : prepareSarlotaDeepLinkPanel\(\)/);

assert.match(triageRenderSource, /Vyber datovou schránku/);
assert.match(triageRenderSource, /K vyřízení/);
assert.match(triageRenderSource, /Předané/);
assert.match(triageRenderSource, /Hotové/);
assert.doesNotMatch(triageRenderSource, /Blokováno|blokováno/);
assert.match(triageRenderSource, /Fronty jsou místní pohled nad aktuálními daty/);
assert.match(triageRenderSource, /max\. 150 zpráv/);
assert.match(triageRenderSource, /data-ds-plus-triage-mailbox=/);
assert.match(triageRenderSource, /data-ds-plus-triage-queue=/);
assert.match(triageRenderSource, /data-ds-plus-triage-open=/);
assert.match(triageRenderSource, /tabindex="-1" data-ds-plus-triage-close/);
assert.match(triageRenderSource, /data-ds-plus-triage-close-button/);
assert.match(triageRenderSource, /Zeptat se k této zprávě/);
assert.doesNotMatch(triageRenderSource, /data-ds-plus-chat=|data-ds-plus-confirm=|data-ds-plus-dismiss=/);
assert.doesNotMatch(triageRenderSource, /data-ds-plus-pilot-action=|data-ds-plus-open-url=/);
assert.doesNotMatch(triageRenderSource, /apiJson\(|method:\s*"POST"|localStorage|sessionStorage/);

assert.match(triageClickSource, /const detailLoaded = await loadDataBoxPlusMessageDetail\(messageId\)/);
assert.match(triageClickSource, /if \(!detailLoaded\)[\s\S]*triageSelectedMessageId = ""/);
assert.match(triageClickSource, /triageDetailError = dataBoxPlusState\.notice/);
assert.match(appSource, /event\.key === "Tab" && dataBoxPlusState\.triageSelectedMessageId/);
assert.match(appSource, /\.ds-plus-triage-detail\[role='dialog'\]/);
assert.doesNotMatch(triageClickSource, /apiJson\(|method:\s*"POST"|confirmDataBoxPlusRecommendation|runDataBoxPlusInstruction/);
assert.match(loaderSource, /dataBoxPlusTriagePreviewActive\(\)[\s\S]*readDataBoxPlusTriageSnapshot\(apiJson\)/);
assert.match(triageModuleSource, /requestJson\("\/api\/data-box-plus\/messages\?limit=150", \{ method: "GET" \}\)/);
assert.doesNotMatch(triageModuleSource, /\/api\/data-box-plus\/status/);

assert.match(stylesSource, /\.ds-plus-triage-mailboxes\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-queues\s*\{/);
assert.match(stylesSource, /\.ds-plus-triage-row\s*\{/);
assert.match(stylesSource, /@media \(max-width: 768px\)[\s\S]*\.ds-plus-triage-row/);
assert.match(stylesSource, /@media \(max-width: 520px\)[\s\S]*\.ds-plus-triage-mailboxes/);
assert.match(stylesSource, /body:has\(\.ds-plus-triage-preview\) \.ai-assistant-layer[\s\S]*display: none !important/);

console.log("data-box-plus triage UI corridor ok");
