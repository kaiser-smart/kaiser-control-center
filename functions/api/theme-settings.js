import { currentUser, json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  ThemeSettingsStoreError,
  readThemeSettings,
  saveThemeSettings
} from "../_lib/theme-settings-store.js";

function themeSettingsError(error) {
  if (error instanceof ThemeSettingsStoreError) {
    return json({ error: error.message }, error.status);
  }

  console.error("theme_settings.api_failed", { message: error.message });
  return json(
    {
      error: "Vzhled se nepodařilo uložit. Zkuste to prosím znovu."
    },
    500
  );
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  const settings = await readThemeSettings(env);
  return json({ settings });
}

export async function onRequestPatch({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const settings = await saveThemeSettings(env, payload, user.id);
    return json({ settings });
  } catch (error) {
    return themeSettingsError(error);
  }
}
