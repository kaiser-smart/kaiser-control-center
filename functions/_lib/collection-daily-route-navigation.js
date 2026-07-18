import { COLLECTION_DAILY_ROUTE_MAP_DEPOT } from "./collection-daily-route-map.js";

const HERE_ROUTING_BASE_URL = "https://router.hereapi.com/v8/routes";
const FLEXIBLE_POLYLINE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export class CollectionDailyRouteNavigationError extends Error {
  constructor(message, status = 400, code = "collection_daily_route_navigation_error") {
    super(message);
    this.name = "CollectionDailyRouteNavigationError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function coordinate(value, minimum, maximum) {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function pointFromMapItem(item = {}) {
  const latitude = coordinate(item.latitude, -90, 90);
  const longitude = coordinate(item.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    id: cleanString(item.stopId || item.id),
    label: cleanString(item.label),
    address: cleanString(item.address),
    latitude,
    longitude
  };
}

function navigationPoint(driverMap = {}, pointId = "") {
  const id = cleanString(pointId);
  const depot = pointFromMapItem(driverMap.depot || COLLECTION_DAILY_ROUTE_MAP_DEPOT);
  if (!id || id === "depot" || id === cleanString(driverMap.depot?.id)) return depot;
  return pointFromMapItem((Array.isArray(driverMap.points) ? driverMap.points : [])
    .find((point) => cleanString(point?.stopId) === id));
}

function decodeUnsignedValues(encoded) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const character of String(encoded || "")) {
    const chunk = FLEXIBLE_POLYLINE_ALPHABET.indexOf(character);
    if (chunk < 0) {
      throw new CollectionDailyRouteNavigationError(
        "HERE vrátil neplatnou geometrii trasy.",
        502,
        "collection_daily_route_navigation_polyline_invalid"
      );
    }
    value += (chunk & 0x1f) * (2 ** shift);
    if ((chunk & 0x20) === 0) {
      values.push(value);
      value = 0;
      shift = 0;
    } else {
      shift += 5;
    }
  }
  if (shift !== 0) {
    throw new CollectionDailyRouteNavigationError(
      "HERE vrátil neúplnou geometrii trasy.",
      502,
      "collection_daily_route_navigation_polyline_incomplete"
    );
  }
  return values;
}

function signedValue(value) {
  return value % 2 === 1 ? -(Math.floor(value / 2) + 1) : Math.floor(value / 2);
}

export function decodeHereFlexiblePolyline(encoded) {
  const values = decodeUnsignedValues(encoded);
  if (values.length < 2) {
    throw new CollectionDailyRouteNavigationError(
      "HERE trasa neobsahuje použitelnou geometrii.",
      502,
      "collection_daily_route_navigation_polyline_missing"
    );
  }
  const version = values[0];
  if (version !== 1) {
    throw new CollectionDailyRouteNavigationError(
      "HERE vrátil nepodporovanou verzi geometrie.",
      502,
      "collection_daily_route_navigation_polyline_version"
    );
  }
  const header = values[1];
  const precision = header & 15;
  const thirdDimension = (header >> 4) & 7;
  const thirdDimensionPrecision = (header >> 7) & 15;
  const factor = 10 ** precision;
  const thirdFactor = 10 ** thirdDimensionPrecision;
  const coordinates = [];
  let latitude = 0;
  let longitude = 0;
  let thirdValue = 0;
  let index = 2;
  while (index < values.length) {
    if (index + 1 >= values.length) {
      throw new CollectionDailyRouteNavigationError(
        "HERE vrátil neúplný bod geometrie.",
        502,
        "collection_daily_route_navigation_polyline_point_incomplete"
      );
    }
    latitude += signedValue(values[index]);
    longitude += signedValue(values[index + 1]);
    index += 2;
    const point = {
      latitude: Math.round((latitude / factor) * 1e6) / 1e6,
      longitude: Math.round((longitude / factor) * 1e6) / 1e6
    };
    if (thirdDimension !== 0) {
      if (index >= values.length) {
        throw new CollectionDailyRouteNavigationError(
          "HERE vrátil neúplný třetí rozměr geometrie.",
          502,
          "collection_daily_route_navigation_polyline_third_dimension_incomplete"
        );
      }
      thirdValue += signedValue(values[index]);
      point.thirdDimension = thirdValue / thirdFactor;
      index += 1;
    }
    coordinates.push(point);
  }
  return coordinates;
}

