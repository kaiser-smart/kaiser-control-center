import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../../_lib/collection-daily-routes-api.js";
import { previewCollectionDailyRoute } from "../../../_lib/collection-daily-routes-store.js";

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const preview = await previewCollectionDailyRoute(env, user, await readJson(request));
    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Návrh denní trasy se teď nepodařilo ověřit.");
  }
}
