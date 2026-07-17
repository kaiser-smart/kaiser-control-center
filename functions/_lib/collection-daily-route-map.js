const HERE_MAP_IMAGE_BASE_URL = "https://image.maps.hereapi.com/mia/v3";
const WEB_MERCATOR_TILE_SIZE = 256;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

export const COLLECTION_DAILY_ROUTE_MAP_WIDTH = 960;
export const COLLECTION_DAILY_ROUTE_MAP_HEIGHT = 420;
export const COLLECTION_DAILY_ROUTE_MAP_DEPOT = Object.freeze({
  id: "kaiser-trnkova",
  label: "Výjezd a návrat · Kaiser servis",
  address: "Trnkova 3052/137, 628 00 Brno",
  latitude: 49.19121,
  longitude: 16.67013
});

function cleanString(value) {
  return String(value ?? "").trim();
}

function coordinate(value, minimum, maximum) {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function normalizedAddress(value) {
  return cleanString(value)
    .toLocaleLowerCase("cs")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function mercatorPoint(latitude, longitude) {
  const safeLatitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
  const sinLatitude = Math.sin(safeLatitude * Math.PI / 180);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)
  };
}

function mercatorCoordinate(point) {
  const longitude = point.x * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y))) * 180 / Math.PI;
  return { latitude, longitude };
}

function stopCoordinate(stop = {}) {
  const sourceSummary = stop?.sourceSummary && typeof stop.sourceSummary === "object"
    ? stop.sourceSummary
    : {};
  const latitude = coordinate(stop.latitude ?? sourceSummary.latitude, -90, 90);
  const longitude = coordinate(stop.longitude ?? sourceSummary.longitude, -180, 180);
  if (latitude !== null && longitude !== null) return { latitude, longitude };
  if (normalizedAddress(stop.addressText) === normalizedAddress(COLLECTION_DAILY_ROUTE_MAP_DEPOT.address)) {
    return {
      latitude: COLLECTION_DAILY_ROUTE_MAP_DEPOT.latitude,
      longitude: COLLECTION_DAILY_ROUTE_MAP_DEPOT.longitude
    };
  }
  return null;
}

export function collectionDailyRouteMapView(points = [], options = {}) {
  const width = Number(options.width) || COLLECTION_DAILY_ROUTE_MAP_WIDTH;
  const height = Number(options.height) || COLLECTION_DAILY_ROUTE_MAP_HEIGHT;
  const padding = Math.max(24, Number(options.padding) || 48);
  const minZoom = Math.max(1, Math.floor(Number(options.minZoom) || 8));
  const maxZoom = Math.max(minZoom, Math.floor(Number(options.maxZoom) || 17));
  const projected = points
    .map((point) => {
      const latitude = coordinate(point?.latitude, -90, 90);
      const longitude = coordinate(point?.longitude, -180, 180);
      return latitude === null || longitude === null ? null : mercatorPoint(latitude, longitude);
    })
    .filter(Boolean);
  if (!projected.length) return null;
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const rangeX = Math.max(0.00000001, maxX - minX);
  const rangeY = Math.max(0.00000001, maxY - minY);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const horizontalZoom = Math.log2(availableWidth / (rangeX * WEB_MERCATOR_TILE_SIZE));
  const verticalZoom = Math.log2(availableHeight / (rangeY * WEB_MERCATOR_TILE_SIZE));
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.floor(Math.min(horizontalZoom, verticalZoom))));
  const centerProjected = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const center = mercatorCoordinate(centerProjected);
  return {
    width,
    height,
    padding,
    zoom,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    centerProjected
  };
}

function positionedPoint(point, view) {
  const projected = mercatorPoint(point.latitude, point.longitude);
  const worldSize = WEB_MERCATOR_TILE_SIZE * (2 ** view.zoom);
  return {
    ...point,
    x: Math.round((view.width / 2 + (projected.x - view.centerProjected.x) * worldSize) * 10) / 10,
    y: Math.round((view.height / 2 + (projected.y - view.centerProjected.y) * worldSize) * 10) / 10
  };
}

