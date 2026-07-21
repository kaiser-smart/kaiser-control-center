import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { userDynamicVariablesForAi } from "../functions/_lib/ai-people-summary.js";
import { createIntroSpeechActivityDetector } from "../src/useElevenLabsAssistant.js";

import {
  COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST,
  COLLECTION_ROUTES_SARLOTA_INTRO_GONG_URL,
  COLLECTION_ROUTES_SARLOTA_OUTRO_GONG_URL,
  COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST,
  COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID,
  COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER,
  collectionRoutesSarlotaAudioWasPlayed,
  collectionRoutesSarlotaIntroFacts,
  collectionRoutesSarlotaIntroGenerationRequest,
  collectionRoutesStopCountPhrase,
  validateCollectionRoutesSarlotaIntro,
  collectionRoutesSarlotaVoiceRequest
} from "../src/data/collectionRoutesSarlotaVoice.js";

assert.equal(COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID, "sarlota");
assert.equal(COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER, "elevenlabs");
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /aktivního system Promptu/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /připojené Knowledge Base/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /Neopakuj stejný údaj/);
assert.doesNotMatch(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /Ahoj Mirku|Můžeme vyrazit/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /bez mikrofonu/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /potřebuje něco upřesnit/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /pětisekundový poslech/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /pokračuj běžnou konverzací/);
assert.doesNotMatch(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /fyzické tlačítko mikrofonu/);
assert.equal(COLLECTION_ROUTES_SARLOTA_INTRO_GONG_URL, "/audio/sarlota-gong-intro.mp3");
assert.equal(COLLECTION_ROUTES_SARLOTA_OUTRO_GONG_URL, "/audio/sarlota-gong-outro.mp3");
assert.match(COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST, /Mirku, s čím mohu pomoct\?/);
assert.match(COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST, /Po otázce zůstaň připravená poslouchat/);
assert.equal(userDynamicVariablesForAi({
  id: "pneumatiky-miroslav-vasek",
  name: "Miroslav Vašek",
  preferredVocative: "Mirku",
  role: "ridic",
  status: "active"
}).user_first_name_friendly_vocative, "Mirku");
assert.equal(collectionRoutesStopCountPhrase(0), "žádné stanoviště");
assert.equal(collectionRoutesStopCountPhrase(1), "jedno stanoviště");
assert.equal(collectionRoutesStopCountPhrase(2), "dvě stanoviště");
assert.equal(collectionRoutesStopCountPhrase(4), "čtyři stanoviště");
assert.equal(collectionRoutesStopCountPhrase(5), "5 stanovišť");

const introSpeechDetector = createIntroSpeechActivityDetector();
assert.equal(introSpeechDetector.observe(0.01), false, "Tiché pozadí nesmí zrušit pětisekundový timeout.");
assert.equal(introSpeechDetector.observe(0.05), false, "Jediný hlukový impuls nesmí otevřít konverzaci.");
assert.equal(introSpeechDetector.observe(0.01), false, "Pokles pod práh musí potvrzování řeči vynulovat.");
assert.equal(introSpeechDetector.observe(0.05), false);
assert.equal(introSpeechDetector.observe(0.05), true, "Souvislý začátek řeči musí zrušit timeout ještě před přepisem.");
introSpeechDetector.reset();
assert.equal(introSpeechDetector.observe(0.05), false, "Nové pětisekundové okno musí začít s čistým detektorem.");

