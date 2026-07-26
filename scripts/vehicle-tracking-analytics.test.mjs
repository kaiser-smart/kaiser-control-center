import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/_lib/auth.js";
import {
  analyzeVehicleTrackingPoints,
  loadVehicleTrackingAnalytics,
  rebuildVehicleTrackingAnalytics,
  vehicleTrackingAnalyticsFromDate,
  vehicleTrackingAnalyticsPeriod,
  vehicleTrackingHaversineKm,
  vehicleTrackingPragueDate
} from "../functions/_lib/vehicle-tracking-analytics.js";
import { onRequestGet as getVehicleTrackingAnalytics } from "../functions/api/vehicle-tracking/analytics.js";
import { VEHICLE_TRACKING_MANTRA } from "../src/data/vehicleTrackingMantra.js";

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

assert.equal(vehicleTrackingAnalyticsPeriod("today"), "today");
assert.equal(vehicleTrackingAnalyticsPeriod("7d"), "7d");
assert.equal(vehicleTrackingAnalyticsPeriod("unknown"), "30d");
assert.equal(VEHICLE_TRACKING_MANTRA.status, "Produkční read-only GPS modul");
assert.ok(VEHICLE_TRACKING_MANTRA.rules.some((rule) => rule.includes("DB_ARCHIVE i DB_AUDIT")));
assert.ok(VEHICLE_TRACKING_MANTRA.rules.some((rule) => rule.includes("vehicle-tracking:view")));
assert.ok(VEHICLE_TRACKING_MANTRA.rules.some((rule) => rule.includes("demo režim nezapíná automaticky")));
assert.equal(vehicleTrackingPragueDate("2026-07-14T22:30:00.000Z"), "2026-07-15");
assert.equal(vehicleTrackingAnalyticsFromDate("7d", new Date("2026-07-15T10:00:00.000Z")), "2026-07-09");

const oneDegree = vehicleTrackingHaversineKm(
  { latitude: 49, longitude: 16 },
  { latitude: 50, longitude: 16 }
);
assert.ok(oneDegree > 111 && oneDegree < 112);

const analysis = analyzeVehicleTrackingPoints([
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 49, longitude: 16, speedKmh: 30, recordedAt: "2026-07-15T06:00:00.000Z" },
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 49, longitude: 16.01, speedKmh: 35, recordedAt: "2026-07-15T06:05:00.000Z" },
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 49, longitude: 16.02, speedKmh: 25, recordedAt: "2026-07-15T06:10:00.000Z" },
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 49, longitude: 16.02, speedKmh: 0, recordedAt: "2026-07-15T06:10:00.000Z" },
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 49, longitude: 16.5, speedKmh: 50, recordedAt: "2026-07-15T06:35:00.000Z" },
  { vehicleKey: "truck-1", licensePlate: "1AA 0001", latitude: 50, longitude: 18, speedKmh: 50, recordedAt: "2026-07-15T06:36:00.000Z" }
], { calculatedAt: "2026-07-15T07:00:00.000Z" });

assert.equal(analysis.points.length, 5, "duplicate point must be removed");
assert.equal(analysis.daily.length, 1);
assert.equal(analysis.daily[0].tripCount, 1);
assert.equal(analysis.daily[0].validSegmentCount, 2);
assert.equal(analysis.daily[0].rejectedSegmentCount, 2);
assert.ok(analysis.daily[0].totalKm > 1.4 && analysis.daily[0].totalKm < 1.5);
assert.equal(analysis.daily[0].coveragePercent, 50);
assert.equal(analysis.daily[0].qualityStatus, "insufficient");
assert.equal(analysis.trips.length, 1);
assert.equal(analysis.trips[0].distanceSource, "gps_geometry");

const midnight = analyzeVehicleTrackingPoints([
  { vehicleKey: "truck-2", latitude: 49, longitude: 16, speedKmh: 20, recordedAt: "2026-07-14T21:59:00.000Z" },
  { vehicleKey: "truck-2", latitude: 49, longitude: 16.01, speedKmh: 20, recordedAt: "2026-07-14T22:01:00.000Z" }
]);
assert.equal(midnight.daily.length, 2);
assert.equal(midnight.daily[1].rejectedSegmentCount, 0, "midnight boundary is not a GPS failure");
assert.equal(midnight.daily[1].totalKm, 0, "distance across a local-day boundary is not invented");

