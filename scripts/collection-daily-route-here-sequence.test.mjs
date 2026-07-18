import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  buildCollectionDailyRouteHereSequenceRequest,
  optimizeCollectionDailyRouteHereSequence,
  __test as sequenceTest
} from "../functions/_lib/collection-daily-route-here-sequence.js";
import {
  buildCollectionDailyRouteOverviewGeometry,
  buildCollectionDailyRouteLegNavigation
} from "../functions/_lib/collection-daily-route-navigation.js";
import {
  appendHereRoutingTruckProfile,
  appendHereWaypointSequenceTruckProfile,
  confirmedCollectionRouteVehicleProfile,
  CONFIRMED_COLLECTION_ROUTE_VEHICLE_PROFILES,
  loadCollectionRouteVehicleProfile
} from "../functions/_lib/collection-route-vehicle-profiles.js";
import { getCollectionDailyRoute } from "../functions/_lib/collection-daily-routes-store.js";
import { collectionDailyRouteHereSequenceErrorResponse } from "../functions/api/collection-routes/daily-routes/[runId]/here-sequence.js";

class D1Statement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    assert.ok(values.length <= 100, `D1 statement překročil 100 parametrů: ${values.length}`);
    return new D1Statement(this.owner, this.sql, values);
  }

  async all() {
    return { results: this.owner.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.owner.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.owner.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function encodeUnsigned(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let current = value;
  let result = "";
  while (current >= 0x20) {
    result += alphabet[(current & 0x1f) | 0x20];
    current = Math.floor(current / 32);
  }
  return result + alphabet[current];
}

function encodeSigned(value) {
  return encodeUnsigned(value < 0 ? (-value * 2) - 1 : value * 2);
}

function flexiblePolyline(points) {
  let result = encodeUnsigned(1) + encodeUnsigned(5);
  let previousLatitude = 0;
  let previousLongitude = 0;
  for (const point of points) {
    const latitude = Math.round(point.latitude * 100000);
    const longitude = Math.round(point.longitude * 100000);
    result += encodeSigned(latitude - previousLatitude) + encodeSigned(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return result;
}

assert.deepEqual(
  CONFIRMED_COLLECTION_ROUTE_VEHICLE_PROFILES.map((profile) => [
    profile.vehicleCode,
    profile.registration,
    profile.emptyWeightKg,
    profile.grossWeightKg,
    profile.payloadCapacityKg,
    profile.lengthCm,
    profile.widthCm,
    profile.heightCm
  ]),
  [
    ["A", "3BN 3558", 13500, 19000, 5500, 850, 240, 350],
    ["B", "1BP 8373", 13200, 19000, 5800, 850, 240, 350],
    ["C", "3BE 2831", 15400, 25000, 9600, 940, 240, 350]
  ]
);
const vehicleA = confirmedCollectionRouteVehicleProfile({ vehicleCode: "A" });
assert.equal(vehicleA.currentWeightKg, 19000);
assert.equal(vehicleA.weightPerAxleKg, null);
const routingParams = new URLSearchParams();
assert.equal(appendHereRoutingTruckProfile(routingParams, vehicleA), true);
assert.equal(routingParams.get("vehicle[height]"), "350");
assert.equal(routingParams.get("vehicle[currentWeight]"), "19000");
assert.equal(routingParams.has("vehicle[weightPerAxle]"), false);
const sequenceParams = new URLSearchParams();
assert.equal(appendHereWaypointSequenceTruckProfile(sequenceParams, vehicleA), true);
assert.equal(sequenceParams.get("height"), "350cm");
assert.equal(sequenceParams.get("limitedWeight"), "19000kg");
assert.equal(sequenceParams.has("weightPerAxle"), false);
const serializedRuntimeError = collectionDailyRouteHereSequenceErrorResponse({
  message: "HERE výpočet byl bezpečně odmítnut.",
  status: 409,
  code: "collection_daily_route_here_sequence_runtime_test"
});
assert.equal(serializedRuntimeError.status, 409);
assert.equal((await serializedRuntimeError.json()).code, "collection_daily_route_here_sequence_runtime_test");
const cloudFailureFallback = await loadCollectionRouteVehicleProfile({
  SMART_ODPADY_DB: {
    prepare() {
      throw new Error("D1 profilová tabulka je dočasně nedostupná");
    }
  }
}, { vehicleCode: "A", vehicleRegistration: "3BN 3558" });
assert.equal(cloudFailureFallback.registration, "3BN 3558");
assert.equal(cloudFailureFallback.currentWeightKg, 19000);

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql",
  "../migrations/test/0001_create_collection_routes_test_control.sql",
  "../migrations/test/0002_create_collection_route_here_optimization.sql"
]) {
  sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}

const runId = "test-route-here-sequence";
sqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count, metadata_json
  ) VALUES ('batch-test', 'synthetic-test', 'synthetic-brno-test', 'preview', 'ready', 'HERE TEST', 5, 0, '{}')
`).run();
sqlite.prepare(`
  INSERT INTO collection_daily_route_runs (
    id, route_key, source_batch_id, source_mode, route_date, route_day_code, route_week_mode,
    vehicle_code, vehicle_registration, vehicle_label, driver_user_id, driver_name,
    title, status, stop_count, excluded_count, metadata_json, created_by_user_id, created_by_name
  ) VALUES (?, ?, 'batch-test', 'synthetic-brno-test', '2026-07-13', 'PO', 'lichý týden',
    'A', '3BN 3558', 'Vůz A · 3BN 3558', 'driver-miroslav', 'Miroslav Vašek',
    'Izolovaný HERE TEST', 'active', 5, 0, ?, 'manager', 'Management')
`).run(runId, `${runId}|A`, JSON.stringify({
  dataScope: "test",
  externalEffectsDisabled: true,
  notificationsDisabled: true,
  vistosWritesDisabled: true,
  productionRouteWritesDisabled: true
}));

const stopRows = [
  ["done-1", 1, "done", 49.19, 16.61],
  ["problem-2", 2, "problem", 49.20, 16.62],
  ["planned-3", 3, "planned", 49.21, 16.63],
  ["planned-4", 4, "planned", 49.22, 16.64],
  ["planned-5", 5, "planned", 49.23, 16.65]
];
for (const [id, order, status, latitude, longitude] of stopRows) {
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json
    ) VALUES (?, 'batch-test', ?, 'synthetic-test', ?, 'preview', ?, '[]')
  `).run(`source-${id}`, order, `source-${id}`, JSON.stringify({ latitude, longitude, status }));
}
for (const [id, order, status, latitude, longitude] of stopRows) {
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, station_name, waste_type, waste_code,
      container_volume, container_count, container_type, frequency, pickup_days_text,
      contract_number, source_contract_id, note, status, source_summary_json
    ) VALUES (?, ?, '2026-07-13', 'batch-test', ?, ?, ?, ?, ?, 'SKO', '200301',
      240, 1, 'nádoba', '1x7', 'pondělí lichá, pondělí sudá', ?, ?, '', ?, ?)
  `).run(
    id, runId, `source-${id}`, order, `Firma ${id}`, `Adresa ${id}, Brno`, `Stanoviště ${id}`,
    `contract-${id}`, `source-contract-${id}`, status, JSON.stringify({ latitude, longitude })
  );
}

const driver = { id: "driver-miroslav", name: "Miroslav Vašek", role: "ridic", status: "active", active: true };
const otherDriver = { id: "driver-other", name: "Cizí řidič", role: "ridic", status: "active", active: true };
const env = {
  COLLECTION_ROUTES_TEST_DB: new D1Database(sqlite),
  HERE_MAPS_API_KEY: "server-only-here-key"
};

const initialDetail = await getCollectionDailyRoute(env, driver, runId, { scope: "test" });
const readiness = sequenceTest.sequenceReadiness(initialDetail, vehicleA);
assert.equal(readiness.ready, true, readiness.blockers.join("\n"));
assert.equal(readiness.plannedStopCount, 3);
assert.equal(readiness.historicalStopCount, 2);
const builtRequest = buildCollectionDailyRouteHereSequenceRequest(readiness, initialDetail, env.HERE_MAPS_API_KEY);
assert.equal(new URL(builtRequest.url).origin, "https://wps.hereapi.com");
assert.equal(new URL(builtRequest.url).searchParams.get("apiKey"), env.HERE_MAPS_API_KEY);
assert.equal(builtRequest.body.get("mode"), "fastest;truck;traffic:enabled");
assert.equal(builtRequest.body.get("departure"), "now");
assert.equal(builtRequest.body.get("height"), "350cm");
assert.equal([...builtRequest.body.keys()].filter((key) => key.startsWith("destination")).length, 3);

let providerCalls = 0;
const sequenceFetch = async (url, options = {}) => {
  providerCalls += 1;
  assert.equal(new URL(url).origin, "https://wps.hereapi.com");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(options.body);
  assert.equal(body.get("limitedWeight"), "19000kg");
  return new Response(JSON.stringify({
    results: [{
      waypoints: [
        { id: "start", sequence: 0 },
        { id: "stop_3", sequence: 1 },
        { id: "stop_1", sequence: 2 },
        { id: "stop_2", sequence: 3 },
        { id: "depot", sequence: 4 }
      ]
    }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

await assert.rejects(
  optimizeCollectionDailyRouteHereSequence(env, otherDriver, runId, {
    confirmation: "optimize-own-test-route-here",
    idempotencyKey: "here-other-driver"
  }, { fetchImpl: sequenceFetch }),
  (error) => error.status === 404 || error.status === 403
);
assert.equal(providerCalls, 0, "Cizí řidič nesmí získat data ani spustit HERE volání.");

const optimized = await optimizeCollectionDailyRouteHereSequence(env, driver, runId, {
  confirmation: "optimize-own-test-route-here",
  idempotencyKey: "here-own-driver"
}, { fetchImpl: sequenceFetch });
assert.equal(providerCalls, 1);
assert.equal(optimized.detail.driverMap.ordering.mode, "here-optimized");
assert.deepEqual(optimized.detail.stops.map((stop) => [stop.id, stop.status]), [
  ["done-1", "done"],
  ["problem-2", "problem"],
  ["planned-5", "planned"],
  ["planned-3", "planned"],
  ["planned-4", "planned"]
]);
assert.equal(optimized.optimization.writesVistos, false);
assert.equal(optimized.optimization.writesProductionRoute, false);
assert.equal(optimized.optimization.sendsNotifications, false);
const audit = sqlite.prepare("SELECT actor_user_id, actor_name, payload_json FROM collection_daily_route_events WHERE event_type = 'route_here_optimized'").get();
assert.equal(audit.actor_user_id, driver.id);
assert.equal(audit.actor_name, driver.name);
assert.equal(JSON.parse(audit.payload_json).vehicleProfile.registration, "3BN 3558");

const routePolyline = flexiblePolyline([
  { latitude: 49.19, longitude: 16.61 },
  { latitude: 49.20, longitude: 16.62 }
]);
let routingCalls = 0;
const routingFetch = async (url) => {
  routingCalls += 1;
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("transportMode"), "truck");
  assert.equal(parsed.searchParams.get("vehicle[height]"), "350");
  assert.equal(parsed.searchParams.get("vehicle[grossWeight]"), "19000");
  assert.equal(parsed.searchParams.get("vehicle[currentWeight]"), "19000");
  assert.equal(parsed.searchParams.has("vehicle[weightPerAxle]"), false);
  return new Response(JSON.stringify({
    routes: [{ sections: [{ polyline: routePolyline, summary: { length: 1000, duration: 120 } }] }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const geometry = await buildCollectionDailyRouteOverviewGeometry(env, optimized.detail, { fetchImpl: routingFetch });
assert.equal(routingCalls, 1);
assert.equal(geometry.vehicleProfile.registration, "3BN 3558");
assert.equal(geometry.writesRoute, false);
assert.ok(geometry.points.length >= 2);

const leg = await buildCollectionDailyRouteLegNavigation(env, optimized.detail, {
  fromPointId: "depot",
  toPointId: "planned-5"
}, { fetchImpl: routingFetch });
assert.equal(leg.vehicleProfile.registration, "3BN 3558");
assert.equal(leg.mode, "truck");

const migrationSource = readFileSync(new URL("../migrations/0044_create_fleet_vehicle_technical_profiles.sql", import.meta.url), "utf8");
for (const value of ["3BN 3558", "1BP 8373", "3BE 2831", "13500", "25000", "940", "240", "350"]) {
  assert.ok(migrationSource.includes(value), `Migrace musí uchovat potvrzenou hodnotu ${value}.`);
}
const profileMigrationDb = new DatabaseSync(":memory:");
profileMigrationDb.exec(migrationSource);
assert.deepEqual(
  profileMigrationDb.prepare(`
    SELECT vehicle_code, gross_weight_kg, length_cm, width_cm, height_cm, weight_per_axle_kg
    FROM fleet_vehicle_technical_profiles
    ORDER BY vehicle_code
  `).all().map((row) => ({ ...row })),
  [
    { vehicle_code: "A", gross_weight_kg: 19000, length_cm: 850, width_cm: 240, height_cm: 350, weight_per_axle_kg: null },
    { vehicle_code: "B", gross_weight_kg: 19000, length_cm: 850, width_cm: 240, height_cm: 350, weight_per_axle_kg: null },
    { vehicle_code: "C", gross_weight_kg: 25000, length_cm: 940, width_cm: 240, height_cm: 350, weight_per_axle_kg: null }
  ]
);

const testSettingsMigrationDb = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql",
  "../migrations/test/0001_create_collection_routes_test_control.sql",
  "../migrations/test/0002_create_collection_route_here_optimization.sql",
  "../migrations/test/0003_configure_collection_route_test_operations_and_gps.sql",
  "../migrations/test/0008_use_confirmed_collection_route_vehicle_profiles.sql"
]) {
  testSettingsMigrationDb.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}
const testSettings = JSON.parse(testSettingsMigrationDb.prepare("SELECT config_json FROM collection_route_here_settings WHERE scope = 'test'").get().config_json);
assert.equal(testSettings.vehicles[0].truck.grossWeightKg, 19000);
assert.equal(testSettings.vehicles[0].truck.currentWeightKg, 19000);
assert.equal(testSettings.vehicles[0].truck.weightPerAxleKg, null);
assert.equal(testSettings.vehicles[2].truck.lengthCm, 940);
assert.equal(testSettings.vehicles[2].technicalDataQuality, "owner-confirmed");

console.log("Collection daily route HERE sequence tests passed.");
