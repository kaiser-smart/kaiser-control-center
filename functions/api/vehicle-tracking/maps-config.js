import { json, requireUserPermission } from "../../_lib/auth.js";

export function vehicleTrackingMapsConfigPayload(env = {}) {
  const browserApiKey = String(
    env.GOOGLE_MAPS_BROWSER_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || ""
  ).trim();

  return {
    apiStatus: browserApiKey ? "ready" : "waiting",
    configured: Boolean(browserApiKey),
    provider: "google-maps-javascript",
    browserApiKey,
    message: browserApiKey
      ? "Google mapa je připravená."
      : "Google Maps klíč zatím není nastavený."
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");

  if (response) {
    return response;
  }

  return json(vehicleTrackingMapsConfigPayload(env));
}
