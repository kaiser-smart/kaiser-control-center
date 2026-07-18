import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

import { AiAssistantLauncher } from "../src/components/AiAssistantLauncher.js";
import { assistantById } from "../src/data/aiAssistants.js";

const sarlota = assistantById("sarlota");
const speakingHtml = AiAssistantLauncher({
  visible: true,
  voiceActive: false,
  voiceUiState: "assistantSpeaking",
  voiceStatus: "Šarlota odpovídá…",
  speakingHologram: true,
  hologramPath: sarlota.hologramPath,
  assistantName: sarlota.name
});

assert.match(speakingHtml, /ai-sarlota-speaking-hologram/);
assert.match(speakingHtml, /sarlota-hologram-driver\.webp/);
assert.match(speakingHtml, /Šarlota mluví/);
assert.match(speakingHtml, /data-ai-stop-voice/);
assert.doesNotMatch(speakingHtml, /Mikrofon|Zobrazit Šarlotu/);

const listeningHtml = AiAssistantLauncher({
  visible: true,
  voiceActive: true,
  voiceUiState: "listening",
  voiceStatus: "Poslouchám…",
  isListening: true,
  speakingHologram: false,
  hologramPath: sarlota.hologramPath,
  assistantName: sarlota.name
});

assert.match(listeningHtml, /ai-assistant-voice-dock/);
assert.match(listeningHtml, /Šarlota poslouchá/);
assert.doesNotMatch(listeningHtml, /ai-sarlota-speaking-hologram/);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const devServerSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");
const assetPath = new URL("../public/avatars/sarlota-hologram-driver.webp", import.meta.url);

assert.ok(existsSync(assetPath), "Průhledný hologram Šarloty musí být součástí veřejných assetů.");
assert.ok(statSync(assetPath).size < 400_000, "Hologram musí zůstat lehký pro tabletový Chrome.");
assert.match(appSource, /collectionRoutesSpeakingHologram/);
assert.match(appSource, /function collectionRoutesSarlotaSpeakingPreviewRequested\(\)/);
assert.match(appSource, /if \(collectionDriverBlackviewSimulatorRequested\(\)\) \{\s+return false;\s+\}/);
assert.match(appSource, /params\.get\("gps"\) === COLLECTION_ROUTES_DRIVER_SIMULATED_GPS_VALUE/);
assert.match(appSource, /params\.get\("sarlota"\) === "speaking"/);
assert.match(appSource, /aiAssistantState\.voiceUiState === "assistantSpeaking"/);
assert.match(appSource, /open: aiAssistantState\.chatOpen && !collectionRoutesSpeakingHologram/);
assert.match(styleSource, /body:has\(\.collection-daily-driver-map\.is-fullscreen\) \.ai-sarlota-speaking-hologram/);
assert.match(styleSource, /\.collection-driver-kiosk-active \.ai-sarlota-speaking-hologram/);
assert.match(styleSource, /z-index: 1201/);
assert.match(styleSource, /@keyframes sarlota-hologram-speaking/);
assert.match(styleSource, /@keyframes sarlota-hologram-scan/);
assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(devServerSource, /\["\.webp", "image\/webp"\]/);

console.log("Šarlota speaking hologram tests passed.");
