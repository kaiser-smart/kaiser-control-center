import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  classifyFleetTripJobCandidate,
  fleetTripJobPairingDedupeKey,
  loadFleetTripJobPairingPreview,
  runFleetTripJobPairing
} from "../functions/_lib/fleet-trip-job-pairing.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

const completedRun = {
  id: "run-a",
  status: "completed",
  started_at: "2026-07-15T06:00:00.000Z",
  completed_at: "2026-07-15T07:30:00.000Z"
};
const completedStops = [
  { id: "stop-a1", run_id: "run-a", status: "done", completed_at: "2026-07-15T06:30:00.000Z" },
  { id: "stop-a2", run_id: "run-a", status: "done", completed_at: "2026-07-15T07:00:00.000Z" }
];
assert.equal(classifyFleetTripJobCandidate({
  started_at: "2026-07-15T06:10:00.000Z",
  finished_at: "2026-07-15T06:20:00.000Z"
}, [completedRun], completedStops).classification, "deadhead_candidate");
const productive = classifyFleetTripJobCandidate({
  started_at: "2026-07-15T06:35:00.000Z",
  finished_at: "2026-07-15T06:45:00.000Z"
}, [completedRun], completedStops);
assert.equal(productive.classification, "productive_candidate");
assert.equal(productive.jobStopId, "stop-a2");
assert.equal(classifyFleetTripJobCandidate({
  started_at: "2026-07-15T06:35:00.000Z",
  finished_at: "2026-07-15T06:45:00.000Z"
}, [{ ...completedRun, status: "active" }], completedStops).reasonCode, "no_completed_route_run");
assert.equal(
  fleetTripJobPairingDedupeKey("2026-07-15T07:29:59.000Z"),
  "fleet-trip-job:2026-07-15T07:15:00.000Z"
);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0015_create_module_rules.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0017_create_collection_routes_phase1a.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0038_create_collection_daily_routes.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0040_create_vehicle_tracking_trip_analytics.sql", import.meta.url), "utf8"));
const migration = readFileSync(new URL("../migrations/0041_create_fleet_trip_job_pairing.sql", import.meta.url), "utf8");
sqlite.exec(migration);
const db = new D1Database(sqlite);

const insertTrip = sqlite.prepare(`INSERT INTO vehicle_tracking_trip_summaries (
  id, vehicle_key, license_plate, local_date, started_at, finished_at, distance_km,
  duration_minutes, moving_minutes, point_count, segment_count, quality_score,
  quality_status, distance_source, calculated_at
) VALUES (?, ?, ?, '2026-07-15', ?, ?, ?, 10, 10, 3, 2, 100, 'ready', 'gps_geometry', '2026-07-15T07:31:00.000Z')`);
insertTrip.run("trip-a-before", "tcars-a", "3BN 3558", "2026-07-15T06:10:00.000Z", "2026-07-15T06:20:00.000Z", 5);
insertTrip.run("trip-a-productive", "tcars-a", "3BN 3558", "2026-07-15T06:35:00.000Z", "2026-07-15T06:45:00.000Z", 6);
insertTrip.run("trip-a-after", "tcars-a", "3BN 3558", "2026-07-15T07:05:00.000Z", "2026-07-15T07:15:00.000Z", 4);
insertTrip.run("trip-b", "tcars-b", "1BP 8373", "2026-07-15T06:00:00.000Z", "2026-07-15T06:10:00.000Z", 8);
insertTrip.run("trip-c", "tcars-c", "3BE 2831", "2026-07-15T06:00:00.000Z", "2026-07-15T06:10:00.000Z", 9);

sqlite.prepare("INSERT INTO collection_import_batches (id, status, api_status) VALUES ('batch-1', 'ready', 'ready')").run();
sqlite.prepare("INSERT INTO collection_import_rows (id, batch_id, row_number) VALUES ('source-a1', 'batch-1', 1)").run();
sqlite.prepare("INSERT INTO collection_import_rows (id, batch_id, row_number) VALUES ('source-a2', 'batch-1', 2)").run();
sqlite.prepare(`INSERT INTO collection_daily_route_runs (
  id, route_key, source_batch_id, route_date, vehicle_code, vehicle_registration,
  status, started_at, completed_at
) VALUES ('run-a', '2026-07-15|A', 'batch-1', '2026-07-15', 'A', '3BN 3558',
  'completed', '2026-07-15T06:00:00.000Z', '2026-07-15T07:30:00.000Z')`).run();
