import { json, requireUserPermission } from "../../_lib/auth.js";

const HERE_MAP_IMAGE_BASE_URL = "https://image.maps.hereapi.com/mia/v3";
const HERE_MAP_IMAGE_WIDTH = 960;
const HERE_MAP_IMAGE_HEIGHT = 420;
const HERE_MAP_IMAGE_TIMEOUT_MS = 12000;
const HERE_MAP_CLOSE_POINTS_MAX_DISTANCE_METERS = 80;
const EARTH_RADIUS_METERS = 6371000;

function coordinate(value, minimum, maximum) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function point(latitude, longitude) {
  const lat = coordinate(latitude, -90, 90);
  const lng = coordinate(longitude, -180, 180);
  return lat === null || lng === null ? null : { lat, lng };
}

function markerOverlay(mapPoint, label, color) {
  return [
    `point:${mapPoint.lat},${mapPoint.lng}`,
    "size=large",
    `label=${label}`,
    `color=${color}`,
    "text-color=#FFFFFF",
    "text-outline-color=#263228",
    "outline-color=#FFFFFF",
    "outline-width=2"
  ].join(";");
}

function distanceMeters(first, second) {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function mapView(points) {
  if (points.length === 1) {
    return `center:${points[0].lat},${points[0].lng};zoom=18`;
  }
  if (distanceMeters(points[0], points[1]) <= HERE_MAP_CLOSE_POINTS_MAX_DISTANCE_METERS) {
    const midpoint = {
      lat: (points[0].lat + points[1].lat) / 2,
      lng: (points[0].lng + points[1].lng) / 2
    };
    return `center:${midpoint.lat},${midpoint.lng};zoom=18`;
  }
  return "overlay:padding=64";
}

export function buildCollectionRoutesHereMapImageUrl(env = {}, input = {}) {
  const apiKey = String(env.HERE_MAPS_API_KEY || "").trim();
  if (!apiKey) throw new Error("here_map_key_missing");

  const address = point(input.addressLatitude, input.addressLongitude);
  const measured = point(input.measuredLatitude, input.measuredLongitude);
  const points = [address, measured].filter(Boolean);
  if (!points.length) throw new Error("here_map_coordinates_missing");

  const view = mapView(points);
  const url = new URL(
    `${HERE_MAP_IMAGE_BASE_URL}/base/mc/${view}/${HERE_MAP_IMAGE_WIDTH}x${HERE_MAP_IMAGE_HEIGHT}/png`
  );
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("style", "logistics.day");
  url.searchParams.set("features", "pois:disabled");
  url.searchParams.set("scaleBar", "km");
  if (address) url.searchParams.append("overlay", markerOverlay(address, "A", "#75BD25"));
  if (measured) url.searchParams.append("overlay", markerOverlay(measured, "F", "#A92020"));
  return url;
}

function errorResponse(message, status, code) {
  return json({ error: message, apiStatus: "waiting", code }, status);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) return response;

  const requestUrl = new URL(request.url);
  let hereUrl;
  try {
    hereUrl = buildCollectionRoutesHereMapImageUrl(env, {
      addressLatitude: requestUrl.searchParams.get("addressLatitude"),
      addressLongitude: requestUrl.searchParams.get("addressLongitude"),
      measuredLatitude: requestUrl.searchParams.get("measuredLatitude"),
      measuredLongitude: requestUrl.searchParams.get("measuredLongitude")
    });
  } catch (error) {
    if (error?.message === "here_map_key_missing") {
      return errorResponse(
        "HERE mapový podklad zatím není aktivovaný. GPS test může pokračovat bez mapy.",
        503,
        "collection_routes_here_map_key_missing"
      );
    }
    return errorResponse(
      "Pro mapový výřez chybí platná adresa nebo fyzická GPS.",
      400,
      "collection_routes_here_map_coordinates_missing"
    );
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), HERE_MAP_IMAGE_TIMEOUT_MS) : null;
  try {
    const hereResponse = await fetch(hereUrl, {
      headers: { Accept: "image/png,image/*" },
      ...(controller ? { signal: controller.signal } : {})
    });
    const contentType = String(hereResponse.headers.get("content-type") || "").toLowerCase();
    if (!hereResponse.ok || !contentType.startsWith("image/")) {
      return errorResponse(
        "HERE mapový výřez se teď nepodařilo načíst. GPS test může pokračovat bez mapy.",
        502,
        "collection_routes_here_map_upstream_failed"
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
      "HERE mapový výřez se teď nepodařilo načíst. GPS test může pokračovat bez mapy.",
      502,
      "collection_routes_here_map_upstream_failed"
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
