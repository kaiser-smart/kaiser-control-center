import assert from "node:assert/strict";

import {
  buildCollectionDailyRouteDriverMap,
  buildCollectionDailyRouteHereMapImageUrl,
  COLLECTION_DAILY_ROUTE_MAP_DEPOT,
  matchCollectionDailyRouteHereOptimization
} from "../functions/_lib/collection-daily-route-map.js";

function stop(index, overrides = {}) {
  const column = index % 18;
  const row = Math.floor(index / 18);
  return {
    id: `stop-${index + 1}`,
    routeOrder: index + 1,
    status: "planned",
    customerName: `TEST stanoviště ${index + 1}`,
    stationName: `Bod ${index + 1}`,
    addressText: `TEST ${index + 1}, Brno`,
    sourceSummary: {
      latitude: 49.14 + row * 0.006,
      longitude: 16.55 + column * 0.012
    },
    ...overrides
  };
}

const stops = Array.from({ length: 198 }, (_, index) => stop(index));
stops[0].status = "done";
stops[1].status = "problem";
const currentMap = buildCollectionDailyRouteDriverMap({
  id: "route-current",
  scope: "test",
  metadata: {}
}, stops);

assert.equal(currentMap.totalStopCount, 198);
assert.equal(currentMap.mappedStopCount, 198);
assert.equal(currentMap.points.length, 198);
assert.equal(currentMap.points.find((point) => point.current)?.stopId, "stop-3");
assert.equal(currentMap.ordering.mode, "current-order");
assert.equal(currentMap.ordering.label, "Aktuální pořadí trasy");
assert.equal(currentMap.depot.address, COLLECTION_DAILY_ROUTE_MAP_DEPOT.address);
assert.ok(currentMap.points.every((point) => point.x >= 0 && point.x <= currentMap.view.width));
assert.ok(currentMap.points.every((point) => point.y >= 0 && point.y <= currentMap.view.height));

const optimizedMap = buildCollectionDailyRouteDriverMap({
  id: "route-optimized",
  scope: "test",
  metadata: {
    routeOptimization: {
      provider: "here-tour-planning",
      status: "completed",
      runId: "here-run-completed",
      appliedToRoute: true,
      completedAt: "2026-07-17T08:00:00.000Z"
    }
  }
}, stops);
assert.equal(optimizedMap.ordering.mode, "here-optimized");
assert.equal(optimizedMap.ordering.label, "Optimalizováno HERE");
assert.equal(optimizedMap.ordering.optimizationRunId, "here-run-completed");

const sequenceOptimizedMap = buildCollectionDailyRouteDriverMap({
  id: "route-sequence-optimized",
  scope: "test",
  metadata: {
    routeOptimization: {
      provider: "here-waypoints-sequence-v8",
      status: "completed",
      runId: "here-sequence-completed",
      appliedToRoute: true
    }
  }
}, stops);
assert.equal(sequenceOptimizedMap.ordering.mode, "here-optimized");
assert.equal(sequenceOptimizedMap.ordering.optimizationRunId, "here-sequence-completed");

const unlinkedResultMap = buildCollectionDailyRouteDriverMap({
  scope: "test",
  metadata: {
    routeOptimization: {
      provider: "here-tour-planning",
      status: "completed",
      runId: "here-run-not-applied",
      appliedToRoute: false
    }
  }
}, stops);
assert.equal(
  unlinkedResultMap.ordering.mode,
  "current-order",
  "Samotný dokončený HERE výpočet se nesmí vydávat za pořadí použité na trase."
);

const matchedEvidence = matchCollectionDailyRouteHereOptimization(
  { vehicleCode: "A" },
  stops.slice(0, 3).map((item, index) => ({ ...item, sourceRowId: `source-${index + 1}` })),
  [{
    id: "here-run-matched",
    status: "completed",
    provider: "here-tour-planning",
    completedAt: "2026-07-17T08:00:00.000Z",
    result: {
      tours: [{
        vehicleId: "kaiser_vehicle_a",
        activities: ["source-1", "source-2", "source-3"].map((sourceRowId) => ({ sourceRowId }))
      }]
    }
  }]
);
assert.equal(matchedEvidence.runId, "here-run-matched");
assert.equal(matchedEvidence.evidence, "exact-source-order-match");
assert.equal(matchCollectionDailyRouteHereOptimization(
  { vehicleCode: "A" },
  stops.slice(0, 3).map((item, index) => ({ ...item, sourceRowId: `source-${index + 1}` })),
  [{
    id: "here-run-wrong-order",
    status: "completed",
    provider: "here-tour-planning",
    result: {
      tours: [{
        vehicleId: "kaiser_vehicle_a",
        activities: ["source-2", "source-1", "source-3"].map((sourceRowId) => ({ sourceRowId }))
      }]
    }
  }]
), null, "Jiné pořadí HERE se nesmí označit jako pořadí použité na trase.");

const depotFallbackMap = buildCollectionDailyRouteDriverMap({ scope: "test" }, [{
  id: "stop-depot",
  routeOrder: 1,
  status: "planned",
  addressText: "Trnkova 3052/137, 628 00 Brno"
}]);
assert.equal(depotFallbackMap.mappedStopCount, 1);
assert.equal(depotFallbackMap.points[0].latitude, COLLECTION_DAILY_ROUTE_MAP_DEPOT.latitude);
assert.equal(depotFallbackMap.points[0].longitude, COLLECTION_DAILY_ROUTE_MAP_DEPOT.longitude);

const coincidentMap = buildCollectionDailyRouteDriverMap({ scope: "production" }, [
  stop(0, { id: "same-place-done", status: "done" }),
  stop(1, {
    id: "same-place-current",
    sourceSummary: { ...stop(0).sourceSummary }
  })
]);
assert.notDeepEqual(
  [coincidentMap.points[0].x, coincidentMap.points[0].y],
  [coincidentMap.points[1].x, coincidentMap.points[1].y],
  "Piny na stejné adrese se musí mírně rozestoupit, aby zelený výsledek nezakryl aktuální bod."
);
assert.ok(coincidentMap.points.every((point) => point.x >= 16 && point.x <= coincidentMap.view.width - 16));
assert.ok(coincidentMap.points.every((point) => point.y >= 18 && point.y <= coincidentMap.view.height - 18));

assert.throws(
  () => buildCollectionDailyRouteHereMapImageUrl({}, currentMap),
  /here_map_key_missing/
);
const hereUrl = buildCollectionDailyRouteHereMapImageUrl({ HERE_MAPS_API_KEY: "server-only-test-key" }, currentMap);
assert.equal(hereUrl.origin, "https://image.maps.hereapi.com");
assert.equal(hereUrl.searchParams.get("apiKey"), "server-only-test-key");
assert.equal(hereUrl.searchParams.get("style"), "logistics.day");
assert.match(decodeURIComponent(hereUrl.pathname), /center:[^/]+;zoom=\d+\/960x420\/png/);
assert.equal(hereUrl.searchParams.getAll("overlay").length, 0, "198 stavových pinů kreslí aplikace, ne dlouhá HERE URL.");

console.log("Collection daily route map tests passed.");
