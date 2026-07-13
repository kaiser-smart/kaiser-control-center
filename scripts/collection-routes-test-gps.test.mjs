import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  collectionRouteGpsPrompt,
  summarizeCollectionRouteGpsSamples
} from "../src/data/collectionRouteGps.js";
import {
  CollectionRoutesTestGpsError,
  collectionRoutesGpsDistanceMeters,
  confirmCollectionRoutesTestGps,
  getCollectionRoutesTestOperationalConfig,
  listCollectionRoutesTestGpsConfirmations
} from "../functions/_lib/collection-routes-test-gps-store.js";

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
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.database.exec("COMMIT");
      return result;
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
    "../migrations/test/0002_create_collection_route_here_optimization.sql",
    "../migrations/test/0003_configure_collection_route_test_operations_and_gps.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

function seedRoute(sqlite) {
  const summary = JSON.stringify({
    customerName: "TEST zákazník",
    stationName: "TEST stanoviště",
    addressPlaceRaw: "Trnkova 3052/137, Brno",
    latitude: 49.19125931950087,
    longitude: 16.670211574110382
  });
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count,
      issue_count, created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES ('batch-test', 'synthetic-test', 'synthetic-brno-test', 'preview', 'ready', '', 1, 0, 'manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '{}')
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES ('row-test', 'batch-test', 1, 'SyntheticSite', 'source-test', 'preview', ?, '[]', CURRENT_TIMESTAMP)
  `).run(summary);
  sqlite.prepare(`
    INSERT INTO collection_daily_route_runs (
      id, route_key, source_batch_id, source_mode, route_date, route_day_code,
      route_week_mode, vehicle_code, vehicle_registration, vehicle_label,
      driver_user_id, driver_name, title, status, stop_count, metadata_json
    ) VALUES (
      'run-test', '2026-07-13|A', 'batch-test', 'synthetic-brno-test', '2026-07-13', 'PO',
      'odd-even', 'A', '3BN 3558', 'Vůz A · 3BN 3558',
      'driver-mirek', 'Miroslav Vašek', 'TEST trasa', 'active', 1, '{"scope":"test"}'
    )
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, station_name, status, source_summary_json
    ) VALUES (
      'stop-test', 'run-test', '2026-07-13', 'batch-test', 'row-test', 1,
      'TEST zákazník', 'Trnkova 3052/137, Brno', 'TEST stanoviště', 'planned', ?
    )
  `).run(summary);
}

const manager = {
  id: "manager-test",
  name: "Manager Test",
  email: "manager@example.invalid",
  role: "management",
  status: "active",
  active: true
};

const driver = {
  id: "driver-mirek",
  name: "Miroslav Vašek",
  role: "ridic",
  status: "active",
  active: true
};

{
  const samples = [
    { latitude: 49.19125, longitude: 16.6702, accuracy: 14, speed: 0, capturedAt: new Date().toISOString() },
    { latitude: 49.19126, longitude: 16.67021, accuracy: 6, speed: 0, capturedAt: new Date().toISOString() },
    { latitude: 49.19127, longitude: 16.67022, accuracy: 9, speed: null, capturedAt: new Date().toISOString() }
  ];
  const summary = summarizeCollectionRouteGpsSamples(samples);
  assert.equal(summary.ok, true);
  assert.equal(summary.point.accuracy, 6);
  assert.equal(summary.point.sampleCount, 3);
  assert.match(collectionRouteGpsPrompt("Miroslave"), /^Miroslave,/);
  assert.equal(
    summarizeCollectionRouteGpsSamples(samples.map((sample) => ({ ...sample, speed: 3 }))).code,
    "vehicle_moving"
  );
  assert.equal(
    summarizeCollectionRouteGpsSamples(samples.map((sample) => ({ ...sample, accuracy: 48 }))).code,
    "gps_accuracy_low"
  );
  assert.ok(collectionRoutesGpsDistanceMeters(samples[0], samples[1]) < 5);
}

{
  const { sqlite, d1 } = openDatabase();
  seedRoute(sqlite);
  const env = { COLLECTION_ROUTES_TEST_DB: d1 };
  const config = await getCollectionRoutesTestOperationalConfig(env, manager);
  assert.equal(config.status, "test-estimate");
  assert.equal(config.config.depot.address, "Trnkova 3052/137, 628 00 Brno");
  assert.equal(config.config.dumpSites.length, 5);
  assert.equal(config.config.vehicles.length, 3);
  assert.equal(config.config.vehicles[0].technicalDataQuality, "conservative-test-estimate");

  await assert.rejects(
    confirmCollectionRoutesTestGps(env, driver, {}),
    (error) => error?.code === "collection_routes_test_forbidden"
  );
  await assert.rejects(
    confirmCollectionRoutesTestGps(env, manager, {
      runId: "run-test",
      stopId: "stop-test",
      latitude: 49.19126,
      longitude: 16.67021,
      accuracyMeters: 6,
      sampleCount: 3,
      speedMps: 2.1,
      capturedAt: new Date().toISOString(),
      idempotencyKey: "moving"
    }),
    (error) => error instanceof CollectionRoutesTestGpsError && error.code === "collection_routes_test_gps_vehicle_moving"
  );

  const saved = await confirmCollectionRoutesTestGps(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    latitude: 49.19126,
    longitude: 16.67021,
    accuracyMeters: 6,
    sampleCount: 5,
    speedMps: 0,
    capturedAt: new Date().toISOString(),
    idempotencyKey: "gps-one"
  });
  assert.equal(saved.reused, false);
  assert.equal(saved.confirmation.status, "driver-measured");
  assert.equal(saved.confirmation.routingCandidate, true);
  assert.ok(saved.confirmation.distanceFromAddressMeters < 5);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_gps_confirmations").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE event_type = 'gps_position_confirmed'").get().count, 1);
  assert.equal(
    JSON.parse(sqlite.prepare("SELECT source_summary_json FROM collection_daily_route_stops WHERE id = 'stop-test'").get().source_summary_json).latitude,
    49.19125931950087,
    "Fyzické měření nesmí přepsat původní adresní GPS."
  );

  const repeated = await confirmCollectionRoutesTestGps(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    latitude: 49.2,
    longitude: 16.7,
    accuracyMeters: 8,
    sampleCount: 3,
    speedMps: 0,
    capturedAt: "2020-01-01T00:00:00.000Z",
    idempotencyKey: "gps-one"
  });
  assert.equal(repeated.reused, true);
  assert.equal(repeated.confirmation.latitude, saved.confirmation.latitude);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_gps_confirmations").get().count, 1);
  await assert.rejects(
    confirmCollectionRoutesTestGps(env, manager, {
      runId: "run-test",
      stopId: "different-stop",
      idempotencyKey: "gps-one"
    }),
    (error) => error?.code === "collection_routes_test_gps_idempotency_conflict"
  );

  const review = await confirmCollectionRoutesTestGps(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    latitude: 49.2,
    longitude: 16.7,
    accuracyMeters: 12,
    sampleCount: 3,
    speedMps: 0,
    capturedAt: new Date().toISOString(),
    idempotencyKey: "gps-two"
  });
  assert.equal(review.confirmation.status, "needs-review");
  assert.equal(review.confirmation.routingCandidate, false);
  const list = await listCollectionRoutesTestGpsConfirmations(env, manager, { runId: "run-test" });
  assert.equal(list.confirmations.length, 2);
  assert.equal((await getCollectionRoutesTestOperationalConfig(env, manager)).gpsSummary.reviewCount, 1);
}

console.log("collection routes TEST GPS tests: ok");
