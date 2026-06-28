import { currentUser, json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  AbsenceSettingsStoreError,
  absenceSettingsApiStatus,
  readAbsenceSettings,
  saveAbsenceSettings
} from "../_lib/absence-settings-store.js";

function absenceSettingsError(error) {
  if (error instanceof AbsenceSettingsStoreError) {
    return json({
      error: error.message,
      code: error.code,
      apiStatus: "waiting",
      missingEndpoint: "PATCH /api/absence-settings"
    }, error.status);
  }

  console.error("absence_settings.api_failed", { message: error.message });
  return json({ error: "Nastavení reportu se nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  try {
    const settings = await readAbsenceSettings(env);
    return json({ settings, apiStatus: absenceSettingsApiStatus(env) });
  } catch (error) {
    return absenceSettingsError(error);
  }
}

export async function onRequestPatch({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "manage");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const settings = await saveAbsenceSettings(env, payload, user.id);
    return json({ settings, apiStatus: "ready" });
  } catch (error) {
    return absenceSettingsError(error);
  }
}