function appendSectionPoints(target, sectionPoints) {
  for (const point of sectionPoints) {
    const previous = target[target.length - 1];
    if (
      previous
      && previous.latitude === point.latitude
      && previous.longitude === point.longitude
    ) continue;
    target.push({ latitude: point.latitude, longitude: point.longitude });
  }
}

export async function buildCollectionDailyRouteLegNavigation(env = {}, detail = {}, input = {}, options = {}) {
  const driverMap = detail?.driverMap || {};
  const liveLatitude = coordinate(input.originLatitude, -90, 90);
  const liveLongitude = coordinate(input.originLongitude, -180, 180);
  const hasLiveOriginInput = cleanString(input.originLatitude) || cleanString(input.originLongitude);
  if (hasLiveOriginInput && (liveLatitude === null || liveLongitude === null)) {
    throw new CollectionDailyRouteNavigationError(
      "Živá poloha tabletu není platná.",
      400,
      "collection_daily_route_navigation_origin_invalid"
    );
  }
  const origin = hasLiveOriginInput
    ? { id: "live-position", label: "Moje poloha", address: "", latitude: liveLatitude, longitude: liveLongitude }
    : navigationPoint(driverMap, input.fromPointId);
  const destination = navigationPoint(driverMap, input.toPointId);
  if (!origin || !destination) {
    throw new CollectionDailyRouteNavigationError(
      "Pro tento úsek chybí ověřené souřadnice.",
      409,
      "collection_daily_route_navigation_coordinates_missing"
    );
  }
  const apiKey = cleanString(env.HERE_MAPS_API_KEY);
  if (!apiKey) {
    throw new CollectionDailyRouteNavigationError(
      "HERE navigace není na serveru nastavená.",
      503,
      "collection_daily_route_navigation_here_key_missing"
    );
  }
  const url = new URL(HERE_ROUTING_BASE_URL);
  url.searchParams.set("transportMode", "truck");
  url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("return", "polyline,summary,actions,instructions");
  url.searchParams.set("lang", "cs-CZ");
  url.searchParams.set("apiKey", apiKey);
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new CollectionDailyRouteNavigationError(
      "HERE trasu se teď nepodařilo načíst.",
      502,
      "collection_daily_route_navigation_here_unreachable"
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CollectionDailyRouteNavigationError(
      "HERE trasu se teď nepodařilo vypočítat.",
      502,
      "collection_daily_route_navigation_here_failed"
    );
  }
  const sections = Array.isArray(payload?.routes?.[0]?.sections) ? payload.routes[0].sections : [];
  if (!sections.length) {
    throw new CollectionDailyRouteNavigationError(
      "HERE pro tento úsek nenašel trasu.",
      404,
      "collection_daily_route_navigation_route_missing"
    );
  }
  const points = [];
  const maneuvers = [];
  let lengthMeters = 0;
  let durationSeconds = 0;
  for (const section of sections) {
    const sectionPoints = cleanString(section?.polyline) ? decodeHereFlexiblePolyline(section.polyline) : [];
    if (cleanString(section?.polyline)) {
      appendSectionPoints(points, sectionPoints);
    }
    lengthMeters += Number(section?.summary?.length) || 0;
    durationSeconds += Number(section?.summary?.duration) || 0;
    const actions = Array.isArray(section?.turnByTurnActions)
      ? section.turnByTurnActions
      : Array.isArray(section?.actions) ? section.actions : [];
    for (const action of actions) {
      const offset = Math.max(0, Math.min(sectionPoints.length - 1, Number(action?.offset) || 0));
      const point = sectionPoints[offset] || null;
      maneuvers.push({
        action: cleanString(action?.action),
        direction: cleanString(action?.direction),
        instruction: cleanString(action?.instruction) || "Pokračuj podle vyznačené trasy.",
        lengthMeters: Math.round(Number(action?.length) || 0),
        durationSeconds: Math.round(Number(action?.duration) || 0),
        ...(point ? { latitude: point.latitude, longitude: point.longitude } : {})
      });
    }
  }
  if (points.length < 2) {
    throw new CollectionDailyRouteNavigationError(
      "HERE trasa nemá použitelnou geometrii.",
      502,
      "collection_daily_route_navigation_geometry_missing"
    );
  }
  return {
    provider: "here-routing-v8",
    mode: "truck",
    origin,
    destination,
    points,
    summary: {
      lengthMeters: Math.round(lengthMeters),
      durationSeconds: Math.round(durationSeconds)
    },
    maneuvers,
    sendsNotifications: false,
    writesRoute: false,
    exposesApiKey: false
  };
}

export const __test = {
  HERE_ROUTING_BASE_URL,
  navigationPoint
};
