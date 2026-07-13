import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { ensureCollectionRoutesTestDataset } from "../functions/_lib/collection-routes-test-store.js";
import {
  buildCollectionRouteHereProblem,
  getCollectionRouteHereReadiness,
  getCollectionRouteHereRun,
  startCollectionRouteHereRun
} from "../functions/_lib/collection-route-here-optimization.js";
import { buildHereOAuthTokenRequest, hereOAuthConfiguration } from "../functions/_lib/here-oauth.js";

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

function openDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql",
    "../migrations/test/0002_create_collection_route_here_optimization.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

const manager = {
  id: "manager-here-test",
  name: "Management HERE Test",
  email: "here-manager@example.invalid",
  role: "management",
  status: "active",
  active: true
};

function vehicle(code, registration, capacitiesTons) {
  return {
    code,
    registration,
    capacitiesTons,
    truck: {
      heightCm: 360,
      widthCm: 255,
      lengthCm: 950,
      grossWeightKg: 18000,
      currentWeightKg: 12000,
      weightPerAxleKg: 7000
    }
  };
}

function readyConfig() {
  return {
    timezone: "Europe/Prague",
    trafficMode: "liveOrHistorical",
    depot: {
      name: "TEST depo",
      latitude: 49.19121,
      longitude: 16.67013
    },
    shift: { start: "06:00", end: "16:00" },
    requiredVehicleCodes: ["A", "B", "C"],
    vehicles: [
      vehicle("A", "3BN 3558", { SKO: 6, PAPIR: 2, PLAST: 1 }),
      vehicle("B", "1BP 8373", { SKO: 6, PAPIR: 2, PLAST: 1 }),
      vehicle("C", "3BE 2831", { SKO: 8, PAPIR: 2.5, PLAST: 1 })
    ],
    dumpSites: [{
      id: "sako-test",
      wasteTypes: ["SKO"],
      latitude: 49.1885,
      longitude: 16.6848,
      serviceMinutes: 12
    }]
  };
}

const { sqlite, d1 } = openDatabase();
const env = {
  COLLECTION_ROUTES_TEST_DB: d1,
  COLLECTION_ROUTES_TEST_SMS_TO: "+420600000000",
  COLLECTION_ROUTES_TEST_EMAIL_TO: "here-route@example.invalid"
};

await ensureCollectionRoutesTestDataset(env, manager, { confirmation: "create-test-brno-500" });

const blocked = await getCollectionRouteHereReadiness(env, manager, {
  routeDate: "2026-07-13",
  wasteType: "SKO"
});
assert.equal(blocked.ready, false);
assert.ok(blocked.blockers.some((item) => item.includes("TEST D1")));
assert.ok(blocked.blockers.some((item) => item.includes("serverové HERE OAuth")));
assert.equal(blocked.writesOperationalRoute, false);
assert.equal(blocked.sendsNotifications, false);

sqlite.prepare(`
  UPDATE collection_route_here_settings
  SET status = 'ready', config_json = ?, updated_at = '2026-07-13T08:00:00.000Z'
  WHERE scope = 'test'
`).run(JSON.stringify(readyConfig()));
env.HERE_ACCESS_KEY_ID = "here-access-key-id-test";
env.HERE_ACCESS_KEY_SECRET = "here-access-key-secret-test";

assert.deepEqual(hereOAuthConfiguration(env).missing, []);
const tokenRequest = await buildHereOAuthTokenRequest(env, {
  nowMs: Date.parse("2026-07-13T08:00:00.000Z"),
  nonce: "fixed-nonce"
});
assert.equal(tokenRequest.url, "https://account.api.here.com/oauth2/token");
assert.match(tokenRequest.headers.Authorization, /HMAC-SHA256/);
assert.match(tokenRequest.headers.Authorization, /fixed-nonce/);
assert.doesNotMatch(tokenRequest.headers.Authorization, /here-access-key-secret-test/);
await assert.rejects(
  buildHereOAuthTokenRequest({
    ...env,
    HERE_TOKEN_ENDPOINT_URL: "https://example.invalid/oauth2/token"
  }),
  (error) => error?.code === "here_oauth_not_configured"
);

const readiness = await getCollectionRouteHereReadiness(env, manager, {
  routeDate: "2026-07-13",
  wasteType: "SKO"
});
assert.equal(readiness.ready, true, readiness.blockers.join("\n"));
assert.ok(readiness.eligibleCount > 0);
assert.ok(readiness.eligibleCount < 501);
assert.deepEqual(readiness.availableWasteTypes.sort(), ["BIO", "PAPIR", "PLAST", "SKLO", "SKO"].sort());

const coordinateRow = sqlite.prepare("SELECT summary_json FROM collection_import_rows WHERE id = ?")
  .get(readiness._stops[0].sourceRowId);
const coordinateSummary = JSON.parse(coordinateRow.summary_json);
sqlite.prepare("UPDATE collection_import_rows SET summary_json = ? WHERE id = ?")
  .run(JSON.stringify({ ...coordinateSummary, latitude: null, longitude: null }), readiness._stops[0].sourceRowId);
const missingCoordinateReadiness = await getCollectionRouteHereReadiness(env, manager, {
  routeDate: "2026-07-13",
  wasteType: "SKO"
});
assert.equal(missingCoordinateReadiness.ready, false);
assert.ok(missingCoordinateReadiness.blockers.some((item) => item.includes("souřadnice")));
sqlite.prepare("UPDATE collection_import_rows SET summary_json = ? WHERE id = ?")
  .run(coordinateRow.summary_json, readiness._stops[0].sourceRowId);

