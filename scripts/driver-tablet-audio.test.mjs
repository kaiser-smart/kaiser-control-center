import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

import {
  DRIVER_TABLET_AUDIO_EVENTS,
  DRIVER_TABLET_AUDIO_EVENT_NAMES,
  DRIVER_TABLET_AUDIO_VERSION,
  driverTabletIntroIdempotencyKey,
  driverTabletRouteSessionId,
  normalizeDriverTabletSoundMode
} from "../src/data/driverTabletAudioContract.js";
import {
  DriverTabletAudioManager,
  DriverTabletIntroController
} from "../src/driverTabletAudioManager.js";

class FakeSource {
  constructor(counter) {
    this.counter = counter;
    this.onended = null;
  }
  connect() {}
  disconnect() {}
  start() { this.counter.started += 1; }
  stop() { this.counter.stopped += 1; this.onended?.(); }
}

function fakeAudioEnvironment() {
  const counter = { started: 0, stopped: 0, decoded: 0, fetched: 0, cached: 0, gains: [] };
  const context = {
    state: "suspended",
    destination: {},
    async resume() { this.state = "running"; },
    async close() { this.state = "closed"; },
    async decodeAudioData() { counter.decoded += 1; return { duration: 0.2 }; },
    createBufferSource() { return new FakeSource(counter); },
    createGain() {
      const gain = { value: 0 };
      counter.gains.push(gain);
      return { gain, connect() {}, disconnect() {} };
    }
  };
  const responses = new Map();
  const cache = {
    async match(request) { return responses.get(String(request)) || null; },
    async put(request, response) { counter.cached += 1; responses.set(String(request), response); }
  };
  return {
    counter,
    context,
    cacheStorage: { async open() { return cache; } },
    async fetchImpl() { counter.fetched += 1; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }
  };
}

function inspectPcm16Wav(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") format = { audioFormat: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (id === "data") data = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  assert.deepEqual(format, { audioFormat: 1, channels: 2, sampleRate: 48000, bits: 16 });
  assert.ok(data?.length > 0, "WAV musí obsahovat datový blok.");
  let energy = 0;
  for (let index = 0; index + 1 < data.length; index += 2) {
    const sample = data.readInt16LE(index) / 32768;
    energy += sample * sample;
  }
  return Math.sqrt(energy / (data.length / 2));
}

assert.equal(normalizeDriverTabletSoundMode("quiet"), "quiet");
assert.equal(normalizeDriverTabletSoundMode("invalid"), "standard");
assert.deepEqual(DRIVER_TABLET_AUDIO_EVENT_NAMES, [
  "tablet_intro", "primary_tap", "stop_completed", "report_saved", "warning",
  "critical_warning", "error", "offline", "online_restored", "route_completed"
]);

const productionSession = driverTabletRouteSessionId({ id: "route-1", scope: "production", startedAt: "2026-07-22T10:00:00.000Z" });
const testSession = driverTabletRouteSessionId({ id: "route-1", scope: "test", startedAt: "2026-07-22T10:00:00.000Z" }, "tablet-session-1");
assert.equal(productionSession, "production:route-1:2026-07-22T10:00:00.000Z");
assert.equal(testSession, "test:tablet-session-1");
assert.equal(
  driverTabletIntroIdempotencyKey({ routeSessionId: productionSession, driverId: "driver-1", introVersion: DRIVER_TABLET_AUDIO_VERSION }),
  `${productionSession}:driver-1:driver-tablet-intro:v${DRIVER_TABLET_AUDIO_VERSION}`
);

const environment = fakeAudioEnvironment();
const logs = [];
const manager = new DriverTabletAudioManager({
  scope: "test",
  allowUnapproved: true,
  contextFactory: () => environment.context,
  fetchImpl: environment.fetchImpl,
  cacheStorage: environment.cacheStorage,
  onOperationalLog: (entry) => logs.push(entry)
});
assert.deepEqual(await manager.unlock(), { ok: true, result: "unlocked" });
assert.equal((await manager.play("primary_tap")).played, true);
assert.equal((await manager.play("primary_tap")).result, "duplicate", "Rychlý dvojstisk musí být potlačen.");
assert.ok(logs.some((entry) => entry.eventType === "duplicate_blocked"));
assert.equal(environment.counter.fetched, 1);
manager.stop();

