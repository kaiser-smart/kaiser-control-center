import {
  DRIVER_TABLET_AUDIO_EVENT_NAMES,
  DRIVER_TABLET_AUDIO_VERSION,
  driverTabletIntroIdempotencyKey,
  driverTabletRouteSessionId,
  isDriverTabletAudioEvent,
  normalizeDriverTabletSoundMode
} from "../../src/data/driverTabletAudioContract.js";
import {
  getCollectionDailyRoute,
  getCollectionDailyRouteTabletTestContext
} from "./collection-daily-routes-store.js";

const PROD_DB = "SMART_ODPADY_DB";
const TEST_DB = "COLLECTION_ROUTES_TEST_DB";
const DEVICE_ID = "blackview-active-7";
const LOG_EVENT_TYPES = new Set([
  "intro_started",
  "intro_skipped",
  "asset_failed",
  "autoplay_blocked",
  "mode_changed",
  "critical_not_played",
  "duplicate_blocked"
]);

export class CollectionRouteDriverTabletAudioError extends Error {
  constructor(message, status = 400, code = "collection_route_driver_tablet_audio_error") {
    super(message);
    this.name = "CollectionRouteDriverTabletAudioError";
    this.status = status;
    this.code = code;
  }
}

function clean(value, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function scopeValue(value) {
  return value === "test" ? "test" : "production";
}

function database(env, scope, required = false) {
  const db = env?.[scope === "test" ? TEST_DB : PROD_DB] || null;
  if (!db && required) {
    throw new CollectionRouteDriverTabletAudioError("Databáze nastavení tabletu není dostupná.", 503, "driver_tablet_audio_database_missing");
  }
  return db;
}

function randomId(prefix = "driver-tablet-audio") {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export async function readDriverTabletPreferences(env, userId, input = {}) {
  const scope = scopeValue(input.scope);
  const normalizedUserId = clean(userId);
  const db = database(env, scope);
  const fallback = { soundMode: "standard", deviceId: DEVICE_ID, scope, updatedAt: "" };
  if (!db || !normalizedUserId) return fallback;
  try {
    const row = await db.prepare(`
      SELECT sound_mode, device_id, updated_at
      FROM collection_route_driver_tablet_preferences
      WHERE user_id = ? AND device_id = ?
      LIMIT 1
    `).bind(normalizedUserId, DEVICE_ID).first();
    return row ? {
      soundMode: normalizeDriverTabletSoundMode(row.sound_mode),
      deviceId: clean(row.device_id) || DEVICE_ID,
      scope,
      updatedAt: clean(row.updated_at)
    } : fallback;
  } catch (error) {
    console.error("collection_routes.driver_tablet_preferences_read_failed", { scope, error: clean(error?.message, 100) });
    return fallback;
  }
}

export async function saveDriverTabletPreferences(env, userId, input = {}) {
  const scope = scopeValue(input.scope);
  const normalizedUserId = clean(userId);
  if (!normalizedUserId) throw new CollectionRouteDriverTabletAudioError("Chybí identita uživatele.", 401, "user_missing");
  const db = database(env, scope, true);
  const soundMode = normalizeDriverTabletSoundMode(input.soundMode);
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO collection_route_driver_tablet_preferences (
      user_id, device_id, sound_mode, updated_at, updated_by_user_id
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      sound_mode = excluded.sound_mode,
      updated_at = excluded.updated_at,
      updated_by_user_id = excluded.updated_by_user_id
  `).bind(normalizedUserId, DEVICE_ID, soundMode, now, normalizedUserId).run();
  return { soundMode, deviceId: DEVICE_ID, scope, updatedAt: now };
}

async function validatedRouteSession(env, user, input) {
  const scope = scopeValue(input.scope);
  const runId = clean(input.runId);
  if (!runId) throw new CollectionRouteDriverTabletAudioError("Chybí identita trasy.", 400, "run_id_missing");
  const detail = await getCollectionDailyRoute(env, user, runId, { scope });
  if (detail?.run?.status !== "active") {
    throw new CollectionRouteDriverTabletAudioError("Zvukovou relaci lze otevřít pouze pro zahájenou trasu.", 409, "route_not_active");
  }
  let sessionId = "";
  if (scope === "test" && clean(input.testSessionId)) {
    const testContext = await getCollectionDailyRouteTabletTestContext(env, user, clean(input.testSessionId));
    if (testContext?.route?.run?.id !== runId) {
      throw new CollectionRouteDriverTabletAudioError("TEST audio relace nepatří zvolené trase.", 403, "test_audio_session_mismatch");
    }
    sessionId = clean(input.testSessionId);
  }
  const routeSessionId = driverTabletRouteSessionId(detail.run, sessionId);
  if (!routeSessionId || routeSessionId !== clean(input.routeSessionId, 320)) {
    throw new CollectionRouteDriverTabletAudioError("Audio relace trasy není platná.", 409, "route_audio_session_invalid");
  }
  return { scope, run: detail.run, routeSessionId };
}

async function insertEvent(db, event) {
  return db.prepare(`
    INSERT OR IGNORE INTO collection_route_driver_tablet_audio_events (
      id, run_id, route_session_id, driver_user_id, actor_user_id, device_id,
      intro_version, event_type, sound_event, result, scope, idempotency_key,
      error_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.id,
    event.runId,
    event.routeSessionId,
    event.driverUserId,
    event.actorUserId,
    DEVICE_ID,
    event.introVersion,
    event.eventType,
    event.soundEvent,
    event.result,
    event.scope,
    event.idempotencyKey,
    event.errorCode,
    event.createdAt
  ).run();
}

export async function claimDriverTabletIntro(env, user, input = {}) {
  const session = await validatedRouteSession(env, user, input);
  const db = database(env, session.scope, true);
  const driverUserId = clean(session.run.driverUserId);
  if (!driverUserId) throw new CollectionRouteDriverTabletAudioError("Trasa nemá ověřeného řidiče.", 409, "driver_missing");
  const introVersion = clean(input.introVersion) || DRIVER_TABLET_AUDIO_VERSION;
  const idempotencyKey = driverTabletIntroIdempotencyKey({ routeSessionId: session.routeSessionId, driverId: driverUserId, introVersion });
  const now = new Date().toISOString();
  const skipped = input.skip === true;
  const result = await insertEvent(db, {
    id: randomId(),
    runId: session.run.id,
    routeSessionId: session.routeSessionId,
    driverUserId,
    actorUserId: clean(user?.id),
    introVersion,
    eventType: skipped ? "intro_skipped" : "intro_started",
    soundEvent: "tablet_intro",
    result: skipped ? clean(input.result) || "mode_off" : "claimed",
    scope: session.scope,
    idempotencyKey,
    errorCode: "",
    createdAt: now
  });
  const claimed = Number(result?.meta?.changes || 0) > 0;
  if (!claimed) {
    await insertEvent(db, {
      id: randomId(),
      runId: session.run.id,
      routeSessionId: session.routeSessionId,
      driverUserId,
      actorUserId: clean(user?.id),
      introVersion,
      eventType: "duplicate_blocked",
      soundEvent: "tablet_intro",
      result: "duplicate",
      scope: session.scope,
      idempotencyKey: `${idempotencyKey}:duplicate`,
      errorCode: "",
      createdAt: now
    });
  }
  return { claimed, skipped: claimed && skipped, routeSessionId: session.routeSessionId, introVersion };
}

export async function logDriverTabletAudioEvent(env, user, input = {}) {
  const session = await validatedRouteSession(env, user, input);
  const eventType = clean(input.eventType, 60);
  if (!LOG_EVENT_TYPES.has(eventType) || eventType === "intro_started") {
    throw new CollectionRouteDriverTabletAudioError("Nepovolený typ audio logu.", 400, "audio_log_event_invalid");
  }
  const soundEvent = clean(input.soundEvent, 60);
  if (soundEvent && !isDriverTabletAudioEvent(soundEvent)) {
    throw new CollectionRouteDriverTabletAudioError("Neznámá zvuková událost.", 400, "sound_event_invalid");
  }
  const db = database(env, session.scope, true);
  const now = new Date().toISOString();
  const idempotencyKey = clean(input.idempotencyKey, 320);
  if (!idempotencyKey) throw new CollectionRouteDriverTabletAudioError("Chybí ochrana audio logu proti duplicitě.", 400, "audio_log_idempotency_missing");
  const write = await insertEvent(db, {
    id: randomId(),
    runId: session.run.id,
    routeSessionId: session.routeSessionId,
    driverUserId: clean(session.run.driverUserId),
    actorUserId: clean(user?.id),
    introVersion: clean(input.introVersion) || DRIVER_TABLET_AUDIO_VERSION,
    eventType,
    soundEvent,
    result: clean(input.result, 60),
    scope: session.scope,
    idempotencyKey,
    errorCode: clean(input.error, 100),
    createdAt: now
  });
  return { logged: Number(write?.meta?.changes || 0) > 0, scope: session.scope, eventType };
}

export const DRIVER_TABLET_AUDIO_LOG_EVENT_TYPES = Object.freeze([...LOG_EVENT_TYPES]);
export const DRIVER_TABLET_AUDIO_REGISTERED_EVENTS = DRIVER_TABLET_AUDIO_EVENT_NAMES;