function spreadCoincidentPoints(points = [], view = {}) {
  const groups = new Map();
  for (const point of points) {
    const key = `${point.x}:${point.y}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  const positioned = new Map();
  for (const group of groups.values()) {
    if (group.length === 1) {
      positioned.set(group[0].stopId, group[0]);
      continue;
    }
    group.forEach((point, index) => {
      const ring = Math.floor(index / 8);
      const ringStart = ring * 8;
      const ringSize = Math.min(8, group.length - ringStart);
      const ringIndex = index - ringStart;
      const radius = 13 + ring * 11;
      const angle = -Math.PI / 2 + ringIndex * (2 * Math.PI / ringSize);
      positioned.set(point.stopId, {
        ...point,
        x: Math.round(Math.max(16, Math.min(view.width - 16, point.x + Math.cos(angle) * radius)) * 10) / 10,
        y: Math.round(Math.max(18, Math.min(view.height - 18, point.y + Math.sin(angle) * radius)) * 10) / 10
      });
    });
  }
  return points.map((point) => positioned.get(point.stopId) || point);
}

function orderingEvidence(run = {}, explicitEvidence = null) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const evidence = explicitEvidence && typeof explicitEvidence === "object"
    ? explicitEvidence
    : metadata.routeOptimization && typeof metadata.routeOptimization === "object"
      ? metadata.routeOptimization
      : {};
  const provider = cleanString(evidence.provider);
  const runId = cleanString(evidence.runId);
  const hereApplied = provider === "here-tour-planning"
    && cleanString(evidence.status) === "completed"
    && evidence.appliedToRoute === true
    && Boolean(runId);
  return hereApplied
    ? {
        mode: "here-optimized",
        label: "Optimalizováno HERE",
        provider,
        optimizationRunId: runId,
        completedAt: cleanString(evidence.completedAt)
      }
    : {
        mode: "current-order",
        label: "Aktuální pořadí trasy",
        provider: "",
        optimizationRunId: "",
        completedAt: ""
      };
}

export function matchCollectionDailyRouteHereOptimization(run = {}, stops = [], candidates = []) {
  const sourceRowIds = (Array.isArray(stops) ? stops : [])
    .map((stop) => cleanString(stop?.sourceRowId))
    .filter(Boolean);
  if (!sourceRowIds.length || sourceRowIds.length !== stops.length) return null;
  const vehicleId = `kaiser_vehicle_${cleanString(run?.vehicleCode).toLowerCase()}`;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (cleanString(candidate?.status) !== "completed" || cleanString(candidate?.provider) !== "here-tour-planning") continue;
    const result = candidate?.result && typeof candidate.result === "object" ? candidate.result : {};
    const tours = Array.isArray(result.tours) ? result.tours : [];
    const vehicleTours = tours.filter((tour) => cleanString(tour?.vehicleId) === vehicleId);
    const eligibleTours = vehicleTours.length ? vehicleTours : tours.length === 1 ? tours : [];
    for (const tour of eligibleTours) {
      const optimizedIds = (Array.isArray(tour?.activities) ? tour.activities : [])
        .map((activity) => cleanString(activity?.sourceRowId))
        .filter(Boolean);
      if (optimizedIds.length !== sourceRowIds.length) continue;
      if (!optimizedIds.every((sourceRowId, index) => sourceRowId === sourceRowIds[index])) continue;
      return {
        provider: "here-tour-planning",
        status: "completed",
        runId: cleanString(candidate.id),
        appliedToRoute: true,
        completedAt: cleanString(candidate.completedAt),
        evidence: "exact-source-order-match"
      };
    }
  }
  return null;
}

export function buildCollectionDailyRouteDriverMap(run = {}, stops = [], options = {}) {
  const normalizedStops = Array.isArray(stops) ? stops : [];
  const currentStop = normalizedStops.find((stop) => cleanString(stop.status) === "planned")
    || (cleanString(run.scope) === "test"
      ? normalizedStops.find((stop) => cleanString(stop.status) === "problem")
      : null);
  const stopPoints = normalizedStops.map((stop) => {
    const location = stopCoordinate(stop);
    if (!location) return null;
    return {
      kind: "stop",
      stopId: cleanString(stop.id),
      routeOrder: Number(stop.routeOrder) || 0,
      status: cleanString(stop.status) || "planned",
      current: cleanString(stop.id) === cleanString(currentStop?.id),
      label: cleanString(stop.stationName || stop.customerName || stop.addressText) || "Stanoviště",
      address: cleanString(stop.addressText),
      ...location
    };
  }).filter(Boolean);
  const depot = {
    kind: "depot",
    ...COLLECTION_DAILY_ROUTE_MAP_DEPOT
  };
  const view = collectionDailyRouteMapView([depot, ...stopPoints]);
  if (!view) return null;
  const publicView = {
    width: view.width,
    height: view.height,
    padding: view.padding,
    zoom: view.zoom,
    centerLatitude: Math.round(view.centerLatitude * 1000000) / 1000000,
    centerLongitude: Math.round(view.centerLongitude * 1000000) / 1000000
  };
  const positionedStops = stopPoints.map((point) => positionedPoint(point, view));
  return {
    provider: "here-map-image",
    depot: positionedPoint(depot, view),
    points: spreadCoincidentPoints(positionedStops, view),
    mappedStopCount: stopPoints.length,
    totalStopCount: normalizedStops.length,
    ordering: orderingEvidence(run, options.routeOptimization),
    view: publicView
  };
}

export function buildCollectionDailyRouteHereMapImageUrl(env = {}, driverMap = {}) {
  const apiKey = cleanString(env.HERE_MAPS_API_KEY);
  if (!apiKey) throw new Error("here_map_key_missing");
  const view = driverMap?.view || {};
  const latitude = coordinate(view.centerLatitude, -90, 90);
  const longitude = coordinate(view.centerLongitude, -180, 180);
  const zoom = Math.floor(Number(view.zoom));
  if (latitude === null || longitude === null || !Number.isInteger(zoom) || zoom < 1 || zoom > 20) {
    throw new Error("here_map_view_missing");
  }
  const width = Math.floor(Number(view.width)) || COLLECTION_DAILY_ROUTE_MAP_WIDTH;
  const height = Math.floor(Number(view.height)) || COLLECTION_DAILY_ROUTE_MAP_HEIGHT;
  const url = new URL(
    `${HERE_MAP_IMAGE_BASE_URL}/base/mc/center:${latitude},${longitude};zoom=${zoom}/${width}x${height}/png`
  );
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("style", "logistics.day");
  url.searchParams.set("features", "pois:disabled");
  url.searchParams.set("scaleBar", "km");
  return url;
}
