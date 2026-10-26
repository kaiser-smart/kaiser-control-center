import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  loadVehicleTrackingHistory,
  vehicleTrackingHistoryPoint,
  vehicleTrackingHistoryRange,
  vehicleTrackingHistorySince
} from "../functions/_lib/vehicle-tracking-history.js";

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
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0037_create_vehicle_tracking_gps_history.sql", import.meta.url), "utf8"));
const db = { prepare(sql) { return new D1Statement(sqlite, sql); } };
const now = new Date("2026-07-11T14:00:00.000Z");

assert.equal(vehicleTrackingHistoryRange("7d"), "7d");
assert.equal(vehicleTrackingHistoryRange("30d"), "24h");
assert.equal(vehicleTrackingHistorySince("24h", now), "2026-07-10T14:00:00.000Z");
assert.equal(vehicleTrackingHistorySince("today", now), "2026-07-10T22:00:00.000Z");

const point = vehicleTrackingHistoryPoint({
  externalVehicleId: " 77 ",
  licensePlate: "3BK 4123",
  latitude: 49.2001,
  longitude: 16.6123,
  speedKmh: 41.2,
  heading: 270.4,
  address: "Brno",
  lastGpsAt: "2026-07-11T13:45:00.000Z"
}, now.toISOString());
assert.equal(point.vehicleKey, "77");
assert.equal(point.speedKmh, 41);
assert.equal(point.heading, 270);
assert.equal(vehicleTrackingHistoryPoint({ externalVehicleId: "77", latitude: 0, longitude: 16, lastGpsAt: now }), null);

sqlite.prepare(`INSERT INTO vehicle_tracking_gps_points (
  id, vehicle_key, license_plate, latitude, longitude, speed_kmh, heading, address, recorded_at, received_at, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(point.id, point.vehicleKey, point.licensePlate, point.latitude, point.longitude, point.speedKmh, point.heading, point.address, point.recordedAt, point.receivedAt, "tcars");
sqlite.prepare(`INSERT INTO vehicle_tracking_gps_points (
  id, vehicle_key, license_plate, latitude, longitude, recorded_at, received_at, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  .run("older-other-vehicle", "88", "9AA 0001", 49.1, 16.5, "2026-07-11T13:50:00.000Z", now.toISOString(), "tcars");
sqlite.prepare(`INSERT INTO vehicle_tracking_history_runs (id, started_at, finished_at, status, points_written, message)
  VALUES (?, ?, ?, ?, ?, ?)`)
  .run("history-run-1", "2026-07-11T13:59:00.000Z", "2026-07-11T13:59:01.000Z", "ok", 2, "GPS body byly uloženy.");

const history = await loadVehicleTrackingHistory(db, { vehicleKey: "77", range: "24h", now });
assert.equal(history.pointCount, 1);
assert.equal(history.points[0].address, "Brno");
assert.equal(history.lastRecordedAt, "2026-07-11T13:45:00.000Z");
assert.equal(history.lastSync.pointsWritten, 2);
assert.deepEqual((await loadVehicleTrackingHistory(db, { vehicleKey: "88", range: "today", now })).points, [
  { latitude: 49.1, longitude: 16.5, speedKmh: null, heading: null, address: "", recordedAt: "2026-07-11T13:50:00.000Z" }
]);

console.log("vehicle-tracking history tests: ok");

// The deployed schema separates GPS points (ARCHIVE) from sync metadata (AUDIT).
// A single SQLite database above cannot expose a routing regression.
const { createSessionCookie } = await import('../functions/_lib/auth.js');
const { onRequestGet } = await import('../functions/api/vehicle-tracking/history.js');
const archive = new DatabaseSync(':memory:'), audit = new DatabaseSync(':memory:');
archive.exec(readFileSync(new URL('../migrations/modular/archive/0002_remaining_archive_schema.sql',import.meta.url),'utf8'));
audit.exec(readFileSync(new URL('../migrations/modular/audit/0003_remaining_audit_schema.sql',import.meta.url),'utf8'));
const recent = new Date(Date.now()-60000).toISOString();
archive.prepare(`INSERT INTO vehicle_tracking_gps_points (id,vehicle_key,license_plate,latitude,longitude,recorded_at,received_at,source) VALUES (?,?,?,?,?,?,?,?)`).run('isolated-gps','77','TEST 077',49.2,16.6,recent,recent,'tcars');
audit.prepare(`INSERT INTO vehicle_tracking_history_runs (id,started_at,finished_at,status,points_written,message) VALUES (?,?,?,?,?,?)`).run('isolated-sync',recent,recent,'ok',1,'Isolated test');
const reads=[];
const connection=(database,domain)=>({prepare(sql){assert.match(sql.trim(),/^SELECT\b/i,'History GET must perform reads only');reads.push({domain,sql});return new D1Statement(database,sql);}});
const endpointUser={id:'history-test-admin',name:'History test',email:'history@example.test',role:'admin',status:'active'};
const endpointEnv={APP_ENV:'test',AUTH_MODE:'mock',AUTH_SESSION_SECRET:'isolated-history-test-secret',AUTH_USERS_JSON:JSON.stringify([endpointUser]),DB_ARCHIVE:connection(archive,'archive'),DB_AUDIT:connection(audit,'audit')};
const cookie=await createSessionCookie(endpointEnv,endpointUser);
const request=()=>new Request('https://smart-odpady.test/api/vehicle-tracking/history?vehicleKey=77&range=24h',{headers:{Cookie:cookie.split(';')[0]}});
const response=await onRequestGet({request:request(),env:endpointEnv});
assert.equal(response.status,200,'History must route GPS reads to ARCHIVE and sync metadata to AUDIT');
const body=await response.json();assert.equal(body.pointCount,1);assert.equal(body.lastSync.pointsWritten,1);assert.equal(body.points[0].recordedAt,recent);
assert(reads.some(r=>r.domain==='archive'&&r.sql.includes('vehicle_tracking_gps_points')));
assert(reads.some(r=>r.domain==='audit'&&r.sql.includes('vehicle_tracking_history_runs')));
for(const missing of ['DB_ARCHIVE','DB_AUDIT']){const env={...endpointEnv};delete env[missing];assert.equal((await onRequestGet({request:request(),env})).status,503);}
assert.equal((await onRequestGet({request:new Request('https://smart-odpady.test/api/vehicle-tracking/history?vehicleKey=77'),env:{...endpointEnv,AUTH_MODE:'email-code'}})).status,401);
console.log('PASS: separated ARCHIVE/AUDIT history read, original response contract, no writes, missing bindings fail closed, authentication required.');
