import {
  DRIVER_TABLET_AUDIO_CACHE,
  DRIVER_TABLET_AUDIO_EVENTS,
  DRIVER_TABLET_AUDIO_GROUPS,
  DRIVER_TABLET_SOUND_MODES,
  isDriverTabletAudioEvent,
  normalizeDriverTabletSoundMode
} from "./data/driverTabletAudioContract.js";

const safeError = (error) => String(error?.code || error?.name || error?.message || "audio_error").slice(0, 120);

export class DriverTabletAudioManager {
  constructor(options = {}) {
    this.manifest = options.manifest || DRIVER_TABLET_AUDIO_EVENTS;
    this.mode = normalizeDriverTabletSoundMode(options.mode);
    this.scope = options.scope === "test" ? "test" : "production";
    this.allowUnapproved = options.allowUnapproved === true || this.scope === "test";
    this.contextFactory = options.contextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.cacheStorage = options.cacheStorage || globalThis.caches || null;
    this.audioFactory = options.audioFactory || ((asset) => {
      const AudioConstructor = globalThis.Audio;
      return typeof AudioConstructor === "function" ? new AudioConstructor(asset) : null;
    });
    this.onOperationalLog = typeof options.onOperationalLog === "function" ? options.onOperationalLog : () => {};
    this.context = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.lastPlayedAt = new Map();
    this.active = null;
    this.unlocked = false;
    this.disposed = false;
    this.busyGroups = new Set();
    this.auditionAudio = null;
  }

  configure(options = {}) {
    if (options.mode) this.mode = normalizeDriverTabletSoundMode(options.mode);
    if (options.scope) this.scope = options.scope === "test" ? "test" : "production";
    if (typeof options.allowUnapproved === "boolean") this.allowUnapproved = options.allowUnapproved;
  }

  setMode(mode) {
    this.mode = normalizeDriverTabletSoundMode(mode);
    return this.mode;
  }

  setBusyGroups(groups = []) {
    this.busyGroups = new Set(Array.from(groups).filter((group) => Object.hasOwn(DRIVER_TABLET_AUDIO_GROUPS, group)));
  }

  async unlock() {
    if (this.disposed) return { ok: false, result: "disposed" };
    try {
      if (!this.context || this.context.state === "closed") this.context = this.contextFactory?.() || null;
      if (!this.context) return { ok: false, result: "unsupported" };
      if (this.context.state !== "running" && typeof this.context.resume === "function") await this.context.resume();
      this.unlocked = this.context.state === "running";
      if (!this.unlocked) {
        this.onOperationalLog({ eventType: "autoplay_blocked", result: "blocked" });
        return { ok: false, result: "blocked" };
      }
      return { ok: true, result: "unlocked" };
    } catch (error) {
      this.onOperationalLog({ eventType: "autoplay_blocked", result: "failed", error: safeError(error) });
      return { ok: false, result: "failed", error: safeError(error) };
    }
  }

  async preload() {
    if (this.disposed) return [];
    const assets = [...new Set(Object.values(this.manifest).map((entry) => entry.asset).filter(Boolean))];
    return Promise.all(assets.map(async (asset) => {
      try {
        await this.loadBuffer(asset);
        return { asset, result: "ready" };
      } catch (error) {
        const failure = { asset, result: "failed", error: safeError(error) };
        this.onOperationalLog({ eventType: "asset_failed", ...failure });
        return failure;
      }
    }));
  }

  async responseForAsset(asset) {
    const request = asset;
    const cache = this.cacheStorage ? await this.cacheStorage.open(DRIVER_TABLET_AUDIO_CACHE) : null;
    const cached = cache ? await cache.match(request) : null;
    if (cached) return cached;
    if (!this.fetchImpl) throw new Error("audio_fetch_unavailable");
    const response = await this.fetchImpl(request);
    if (!response?.ok) throw new Error(`audio_http_${response?.status || 0}`);
    if (cache) await cache.put(request, response.clone());
    return response;
  }

  async loadBuffer(asset) {
    if (this.buffers.has(asset)) return this.buffers.get(asset);
    if (this.loading.has(asset)) return this.loading.get(asset);
    const pending = (async () => {
      const unlockResult = await this.unlock();
      if (!unlockResult.ok) throw new Error(unlockResult.result);
      const response = await this.responseForAsset(asset);
      const bytes = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(bytes.slice(0));
      this.buffers.set(asset, buffer);
      return buffer;
    })().finally(() => this.loading.delete(asset));
    this.loading.set(asset, pending);
    return pending;
  }

  isAllowed(name, entry, now, options = {}) {
    const mode = DRIVER_TABLET_SOUND_MODES[this.mode];
    if (this.mode === "off" && entry.group !== "critical") return "mode_off";
    if (this.mode === "quiet" && entry.group === "ui") return "quiet_ui";
    if (!mode.allowIntro && name === "tablet_intro") return "intro_disabled";
    if (!entry.approved && !this.allowUnapproved) return "unapproved";
    if (this.busyGroups.has("navigation") && entry.group !== "critical") return "navigation_busy";
    if (this.busyGroups.has("critical") && entry.group !== "critical") return "critical_busy";
    if (options.audition === true && this.allowUnapproved) return "";
    const previous = this.lastPlayedAt.get(name) || 0;
    if (this.active?.name === name) return "duplicate";
    if (now - previous < Number(entry.debounceMs || 0)) return "duplicate";
    if (this.active) {
      const currentPriority = DRIVER_TABLET_AUDIO_GROUPS[this.active.group]?.priority || 0;
      const nextPriority = DRIVER_TABLET_AUDIO_GROUPS[entry.group]?.priority || 0;
      if (nextPriority <= currentPriority) return "priority";
    }
    return "";
  }

