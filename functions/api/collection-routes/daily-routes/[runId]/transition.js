import { currentUser, json, readJson } from "../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../../_lib/collection-daily-routes-api.js";
import { transitionCollectionDailyRoute } from "../../../../_lib/collection-daily-routes-store.js";

export async function onRequestPost({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const route = await transitionCollectionDailyRoute(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      await readJson(request)
    );
    return json({ route, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Stav denní trasy se teď nepodařilo změnit.");
  }
}
