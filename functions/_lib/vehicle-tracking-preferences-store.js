import {
  DEFAULT_VEHICLE_TRACKING_PREFERENCES,
  normalizeVehicleTrackingPreferences
} from "../../src/data/vehicleTrackingPreferences.js";

const DB_BINDING = "SMART_ODPADY_DB";

export class VehicleTrackingPreferencesStoreError extends Error {
  constructor(message, status = 400, code = "vehicle_tracking_preferences_error") {
    super(message);
    this.name = "VehicleTrackingPreferencesStoreError";
    this.status = status;
    this.code = code;
  }
}

function preferenceDatabase(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new VehicleTrackingPreferencesStoreError(
      "Databáze uživatelského nastavení není dostupná.",
      503,
      "vehicle_tracking_preferences_database_missing"
    );
  }
  return db;
}

export async function readVehicleTrackingPreferences(env, userId = "") {
  const normalizedUserId = String(userId || "").trim();
  const db = preferenceDatabase(env);
  if (!db || !normalizedUserId) {
    return normalizeVehicleTrackingPreferences(DEFAULT_VEHICLE_TRACKING_PREFERENCES, { userId: normalizedUserId });
  }

  try {
    const row = await db
      .prepare(`
        SELECT settings_json, updated_at
        FROM vehicle_tracking_user_preferences
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(normalizedUserId)
      .first();

    if (!row?.settings_json) {
      return normalizeVehicleTrackingPreferences(DEFAULT_VEHICLE_TRACKING_PREFERENCES, { userId: normalizedUserId });
    }

    return normalizeVehicleTrackingPreferences(JSON.parse(row.settings_json), {
      updatedAt: row.updated_at,
      userId: normalizedUserId
    });
  } catch (error) {
    console.error("vehicle_tracking_preferences.d1_read_failed", { message: error.message });
    return normalizeVehicleTrackingPreferences(DEFAULT_VEHICLE_TRACKING_PREFERENCES, { userId: normalizedUserId });
  }
}

export async function saveVehicleTrackingPreferences(env, userId = "", input = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new VehicleTrackingPreferencesStoreError("Chybí identita uživatele.", 401, "user_missing");
  }

  const db = preferenceDatabase(env, true);
  const now = new Date().toISOString();
  const preferences = normalizeVehicleTrackingPreferences(input, {
    updatedAt: now,
    userId: normalizedUserId
  });

  await db
    .prepare(`
      INSERT INTO vehicle_tracking_user_preferences (
        user_id,
        settings_json,
        updated_at
      ) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `)
    .bind(normalizedUserId, JSON.stringify({ infoStyle: preferences.infoStyle }), now)
    .run();

  return preferences;
}
