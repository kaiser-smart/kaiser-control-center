import {
  normalizeAbsenceSettings
} from "../../src/data/absence.js";

const ABSENCE_SETTINGS_DB_BINDING = "SMART_ODPADY_DB";
const ABSENCE_SETTINGS_ID = "current";

export class AbsenceSettingsStoreError extends Error {
  constructor(message, status = 400, code = "absence_settings_error") {
    super(message);
    this.name = "AbsenceSettingsStoreError";
    this.status = status;
    this.code = code;
  }
}

function absenceSettingsDatabase(env, required = false) {
  const db = env?.[ABSENCE_SETTINGS_DB_BINDING] || null;

  if (!db && required) {
    throw new AbsenceSettingsStoreError(
      "Databáze nastavení nepřítomností není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "absence_settings_database_missing"
    );
  }

  return db;
}

async function ensureAbsenceSettingsTable(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS absence_settings (
        id TEXT PRIMARY KEY NOT NULL,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT
      )
    `)
    .run();
}

export function absenceSettingsApiStatus(env) {
  return absenceSettingsDatabase(env) ? "ready" : "waiting";
}

export async function readAbsenceSettings(env) {
  const db = absenceSettingsDatabase(env);

  if (!db) {
    return normalizeAbsenceSettings();
  }

  try {
    await ensureAbsenceSettingsTable(db);

    const row = await db
      .prepare(`
        SELECT settings_json, updated_at, updated_by_user_id
        FROM absence_settings
        WHERE id = ?
        LIMIT 1
      `)
      .bind(ABSENCE_SETTINGS_ID)
      .first();

    if (!row?.settings_json) {
      return normalizeAbsenceSettings();
    }

    const parsed = JSON.parse(row.settings_json);
    return normalizeAbsenceSettings(parsed, {
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id
    });
  } catch (error) {
    console.error("absence_settings.d1_read_failed", { message: error.message });
    return normalizeAbsenceSettings();
  }
}

export async function saveAbsenceSettings(env, input, userId = "") {
  const db = absenceSettingsDatabase(env, true);
  const now = new Date().toISOString();
  const settings = normalizeAbsenceSettings(input, {
    updatedAt: now,
    updatedByUserId: userId
  });

  await ensureAbsenceSettingsTable(db);

  await db
    .prepare(`
      INSERT INTO absence_settings (
        id,
        settings_json,
        updated_at,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at,
        updated_by_user_id = excluded.updated_by_user_id
    `)
    .bind(
      ABSENCE_SETTINGS_ID,
      JSON.stringify(settings),
      settings.updatedAt,
      settings.updatedByUserId || null
    )
    .run();

  return settings;
}
