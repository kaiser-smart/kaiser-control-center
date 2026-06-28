import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings
} from "../../src/data/themeSettings.js";

const THEME_DB_BINDING = "SMART_ODPADY_DB";
const THEME_SETTINGS_ID = "current";

export class ThemeSettingsStoreError extends Error {
  constructor(message, status = 400, code = "theme_settings_error") {
    super(message);
    this.name = "ThemeSettingsStoreError";
    this.status = status;
    this.code = code;
  }
}

function themeDatabase(env, required = false) {
  const db = env?.[THEME_DB_BINDING] || null;

  if (!db && required) {
    throw new ThemeSettingsStoreError(
      "Databáze nastavení vzhledu není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "theme_database_missing"
    );
  }

  return db;
}

export async function readThemeSettings(env) {
  const db = themeDatabase(env);

  if (!db) {
    return normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  }

  try {
    const row = await db
      .prepare(`
        SELECT settings_json, updated_at, updated_by_user_id
        FROM theme_settings
        WHERE id = ?
        LIMIT 1
      `)
      .bind(THEME_SETTINGS_ID)
      .first();

    if (!row?.settings_json) {
      return normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
    }

    const parsed = JSON.parse(row.settings_json);
    return normalizeThemeSettings(parsed, {
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id
    });
  } catch (error) {
    console.error("theme_settings.d1_read_failed", { message: error.message });
    return normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  }
}

export async function saveThemeSettings(env, input, userId = "") {
  const db = themeDatabase(env, true);
  const now = new Date().toISOString();
  const settings = normalizeThemeSettings(input, {
    updatedAt: now,
    updatedByUserId: userId
  });

  await db
    .prepare(`
      INSERT INTO theme_settings (
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
      THEME_SETTINGS_ID,
      JSON.stringify(settings),
      settings.updatedAt,
      settings.updatedByUserId || null
    )
    .run();

  return settings;
}