manager.setMode("quiet");
assert.equal((await manager.play("primary_tap")).result, "quiet_ui", "Tichý režim musí potlačit kliknutí.");
assert.equal((await manager.play("stop_completed")).played, true, "Tichý režim musí ponechat důležité potvrzení.");
manager.stop();

manager.setMode("off");
assert.equal((await manager.play("tablet_intro")).result, "mode_off");
assert.equal((await manager.play("critical_warning")).played, true, "Kritický existující stav zůstává povolený i při vypnutí.");
manager.stop();

manager.setMode("standard");
manager.setBusyGroups(["navigation"]);
assert.equal((await manager.play("stop_completed")).result, "navigation_busy");
manager.lastPlayedAt.delete("critical_warning");
assert.equal((await manager.play("critical_warning")).played, true);
manager.stop();
manager.setBusyGroups([]);

manager.lastPlayedAt.delete("stop_completed");
assert.equal((await manager.play("stop_completed")).played, true);
assert.equal((await manager.play("error")).played, true, "Chyba s vyšší prioritou musí přerušit potvrzení.");
assert.ok(environment.counter.stopped >= 1);
assert.equal((await manager.play("error", { audition: true })).played, true, "Administrátorský poslech nesmí zablokovat produkční debounce.");
assert.equal((await manager.play("error", { audition: true })).played, true, "Po sobě jdoucí varianty musí být v náhledu vždy slyšet.");
assert.equal(environment.counter.gains.at(-1).value, 0.82, "Náhled musí použít slyšitelnou poslechovou úroveň nezávislou na provozním zeslabení.");
manager.dispose();
assert.equal((await manager.play("error")).result, "disposed");

const nativeAudioCalls = [];
const nativePreviewManager = new DriverTabletAudioManager({
  scope: "test",
  allowUnapproved: true,
  audioFactory: (asset) => {
    const audio = {
      asset,
      preload: "",
      volume: 0,
      currentTime: 3,
      onended: null,
      onerror: null,
      pause() { nativeAudioCalls.push({ type: "pause", asset }); },
      load() { nativeAudioCalls.push({ type: "load", asset: this.src }); },
      play() {
        nativeAudioCalls.push({ type: "play", asset: this.src, volume: this.volume, preload: this.preload, muted: this.muted });
        return Promise.resolve();
      }
    };
    return audio;
  }
});
const nativePreviewResult = await nativePreviewManager.play("tablet_intro", {
  asset: "/audio/driver-tablet/elevenlabs/tablet-intro-b.wav",
  audition: true,
  volume: 0.82
});
assert.deepEqual(nativePreviewResult, {
  played: true,
  result: "played",
  asset: "/audio/driver-tablet/elevenlabs/tablet-intro-b.wav",
  output: "native_audio"
});
assert.deepEqual(nativeAudioCalls.find((call) => call.type === "play"), {
  type: "play",
  asset: "/audio/driver-tablet/elevenlabs/tablet-intro-b.wav",
  volume: 0.82,
  preload: "auto",
  muted: false
});
assert.equal(nativeAudioCalls.filter((call) => call.type === "load").length, 1);
await nativePreviewManager.play("tablet_intro", {
  asset: "/audio/driver-tablet/elevenlabs/tablet-intro-c.wav",
  audition: true,
  volume: 0.82
});
assert.equal(nativeAudioCalls.filter((call) => call.type === "load").length, 2, "Náhled musí znovu použít jeden trvalý audio výstup.");
nativePreviewManager.dispose();

