import { currentUser, json } from "../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../../_lib/collection-daily-routes-api.js";
import { getCollectionDailyRoute } from "../../../../_lib/collection-daily-routes-store.js";
import {
  buildCollectionDailyRouteOverviewGeometry,
  CollectionDailyRouteNavigationError
} from "../../../../_lib/collection-daily-route-navigation.js";

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const url = new URL(request.url);
    const detail = await getCollectionDailyRoute(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      { scope: url.searchParams.get("scope") }
    );
    const geometry = await buildCollectionDailyRouteOverviewGeometry(env, detail, {
      fetchImpl: env?.__HERE_ROUTING_FETCH || fetch
    });
    return json({ geometry, apiStatus: "ready" });
  } catch (error) {
    if (error instanceof CollectionDailyRouteNavigationError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    return collectionDailyRoutesErrorResponse(error, "Silniční průběh celé trasy se teď nepodařilo načíst.");
  }
}
