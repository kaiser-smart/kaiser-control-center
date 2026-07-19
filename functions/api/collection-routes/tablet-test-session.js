import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../_lib/collection-daily-routes-api.js";
import {
  getCollectionDailyRouteTabletTestLauncher,
  resetCollectionDailyRouteTabletTestSession,
  startCollectionDailyRouteTabletTestSession
} from "../../_lib/collection-daily-routes-store.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const launcher = await getCollectionDailyRouteTabletTestLauncher(env, user);
    return json({ ...launcher, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "TEST tabletu se teď nepodařilo načíst.");
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const input = await readJson(request);
    const result = input.action === "reset"
      ? await resetCollectionDailyRouteTabletTestSession(env, user, input)
      : await startCollectionDailyRouteTabletTestSession(env, user, input);
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "TEST relaci tabletu se teď nepodařilo změnit.");
  }
}