const oneStopFacts = collectionRoutesSarlotaIntroFacts({
  actor: { vocative: "Mirku" },
  route: { totalCount: 1, currentStop: { customerName: "Firma test 501" } },
  weather: { verified: false, summary: "" },
  fuel: { verified: false, value: null },
  absentDispatchersVerified: true,
  absentDispatchers: []
});
assert.equal(oneStopFacts.stopCountPhrase, "jedno stanoviště");
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou jedno stanoviště. Začínáme firmou Firma test 501. Aktuální předpověď pro Brno teď není bezpečně dostupná. Stav nádrže teď není bezpečně dostupný z T-Cars. Dispečink je dnes zajištěný. Zastupování není potřeba. Mirku, potřebuješ něco upřesnit?",
  oneStopFacts
).valid, true, "Jedna zastávka musí zaznít jako jedno stanoviště, nikdy jedna stanovišť.");
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou jedno stanoviště. Začínáme firmou Firma test 501. Aktuální předpověď pro Brno teď není bezpečně dostupná. Stav nádrže teď není bezpečně dostupný z tý kárs. Dispečink je dnes zajištěný. Zastupování není potřeba. Mirku, potřebuješ něco upřesnit?",
  oneStopFacts
).valid, true, "Výslovnost tý kárs musí být stejný ověřený fakt jako zápis T-Cars.");

const introContext = {
  actor: { name: "Miroslav Vašek", vocative: "Mirku" },
  route: {
    title: "pondělí 2026-07-13 · Vůz A · 3BN 3558",
    totalCount: 198,
    currentStop: { customerName: "Test 1 s.r.o." }
  },
  vehicle: { status: "verified", fleetMatch: true, label: "Vůz A · 3BN 3558", registration: "3BN 3558" },
  weather: {
    verified: true,
    summary: "Brno: 22 °C, zataženo. Během směny hrozí bouřka.",
    observedAt: "2026-07-20T10:00:00+02:00",
    source: "open_meteo"
  },
  fuel: { verified: true, value: 63.5, unit: "", measuredAt: "2026-07-20T09:55:00+02:00" },
  absentDispatchersVerified: true,
  absentDispatchers: [{ name: "Jana Dispečerová", label: "Mimo pracoviště" }]
};
const introFacts = collectionRoutesSarlotaIntroFacts(introContext, {
  now: Date.parse("2026-07-20T10:10:00+02:00")
});
const introRequest = collectionRoutesSarlotaIntroGenerationRequest(introContext, {
  now: Date.parse("2026-07-20T10:10:00+02:00")
});
assert.match(introRequest, /3BN 3558/);
assert.match(introRequest, /Během směny hrozí bouřka/);
assert.match(introRequest, /Test 1 s\.r\.o\./);
assert.match(introRequest, /63\.5/);
assert.match(introRequest, /22 stupňů Celsia/);
assert.match(introRequest, /tý kárs/);
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Počasí v Brně bude dnes 22 °C, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Jednotku T-Cars neposkytuje. Dnes není v práci dispečerka Jana Dispečerová. Mirku, potřebuješ něco upřesnit?",
  introFacts
).valid, true);
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Počasí v Brně bude dnes 22 stupňů Celsia, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Jednotku T-Cars neposkytuje. Dnes není v práci dispečerka Jana Dispečerová. Mirku, potřebuješ něco upřesnit?",
  introFacts
).valid, true, "Bezpečnostní kontrola musí přijmout správnou hlasovou výslovnost jednotky °C.");
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj Mirku, dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Počasí v Brně bude dnes 22 stupňů Celsia, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Dnes není v práci dispečerka Jana Dispečerová. Mirku, potřebuješ něco upřesnit?",
  introFacts
).valid, true, "Přirozený pád názvu Brna nesmí změnit ověřený obsah předpovědi.");

const hallucinatedIntro = validateCollectionRoutesSarlotaIntro(
  "Dobré dopoledne, posádko. Dnes jedete trasu Severní průmyslová zóna s osmi stanovišti. Pro jízdu je přiřazené vozidlo Mercedes Atego, SPZ 5A4 1234.",
  introFacts
);
assert.equal(hallucinatedIntro.valid, false);
assert.ok(hallucinatedIntro.violations.includes("foreign_route_title"));
assert.ok(hallucinatedIntro.violations.includes("foreign_stop_count"));
assert.ok(hallucinatedIntro.violations.includes("unverified_vehicle_or_registration"));
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Vozidlo Mercedes Atego s SPZ 3BN 3558 je připravené.",
  introFacts
).valid, false, "Cizí značka nebo model se nesmí schovat za správnou SPZ.");

