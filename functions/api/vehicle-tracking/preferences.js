import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  VehicleTrackingPreferencesStoreError,
  readVehicleTrackingPreferences,
  saveVehicleTrackingPreferences
} from "../../_lib/vehicle-tracking-preferences-store.js";

function preferenceError(error) {
  if (error instanceof VehicleTrackingPreferencesStoreError) {
    return json({ error: error.message }, error.status);
  }
  console.error("vehicle_tracking_preferences.api_failed", { message: error.message });
  return json({ error: "Volbu info cedule se nepodařilo uložit." }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;

  try {
    return json({ preferences: await readVehicleTrackingPreferences(env, user.id) });
  } catch (error) {
    return preferenceError(error);
  }
}

export async function onRequestPatch({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;

  try {
    const payload = await readJson(request);
    return json({ preferences: await saveVehicleTrackingPreferences(env, user.id, payload) });
  } catch (error) {
    return preferenceError(error);
  }
}
