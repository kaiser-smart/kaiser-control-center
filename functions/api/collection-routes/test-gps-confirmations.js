import { currentUser, json, readJson } from "../../_lib/auth.js";
import {
  CollectionRoutesTestGpsError,
  confirmCollectionRoutesTestGps,
  listCollectionRoutesTestGpsConfirmations
} from "../../_lib/collection-routes-test-gps-store.js";

function errorResponse(error) {
  if (error instanceof CollectionRoutesTestGpsError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_routes_test_gps.api_failed", { message: error?.message });
  return json({ error: "GPS potvrzení stanoviště se teď nepodařilo zpracovat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const url = new URL(request.url);
    return json({
      ...(await listCollectionRoutesTestGpsConfirmations(env, user, { runId: url.searchParams.get("runId") })),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  try {
    const result = await confirmCollectionRoutesTestGps(env, user, await readJson(request));
    return json({ ...result, apiStatus: "ready" }, result.reused ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