const migration = readFileSync(new URL("../migrations/0040_create_vehicle_tracking_trip_analytics.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../workers/vehicle-tracking-history-runner.js", import.meta.url), "utf8");
assert.match(migration, /vehicle_tracking_daily_metrics/);
assert.match(migration, /vehicle_tracking_trip_summaries/);
assert.match(worker, /historyIntervalMinutes:\s*1/);
assert.match(worker, /analyticsIntervalMinutes:\s*5/);
assert.doesNotMatch(worker, /setInterval|localStorage|sessionStorage/);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0037_create_vehicle_tracking_gps_history.sql", import.meta.url), "utf8"));
sqlite.exec(migration);
const db = new D1Database(sqlite);
[
  ["p1", "truck-1", "1AA 0001", 49, 16, 30, "2026-07-15T06:00:00.000Z"],
  ["p2", "truck-1", "1AA 0001", 49, 16.01, 35, "2026-07-15T06:05:00.000Z"],
  ["p3", "truck-1", "1AA 0001", 49, 16.02, 25, "2026-07-15T06:10:00.000Z"]
].forEach(([id, vehicleKey, plate, latitude, longitude, speed, recordedAt]) => sqlite.prepare(`INSERT INTO vehicle_tracking_gps_points (
  id, vehicle_key, license_plate, latitude, longitude, speed_kmh, recorded_at, received_at, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tcars')`).run(
  id, vehicleKey, plate, latitude, longitude, speed, recordedAt, "2026-07-15T06:11:00.000Z"
));
const rebuilt = await rebuildVehicleTrackingAnalytics(db, { days: 2, now: new Date("2026-07-15T07:00:00.000Z") });
assert.equal(rebuilt.status, "ok");
assert.equal(rebuilt.periodFrom, "2026-06-16", "first run must backfill 30 days without a manual action");
assert.equal(rebuilt.vehiclesProcessed, 1);
assert.equal(rebuilt.dailyRowsWritten, 1);
const rebuiltIncremental = await rebuildVehicleTrackingAnalytics(db, { days: 2, now: new Date("2026-07-15T07:02:00.000Z") });
assert.equal(rebuiltIncremental.periodFrom, "2026-07-14", "later runs must stay incremental");
const loaded = await loadVehicleTrackingAnalytics(db, { period: "today", now: new Date("2026-07-15T07:01:00.000Z") });
assert.equal(loaded.apiStatus, "ready");
assert.equal(loaded.summary.vehicleCount, 1);
assert.ok(loaded.summary.totalKm > 1.4 && loaded.summary.totalKm < 1.5);
assert.equal(loaded.vehicles[0].licensePlate, "1AA 0001");

const modularArchive = new DatabaseSync(":memory:");
const modularAudit = new DatabaseSync(":memory:");
modularArchive.exec(readFileSync(
  new URL("../migrations/modular/archive/0002_remaining_archive_schema.sql", import.meta.url),
  "utf8"
));
modularAudit.exec(readFileSync(
  new URL("../migrations/modular/audit/0003_remaining_audit_schema.sql", import.meta.url),
  "utf8"
));

const modularNow = new Date();
const modularDate = vehicleTrackingPragueDate(modularNow);
const modularStartedAt = new Date(modularNow.getTime() - 60_000).toISOString();
const modularFinishedAt = new Date(modularNow.getTime() - 30_000).toISOString();
modularArchive.prepare(`INSERT INTO vehicle_tracking_daily_metrics (
  vehicle_key, local_date, license_plate, total_km, trip_count, moving_minutes, point_count,
  valid_segment_count, rejected_segment_count, coverage_percent, quality_status,
  first_recorded_at, last_recorded_at, distance_source, calculated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gps_geometry', ?)`).run(
  "truck-modular",
  modularDate,
  "2BB 0002",
  12.5,
  2,
  45,
  20,
  18,
  2,
  90,
  "ready",
  modularStartedAt,
  modularFinishedAt,
  modularFinishedAt
);
modularArchive.prepare(`INSERT INTO vehicle_tracking_gps_points (
  id, vehicle_key, license_plate, latitude, longitude, speed_kmh, recorded_at, received_at, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tcars')`).run(
  "modular-point",
  "truck-modular",
  "2BB 0002",
  49,
  16,
  30,
  modularFinishedAt,
  modularFinishedAt
);
modularAudit.prepare(`INSERT INTO vehicle_tracking_analytics_runs (
  id, started_at, finished_at, status, period_from, period_to, vehicles_processed,
  points_processed, trips_written, daily_rows_written, message
) VALUES (?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?)`).run(
  "modular-run",
  modularStartedAt,
  modularFinishedAt,
  modularDate,
  modularDate,
  1,
  20,
  2,
  1,
  "Modulární přepočet dokončen."
);

const endpointUser = {
  id: "vehicle-tracking-test-admin",
  name: "GPS Analytics Test",
  email: "gps-analytics-test@kaiserservis.cz",
  role: "admin",
  status: "active"
};
const endpointEnv = {
  APP_ENV: "test",
  AUTH_MODE: "mock",
  AUTH_SESSION_SECRET: "vehicle-tracking-analytics-test-secret",
  AUTH_USERS_JSON: JSON.stringify([endpointUser]),
  DB_ARCHIVE: new D1Database(modularArchive),
  DB_AUDIT: new D1Database(modularAudit)
};
const endpointCookie = await createSessionCookie(endpointEnv, endpointUser);
const endpointResponse = await getVehicleTrackingAnalytics({
  request: new Request(`https://smart-odpady.test/api/vehicle-tracking/analytics?period=today`, {
    headers: { Cookie: endpointCookie.split(";")[0] }
  }),
  env: endpointEnv
});
assert.equal(endpointResponse.status, 200, "read endpoint must combine DB_ARCHIVE and DB_AUDIT");
const endpointPayload = await endpointResponse.json();
assert.equal(endpointPayload.apiStatus, "ready");
assert.equal(endpointPayload.summary.vehicleCount, 1);
assert.equal(endpointPayload.summary.totalKm, 12.5);
assert.equal(endpointPayload.lastRun.status, "ok");
assert.equal(endpointPayload.lastRun.pointsProcessed, 20);

const missingAuditResponse = await getVehicleTrackingAnalytics({
  request: new Request(`https://smart-odpady.test/api/vehicle-tracking/analytics?period=today`, {
    headers: { Cookie: endpointCookie.split(";")[0] }
  }),
  env: { ...endpointEnv, DB_AUDIT: undefined }
});
assert.equal(missingAuditResponse.status, 503, "read endpoint must fail closed without DB_AUDIT");

console.log("vehicle tracking analytics tests: ok");