const inventedWeather = validateCollectionRoutesSarlotaIntro(
  "Dobrý den, posádko. Počasí nám přeje, můžeme vyrazit.",
  introFacts
);
assert.equal(inventedWeather.valid, false);
assert.ok(inventedWeather.violations.includes("unverified_or_paraphrased_weather"));

const interactiveAutomaticIntro = validateCollectionRoutesSarlotaIntro(
  "Ahoj Mirku, dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Brno: 22 °C, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Dnes není v práci dispečerka Jana Dispečerová. Potřebuješ něco upřesnit?",
  introFacts
);
assert.equal(interactiveAutomaticIntro.valid, false);
assert.ok(interactiveAutomaticIntro.violations.includes("missing_or_invalid_closing_question"));

const introWithoutClosingQuestion = validateCollectionRoutesSarlotaIntro(
  "Ahoj Mirku, dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Brno: 22 °C, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Dnes není v práci dispečerka Jana Dispečerová.",
  introFacts
);
assert.equal(introWithoutClosingQuestion.valid, false);
assert.ok(introWithoutClosingQuestion.violations.includes("missing_or_invalid_closing_question"));
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj Mirku, dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Brno: 22 °C, zataženo. Během směny hrozí bouřka. Stav nádrže je 63,5. Dnes není v práci dispečerka Jana Dispečerová. Potřebuješ něco upřesnit? Dobře.",
  introFacts
).valid, false, "Závěrečná otázka musí být skutečně poslední větou automatického úvodu.");

const staleWeatherFacts = collectionRoutesSarlotaIntroFacts(introContext, {
  now: Date.parse("2026-07-20T12:00:00+02:00")
});
assert.equal(staleWeatherFacts.weather, null);
assert.equal(validateCollectionRoutesSarlotaIntro("Venku je jasno.", staleWeatherFacts).valid, false);
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Aktuální předpověď pro Brno teď není bezpečně dostupná. Stav nádrže je 63,5. Jednotku T-Cars neposkytuje. Dnes není v práci dispečerka Jana Dispečerová. Mirku, potřebuješ něco upřesnit?",
  staleWeatherFacts
).valid, true);

const unavailableFacts = collectionRoutesSarlotaIntroFacts({
  ...introContext,
  weather: { verified: false, summary: "" },
  fuel: { verified: false, value: null },
  absentDispatchersVerified: true,
  absentDispatchers: []
});
assert.equal(validateCollectionRoutesSarlotaIntro(
  "Ahoj, Mirku. Dnes máme před sebou 198 stanovišť. Začínáme firmou Test 1 s.r.o. Aktuální předpověď pro Brno teď není bezpečně dostupná. Stav nádrže teď není bezpečně dostupný z T-Cars. Dispečink je dnes zajištěný. Zastupování není potřeba. Mirku, potřebuješ něco upřesnit?",
  unavailableFacts
).valid, true, "Chybějící provozní údaj se musí přiznat nebo nahradit bezpečnou informací, ne tiše přeskočit.");

