import { currentUser, json } from "../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../../_lib/collection-daily-routes-api.js";
import { getCollectionDailyRoute } from "../../../../_lib/collection-daily-routes-store.js";
import {
  buildCollectionDailyRouteLegNavigation,
  CollectionDailyRouteNavigationError
} from "../../../../_lib/collection-daily-route-navigation.js";

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const detail = await getCollectionDailyRoute(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      { scope }
    );
    const navigation = await buildCollectionDailyRouteLegNavigation(env, detail, {
      fromPointId: url.searchParams.get("fromPointId"),
      toPointId: url.searchParams.get("toPointId")
    }, {
      fetchImpl: env?.__HERE_ROUTING_FETCH || fetch
    });
    return json({ navigation, apiStatus: "ready" });
  } catch (error) {
    if (error instanceof CollectionDailyRouteNavigationError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    return collectionDailyRoutesErrorResponse(error, "Navigační úsek se teď nepodařilo načíst.");
  }
}
