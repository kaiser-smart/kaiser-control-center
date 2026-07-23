import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteDriverTabletAudioError,
  readDriverTabletPreferences,
  saveDriverTabletPreferences
} from "../../../_lib/collection-route-driver-tablet-audio-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRouteDriverTabletAudioError) return json({ error: error.message }, error.status);
  console.error("collection_routes.driver_tablet_preferences_api_failed", { error: String(error?.message || "unknown").slice(0, 100) });
  return json({ error: "Nastavení zvuku tabletu se nepodařilo uložit." }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    return json({ preferences: await readDriverTabletPreferences(env, user.id, { scope }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPatch({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    return json({ preferences: await saveDriverTabletPreferences(env, user.id, await readJson(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
