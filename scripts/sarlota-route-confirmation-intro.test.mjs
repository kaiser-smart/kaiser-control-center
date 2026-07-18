import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mantraSource = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");

const transitionStart = appSource.indexOf("async function transitionMyCollectionDailyRoute(action)");
const transitionEnd = appSource.indexOf("async function optimizeMyCollectionDailyRouteWithHere", transitionStart);
assert.ok(transitionStart >= 0 && transitionEnd > transitionStart);
const transitionSource = appSource.slice(transitionStart, transitionEnd);

assert.match(transitionSource, /if \(action === "start"\) void elevenLabsAssistant\.unlockVoiceAudio\?\.\(\);/);
assert.match(transitionSource, /startSarlotaAfterTransition = action === "start";/);
assert.match(transitionSource, /await enableCollectionDailyDriverSarlota\(\{ promptForMemory: false, invocation: "automatic" \}\);/);
assert.match(transitionSource, /Trasa je zahájená\. Připravuji úvodní přivítání Šarloty/);
assert.doesNotMatch(transitionSource, /speechSynthesis|SpeechSynthesisUtterance/);

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
assert.match(appSource, /myDailyRouteSarlotaAutoSession = automaticSession;/);
assert.match(appSource, /Můžeš s ní rovnou mluvit/);
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
assert.match(mantraSource, /mikrofonový panel se ukáže jen při ručním ZAPNOUT ŠARLOTU/);
assert.match(mantraSource, /Mluvím, Poslouchám a Přemýšlím/);
assert.match(mantraSource, /signed URL, WebSocket nebo audio selže/);

console.log("Šarlota route confirmation intro tests passed.");