const exactInstruction = "Tomáši, až zastavíš přímo u nádob, klepni na Potvrdit GPS stanoviště.";
const voiceRequest = collectionRoutesSarlotaVoiceRequest(exactInstruction);
assert.match(voiceRequest, /Řekni pouze přesný český pokyn/);
assert.match(voiceRequest, new RegExp(exactInstruction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.equal(collectionRoutesSarlotaVoiceRequest("  "), "");

assert.equal(collectionRoutesSarlotaAudioWasPlayed({
  assistantId: "sarlota",
  audioChunkCount: 3,
  audioPlaybackStarted: true,
  audioPlaybackFailed: false
}), true);
assert.equal(collectionRoutesSarlotaAudioWasPlayed({
  assistantId: "sarlota-smart-2",
  audioChunkCount: 3,
  audioPlaybackStarted: true,
  audioPlaybackFailed: false
}), false, "Řidičský tablet nesmí použít testovací nebo jiný hlas místo produkční Šarloty.");
assert.equal(collectionRoutesSarlotaAudioWasPlayed({
  assistantId: "sarlota",
  audioChunkCount: 0,
  audioPlaybackStarted: false,
  audioPlaybackFailed: false
}), false);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
assert.doesNotMatch(
  appSource,
  /speechSynthesis|SpeechSynthesisUtterance/,
  "KSO nesmí obsahovat systémové TTS; veškerý hlas musí jít přes serverovou Šarlotu z ElevenLabs."
);
const voiceFunctionStart = appSource.indexOf("async function speakCollectionRoutesTestGps");
const voiceFunctionEnd = appSource.indexOf("function vibrateCollectionRoutesTestGps", voiceFunctionStart);
assert.ok(voiceFunctionStart >= 0 && voiceFunctionEnd > voiceFunctionStart);
const voiceFunctionSource = appSource.slice(voiceFunctionStart, voiceFunctionEnd);
assert.match(voiceFunctionSource, /elevenLabsAssistant\.sendVoiceMessage/);
assert.match(voiceFunctionSource, /COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID/);
assert.match(voiceFunctionSource, /instructionOnly: true/);
assert.doesNotMatch(voiceFunctionSource, /speechSynthesis|SpeechSynthesisUtterance/);
assert.match(appSource, /data-collection-routes-test-voice-provider/);
assert.match(appSource, /Hlas: ElevenLabs Šarlota · systémové čtení vypnuto/);
assert.match(appSource, /Automatický hlas se bez gongu nespustí/);
assert.match(appSource, /error\.code = "voice_intro_gong_failed"/);
assert.match(appSource, /endAfterGeneratedIntro: false/);
assert.match(appSource, /continueAfterGeneratedIntro: automaticSession/);
assert.match(appSource, /onIntroEngaged/);
assert.match(appSource, /myDailyRouteSarlotaHologramConversation/);
assert.match(appSource, /finishCollectionRoutesSarlotaIntroResponseWindow/);
assert.match(appSource, /COLLECTION_ROUTES_SARLOTA_OUTRO_GONG_URL/);
assert.match(appSource, /introSilenceTimeoutMs/);
assert.match(appSource, /myDailyRouteSarlotaAwaitingResponse/);
assert.match(appSource, /SPUSTIT HOLOGRAFICKOU ŠARLOTU/);

const automaticVoiceStart = appSource.slice(
  appSource.indexOf("async function startCollectionDailyDriverSarlota"),
  appSource.indexOf("async function enableCollectionDailyDriverSarlota")
);
assert.match(automaticVoiceStart, /if \(!automaticSession\) void elevenLabsAssistant\.prepareVoiceInput/);
assert.doesNotMatch(automaticVoiceStart, /if \(automaticSession\) void elevenLabsAssistant\.prepareVoiceInput/);

const providerSource = readFileSync(new URL("../src/ElevenLabsAssistantProvider.js", import.meta.url), "utf8");
assert.match(
  providerSource,
  /playVoiceCue: assistant\.playVoiceCue/,
  "Provider musí skutečně zpřístupnit gong aplikaci; jinak optional chaining vrátí undefined a gong se nikdy nepřehraje."
);

const closeFunctionStart = appSource.indexOf("function closeCollectionRoutesTestTablet");
const closeFunctionEnd = appSource.indexOf("async function loadLatestCollectionRoutesTestNotificationJob", closeFunctionStart);
const closeFunctionSource = appSource.slice(closeFunctionStart, closeFunctionEnd);
assert.match(closeFunctionSource, /elevenLabsAssistant\.stopVoiceAudio/);
assert.doesNotMatch(closeFunctionSource, /speechSynthesis/);

const resetAdminTestStart = appSource.indexOf("async function resetCollectionRoutesAdminTabletTest");
const resetAdminTestEnd = appSource.indexOf("async function loadLatestCollectionRoutesTestNotificationJob", resetAdminTestStart);
const resetAdminTestSource = appSource.slice(resetAdminTestStart, resetAdminTestEnd);
assert.match(resetAdminTestSource, /closeAiAssistant\(\{ launcherVisible: false, renderAfter: false \}\)/);

const elevenLabsSource = readFileSync(new URL("../src/useElevenLabsAssistant.js", import.meta.url), "utf8");
assert.match(elevenLabsSource, /if \(audioContext\.state !== "running"\) \{\s*return false;/);
assert.match(elevenLabsSource, /bufferedIntroAudio\.push\(\{ audioBase64, format: agentAudioFormat \}\)/);
assert.match(elevenLabsSource, /validateGeneratedIntro/);
assert.match(elevenLabsSource, /voice_intro_validation_failed/);
assert.match(elevenLabsSource, /introValidated: true/);
assert.match(elevenLabsSource, /introGenerationRequest/);
assert.match(elevenLabsSource, /suppressing-technical-first-message/);
assert.match(elevenLabsSource, /waiting-for-generated-intro/);
assert.match(elevenLabsSource, /requestGeneratedIntro/);
assert.match(elevenLabsSource, /endAfterGeneratedIntro/);
assert.match(elevenLabsSource, /continueAfterGeneratedIntro/);
assert.match(elevenLabsSource, /listenAfterTechnicalFirstMessage/);
assert.match(elevenLabsSource, /listening-after-technical-first-message/);
assert.match(elevenLabsSource, /introSilenceTimeoutMs/);
assert.match(elevenLabsSource, /introAwaitingUser/);
assert.match(elevenLabsSource, /state: "intro-silence-complete"/);
assert.match(elevenLabsSource, /deferMicrophoneUntilAfterGeneratedIntro/);
assert.match(elevenLabsSource, /if \(deferMicrophoneUntilAfterGeneratedIntro && !introPlaybackFinished\)/);
assert.match(elevenLabsSource, /introPlaybackFinished = true;[\s\S]*await startAudioInput\(\)/);
assert.match(elevenLabsSource, /introUserEngaged = true;[\s\S]*window\.clearTimeout\(introSilenceTimer\)/);
assert.match(elevenLabsSource, /markIntroUserEngaged\("local_voice_activity"\)/);
assert.match(elevenLabsSource, /markIntroUserEngaged\("vad_score"\)/);
const introEngagedHelperStart = elevenLabsSource.indexOf("function markIntroUserEngaged");
const introEngagedHelperEnd = elevenLabsSource.indexOf("function clearTimers", introEngagedHelperStart);
assert.ok(introEngagedHelperStart >= 0 && introEngagedHelperEnd > introEngagedHelperStart);
assert.doesNotMatch(
  elevenLabsSource.slice(introEngagedHelperStart, introEngagedHelperEnd),
  /settle\(/,
  "První řeč řidiče smí zrušit jen pětisekundový timeout; živou konverzaci nesmí ukončit."
);
assert.match(elevenLabsSource, /if \(!endAfterGeneratedIntro && \(typeof navigator/);
assert.match(elevenLabsSource, /playCue/);
assert.match(elevenLabsSource, /playCueWithMediaElement/);
assert.match(elevenLabsSource, /window\.Audio/);
assert.match(elevenLabsSource, /elevenlabs\.voice_cue_playback_failed/);
const sendVoiceStart = elevenLabsSource.indexOf("async function sendVoiceMessage");
const sendVoiceEnd = elevenLabsSource.indexOf("\n  return {\n    clientTools", sendVoiceStart);
assert.ok(sendVoiceStart >= 0 && sendVoiceEnd > sendVoiceStart);
const sendVoiceSource = elevenLabsSource.slice(sendVoiceStart, sendVoiceEnd);
assert.match(sendVoiceSource, /instructionOnly/);
assert.match(sendVoiceSource, /automaticSpeechCueUrl/);
assert.match(sendVoiceSource, /disabled_for_voice_instruction/);
assert.match(sendVoiceSource, /Přehrání pevného hlasového pokynu nesmí spouštět nástroje ani měnit stav/);

console.log("collection routes ElevenLabs Šarlota voice tests passed");
