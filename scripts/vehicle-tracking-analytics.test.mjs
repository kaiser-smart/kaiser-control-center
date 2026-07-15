import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  analyzeVehicleTrackingPoints,
  loadVehicleTrackingAnalytics,
  rebuildVehicleTrackingAnalytics,
  vehicleTrackingAnalyticsFromDate,
  vehicleTrackingAnalyticsPeriod,
  vehicleTrackingHaversineKm,
  vehicleTrackingPragueDate
} from "../functions/_lib/vehicle-tracking-analytics.js";

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

console.log("vehicle tracking analytics tests: ok");
