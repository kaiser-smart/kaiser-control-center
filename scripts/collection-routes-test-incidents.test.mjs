import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  getCollectionRoutesTestIncidentPhoto,
  listCollectionRoutesTestIncidents,
  reportCollectionRoutesTestIncident
} from "../functions/_lib/collection-routes-test-incidents-store.js";
import {
  __test as incidentApiTest,
  detectCollectionRouteTestIncidentImageType
} from "../functions/api/collection-routes/test-incidents.js";

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

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
    this.deleted = [];
  }

  async put(key, body, options = {}) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body || []);
    this.objects.set(key, {
      body: bytes,
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {}
    });
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

function openDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql",
    "../migrations/test/0005_create_collection_route_test_incidents.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

function seedRoute(sqlite) {
  const summary = JSON.stringify({
    customerName: "Firma test 501",
    stationName: "Firma test 501 · stanoviště Trnkova",
    addressPlaceRaw: "Trnkova 3052/137, 628 00 Brno"
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
    ) VALUES ('row-test', 'batch-test', 501, 'SyntheticSite', 'test-field-site-501', 'preview', ?, '[]', CURRENT_TIMESTAMP)
  `).run(summary);
  sqlite.prepare(`
    INSERT INTO collection_daily_route_runs (
      id, route_key, source_batch_id, source_mode, route_date, route_day_code,
      route_week_mode, vehicle_code, vehicle_registration, vehicle_label,
      driver_user_id, driver_name, title, status, stop_count, metadata_json
    ) VALUES (
      'run-test', '2026-07-15|FIELD|stationary-field-test', 'batch-test', 'synthetic-brno-test', '2026-07-15', 'ST',
      'odd-even', 'FIELD', '', 'Stacionární TEST tabletu',
      '', '', 'Stacionární TEST incidentů', 'active', 1,
      '{"dataScope":"test","testMode":"stationary-field-test","fieldTesterUserId":"manager-test","fieldTesterName":"Manager Test","sendsNotifications":false}'
    )
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, station_name, status, source_summary_json
    ) VALUES (
      'stop-test', 'run-test', '2026-07-15', 'batch-test', 'row-test', 1,
      'Firma test 501', 'Trnkova 3052/137, 628 00 Brno', 'Firma test 501 · stanoviště Trnkova', 'planned', ?
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

const otherManager = {
  id: "other-manager",
  name: "Jiný Manager",
  role: "management",
  status: "active",
  active: true
};

const driver = {
  id: "driver-test",
  name: "Řidič Test",
  role: "ridic",
  status: "active",
  active: true
};

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

assert.equal(detectCollectionRouteTestIncidentImageType(jpeg), "image/jpeg");
assert.equal(detectCollectionRouteTestIncidentImageType(png), "image/png");
assert.equal(detectCollectionRouteTestIncidentImageType(webp), "image/webp");
assert.equal(detectCollectionRouteTestIncidentImageType(new Uint8Array([1, 2, 3])), "");
assert.equal(incidentApiTest.MAX_PHOTO_SIZE_BYTES, 6 * 1024 * 1024);

{
  const { sqlite, d1 } = openDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  const env = { COLLECTION_ROUTES_TEST_DB: d1, SMART_ODPADY_DOCUMENTS: bucket };

  await assert.rejects(
    reportCollectionRoutesTestIncident(env, driver, {}, {}),
    (error) => error?.code === "collection_routes_test_forbidden" && error?.status === 403
  );
  await assert.rejects(
    reportCollectionRoutesTestIncident(env, otherManager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "overfilled_container",
      idempotencyKey: "wrong-tester"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_field_tester_mismatch"
  );

  const saved = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "overfilled_container",
    note: "Přeplněná nádoba vedle vjezdu.",
    idempotencyKey: "incident-one"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });

  assert.equal(saved.reused, false);
  assert.equal(saved.incident.type, "overfilled_container");
  assert.equal(saved.incident.typeLabel, "Přeplněná nádoba");
  assert.equal(saved.incident.status, "recorded-test");
  assert.equal(saved.incident.createdByUserId, manager.id);
  assert.equal(saved.incident.metadata.noNotifications, true);
  assert.equal(saved.incident.metadata.noCustomerContact, true);
  assert.equal(saved.incident.metadata.noRouteChange, true);
  assert.match(saved.incident.photoUrl, /^\/api\/collection-routes\/test-incidents\/.+\/photo$/);
  assert.equal(bucket.objects.size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incidents").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incident_events").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE event_type = 'test_incident_reported'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT status FROM collection_daily_route_stops WHERE id = 'stop-test'").get().status, "planned");

  const repeated = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "overfilled_container",
    idempotencyKey: "incident-one"
  });
  assert.equal(repeated.reused, true);
  assert.equal(bucket.objects.size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incidents").get().count, 1);

  await assert.rejects(
    reportCollectionRoutesTestIncident(env, manager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "damaged_container",
      idempotencyKey: "incident-one"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_idempotency_conflict"
  );

  const list = await listCollectionRoutesTestIncidents(env, manager, { runId: "run-test" });
  assert.equal(list.incidents.length, 1);
  assert.equal(list.sendsNotifications, false);
  assert.equal(list.changesRoute, false);

  const photo = await getCollectionRoutesTestIncidentPhoto(env, manager, saved.incident.id);
  assert.equal(photo.contentType, "image/jpeg");
  assert.deepEqual(Array.from(photo.body), Array.from(jpeg));
}

{
  const { sqlite, d1 } = openDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  d1.batch = async () => {
    throw new Error("forced D1 failure");
  };
  const env = { COLLECTION_ROUTES_TEST_DB: d1, SMART_ODPADY_DOCUMENTS: bucket };
  await assert.rejects(
    reportCollectionRoutesTestIncident(env, manager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "site_inaccessible",
      idempotencyKey: "incident-cleanup"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_store_failed"
  );
  assert.equal(bucket.objects.size, 0, "R2 fotografie se při chybě D1 musí odstranit.");
  assert.equal(bucket.deleted.length, 1);
}

console.log("collection routes TEST incident tests: ok");