  async play(name, options = {}) {
    if (this.disposed || !isDriverTabletAudioEvent(name)) return { played: false, result: this.disposed ? "disposed" : "unknown_event" };
    const entry = this.manifest[name];
    const now = Date.now();
    const blocked = this.isAllowed(name, entry, now, options);
    if (blocked) {
      if (blocked === "duplicate") this.onOperationalLog({ eventType: "duplicate_blocked", soundEvent: name, result: blocked });
      if (name === "critical_warning") this.onOperationalLog({ eventType: "critical_not_played", soundEvent: name, result: blocked });
      return { played: false, result: blocked };
    }
    this.lastPlayedAt.set(name, now);
    try {
      const asset = String(options.asset || entry.asset || "");
      const modeVolume = DRIVER_TABLET_SOUND_MODES[this.mode]?.volume ?? 1;
      const requestedGain = options.audition === true
        ? Number(options.volume ?? 0.82)
        : Number(entry.volume || 0.3) * modeVolume * Number(options.volume || 1);
      const outputGain = Math.max(0, Math.min(1, requestedGain));
      if (options.audition === true) {
        const audio = this.auditionAudio || this.audioFactory?.(asset) || null;
        if (audio) {
          this.active?.stop?.();
          this.auditionAudio = audio;
          try { audio.pause?.(); } catch { /* předchozí varianta už mohla skončit */ }
          audio.preload = "auto";
          audio.muted = false;
          audio.defaultMuted = false;
          audio.playsInline = true;
          audio.volume = outputGain;
          if (audio.src !== asset) audio.src = asset;
          try { audio.currentTime = 0; } catch { /* seek bude možný po načtení metadat */ }
          audio.load?.();
          const token = Symbol(name);
          const cleanup = () => {
            if (this.active?.token === token) this.active = null;
            audio.onended = null;
            audio.onerror = null;
          };
          this.active = {
            token,
            name,
            group: entry.group,
            interruptible: true,
            stop: () => {
              try { audio.pause?.(); } catch { /* audio už mohlo skončit */ }
              try { audio.currentTime = 0; } catch { /* některé prohlížeče nedovolí seek před načtením */ }
              cleanup();
            }
          };
          audio.onended = cleanup;
          audio.onerror = cleanup;
          if (typeof audio.play !== "function") throw new Error("native_audio_play_unavailable");
          const playback = audio.play();
          if (playback && typeof playback.then === "function") await playback;
          return { played: true, result: "played", asset, output: "native_audio" };
        }
      }
      const buffer = await this.loadBuffer(asset);
      if (this.disposed) return { played: false, result: "disposed" };
      this.active?.stop?.();
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = outputGain;
      source.connect(gain);
      gain.connect(this.context.destination);
      const token = Symbol(name);
      this.active = {
        token,
        name,
        group: entry.group,
        source,
        interruptible: entry.interruptible !== false,
        stop: () => {
          try { source.stop(); } catch { /* source už mohl skončit */ }
        }
      };
      source.onended = () => {
        if (this.active?.token === token) this.active = null;
        source.disconnect?.();
        gain.disconnect?.();
      };
      source.start(0);
      return { played: true, result: "played", asset };
    } catch (error) {
      if (this.active?.name === name) this.stop();
      if (this.lastPlayedAt.get(name) === now) this.lastPlayedAt.delete(name);
      const failure = safeError(error);
      this.onOperationalLog({ eventType: "asset_failed", soundEvent: name, result: "failed", error: failure });
      return { played: false, result: "failed", error: failure };
    }
  }

  stop() {
    if (!this.active) return;
    this.active.stop?.();
    this.active = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    this.loading.clear();
    if (this.auditionAudio) {
      try { this.auditionAudio.pause?.(); } catch { /* výstup už mohl být ukončen */ }
      try { this.auditionAudio.removeAttribute?.("src"); } catch { /* ne všechny testovací implementace mají DOM API */ }
      this.auditionAudio = null;
    }
    if (this.context && this.context.state !== "closed") void this.context.close?.();
    this.context = null;
  }
}

export class DriverTabletIntroController {
  constructor(options = {}) {
    this.onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    this.onPlay = typeof options.onPlay === "function" ? options.onPlay : () => Promise.resolve();
    this.onComplete = typeof options.onComplete === "function" ? options.onComplete : () => {};
    this.reducedMotion = options.reducedMotion === true;
    this.timer = null;
    this.state = "idle";
    this.running = false;
    this.steps = this.reducedMotion
      ? [["dimmed", 80], ["summary", 520], ["completed", 0]]
      : [["dimmed", 180], ["brand", 820], ["summary", 1120], ["settling", 520], ["completed", 0]];
  }

  start() {
    if (this.running || this.state === "completed") return false;
    this.running = true;
    this.advance(0);
    return true;
  }

  advance(index) {
    if (!this.running) return;
    const [state, duration] = this.steps[index] || ["completed", 0];
    this.state = state;
    this.onStateChange(state);
    if (state === "brand") void this.onPlay();
    if (state === "completed") {
      this.running = false;
      this.onComplete("completed");
      return;
    }
    this.timer = globalThis.setTimeout(() => this.advance(index + 1), duration);
  }

  skip() {
    if (!this.running) return false;
    globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.state = "skipped";
    this.onStateChange("skipped");
    this.onComplete("skipped");
    return true;
  }

  dispose() {
    globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
  }
}
