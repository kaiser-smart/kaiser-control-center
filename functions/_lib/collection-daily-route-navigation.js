import { COLLECTION_DAILY_ROUTE_MAP_DEPOT } from "./collection-daily-route-map.js";
import {
  appendHereRoutingTruckProfile,
  loadCollectionRouteVehicleProfile
} from "./collection-route-vehicle-profiles.js";

const HERE_ROUTING_BASE_URL = "https://router.hereapi.com/v8/routes";
const FLEXIBLE_POLYLINE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const HERE_ROUTING_TIMEOUT_MS = 15_000;
const OVERVIEW_MAX_EDGES_PER_REQUEST = 25;
const OVERVIEW_PROVIDER_CONCURRENCY = 4;

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

function vehicleNotice(payload = {}) {
  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  const notices = [
    ...(Array.isArray(payload?.notices) ? payload.notices : []),
    ...(Array.isArray(route?.notices) ? route.notices : []),
    ...(Array.isArray(route?.sections) ? route.sections.flatMap((section) => Array.isArray(section?.notices) ? section.notices : []) : [])
  ];
  return notices.find((notice) => (
    cleanString(notice?.severity).toLowerCase() === "critical"
    && ["violatedVehicleRestriction", "currentWeightExceedsLimit", "violatedBlockedRoad"]
      .includes(cleanString(notice?.code))
  )) || null;
}

function publicVehicleNotice(notice = {}) {
  return {
    code: cleanString(notice?.code) || "vehicleRestriction",
    severity: cleanString(notice?.severity) || "critical",
    title: cleanString(notice?.title || notice?.message) || "HERE našel kritické omezení pro potvrzený profil vozu."
  };
}

async function requestHereRoute(env, input = {}, options = {}) {
  const apiKey = cleanString(env.HERE_MAPS_API_KEY);
  if (!apiKey) {
    throw new CollectionDailyRouteNavigationError(
      "HERE navigace není na serveru nastavená.",
      503,
      "collection_daily_route_navigation_here_key_missing"
    );
  }
  const profile = input.vehicleProfile || await loadCollectionRouteVehicleProfile(env, input.run || {});
  const stationaryNoDrive = input?.run?.metadata?.stationaryNoDrive === true
    || cleanString(input?.run?.vehicleCode).toUpperCase() === "FIELD";
  if (!profile && !stationaryNoDrive) {
    throw new CollectionDailyRouteNavigationError(
      "Pro přidělený vůz chybí potvrzené rozměry a hmotnosti.",
      409,
      "collection_daily_route_navigation_vehicle_profile_missing"
    );
  }
  const url = new URL(HERE_ROUTING_BASE_URL);
  url.searchParams.set("transportMode", "truck");
  url.searchParams.set("origin", `${input.origin.latitude},${input.origin.longitude}`);
  url.searchParams.set("destination", `${input.destination.latitude},${input.destination.longitude}`);
  for (const via of Array.isArray(input.via) ? input.via : []) {
    url.searchParams.append("via", `${via.latitude},${via.longitude}`);
  }
  url.searchParams.set("return", input.actions ? "polyline,summary,actions,instructions" : "polyline,summary");
  if (input.actions) url.searchParams.set("lang", "cs-CZ");
  if (profile) appendHereRoutingTruckProfile(url.searchParams, profile);
  url.searchParams.set("apiKey", apiKey);
  const fetchImpl = options.fetchImpl || fetch;
  const abortController = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs) || HERE_ROUTING_TIMEOUT_MS);
  const timeoutId = abortController
    ? setTimeout(() => abortController.abort(), timeoutMs)
    : null;
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
      ...(abortController ? { signal: abortController.signal } : {})
    });
  } catch {
    if (abortController?.signal?.aborted) {
      throw new CollectionDailyRouteNavigationError(
        "HERE výpočet silničního průběhu překročil bezpečný časový limit.",
        504,
        "collection_daily_route_navigation_here_timeout"
      );
    }
    throw new CollectionDailyRouteNavigationError(
      "HERE trasu se teď nepodařilo načíst.",
      502,
      "collection_daily_route_navigation_here_unreachable"
    );
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("collection_daily_route_navigation.provider_failed", {
      providerStatus: response.status,
      providerCode: cleanString(payload?.code || payload?.errorCode),
      message: cleanString(payload?.title || payload?.detail || payload?.message) || "HERE response without JSON message"
    });
    throw new CollectionDailyRouteNavigationError(
      "HERE trasu se teď nepodařilo vypočítat.",
      502,
      "collection_daily_route_navigation_here_failed"
    );
  }
  const notice = vehicleNotice(payload);
  if (notice && input.allowCriticalNotices !== true) {
    throw new CollectionDailyRouteNavigationError(
      "HERE našel na trase kritické omezení pro rozměry nebo hmotnost vozu.",
      409,
      "collection_daily_route_navigation_vehicle_restriction"
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
  return {
    sections,
    profile,
    criticalVehicleNotice: notice ? publicVehicleNotice(notice) : null
  };
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
  const { sections, profile } = await requestHereRoute(env, {
    run: detail?.run,
    origin,
    destination,
    actions: true
  }, options);
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
    vehicleProfile: profile,
    sendsNotifications: false,
    writesRoute: false,
    exposesApiKey: false
  };
}

