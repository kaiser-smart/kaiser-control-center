import { currentUser, json } from "../../../../_lib/auth.js";
import {
  collectionDailyRouteRunId,
  collectionDailyRoutesErrorResponse
} from "../../../../_lib/collection-daily-routes-api.js";
import {
  getCollectionDailyRoute
} from "../../../../_lib/collection-daily-routes-store.js";
import {
  buildCollectionDailyRouteHereMapImageUrl
} from "../../../../_lib/collection-daily-route-map.js";

const HERE_MAP_IMAGE_TIMEOUT_MS = 12000;

function errorResponse(message, status, code) {
  return json({ error: message, apiStatus: "waiting", code }, status);
}

export async function onRequestGet({ request, env, params }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Nepřihlášeno." }, 401);
  const requestUrl = new URL(request.url);
  const runId = collectionDailyRouteRunId(request, params);
  let detail;
  try {
    detail = await getCollectionDailyRoute(env, user, runId, {
      scope: requestUrl.searchParams.get("scope")
    });
  } catch (error) {
    return collectionDailyRoutesErrorResponse(error, "Mapu přidělené trasy se teď nepodařilo načíst.");
  }

  let hereUrl;
  try {
    hereUrl = buildCollectionDailyRouteHereMapImageUrl(env, detail?.driverMap);
  } catch (error) {
    if (error?.message === "here_map_key_missing") {
      return errorResponse(
        "HERE mapový podklad zatím není aktivovaný. Trasa zůstává dostupná podle adres.",
        503,
        "collection_daily_route_map_key_missing"
      );
    }
    return errorResponse(
      "Trasa zatím nemá dostatek platných souřadnic pro celkovou mapu.",
      409,
      "collection_daily_route_map_view_missing"
    );
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), HERE_MAP_IMAGE_TIMEOUT_MS) : null;
  try {
    const hereResponse = await fetch(hereUrl, {
      headers: { Accept: "image/png,image/*" },
      ...(controller ? { signal: controller.signal } : {})
    });
    const contentType = cleanContentType(hereResponse.headers.get("content-type"));
    if (!hereResponse.ok || !contentType.startsWith("image/")) {
      return errorResponse(
        "HERE mapový podklad se teď nepodařilo načíst. Trasa zůstává dostupná podle adres.",
        502,
        "collection_daily_route_map_upstream_failed"
      );
    }
    return new Response(hereResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return errorResponse(
      "HERE mapový podklad se teď nepodařilo načíst. Trasa zůstává dostupná podle adres.",
      502,
      "collection_daily_route_map_upstream_failed"
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function cleanContentType(value) {
  return String(value || "").trim().toLowerCase();
}
