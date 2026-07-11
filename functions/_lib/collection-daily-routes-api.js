import { json } from "./auth.js";
import { CollectionDailyRoutesError } from "./collection-daily-routes-store.js";

export function collectionDailyRoutesErrorResponse(error, fallbackMessage = "Denní Svozové trasy se teď nepodařilo zpracovat.") {
  if (error instanceof CollectionDailyRoutesError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("collection_daily_routes.api_failed", { message: error?.message });
  return json({ error: fallbackMessage, apiStatus: "waiting" }, 500);
}

export function collectionDailyRouteRunId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const routeIndex = parts.lastIndexOf("daily-routes");
  return decodeURIComponent(cleanParam(params?.runId || parts[routeIndex + 1] || ""));
}

export function collectionDailyRouteStopId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const stopsIndex = parts.lastIndexOf("stops");
  return decodeURIComponent(cleanParam(params?.stopId || parts[stopsIndex + 1] || ""));
}

function cleanParam(value) {
  return String(value ?? "").trim();
}
