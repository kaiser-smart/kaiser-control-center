import { currentUser, json } from "../../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../../_lib/collection-daily-routes-api.js";
import { getMyCollectionDailyRoute } from "../../../_lib/collection-daily-routes-store.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const route = await getMyCollectionDailyRoute(env, user);
    return json({ route, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Přiřazenou denní trasu se teď nepodařilo načíst.");
  }
}
