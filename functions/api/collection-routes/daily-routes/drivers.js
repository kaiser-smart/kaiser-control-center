import { json, requireUserPermission } from "../../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../../_lib/collection-daily-routes-api.js";
import {
  COLLECTION_DAILY_ROUTE_VEHICLES,
  listCollectionDailyRouteDrivers
} from "../../../_lib/collection-daily-routes-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const drivers = await listCollectionDailyRouteDrivers(env);
    return json({ drivers, vehicles: COLLECTION_DAILY_ROUTE_VEHICLES, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Seznam řidičů se teď nepodařilo načíst.");
  }
}
