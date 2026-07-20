import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mantraSource = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");
const systemPromptSource = readFileSync(new URL("../src/sarlota/sarlotaSystemPrompt.js", import.meta.url), "utf8");
const voiceClientSource = readFileSync(new URL("../src/useElevenLabsAssistant.js", import.meta.url), "utf8");
const contextSource = readFileSync(new URL("../functions/_lib/collection-routes-sarlota-context.js", import.meta.url), "utf8");
const sourcePrompt = readFileSync(new URL("../docs/SARLOTA_COLLECTION_CREW_TABLET_SOURCE_PROMPT.md", import.meta.url), "utf8");

const transitionStart = appSource.indexOf("async function transitionMyCollectionDailyRoute(action)");
const transitionEnd = appSource.indexOf("async function optimizeMyCollectionDailyRouteWithHere", transitionStart);
assert.ok(transitionStart >= 0 && transitionEnd > transitionStart);
const transitionSource = appSource.slice(transitionStart, transitionEnd);

assert.match(transitionSource, /if \(action === "start"\) \{[\s\S]*unlockVoiceAudio/);
assert.doesNotMatch(
  transitionSource.slice(0, transitionSource.indexOf("let startSarlotaAfterTransition")),
  /prepareVoiceInput/,
  "Automatický úvod pouze přehrává ověřené audio a nesmí žádat mikrofon."
);
assert.match(transitionSource, /startSarlotaAfterTransition = action === "start";/);
assert.match(transitionSource, /await enableCollectionDailyDriverSarlota\(\{ promptForMemory: false, invocation: "automatic" \}\);/);
assert.match(transitionSource, /Trasa je zahájená\. Připravuji úvodní přivítání Šarloty/);
assert.doesNotMatch(transitionSource, /speechSynthesis|SpeechSynthesisUtterance/);

const loadRouteStart = appSource.indexOf("async function loadMyCollectionDailyRoute(options = {})");
const loadRouteEnd = appSource.indexOf("async function transitionMyCollectionDailyRoute(action)", loadRouteStart);
assert.ok(loadRouteStart >= 0 && loadRouteEnd > loadRouteStart);
const loadRouteSource = appSource.slice(loadRouteStart, loadRouteEnd);

assert.match(appSource, /function collectionDailyDriverSarlotaAutoStartRunId\(\)/);
assert.match(appSource, /run\.scope !== "test"/);
assert.match(appSource, /run\.status !== "active"/);
assert.match(appSource, /normalizePath\(window\.location\.pathname\) !== COLLECTION_ROUTES_DRIVER_TEST_KIOSK_ROUTE/);
assert.match(appSource, /\|\| collectionDriverBlackviewSimulatorRequested\(\)/);
assert.match(appSource, /myDailyRouteSarlotaAutoAttemptedRunId === run\.id/);
assert.match(loadRouteSource, /const sarlotaAutoStartRunId = collectionDailyDriverSarlotaAutoStartRunId\(\);/);
assert.match(loadRouteSource, /myDailyRouteSarlotaAutoAttemptedRunId = sarlotaAutoStartRunId;/);
assert.match(loadRouteSource, /await enableCollectionDailyDriverSarlota\(\{ promptForMemory: false, invocation: "automatic" \}\);/);
assert.match(appSource, /Automatický start čeká na mikrofon\. Povol mikrofon pro tento web/);

const enableStart = appSource.indexOf("async function enableCollectionDailyDriverSarlota(options = {})");
const enableEnd = appSource.indexOf("async function grantCollectionRoutesSarlotaMemoryAndStart", enableStart);
assert.ok(enableStart >= 0 && enableEnd > enableStart);
const enableSource = appSource.slice(enableStart, enableEnd);

assert.match(enableSource, /const context = await loadCollectionRoutesSarlotaContext\(\);/);
assert.match(enableSource, /const promptForMemory = options\.promptForMemory !== false;/);
assert.match(enableSource, /if \(promptForMemory && context\.memory\?\.available && context\.memory\?\.consent !== true\)/);
assert.match(enableSource, /collectionRoutesPilotState\.myDailyRoutePanel = "";/);
assert.match(enableSource, /await startCollectionDailyDriverSarlota\(options\);/);
assert.match(appSource, /const automaticSession = options\.invocation === "automatic";/);
assert.match(appSource, /const automaticRetryCount = Math\.max\(0, Number\(options\.automaticRetryCount \|\| 0\)\);/);
assert.match(appSource, /myDailyRouteSarlotaAutoSession = automaticSession;/);
assert.match(appSource, /myDailyRouteSarlotaIntroCompleted = false;/);
assert.match(appSource, /endAfterGeneratedIntro: automaticSession/);
assert.match(appSource, /options\.endAfterGeneratedIntro === true[\s\S]*Ověřuji fakta[\s\S]*Zvuk zatím neběží/);
assert.match(appSource, /COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST/);
assert.match(appSource, /Úvodní hlášení skončilo\. Šarlota je vypnutá/);
assert.match(appSource, /ŠARLOTA PŘIPRAVUJE OVĚŘENÝ ÚVOD/);
assert.match(appSource, /SPUSTIT ZVUK A PŘEHRÁT ÚVOD/);
assert.match(appSource, /ZAPNOUT ŠARLOTU MIKROFONEM/);
assert.match(appSource, /Můžeš s ní rovnou mluvit/);
assert.match(appSource, /automaticSession && error\?\.code === "voice_disconnected" && automaticRetryCount < 1/);
assert.match(appSource, /Šarlotu jednou automaticky znovu připojuji/);
assert.match(appSource, /automaticRetryCount: automaticRetryCount \+ 1/);
assert.match(
  appSource,
  /isCollectionRoutesPath\(normalizePath\(window\.location\.pathname\)\)\s*&& collectionRoutesPilotState\.myDailyRouteSarlotaAutoSession\s*\) \{\s*closeAiAssistant\(\{ launcherVisible: false \}\);\s*return;/,
  "Ukončení automatické relace musí zavřít hlasové okno; mikrofonový panel smí otevřít jen ruční spuštění."
);

assert.match(appSource, /data-collection-driver-route-confirmation-open/);
assert.match(appSource, /data-collection-driver-route-confirmation-form/);
assert.match(appSource, /async function openCollectionDailyDriverRouteConfirmation\(\)/);
assert.match(appSource, /async function confirmAndStartMyCollectionDailyRoute\(form\)/);
assert.match(appSource, /const requestedMemory = Boolean\(form\?\.elements\?\.useMemory\?\.checked\);/);
assert.match(appSource, /const context = await loadCollectionRoutesSarlotaContext\(\);/);
assert.match(appSource, /if \(context\.readiness\?\.canStart !== true\)/);
assert.match(appSource, /Dnešní trasu se nepodařilo bezpečně ověřit\. Trasa nebyla zahájená\./);
assert.match(appSource, /const useMemory = memory\.consent === true \|\| requestedMemory;/);
assert.match(appSource, /Pracovní paměť se nepodařilo nastavit\. Trasa nebyla zahájená\./);
assert.match(appSource, /await transitionMyCollectionDailyRoute\("start"\);/);
assert.match(appSource, /DNEŠNÍ TRASA · JEDEN KROK/);
assert.match(appSource, /Když volbu nezaškrtneš, Šarlota se spustí bez paměti/);
assert.match(appSource, /Šarlota nic dalšího sama neuloží ani neodešle/);
assert.match(appSource, /POTVRDIT DNEŠNÍ TRASU/);
assert.match(appSource, /POTVRDIT A ZAHÁJIT TEST/);
assert.match(appSource, /POTVRDIT A ZAHÁJIT TRASU/);
assert.match(appSource, /V jednom okně potvrdíš trasu i pracovní paměť Šarloty/);
assert.match(appSource, /POČASÍ PRO SMĚNU/);
assert.match(appSource, /Osádka|OSÁDKA/);
assert.match(appSource, /TRASU TEĎ NELZE ZAHÁJIT/);
assert.match(appSource, /pending \|\| !routeCanStart \? "disabled" : ""/);
assert.match(styleSource, /Blackview Active 7 LTE/);
assert.match(styleSource, /\.collection-daily-driver-route-confirmation > \.primary-action \{\s*min-height: 54px;/);
assert.match(styleSource, /\.collection-daily-driver-modal > section \{\s*max-height: calc\(100dvh - 8px\);/);
assert.match(mantraSource, /v jednom okně a jedním finálním klepnutím/);
assert.match(mantraSource, /paměť výslovně nezaškrtne, nezapne se ani se nic neuloží/);
assert.match(mantraSource, /ZAPNOUT ŠARLOTU MIKROFONEM/);
assert.match(mantraSource, /Po dohrání se hologram, hlasová relace i mikrofon automaticky vypnou/);
assert.match(mantraSource, /Mirku, s čím mohu pomoct/);
assert.match(mantraSource, /signed URL, WebSocket nebo audio selže/);
assert.match(mantraSource, /nesmí přečíst pevnou backendovou šablonu/);
assert.match(mantraSource, /skutečně aktivního Promptu, připojené Knowledge Base, Tools a dynamic variables/);
assert.match(mantraSource, /na potvrzení trasy se znovu neptá/);
assert.match(systemPromptSource, /SVOZOVÉ TRASY \/ TABLET OSÁDKY A ÚVODNÍ HLÁŠENÍ/);
assert.match(systemPromptSource, /přesnou technickou hodnotu KSO_INTRO_GENERATION_PENDING/);
assert.match(systemPromptSource, /aktivního Promptu, připojené Knowledge Base a ověřených dynamic variables/);
assert.match(systemPromptSource, /Na potvrzení se znovu neptej|na potvrzení trasy se znovu neptej/);
assert.match(systemPromptSource, /Hlas HERE navigace je samostatný systém/);
assert.match(contextSource, /COLLECTION_ROUTES_INTRO_GENERATION_MARKER = "KSO_INTRO_GENERATION_PENDING"/);
assert.doesNotMatch(contextSource, /Jestli máš kafe po ruce|Budu hlídat trasu, zastávky i všechno důležité/);
assert.match(voiceClientSource, /suppressing-technical-first-message/);
assert.match(voiceClientSource, /waiting-for-generated-intro/);
assert.match(voiceClientSource, /sendJson\(\{ type: "user_message", text: introGenerationRequest \}\)/);
assert.match(voiceClientSource, /endAfterGeneratedIntro/);
assert.match(voiceClientSource, /state: "intro-complete"/);
assert.match(sourcePrompt, /BEZPEČNÝ PROVOZNÍ VÝTAH JE AKTIVNÍ/);

console.log("Šarlota route confirmation intro tests passed.");
