import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { collectionDailyRoutesErrorResponse } from "../../_lib/collection-daily-routes-api.js";
import {
  createCollectionDailyRouteDraft,
  listCollectionDailyRoutes
} from "../../_lib/collection-daily-routes-store.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const routes = await listCollectionDailyRoutes(env, {
      status: url.searchParams.get("status"),
      routeDate: url.searchParams.get("routeDate"),
      limit: url.searchParams.get("limit"),
      scope: url.searchParams.get("scope")
    }, user);
    return json({ routes, apiStatus: "ready" });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Seznam denních tras se teď nepodařilo načíst.");
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const route = await createCollectionDailyRouteDraft(env, user, await readJson(request));
    return json({ route, apiStatus: "ready" }, 201);
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Návrh denní trasy se teď nepodařilo uložit.");
  }
}
