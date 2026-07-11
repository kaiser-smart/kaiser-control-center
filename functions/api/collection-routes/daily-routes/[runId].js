import { currentUser, json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../_lib/collection-daily-routes-api.js";
import {
  assignCollectionDailyRouteDriver,
  getCollectionDailyRoute
} from "../../../_lib/collection-daily-routes-store.js";

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const route = await getCollectionDailyRoute(env, user, collectionDailyRouteRunId(request, params));
    return json({ route, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Denní trasu se teď nepodařilo načíst.");
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const route = await assignCollectionDailyRouteDriver(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      await readJson(request)
    );
    return json({ route, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Řidiče se teď nepodařilo přiřadit.");
  }
}
