import {
  applyCollectionDailyRouteHereOrder,
  COLLECTION_DAILY_ROUTE_SCOPE_TEST,
  CollectionDailyRoutesError,
  getCollectionDailyRoute
} from "./collection-daily-routes-store.js";
import { COLLECTION_DAILY_ROUTE_MAP_DEPOT } from "./collection-daily-route-map.js";
import {
  appendHereWaypointSequenceTruckProfile,
  loadCollectionRouteVehicleProfile
} from "./collection-route-vehicle-profiles.js";

const HERE_WAYPOINT_SEQUENCE_URL = "https://wps.hereapi.com/v8/findsequence2";
const CONFIRMATION = "optimize-own-test-route-here";
const MAX_OPTIMIZED_STOPS = 200;

export class CollectionDailyRouteHereSequenceError extends Error {
  constructor(message, status = 400, code = "collection_daily_route_here_sequence_error") {
    super(message);
    this.name = "CollectionDailyRouteHereSequenceError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function coordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function stopServiceSeconds(stop = {}) {
  const volume = Math.max(0, Number(stop.containerVolume) || 0);
  const count = Math.max(1, Number(stop.containerCount) || 1);
  return Math.round((volume >= 1100 ? 300 : 180) * count);
}

function mappedStops(detail = {}) {
  const byStopId = new Map((Array.isArray(detail?.driverMap?.points) ? detail.driverMap.points : [])
    .map((point) => [cleanString(point?.stopId), point]));
  return (Array.isArray(detail?.stops) ? detail.stops : []).map((stop) => {
    const point = byStopId.get(cleanString(stop.id)) || {};
    return {
      ...stop,
      latitude: coordinate(point.latitude, -90, 90),
      longitude: coordinate(point.longitude, -180, 180)
    };
  });
}

function sequenceReadiness(detail = {}, profile = null) {
  const stops = mappedStops(detail);
  const planned = stops.filter((stop) => cleanString(stop.status) === "planned");
  const missingCoordinates = planned.filter((stop) => stop.latitude === null || stop.longitude === null);
  const blockers = [];
  if (detail?.run?.scope !== COLLECTION_DAILY_ROUTE_SCOPE_TEST) blockers.push("HERE pořadí lze tímto krokem změnit jen v odděleném TEST scope.");
  if (!["confirmed", "active"].includes(cleanString(detail?.run?.status))) blockers.push("TEST trasa musí být připravená nebo zahájená.");
  if (planned.length < 2) blockers.push("Pro optimalizaci musí zbývat alespoň dvě čekající stanoviště.");
  if (planned.length > MAX_OPTIMIZED_STOPS) blockers.push(`HERE pořadí podporuje nejvýše ${MAX_OPTIMIZED_STOPS} čekajících stanovišť při návratu do depa.`);
  if (missingCoordinates.length) blockers.push(`${missingCoordinates.length} čekajících stanovišť nemá použitelné souřadnice.`);
  if (!profile) blockers.push("Pro přidělený vůz chybí potvrzené rozměry a hmotnosti.");
  return {
    ready: blockers.length === 0,
    blockers,
    planned,
    historical: stops.filter((stop) => cleanString(stop.status) !== "planned"),
    profile,
    totalStopCount: stops.length,
    plannedStopCount: planned.length,
    historicalStopCount: stops.length - planned.length,
    provider: "here-waypoints-sequence-v8",
    objective: "time",
    trafficMode: "live",
    writesVistos: false,
    writesProductionRoute: false,
    sendsNotifications: false
  };
}

function publicReadiness(readiness = {}) {
  const { planned, historical, ...result } = readiness;
  return result;
}

function throwHereSequenceStageError(error, stage, message, code) {
  if (error instanceof CollectionDailyRouteHereSequenceError || error instanceof CollectionDailyRoutesError) {
    throw error;
  }
  console.error("collection_daily_route_here_sequence.stage_failed", {
    stage,
    message: cleanString(error?.message)
  });
  throw new CollectionDailyRouteHereSequenceError(message, 500, code);
}

function startPoint(readiness = {}, detail = {}) {
  const historical = [...(readiness.historical || [])].sort((left, right) => Number(left.routeOrder) - Number(right.routeOrder));
  const last = historical[historical.length - 1];
  if (last && last.latitude !== null && last.longitude !== null) {
    return { id: "route-history", latitude: last.latitude, longitude: last.longitude };
  }
  const depot = detail?.driverMap?.depot || COLLECTION_DAILY_ROUTE_MAP_DEPOT;
  return { id: "depot", latitude: Number(depot.latitude), longitude: Number(depot.longitude) };
}

export function buildCollectionDailyRouteHereSequenceRequest(readiness = {}, detail = {}, apiKey = "") {
  if (!readiness.ready) {
    throw new CollectionDailyRouteHereSequenceError(
      readiness.blockers?.[0] || "HERE pořadí teď nelze vypočítat.",
      409,
      "collection_daily_route_here_sequence_not_ready"
    );
  }
  const start = startPoint(readiness, detail);
  const depot = detail?.driverMap?.depot || COLLECTION_DAILY_ROUTE_MAP_DEPOT;
  const params = new URLSearchParams();
  params.set("start", `start;${start.latitude},${start.longitude}`);
  params.set("end", `depot;${depot.latitude},${depot.longitude}`);
  params.set("mode", "fastest;truck;traffic:enabled");
  params.set("departure", "now");
  params.set("improveFor", "time");
  params.set("requestId", randomId("kaiser-test-route"));
  appendHereWaypointSequenceTruckProfile(params, readiness.profile);
  const waypointToStopId = {};
  readiness.planned.forEach((stop, index) => {
    const waypointId = `stop_${index + 1}`;
    waypointToStopId[waypointId] = stop.id;
    params.set(
      `destination${index + 1}`,
      `${waypointId};${stop.latitude},${stop.longitude};st:${stopServiceSeconds(stop)},interruptible:false`
    );
  });
  const url = new URL(HERE_WAYPOINT_SEQUENCE_URL);
  url.searchParams.set("apiKey", cleanString(apiKey));
  return { url: url.toString(), body: params, waypointToStopId, requestId: params.get("requestId") };
}

function optimizedStopIds(payload = {}, waypointToStopId = {}) {
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  const waypoints = Array.isArray(result?.waypoints) ? result.waypoints : [];
  return waypoints
    .filter((waypoint) => waypointToStopId[cleanString(waypoint?.id)])
    .sort((left, right) => Number(left?.sequence) - Number(right?.sequence))
    .map((waypoint) => waypointToStopId[cleanString(waypoint.id)]);
}

export async function getCollectionDailyRouteHereSequenceReadiness(env, user, runId) {
  const detail = await getCollectionDailyRoute(env, user, runId, { scope: COLLECTION_DAILY_ROUTE_SCOPE_TEST });
  const profile = await loadCollectionRouteVehicleProfile(env, detail.run);
  return { detail, readiness: sequenceReadiness(detail, profile) };
}

export async function optimizeCollectionDailyRouteHereSequence(env, user, runId, input = {}, options = {}) {
  if (cleanString(input.confirmation) !== CONFIRMATION) {
    throw new CollectionDailyRouteHereSequenceError(
      "HERE přepočet nebyl výslovně potvrzen.",
      409,
      "collection_daily_route_here_sequence_confirmation_required"
    );
  }
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new CollectionDailyRouteHereSequenceError(
      "Chybí ochrana proti dvojímu spuštění HERE přepočtu.",
      400,
      "collection_daily_route_here_sequence_idempotency_missing"
    );
  }
  const apiKey = cleanString(env.HERE_MAPS_API_KEY);
  if (!apiKey) {
    throw new CollectionDailyRouteHereSequenceError(
      "HERE optimalizace není na serveru nastavená.",
      503,
      "collection_daily_route_here_sequence_key_missing"
    );
  }
  let detail;
  let readiness;
  try {
    ({ detail, readiness } = await getCollectionDailyRouteHereSequenceReadiness(env, user, runId));
  } catch (error) {
    throwHereSequenceStageError(
      error,
      "route-readiness",
      "Nepodařilo se načíst přidělenou TEST trasu a potvrzený profil vozu.",
      "collection_daily_route_here_sequence_readiness_failed"
    );
  }
  let request;
  try {
    request = buildCollectionDailyRouteHereSequenceRequest(readiness, detail, apiKey);
  } catch (error) {
    throwHereSequenceStageError(
      error,
      "request-build",
      "Nepodařilo se připravit bezpečný HERE výpočet.",
      "collection_daily_route_here_sequence_request_failed"
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: request.body.toString()
    });
  } catch {
    throw new CollectionDailyRouteHereSequenceError(
      "HERE optimalizaci se teď nepodařilo odeslat.",
      502,
      "collection_daily_route_here_sequence_unreachable"
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CollectionDailyRouteHereSequenceError(
      cleanString(payload?.errors?.[0]?.message || payload?.message) || "HERE optimalizaci odmítl.",
      502,
      "collection_daily_route_here_sequence_provider_failed"
    );
  }
  const stopIds = optimizedStopIds(payload, request.waypointToStopId);
  if (stopIds.length !== readiness.plannedStopCount || new Set(stopIds).size !== stopIds.length) {
    throw new CollectionDailyRouteHereSequenceError(
      "HERE nevrátil úplné a jednoznačné pořadí všech čekajících stanovišť.",
      502,
      "collection_daily_route_here_sequence_incomplete"
    );
  }
  const completedAt = new Date().toISOString();
  let optimizedDetail;
  try {
    optimizedDetail = await applyCollectionDailyRouteHereOrder(env, user, runId, {
      scope: COLLECTION_DAILY_ROUTE_SCOPE_TEST,
      idempotencyKey,
      optimizedStopIds: stopIds,
      provider: "here-waypoints-sequence-v8",
      optimizationRunId: request.requestId,
      completedAt,
      trafficMode: "live",
      objective: "time",
      vehicleProfile: readiness.profile
    });
  } catch (error) {
    throwHereSequenceStageError(
      error,
      "route-save",
      "HERE pořadí bylo vypočtené, ale nepodařilo se ho bezpečně uložit do TEST trasy.",
      "collection_daily_route_here_sequence_save_failed"
    );
  }
  return {
    detail: optimizedDetail,
    optimization: optimizedDetail?.run?.metadata?.routeOptimization || {},
    readiness: publicReadiness(readiness),
    apiStatus: "ready"
  };
}

export const COLLECTION_DAILY_ROUTE_HERE_SEQUENCE_CONFIRMATION = CONFIRMATION;

export const __test = {
  HERE_WAYPOINT_SEQUENCE_URL,
  MAX_OPTIMIZED_STOPS,
  mappedStops,
  optimizedStopIds,
  sequenceReadiness,
  startPoint
};