const introStates = [];
let introCompletions = 0;
const intro = new DriverTabletIntroController({
  onStateChange: (state) => introStates.push(state),
  onComplete: () => { introCompletions += 1; }
});
assert.equal(intro.start(), true);
assert.equal(intro.start(), false, "Jeden controller nesmí intro spustit dvakrát.");
assert.equal(introStates[0], "dimmed");
assert.equal(intro.skip(), true);
assert.equal(intro.skip(), false);
assert.equal(introStates.at(-1), "skipped");
assert.equal(introCompletions, 1);
intro.dispose();

const metadata = JSON.parse(readFileSync(new URL("../public/audio/driver-tablet/metadata.json", import.meta.url), "utf8"));
assert.equal(metadata.production_approved, true, "Administrátorem schválená sada A musí být označená jako produkční.");
assert.equal(metadata.production_set, "A");
assert.equal(metadata.approved_by, "Radim");
assert.equal(metadata.source, "elevenlabs_sound_effects");
assert.equal(metadata.remote_runtime_urls, false);
assert.equal(metadata.assets.length, 30);
for (const item of metadata.assets) {
  const file = new URL(`../public/audio/driver-tablet/elevenlabs/${item.candidate}.wav`, import.meta.url);
  assert.ok(statSync(file).size > 1000, `Audio asset ${item.candidate} musí existovat.`);
  assert.ok(item.duration_seconds <= 1.5, `${item.candidate} je příliš dlouhý.`);
  assert.equal(item.source, "elevenlabs_sound_effects");
  assert.equal(item.approved_by, item.candidate.endsWith("-a") ? "Radim" : null, "Schválení se smí vztahovat pouze na sadu A.");
  assert.ok(item.rms_dbfs > -45 && item.rms_dbfs < -10, `${item.candidate} nesmí být tichý ani přebuzený.`);
  assert.ok(inspectPcm16Wav(file) > 0.002, `${item.candidate} musí obsahovat slyšitelný signál.`);
}
for (const config of Object.values(DRIVER_TABLET_AUDIO_EVENTS)) {
  assert.equal(config.approved, true, "Produkční události musí po schválení sady A projít allowlistem.");
  assert.ok(config.asset.endsWith("-a.wav"), "Produkční asset musí pocházet ze sady A.");
  assert.equal(config.candidates.length, 3, "Každá událost musí mít tři varianty k poslechu.");
  assert.ok(config.candidates.every((asset) => asset.startsWith("/audio/driver-tablet/elevenlabs/") && !asset.startsWith("http")));
}

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const localServerSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");
assert.ok(localServerSource.includes('[".wav", "audio/wav"]'), "Lokální náhled musí WAV posílat s audio MIME typem.");
for (const marker of [
  "DriverTabletAudioManager",
  "DriverTabletIntroController",
  "startCollectionDailyDriverIntro",
  "claim_intro",
  "data-collection-driver-intro-skip",
  "data-collection-driver-sound-mode",
  "data-collection-routes-audio-native",
  'playCollectionDailyDriverSound("stop_completed")',
  'playCollectionDailyDriverSound("report_saved")',
  'playCollectionDailyDriverSound("route_completed")',
  'playCollectionDailyDriverSound("offline")',
  'playCollectionDailyDriverSound("online_restored")'
]) assert.ok(appSource.includes(marker), `Chybí napojení: ${marker}`);
assert.equal(appSource.includes("myDailyRouteSoundsEnabled"), false);
assert.equal(appSource.includes("data-collection-driver-sound-toggle"), false);
assert.ok(appSource.includes("<audio"), "Administrátorský náhled musí používat nativní audio ovladače prohlížeče.");
assert.equal(appSource.includes("driverTabletAudioPreviewManager"), false, "Administrátorský náhled nesmí záviset na vlastní obsluze přehrávání.");
for (const marker of [
  ".collection-daily-driver-intro",
  ".collection-daily-driver-progress i",
  ".collection-daily-driver-stop-list li.is-state-updated",
  "prefers-reduced-motion: reduce",
  "collection-driver-panel-enter"
]) assert.ok(styleSource.includes(marker), `Chybí animační styl: ${marker}`);

console.log("driver tablet audio tests: ok");