sqlite.prepare(`INSERT INTO collection_daily_route_stops (
  id, run_id, route_date, source_batch_id, source_row_id, route_order, status, completed_at
) VALUES (?, 'run-a', '2026-07-15', 'batch-1', ?, ?, 'done', ?)`)
  .run("stop-a1", "source-a1", 1, "2026-07-15T06:30:00.000Z");
sqlite.prepare(`INSERT INTO collection_daily_route_stops (
  id, run_id, route_date, source_batch_id, source_row_id, route_order, status, completed_at
) VALUES (?, 'run-a', '2026-07-15', 'batch-1', ?, ?, 'done', ?)`)
  .run("stop-a2", "source-a2", 2, "2026-07-15T07:00:00.000Z");

const env = { SMART_ODPADY_DB: db };
const fleetVehicles = [
  { id: "vistos-vehicle-a", vistosVehicleId: "vehicle-a", licensePlate: "3BN 3558" },
  { id: "vistos-vehicle-b", vistosVehicleId: "vehicle-b", licensePlate: "1BP 8373" },
  { id: "vistos-vehicle-c", vistosVehicleId: "vehicle-c", licensePlate: "3BE 2831" }
];
const result = await runFleetTripJobPairing(env, {
  scheduledAt: "2026-07-15T07:30:00.000Z",
  triggeredBy: "test",
  fleetVehicles
});
assert.equal(result.status, "ok");
assert.equal(result.phase, "read-only-pilot");
assert.equal(result.summary.aliasesReady, 3);
assert.equal(result.summary.tripsSeen, 5);
assert.equal(result.summary.candidateTrips, 3);
assert.equal(result.summary.unclassifiedTrips, 2);
assert.equal(result.summary.actualRouteRuns, 1);
assert.equal(result.summary.actualStops, 2);
assert.equal(result.qualityGate.dashboardActivationAllowed, false);
assert.ok(result.qualityGate.reasons.includes("phase_1a_preview_only"));

const productiveAllocation = sqlite.prepare("SELECT * FROM fleet_trip_job_allocations WHERE trip_id = 'trip-a-productive'").get();
assert.equal(productiveAllocation.classification, "productive_candidate");
assert.equal(productiveAllocation.job_stop_id, "stop-a2");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM fleet_vehicle_external_aliases").get().count, 9);
assert.equal(sqlite.prepare("SELECT last_run_status FROM module_rules WHERE id = 'vehicle-tracking-trip-job-pairing-phase1a'").get().last_run_status, "ok");

const duplicate = await runFleetTripJobPairing(env, {
  scheduledAt: "2026-07-15T07:31:00.000Z",
  triggeredBy: "test",
  fleetVehicles
});
assert.equal(duplicate.status, "skipped");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM fleet_trip_job_pairing_runs").get().count, 1);

sqlite.prepare("UPDATE module_rules SET status = 'inactive' WHERE id = 'vehicle-tracking-trip-job-pairing-phase1a'").run();
const inactive = await runFleetTripJobPairing(env, {
  scheduledAt: "2026-07-15T07:45:00.000Z",
  triggeredBy: "test",
  fleetVehicles
});
assert.equal(inactive.status, "skipped");
assert.equal(inactive.reason, "automation_inactive");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM fleet_trip_job_pairing_runs").get().count, 1);
sqlite.prepare("UPDATE module_rules SET status = 'active' WHERE id = 'vehicle-tracking-trip-job-pairing-phase1a'").run();

const preview = await loadFleetTripJobPairingPreview(env);
assert.equal(preview.apiStatus, "ready");
assert.equal(preview.phase, "read-only-pilot");
assert.equal(preview.cloudAutomation.dependsOnFleetModuleOpen, false);
assert.equal(preview.qualityGate.dashboardActivationAllowed, false);
assert.equal(preview.allocations.length, 5);

const worker = readFileSync(new URL("../workers/vehicle-tracking-history-runner.js", import.meta.url), "utf8");
assert.match(migration, /fleet_vehicle_external_aliases/);
assert.match(migration, /fleet_trip_job_allocations/);
assert.match(migration, /dashboard_activation_allowed/);
assert.match(worker, /tripJobPairingIntervalMinutes:\s*15/);
assert.match(worker, /internal-trip-job-pairing-sync/);
assert.doesNotMatch(worker, /setInterval|localStorage|sessionStorage/);

console.log("fleet trip-job pairing tests: ok");
