import { currentUser, json, readJson } from "../../../../_lib/auth.js";
import {
  CollectionDailyRouteHereSequenceError,
  getCollectionDailyRouteHereSequenceReadiness,
  optimizeCollectionDailyRouteHereSequence
} from "../../../../_lib/collection-daily-route-here-sequence.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../../_lib/collection-daily-routes-api.js";

function errorResponse(error) {
  if (error instanceof CollectionDailyRouteHereSequenceError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  return collectionDailyRoutesErrorResponse(error, "HERE optimalizaci TEST trasy se teď nepodařilo zpracovat.");
}

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const { readiness } = await getCollectionDailyRouteHereSequenceReadiness(
      env,
      user,
      collectionDailyRouteRunId(request, params)
    );
    const { planned, historical, profile, ...publicReadiness } = readiness;
    return json({ readiness: publicReadiness, apiStatus: readiness.ready ? "ready" : "waiting" });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function onRequestPost({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    return json(await optimizeCollectionDailyRouteHereSequence(
      env,
      user,
      collectionDailyRouteRunId(request, params),
      await readJson(request),
      { fetchImpl: env?.__HERE_WAYPOINT_SEQUENCE_FETCH || fetch }
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
