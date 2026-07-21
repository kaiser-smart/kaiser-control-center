import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLLECTION_ROUTES_OPERATIONAL_CONTRACT,
  collectionRoutesDriverTabletCssSizeLabel,
  collectionRoutesDriverTabletLabel
} from "../src/data/collectionRoutesOperationalContract.js";
import { validateSarlotaModuleVoiceVariables } from "../src/sarlota/sarlotaModuleVoiceContracts.js";

const mantra = readFileSync(new URL("../src/data/collectionRoutesMantra.js", import.meta.url), "utf8");
const handbook = readFileSync(new URL("../PŘÍRUČKA.md", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const contract = COLLECTION_ROUTES_OPERATIONAL_CONTRACT;

assert.equal(collectionRoutesDriverTabletLabel(), "Blackview Active 7 LTE · 11″");
assert.equal(collectionRoutesDriverTabletCssSizeLabel(), "960 × 600 CSS px");
assert.equal(contract.driverTablet.physicalWidth, 1920);
assert.equal(contract.driverTablet.physicalHeight, 1200);
assert.equal(contract.driverTablet.simulatorDevice, "blackview");
assert.equal(contract.voice.firstMessageTemplate, "{{intro_announcement}}");
assert.equal(contract.voice.introSource, "elevenlabs_agent_prompt_kb");
assert.equal(contract.voice.technicalFirstMessageMarker, "KSO_INTRO_GENERATION_PENDING");
assert.equal(contract.voice.suppressTechnicalFirstMessage, true);
assert.equal(contract.voice.generateAudibleIntroWithActiveAgent, true);
assert.equal(contract.voice.automaticIntroMicrophoneEnabled, false);
assert.equal(contract.voice.automaticResponseWindowMicrophoneEnabled, true);
assert.equal(contract.voice.automaticIntroUi, "hologram_only");
assert.equal(contract.voice.automaticIntroShowsMicrophoneUi, false);
assert.equal(contract.voice.voiceCueProviderRequired, true);
assert.deepEqual(contract.voice.hologramLifecycle, [
  "preparing",
  "intro_gong",
  "agent_speaking",
  "response_listening",
  "conversation",
  "outro_gong"
]);
assert.equal(contract.voice.automaticIntroClosingQuestion, true);
assert.equal(contract.voice.automaticIntroResponseMode, "hologram_voice_window");
assert.equal(contract.voice.responseWindowTimeoutEndsEngagedConversation, false);
assert.equal(contract.voice.introSilenceTimeoutMs, 5000);

for (const marker of [
  "Blackview Active 7 LTE",
  "1920 × 1200",
  "960 × 600 CSS px",
  "Samsung ani obecný 11palcový tablet"
]) {
  assert.ok(mantra.includes(marker), `Mantra Svozových tras postrádá závazný marker: ${marker}`);
  assert.ok(handbook.includes(marker), `PŘÍRUČKA postrádá závazný marker: ${marker}`);
}

for (const marker of [
  "KSO_INTRO_GENERATION_PENDING",
  "skutečně aktivní ElevenLabs agent",
  "publikovaného system Promptu",
  "pevnou backendovou ani frontendovou šablonu"
]) {
  assert.ok(handbook.includes(marker), `PŘÍRUČKA postrádá závazný hlasový marker: ${marker}`);
}

assert.ok(appSource.includes("COLLECTION_ROUTES_DRIVER_TABLET_DEVICE"));
assert.ok(appSource.includes("collectionRoutesDriverTabletLabel()"));
assert.ok(appSource.includes("collectionRoutesDriverTabletCssSizeLabel()"));

const variables = {
  current_module: "Svozové trasy",
  current_module_route: "/trasy-svozu/test",
  current_module_context: JSON.stringify({ module: "Svozové trasy", route: "/trasy-svozu/test" }),
  intro_announcement: contract.voice.technicalFirstMessageMarker
};
assert.equal(validateSarlotaModuleVoiceVariables("/trasy-svozu/test", variables).ready, true);
assert.equal(validateSarlotaModuleVoiceVariables("/trasy-svozu/test", { ...variables, current_module: "Jiný modul" }).ready, false);
assert.equal(validateSarlotaModuleVoiceVariables("/trasy-svozu/test", { ...variables, intro_announcement: "" }).ready, false);

console.log("collection routes operational contract: ok");