env.HERE_TOUR_PLANNING_BASE_URL = "https://example.invalid/v3";
const invalidBaseReadiness = await getCollectionRouteHereReadiness(env, manager, {
  routeDate: readiness.routeDate,
  wasteType: "SKO"
});
assert.equal(invalidBaseReadiness.ready, false);
assert.ok(invalidBaseReadiness.blockers.some((item) => item.includes("bezpečně nastavená")));
delete env.HERE_TOUR_PLANNING_BASE_URL;

const problem = buildCollectionRouteHereProblem(readiness);
assert.equal(problem.fleet.types.length, 3);
assert.equal(problem.fleet.profiles.length, 3);
assert.ok(problem.fleet.profiles.every((profile) => profile.type === "truck"));
assert.ok(problem.fleet.profiles.every((profile) => profile.options.height > 0 && profile.options.grossWeight > 0));
assert.equal(problem.plan.jobs.length, readiness.eligibleCount);
assert.ok(problem.plan.jobs.every((job) => job.tasks.pickups[0].demand[0] > 0));
assert.ok(problem.fleet.types.every((item) => item.shifts[0].reloads[0].duration === 720));
assert.ok(problem.fleet.types.every((item) => item.shifts[0].end.location.lat === readyConfig().dumpSites[0].latitude));

let providerCalls = 0;
let submittedProblem = null;
const fetchImpl = async (url, options = {}) => {
  providerCalls += 1;
  if (url === "https://account.api.here.com/oauth2/token") {
    assert.equal(options.method, "POST");
    assert.doesNotMatch(options.headers.Authorization, /here-access-key-secret-test/);
    return new Response(JSON.stringify({ accessToken: "here-bearer-token", expiresIn: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  assert.equal(options.headers.Authorization, "Bearer here-bearer-token");
  if (url === "https://tourplanning.hereapi.com/v3/problems/async") {
    submittedProblem = JSON.parse(options.body);
    return new Response(JSON.stringify({ href: "https://tourplanning.hereapi.com/v3/status/status-test-1" }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (url === "https://tourplanning.hereapi.com/v3/status/status-test-1") {
    return new Response(JSON.stringify({
      status: "success",
      resource: { href: "https://tourplanning.hereapi.com/v3/problems/problem-test-1/solution" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url === "https://tourplanning.hereapi.com/v3/problems/problem-test-1/solution") {
    const firstJob = submittedProblem.plan.jobs[0];
    return new Response(JSON.stringify({
      statistic: {
        distance: 32100,
        duration: 5400,
        times: { driving: 3600, serving: 1800, waiting: 0 }
      },
      tours: [{
        vehicleId: "kaiser_vehicle_a_1",
        statistic: {
          distance: 32100,
          duration: 5400,
          times: { driving: 3600, serving: 1800, waiting: 0 }
        },
        stops: [{
          distance: 1200,
          time: { arrival: "2026-07-13T06:10:00+02:00", departure: "2026-07-13T06:15:00+02:00" },
          location: firstJob.tasks.pickups[0].places[0].location,
          activities: [{
            jobId: firstJob.id,
            type: "pickup",
            location: firstJob.tasks.pickups[0].places[0].location,
            time: { start: "2026-07-13T06:10:00+02:00", end: "2026-07-13T06:15:00+02:00" }
          }]
        }]
      }],
      unassigned: []
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`Unexpected HERE URL: ${url}`);
};

await assert.rejects(
  startCollectionRouteHereRun(env, manager, {
    routeDate: readiness.routeDate,
    wasteType: "SKO",
    expectedStopCount: readiness.eligibleCount,
    confirmation: "wrong",
    idempotencyKey: "here-start-wrong"
  }),
  (error) => error?.code === "collection_route_here_confirmation_required"
);

const started = await startCollectionRouteHereRun(env, manager, {
  routeDate: readiness.routeDate,
  wasteType: "SKO",
  expectedStopCount: readiness.eligibleCount,
  confirmation: "start-here-test-readonly",
  idempotencyKey: "here-start-one"
}, { fetchImpl, nowMs: Date.parse("2026-07-13T08:00:00.000Z"), nonce: "submit-nonce" });
assert.equal(started.run.status, "submitted");
assert.equal(started.run.createsOperationalRoute, false);
assert.equal(started.run.sendsNotifications, false);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_here_runs").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_here_events").get().count, 2);
assert.equal(providerCalls, 2);

const repeated = await startCollectionRouteHereRun(env, manager, {
  routeDate: readiness.routeDate,
  wasteType: "SKO",
  expectedStopCount: readiness.eligibleCount,
  confirmation: "start-here-test-readonly",
  idempotencyKey: "here-start-one"
}, { fetchImpl });
assert.equal(repeated.reused, true);
assert.equal(repeated.run.id, started.run.id);
assert.equal(providerCalls, 2, "Idempotentní opakování nesmí zavolat HERE podruhé.");

const completed = await getCollectionRouteHereRun(env, manager, started.run.id, {
  fetchImpl,
  nowMs: Date.parse("2026-07-13T08:01:00.000Z"),
  nonce: "poll-nonce"
});
assert.equal(completed.run.status, "completed");
assert.equal(completed.run.result.distanceMeters, 32100);
assert.equal(completed.run.result.assignedStopCount, 1);
assert.equal(completed.run.result.unassignedCount, 0);
assert.equal(completed.run.result.tours.length, 1);
assert.equal(providerCalls, 5);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_here_events").get().count, 3);

await getCollectionRouteHereRun(env, manager, started.run.id, { fetchImpl });
assert.equal(providerCalls, 5, "Dokončený běh se musí číst z D1 bez dalšího volání HERE.");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_notification_jobs").get().count, 0);
assert.equal(sqlite.prepare("SELECT config_json FROM collection_route_here_settings WHERE scope = 'test'").get().config_json, JSON.stringify(readyConfig()));

console.log("Collection route HERE optimization tests passed.");