function overviewRoutePoints(detail = {}) {
  const driverMap = detail?.driverMap || {};
  const depot = pointFromMapItem(driverMap.depot || COLLECTION_DAILY_ROUTE_MAP_DEPOT);
  const stops = (Array.isArray(driverMap.points) ? driverMap.points : [])
    .slice()
    .sort((left, right) => Number(left?.routeOrder) - Number(right?.routeOrder))
    .map(pointFromMapItem)
    .filter(Boolean);
  return depot ? [depot, ...stops, depot] : [];
}

export async function buildCollectionDailyRouteOverviewGeometry(env = {}, detail = {}, options = {}) {
  const coordinates = overviewRoutePoints(detail);
  if (coordinates.length < 3) {
    throw new CollectionDailyRouteNavigationError(
      "Celá trasa nemá dost použitelných souřadnic.",
      409,
      "collection_daily_route_navigation_overview_coordinates_missing"
    );
  }
  const profile = await loadCollectionRouteVehicleProfile(env, detail?.run || {});
  if (!profile) {
    throw new CollectionDailyRouteNavigationError(
      "Pro přidělený vůz chybí potvrzené rozměry a hmotnosti.",
      409,
      "collection_daily_route_navigation_vehicle_profile_missing"
    );
  }
  const requests = [];
  for (let startIndex = 0; startIndex < coordinates.length - 1; startIndex += OVERVIEW_MAX_EDGES_PER_REQUEST) {
    const endIndex = Math.min(coordinates.length - 1, startIndex + OVERVIEW_MAX_EDGES_PER_REQUEST);
    requests.push({
      run: detail?.run,
      vehicleProfile: profile,
      origin: coordinates[startIndex],
      destination: coordinates[endIndex],
      via: coordinates.slice(startIndex + 1, endIndex),
      actions: false,
      allowCriticalNotices: true
    });
  }
  const routeResults = [];
  for (let index = 0; index < requests.length; index += OVERVIEW_PROVIDER_CONCURRENCY) {
    const batch = requests.slice(index, index + OVERVIEW_PROVIDER_CONCURRENCY);
    routeResults.push(...await Promise.all(
      batch.map((request) => requestHereRoute(env, request, options))
    ));
  }
  const points = [];
  let lengthMeters = 0;
  let durationSeconds = 0;
  const warnings = [];
  const warningKeys = new Set();
  for (const { sections, criticalVehicleNotice } of routeResults) {
    if (criticalVehicleNotice) {
      const warningKey = `${criticalVehicleNotice.code}:${criticalVehicleNotice.title}`;
      if (!warningKeys.has(warningKey)) {
        warningKeys.add(warningKey);
        warnings.push(criticalVehicleNotice);
      }
    }
    for (const section of sections) {
      if (cleanString(section?.polyline)) {
        appendSectionPoints(points, decodeHereFlexiblePolyline(section.polyline));
      }
      lengthMeters += Number(section?.summary?.length) || 0;
      durationSeconds += Number(section?.summary?.duration) || 0;
    }
  }
  if (points.length < 2) {
    throw new CollectionDailyRouteNavigationError(
      "HERE celá trasa nemá použitelnou silniční geometrii.",
      502,
      "collection_daily_route_navigation_overview_geometry_missing"
    );
  }
  return {
    provider: "here-routing-v8",
    mode: "truck",
    points,
    summary: {
      lengthMeters: Math.round(lengthMeters),
      durationSeconds: Math.round(durationSeconds)
    },
    vehicleProfile: profile,
    providerCalls: routeResults.length,
    warnings,
    safeForNavigation: warnings.length === 0,
    sendsNotifications: false,
    writesRoute: false,
    exposesApiKey: false
  };
}

export const __test = {
  HERE_ROUTING_BASE_URL,
  HERE_ROUTING_TIMEOUT_MS,
  OVERVIEW_MAX_EDGES_PER_REQUEST,
  OVERVIEW_PROVIDER_CONCURRENCY,
  navigationPoint,
  overviewRoutePoints,
  publicVehicleNotice,
  vehicleNotice
};
