import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST,
  COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST,
  COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID,
  COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER,
  collectionRoutesSarlotaAudioWasPlayed,
  collectionRoutesSarlotaVoiceRequest
} from "../src/data/collectionRoutesSarlotaVoice.js";

assert.equal(COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID, "sarlota");
assert.equal(COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER, "elevenlabs");
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /aktivního system Promptu/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /připojené Knowledge Base/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /Neopakuj stejný údaj/);
assert.doesNotMatch(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /Ahoj Mirku|Můžeme vyrazit/);
assert.match(COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST, /jediná zpráva automatického spuštění/);
assert.match(COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST, /Mirku, s čím mohu pomoct\?/);
assert.match(COLLECTION_ROUTES_SARLOTA_MANUAL_GREETING_REQUEST, /Po otázce zůstaň připravená poslouchat/);

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

const closeFunctionStart = appSource.indexOf("function closeCollectionRoutesTestTablet");
const closeFunctionEnd = appSource.indexOf("async function loadLatestCollectionRoutesTestNotificationJob", closeFunctionStart);
const closeFunctionSource = appSource.slice(closeFunctionStart, closeFunctionEnd);
assert.match(closeFunctionSource, /elevenLabsAssistant\.stopVoiceAudio/);
assert.doesNotMatch(closeFunctionSource, /speechSynthesis/);

const elevenLabsSource = readFileSync(new URL("../src/useElevenLabsAssistant.js", import.meta.url), "utf8");
assert.match(elevenLabsSource, /introGenerationRequest/);
assert.match(elevenLabsSource, /suppressing-technical-first-message/);
assert.match(elevenLabsSource, /waiting-for-generated-intro/);
assert.match(elevenLabsSource, /requestGeneratedIntro/);
assert.match(elevenLabsSource, /endAfterGeneratedIntro/);
assert.match(elevenLabsSource, /state: "intro-complete"/);
assert.match(elevenLabsSource, /settle\(resolve, payload, "intro-complete"\)/);
const sendVoiceStart = elevenLabsSource.indexOf("async function sendVoiceMessage");
const sendVoiceEnd = elevenLabsSource.indexOf("\n  return {\n    clientTools", sendVoiceStart);
assert.ok(sendVoiceStart >= 0 && sendVoiceEnd > sendVoiceStart);
const sendVoiceSource = elevenLabsSource.slice(sendVoiceStart, sendVoiceEnd);
assert.match(sendVoiceSource, /instructionOnly/);
assert.match(sendVoiceSource, /disabled_for_voice_instruction/);
assert.match(sendVoiceSource, /Přehrání pevného hlasového pokynu nesmí spouštět nástroje ani měnit stav/);

console.log("collection routes ElevenLabs Šarlota voice tests passed");
