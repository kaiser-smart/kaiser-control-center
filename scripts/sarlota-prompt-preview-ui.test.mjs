import assert from "node:assert/strict";
import fs from "node:fs";

import { SarlotaStatusPanel } from "../src/components/SarlotaStatusPanel.js";

const status = {
  generatedAt: "2026-07-18T12:00:00.000Z",
  agent: {
    assistantKey: "sarlota",
    assistantDisplayName: "Šarlota",
    assistantAgentIdPresent: true,
    assistantAgentIdMasked: "agent_***",
    status: "configured",
    name: "Šarlota"
  },
  driverReportPrompt: {
    status: "error",
    syncAllowed: true,
    rulePresent: false,
    forbiddenPhrasesPresent: []
  }
};

const readyPlan = {
  mode: "dry_run",
  ready: true,
  alreadyApplied: false,
  assistant: {
    assistantKey: "sarlota",
    assistantDisplayName: "Šarlota"
  },
  agent: {
    expectedName: "Šarlota",
    nameMatches: true,
    firstMessage: "{{intro_announcement}}",
    firstMessageMatches: true
  },
  prompt: {
    path: "conversation_config.agent.prompt.prompt",
    currentLength: 8421,
    targetLength: 12600,
    targetVersion: "sarlota-elevenlabs-2026-07-19-language-examples-hardened",
    currentFingerprint: "fnv1a-current-8421",
    currentPromptText: "TAJNY_TEXT_PROMPTU_SE_NESMI_ZOBRAZIT",
    willReplaceEntirePrompt: true,
    willAppendCollectionRoutesCrewTabletRule: true,
    willAppendCollectionRoutesContextRule: true,
    willAppendCollectionRoutesDriverActionRule: true,
    legacyRulePresent: false,
    forbiddenPhrasesPresent: []
  },
  safety: {
    returnsPromptText: false,
    requiresPostApplyTrue: true,
    willNotPatchFirstMessage: true,
    willNotPatchModel: true,
    willNotPatchTools: true
  }
};

const previewHtml = SarlotaStatusPanel({
  status,
  selectedAssistantKey: "sarlota",
  promptSyncPlan: readyPlan
});

assert.match(previewHtml, /Načíst náhled promptu/);
assert.match(previewHtml, /data-sarlota-prompt-plan/);
assert.match(previewHtml, /NÁHLED · BEZ ZÁPISU/);
assert.match(previewHtml, /Jeden kanonický prompt/);
assert.match(previewHtml, /12600 znaků/);
assert.match(previewHtml, /sarlota-elevenlabs-2026-07-19-language-examples-hardened/);
assert.match(previewHtml, /conversation_config\.agent\.prompt\.prompt/);
assert.match(previewHtml, /data-sarlota-prompt-apply/);
assert.match(previewHtml, /ZAPSAT DO ELEVENLABS/);
assert.doesNotMatch(previewHtml, /TAJNY_TEXT_PROMPTU_SE_NESMI_ZOBRAZIT/);

const confirmationHtml = SarlotaStatusPanel({
  status,
  selectedAssistantKey: "sarlota",
  promptSyncPlan: readyPlan,
  promptSyncConfirmationPending: true
});
assert.match(confirmationHtml, /POTVRDIT ZÁPIS DO ELEVENLABS/);
assert.match(confirmationHtml, /druhé kliknutí provede změnu/);

const languagePlan = {
  ready: true,
  alreadyApplied: false,
  packageVersion: "sarlota-language-2026-07-19-v1",
  currentFingerprint: "language-live-fingerprint",
  agent: { nameMatches: true, firstMessageMatches: true },
  knowledgeBase: {
    name: "Šarlota – jazyková reference KSO",
    action: "create",
    currentLength: 0,
    targetLength: 6400,
    secretContent: "TAJNY_OBSAH_KB_SE_NESMI_ZOBRAZIT"
  },
  pronunciationDictionary: {
    name: "Šarlota – čeština KSO",
    action: "create",
    currentRuleCount: 0,
    targetRuleCount: 26
  }
};
const languageHtml = SarlotaStatusPanel({
  status,
  selectedAssistantKey: "sarlota",
  languageSyncPlan: languagePlan
});
assert.match(languageHtml, /Načíst jazykový balík/);
assert.match(languageHtml, /data-sarlota-language-plan/);
assert.match(languageHtml, /Šarlota – jazyková reference KSO/);
assert.match(languageHtml, /0 → 26/);
assert.match(languageHtml, /data-sarlota-language-apply/);
assert.doesNotMatch(languageHtml, /TAJNY_OBSAH_KB_SE_NESMI_ZOBRAZIT/);

const plainHtml = SarlotaStatusPanel({ status, selectedAssistantKey: "sarlota" });
assert.doesNotMatch(plainHtml, /data-sarlota-prompt-apply/);

const appliedHtml = SarlotaStatusPanel({
  status,
  selectedAssistantKey: "sarlota",
  promptSyncPlan: {
    ...readyPlan,
    ready: false,
    alreadyApplied: true,
    prompt: {
      ...readyPlan.prompt,
      willAppendCollectionRoutesContextRule: false,
      willAppendCollectionRoutesDriverActionRule: false
    }
  }
});
assert.match(appliedHtml, /SYNCHRONIZOVÁNO/);
assert.doesNotMatch(appliedHtml, /data-sarlota-prompt-apply/);

const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const previewStart = appSource.indexOf("async function syncSarlotaPrompt()");
const applyStart = appSource.indexOf("async function applySarlotaPromptSync()");
const nextFunction = appSource.indexOf("function sarlotaLanguageSyncConfirmText", applyStart);
assert.ok(previewStart >= 0 && applyStart > previewStart && nextFunction > applyStart);
const previewSource = appSource.slice(previewStart, applyStart);
const applySource = appSource.slice(applyStart, nextFunction);
assert.match(previewSource, /sarlota-prompt-sync\?\$\{sarlotaAssistantApiQuery\(\)\}/);
assert.match(previewSource, /sarlotaStatusState\.promptSyncPlan = plan/);
assert.doesNotMatch(previewSource, /method: "POST"/);
assert.match(applySource, /method: "POST"/);
assert.match(applySource, /apply: true/);
assert.match(applySource, /expectedCurrentFingerprint/);
assert.match(applySource, /promptSyncConfirmationPending/);
assert.doesNotMatch(applySource, /window\.confirm/);
assert.match(appSource, /data-sarlota-prompt-apply/);
assert.match(appSource, /data-sarlota-prompt-plan-cancel/);
assert.match(appSource, /sarlota-language-sync/);
assert.match(appSource, /data-sarlota-language-apply/);
assert.match(appSource, /expectedCurrentFingerprint: plan\.currentFingerprint/);
assert.match(appSource, /myDailyRouteSarlotaConnecting/);
assert.match(appSource, /options\.onFailed\?\.\(error\)/);

console.log("sarlota prompt preview UI tests: OK");
