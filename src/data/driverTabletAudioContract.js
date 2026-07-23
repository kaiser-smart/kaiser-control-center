export const DRIVER_TABLET_AUDIO_VERSION = "2";
export const DRIVER_TABLET_AUDIO_CACHE = `kaiser-driver-tablet-audio-v${DRIVER_TABLET_AUDIO_VERSION}`;

export const DRIVER_TABLET_SOUND_MODES = Object.freeze({
  standard: Object.freeze({ label: "Standardní", volume: 1, allowUi: true, allowIntro: true }),
  quiet: Object.freeze({ label: "Tiché", volume: 0.52, allowUi: false, allowIntro: true }),
  off: Object.freeze({ label: "Vypnuto", volume: 0, allowUi: false, allowIntro: false })
});

export const DRIVER_TABLET_AUDIO_GROUPS = Object.freeze({
  ui: Object.freeze({ priority: 10 }),
  confirmation: Object.freeze({ priority: 30 }),
  notification: Object.freeze({ priority: 50 }),
  critical: Object.freeze({ priority: 90 }),
  navigation: Object.freeze({ priority: 100 })
});

const candidate = (name) => `/audio/driver-tablet/elevenlabs/${name}.wav`;

export const DRIVER_TABLET_AUDIO_EVENTS = Object.freeze({
  tablet_intro: Object.freeze({
    group: "notification",
    asset: candidate("tablet-intro-a"),
    candidates: Object.freeze([candidate("tablet-intro-a"), candidate("tablet-intro-b"), candidate("tablet-intro-c")]),
    volume: 0.42,
    debounceMs: 5000,
    interruptible: false,
    approved: true
  }),
  primary_tap: Object.freeze({
    group: "ui",
    asset: candidate("primary-tap-a"),
    candidates: Object.freeze([candidate("primary-tap-a"), candidate("primary-tap-b"), candidate("primary-tap-c")]),
    volume: 0.2,
    debounceMs: 90,
    interruptible: true,
    approved: true
  }),
  stop_completed: Object.freeze({
    group: "confirmation",
    asset: candidate("stop-completed-a"),
    candidates: Object.freeze([candidate("stop-completed-a"), candidate("stop-completed-b"), candidate("stop-completed-c")]),
    volume: 0.34,
    debounceMs: 900,
    interruptible: true,
    approved: true
  }),
  report_saved: Object.freeze({
    group: "confirmation",
    asset: candidate("report-saved-a"),
    candidates: Object.freeze([candidate("report-saved-a"), candidate("report-saved-b"), candidate("report-saved-c")]),
    volume: 0.3,
    debounceMs: 900,
    interruptible: true,
    approved: true
  }),
  warning: Object.freeze({
    group: "notification",
    asset: candidate("warning-a"),
    candidates: Object.freeze([candidate("warning-a"), candidate("warning-b"), candidate("warning-c")]),
    volume: 0.31,
    debounceMs: 2500,
    interruptible: false,
    approved: true
  }),
  critical_warning: Object.freeze({
    group: "critical",
    asset: candidate("critical-warning-a"),
    candidates: Object.freeze([candidate("critical-warning-a"), candidate("critical-warning-b"), candidate("critical-warning-c")]),
    volume: 0.44,
    debounceMs: 4000,
    interruptible: false,
    maxRepeats: 2,
    approved: true
  }),
  error: Object.freeze({
    group: "notification",
    asset: candidate("error-a"),
    candidates: Object.freeze([candidate("error-a"), candidate("error-b"), candidate("error-c")]),
    volume: 0.31,
    debounceMs: 700,
    interruptible: false,
    approved: true
  }),
  offline: Object.freeze({
    group: "notification",
    asset: candidate("offline-a"),
    candidates: Object.freeze([candidate("offline-a"), candidate("offline-b"), candidate("offline-c")]),
    volume: 0.27,
    debounceMs: 5000,
    interruptible: false,
    approved: true
  }),
  online_restored: Object.freeze({
    group: "notification",
    asset: candidate("online-restored-a"),
    candidates: Object.freeze([candidate("online-restored-a"), candidate("online-restored-b"), candidate("online-restored-c")]),
    volume: 0.28,
    debounceMs: 3000,
    interruptible: true,
    approved: true
  }),
  route_completed: Object.freeze({
    group: "confirmation",
    asset: candidate("route-completed-a"),
    candidates: Object.freeze([candidate("route-completed-a"), candidate("route-completed-b"), candidate("route-completed-c")]),
    volume: 0.38,
    debounceMs: 5000,
    interruptible: false,
    approved: true
  })
});

export const DRIVER_TABLET_AUDIO_EVENT_NAMES = Object.freeze(Object.keys(DRIVER_TABLET_AUDIO_EVENTS));

export function normalizeDriverTabletSoundMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return Object.hasOwn(DRIVER_TABLET_SOUND_MODES, mode) ? mode : "standard";
}

export function isDriverTabletAudioEvent(value) {
  return Object.hasOwn(DRIVER_TABLET_AUDIO_EVENTS, String(value || ""));
}

export function driverTabletRouteSessionId(run = {}, testSessionId = "") {
  const scope = run?.scope === "test" ? "test" : "production";
  const isolatedSession = String(testSessionId || "").trim();
  if (scope === "test" && isolatedSession) return `test:${isolatedSession}`;
  const runId = String(run?.id || "").trim();
  const startedAt = String(run?.startedAt || "").trim();
  return runId && startedAt ? `${scope}:${runId}:${startedAt}` : "";
}

export function driverTabletIntroIdempotencyKey({ routeSessionId = "", driverId = "", introVersion = DRIVER_TABLET_AUDIO_VERSION } = {}) {
  const session = String(routeSessionId || "").trim();
  const driver = String(driverId || "").trim();
  const version = String(introVersion || "").trim();
  return session && driver && version ? `${session}:${driver}:driver-tablet-intro:v${version}` : "";
}
