import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRouteDriverTabletAudioError,
  claimDriverTabletIntro,
  logDriverTabletAudioEvent
} from "../../../_lib/collection-route-driver-tablet-audio-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRouteDriverTabletAudioError) return json({ error: error.message, code: error.code }, error.status);
  console.error("collection_routes.driver_tablet_audio_api_failed", { error: String(error?.message || "unknown").slice(0, 100) });
  return json({ error: "Audio událost tabletu se nepodařilo bezpečně uložit." }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;
  try {
    const payload = await readJson(request);
    const result = payload.action === "claim_intro"
      ? await claimDriverTabletIntro(env, user, payload)
      : await logDriverTabletAudioEvent(env, user, payload);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
