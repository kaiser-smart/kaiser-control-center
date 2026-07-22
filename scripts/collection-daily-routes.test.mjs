import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { onRequestGet as listDailyRoutesApi } from "../functions/api/collection-routes/daily-routes.js";
import { onRequestGet as myDailyRouteApi } from "../functions/api/collection-routes/daily-routes/my.js";
import { onRequestGet as driverRouteMapApi } from "../functions/api/collection-routes/daily-routes/[runId]/map.js";
import { onRequestGet as driverRouteNavigationApi } from "../functions/api/collection-routes/daily-routes/[runId]/navigation.js";
import { onRequestGet as testGpsListApi } from "../functions/api/collection-routes/test-gps-confirmations.js";
import { onRequestPost as stopEventApi } from "../functions/api/collection-routes/daily-routes/[runId]/stops/[stopId]/events.js";
import { onRequestPost as driverReportApi } from "../functions/api/collection-routes/daily-routes/[runId]/stops/[stopId]/report.js";
import { onRequestGet as driverReportPhotoApi } from "../functions/api/collection-routes/daily-routes/[runId]/reports/[reportId]/photo.js";
import { previewCollectionRoutesTestNotifications } from "../functions/_lib/collection-routes-test-notifications.js";
import {
  confirmCollectionRoutesTestGps,
  listCollectionRoutesTestGpsConfirmations
} from "../functions/_lib/collection-routes-test-gps-store.js";
import {
  __collectionDailyRouteEligibilityForTest,
  __collectionDailyRoutePickupScheduleForTest,
  COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID,
  COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  assignCollectionDailyRouteDriver,
  collectionDailyRouteExternalEffectsDisabled,
  collectionDailyRouteDateInfo,
  createCollectionDailyRouteDraft,
  getCollectionDailyRoute,
  getMyCollectionDailyRoute,
  listCollectionDailyRouteDrivers,
  listCollectionDailyRoutes,
  previewCollectionDailyRoute,
  recordCollectionDailyRouteStopEvent,
  transitionCollectionDailyRoute
} from "../functions/_lib/collection-daily-routes-store.js";

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
    return { success: true, meta: this.database.prepare(this.sql).run(...this.values) };
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
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
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
    this.objects.set(key, {
      body: body instanceof Uint8Array ? body : new Uint8Array(body || []),
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

function summary(overrides = {}) {
  return {
    sourceContractId: "contract-1",
    contractId: "contract-1",
    contractNumber: "KS-001",
    customerName: "Test zákazník",
    addressRaw: "Trnkova 117, Brno",
    addressPlaceRaw: "Trnkova 117, Brno",
    stationName: "Dvůr",
    siteName: "Dvůr",
    wasteType: "SKO",
    wasteCode: "20 03 01",
    frequency: "1x7",
    containerVolume: 1100,
    containerCount: 1,
    containerType: "nádoba",
    pickupDaysText: "pondělí lichá, pondělí sudá (dopočteno)",
    serviceMode: "regular",
    onDemand: false,
    svozKaiserIncluded: true,
    issueCount: 0,
    note: "Brána zezadu",
    ...overrides
  };
}

function insertImportRow(sqlite, { id, rowNumber, rowSummary, issues = [] }) {
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES (?, 'batch-current', ?, 'ContractRow', ?, 'preview', ?, ?, '2026-07-12T08:00:00.000Z')
  `).run(id, rowNumber, `source-${id}`, JSON.stringify(rowSummary), JSON.stringify(issues));
}

const dateInfo = collectionDailyRouteDateInfo("2026-07-13");
assert.deepEqual(dateInfo, {
  routeDate: "2026-07-13",
  dayCode: "PO",
  dayLabel: "pondělí",
  isoWeek: 29,
  parity: "odd",
  weekMode: "lichý týden"
});
assert.deepEqual(__collectionDailyRoutePickupScheduleForTest("18330, 18337"), [
  { dayCode: "PO", parity: "odd", text: "pondělí lichá" },
  { dayCode: "PO", parity: "even", text: "pondělí sudá" }
]);
assert.equal(__collectionDailyRouteEligibilityForTest({
  id: "eligible",
  rowNumber: 1,
  summary: summary(),
  issues: []
}, "2026-07-13").eligible, true);
assert.match(__collectionDailyRouteEligibilityForTest({
  id: "monthly",
  rowNumber: 2,
  summary: summary({ frequency: "1x30", pickupDaysText: "pondělí lichá" }),
  issues: []
}, "2026-07-13").reason, /Měsíční četnost/);
assert.equal(__collectionDailyRouteEligibilityForTest({
  id: "monthly-confirmed",
  rowNumber: 2,
  summary: summary({
    frequency: "1x30",
    pickupDaysText: "2. pondělí v měsíci",
    pickupSchedule: { mode: "monthly-weekday", dayCodes: ["PO"], parities: ["all"], weekOfMonth: 2 }
  }),
  issues: []
}, "2026-07-13").eligible, true);
assert.match(__collectionDailyRouteEligibilityForTest({
  id: "monthly-wrong-occurrence",
  rowNumber: 2,
  summary: summary({
    frequency: "1x30",
    pickupDaysText: "2. pondělí v měsíci",
    pickupSchedule: { mode: "monthly-weekday", dayCodes: ["PO"], parities: ["all"], weekOfMonth: 2 }
  }),
  issues: []
}, "2026-07-20").reason, /2\. pondělí v měsíci/);
assert.match(__collectionDailyRouteEligibilityForTest({
  id: "monthly-wrong-weekday",
  rowNumber: 2,
  summary: summary({
    frequency: "1x30",
    pickupDaysText: "2. pondělí v měsíci",
    pickupSchedule: { mode: "monthly-weekday", dayCodes: ["PO"], parities: ["all"], weekOfMonth: 2 }
  }),
  issues: []
}, "2026-07-14").reason, /není plánovaná na úterý/);
assert.match(__collectionDailyRouteEligibilityForTest({
  id: "missing-address-place",
  rowNumber: 3,
  summary: summary({ addressPlaceRaw: "", addressRaw: "Náhradní technická adresa" }),
  issues: []
}, "2026-07-13").reason, /Adresní místo/);

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0001_create_users.sql",
  "../migrations/0002_add_user_manager.sql",
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql"
]) {
  sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}

sqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count,
    created_by_user_id, created_at, finished_at, metadata_json
  ) VALUES (
    'batch-current', 'vistos', 'vistos-komunal-preview', 'preview', 'ready', 'test', 4, 1,
    'dispatcher-1', '2026-07-12T08:00:00.000Z', '2026-07-12T08:00:00.000Z', '{}'
  )
`).run();
insertImportRow(sqlite, { id: "row-eligible", rowNumber: 1, rowSummary: summary() });
insertImportRow(sqlite, {
  id: "row-issue",
  rowNumber: 2,
  rowSummary: summary({ issueCount: 1, customerName: "Neověřený zákazník" }),
  issues: [{ type: "missing-address", severity: "error", message: "Chybí adresa." }]
});
insertImportRow(sqlite, {
  id: "row-monthly",
  rowNumber: 3,
  rowSummary: summary({ customerName: "Měsíční zákazník", frequency: "1x30", pickupDaysText: "pondělí lichá" })
});
insertImportRow(sqlite, {
  id: "row-tuesday",
  rowNumber: 4,
  rowSummary: summary({ customerName: "Úterní zákazník", pickupDaysText: "úterý lichá, úterý sudá" })
});

const dispatcher = { id: "dispatcher-1", name: "Dispečer Test", role: "dispecer", status: "active", active: true };
const driver = { id: "driver-1", name: "Miroslav Vašek", role: "ridic", status: "active", active: true };
const otherDriver = { id: "driver-2", name: "Jiný řidič", role: "ridic", status: "active", active: true };
const readonly = { id: "readonly-1", name: "Readonly Test", role: "readonly", status: "active", active: true };
const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  AUTH_USERS_JSON: JSON.stringify([dispatcher, driver, otherDriver, readonly]),
  AUTH_SESSION_SECRET: "collection-daily-routes-test-session-secret"
};

const availableDrivers = await listCollectionDailyRouteDrivers(env);
assert.equal(availableDrivers.find((item) => item.id === driver.id)?.addressingName, "Miroslave");

async function authenticatedRequest(url, user) {
  const cookie = (await createSessionCookie(env, user)).split(";")[0];
  return new Request(url, { headers: { Cookie: cookie } });
}

const preview = await previewCollectionDailyRoute(env, {
  routeDate: "2026-07-13",
  vehicleCode: "A",
  sourceBatchId: "batch-current",
  sourceRowIds: ["row-eligible", "row-issue", "row-monthly", "row-tuesday"]
});
assert.equal(preview.eligibleCount, 1);
assert.equal(preview.excludedCount, 3);
assert.equal(preview.createsOperationalRoute, false);
assert.match(preview.excludedRows.find((row) => row.sourceRowId === "row-issue").reason, /datových kontrol/);
assert.match(preview.excludedRows.find((row) => row.sourceRowId === "row-tuesday").reason, /není plánovaná na pondělí/);

const created = await createCollectionDailyRouteDraft(env, dispatcher, {
  routeDate: "2026-07-13",
  vehicleCode: "A",
  sourceBatchId: "batch-current",
  sourceRowIds: ["row-eligible", "row-issue", "row-monthly", "row-tuesday"]
});
assert.equal(created.run.status, "draft");
assert.equal(created.run.stopCount, 1);
assert.equal(created.run.excludedCount, 3);
assert.equal(created.stops[0].customerName, "Test zákazník");
assert.equal(created.stops[0].frequency, "1x7");
assert.equal(created.stops[0].pickupDaysText, "pondělí lichá, pondělí sudá (dopočteno)");
assert.equal(created.stops[0].contractNumber, "KS-001");
await assert.rejects(
  createCollectionDailyRouteDraft(env, readonly, { routeDate: "2026-07-14", vehicleCode: "A", sourceRowIds: ["row-tuesday"] }),
  (error) => error.status === 403
);
await assert.rejects(
  createCollectionDailyRouteDraft(env, dispatcher, { routeDate: "2026-07-13", vehicleCode: "A", sourceRowIds: ["row-eligible"] }),
  (error) => error.code === "collection_daily_route_already_exists"
);

sqlite.prepare("UPDATE collection_import_rows SET summary_json = ? WHERE id = 'row-eligible'")
  .run(JSON.stringify(summary({ customerName: "Později změněný zákazník" })));
const immutable = await getCollectionDailyRoute(env, dispatcher, created.run.id);
assert.equal(immutable.stops[0].customerName, "Test zákazník");
assert.equal(immutable.stops[0].sourceSummary.customerName, "Test zákazník");

const assigned = await assignCollectionDailyRouteDriver(env, dispatcher, created.run.id, {
  driverUserId: driver.id,
  idempotencyKey: "assign-driver-1"
});
assert.equal(assigned.run.driverUserId, driver.id);
assert.equal(assigned.run.driverName, driver.name);
assert.equal(assigned.run.metadata.driverAddressingName, "Miroslave");

const confirmed = await transitionCollectionDailyRoute(env, dispatcher, created.run.id, {
  action: "confirm",
  idempotencyKey: "confirm-route-1"
});
assert.equal(confirmed.run.status, "confirmed");
assert.equal((await getMyCollectionDailyRoute(env, driver)).run.id, created.run.id);
const driverListResponse = await listDailyRoutesApi({
  request: await authenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes", driver),
  env
});
assert.equal(driverListResponse.status, 403);
const dispatcherListResponse = await listDailyRoutesApi({
  request: await authenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes", dispatcher),
  env
});
assert.equal(dispatcherListResponse.status, 200);
assert.equal((await dispatcherListResponse.json()).routes.length, 1);
const myRouteResponse = await myDailyRouteApi({
  request: await authenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes/my", driver),
  env
});
assert.equal(myRouteResponse.status, 200);
assert.equal((await myRouteResponse.json()).route.run.id, created.run.id);
await assert.rejects(
  getCollectionDailyRoute(env, otherDriver, created.run.id),
  (error) => error.status === 403
);

await assert.rejects(
  transitionCollectionDailyRoute(env, otherDriver, created.run.id, { action: "start" }),
  (error) => error.status === 403
);
const started = await transitionCollectionDailyRoute(env, driver, created.run.id, {
  action: "start",
  idempotencyKey: "start-route-1"
});
assert.equal(started.run.status, "active");
await assert.rejects(
  transitionCollectionDailyRoute(env, driver, created.run.id, { action: "complete" }),
  (error) => error.code === "collection_daily_route_stops_pending"
);

const breakStarted = await recordCollectionDailyRouteStopEvent(env, driver, created.run.id, created.stops[0].id, {
  action: "break",
  note: "Přestávka zahájena.",
  payload: { phase: "started" },
  idempotencyKey: "break-route-start-1"
});
assert.equal(breakStarted.events[0].eventType, "break");
assert.equal(breakStarted.events[0].payload.phase, "started");
const breakAfterRefresh = await getMyCollectionDailyRoute(env, driver);
assert.equal(breakAfterRefresh.events[0].payload.phase, "started");
const breakEnded = await recordCollectionDailyRouteStopEvent(env, driver, created.run.id, created.stops[0].id, {
  action: "break",
  note: "Přestávka ukončena.",
  payload: { phase: "ended" },
  idempotencyKey: "break-route-end-1"
});
assert.equal(breakEnded.events[0].payload.phase, "ended");
const done = await recordCollectionDailyRouteStopEvent(env, driver, created.run.id, created.stops[0].id, {
  action: "done",
  idempotencyKey: "done-stop-1"
});
assert.equal(done.stops[0].status, "done");
assert.equal(done.run.summary.doneCount, 1);

const completed = await transitionCollectionDailyRoute(env, driver, created.run.id, {
  action: "complete",
  idempotencyKey: "complete-route-1"
});
assert.equal(completed.run.status, "completed");
const reopened = await transitionCollectionDailyRoute(env, dispatcher, created.run.id, {
  action: "reopen",
  idempotencyKey: "reopen-route-1"
});
assert.equal(reopened.run.status, "active");
const reset = await recordCollectionDailyRouteStopEvent(env, dispatcher, created.run.id, created.stops[0].id, {
  action: "reset",
  idempotencyKey: "reset-stop-1"
});
assert.equal(reset.stops[0].status, "planned");
const problem = await recordCollectionDailyRouteStopEvent(env, driver, created.run.id, created.stops[0].id, {
  action: "problem",
  reason: "Nádoba není přístupná",
  note: "Zamčená brána",
  idempotencyKey: "problem-stop-1"
});
assert.equal(problem.stops[0].status, "problem");
assert.equal(problem.run.summary.problemCount, 1);
assert.equal((await transitionCollectionDailyRoute(env, driver, created.run.id, {
  action: "complete",
  idempotencyKey: "complete-route-2"
})).run.status, "completed");

const duplicatePreview = await previewCollectionDailyRoute(env, {
  routeDate: "2026-07-13",
  vehicleCode: "B",
  sourceRowIds: ["row-eligible"]
});
assert.equal(duplicatePreview.eligibleCount, 0);
assert.match(duplicatePreview.excludedRows[0].reason, /jiné trase/);

const routes = await listCollectionDailyRoutes(env, { limit: 10 }, dispatcher);
assert.equal(routes.length, 1);
assert.equal(routes[0].summary.problemCount, 1);
assert.ok((await getCollectionDailyRoute(env, driver, created.run.id)).events.length >= 9);

const fieldSqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql",
  "../migrations/test/0001_create_collection_routes_test_control.sql",
  "../migrations/test/0002_create_collection_route_here_optimization.sql",
  "../migrations/test/0003_configure_collection_route_test_operations_and_gps.sql"
]) {
  fieldSqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}
fieldSqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count,
    created_by_user_id, created_at, finished_at, metadata_json
  ) VALUES (
    'field-batch', 'synthetic-test', 'synthetic-brno-test', 'preview', 'ready', 'field test', 2, 0,
    'tomas-manager', '2026-07-13T08:00:00.000Z', '2026-07-13T08:00:00.000Z', '{}'
  )
`).run();
fieldSqlite.prepare(`
  INSERT INTO collection_route_test_datasets (
    id, dataset_key, name, status, source_batch_id, seed, company_count, site_count,
    address_source, metadata_json, created_by_user_id, created_by_name, created_at, updated_at
  ) VALUES (
    'field-dataset', 'brno-500-v2', 'TEST Brno 501', 'ready', 'field-batch', 20260711, 2, 2,
    'TEST', '{}', 'tomas-manager', 'Tomáš Test', '2026-07-13T08:00:00.000Z', '2026-07-13T08:00:00.000Z'
  )
`).run();
const fieldSummary = summary({
  sourceId: COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID,
  customerName: "Firma test 501",
  stationName: "Firma test 501 · stanoviště Trnkova",
  siteName: "Firma test 501 · stanoviště Trnkova",
  addressRaw: "Trnkova 3052/137, 628 00 Brno",
  addressPlaceRaw: "Trnkova 3052/137, 628 00 Brno",
  pickupDaysText: "středa lichá, středa sudá",
  containerVolume: 120,
  latitude: 49.19125931950087,
  longitude: 16.670211574110382
});
fieldSqlite.prepare(`
  INSERT INTO collection_import_rows (
    id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
  ) VALUES ('field-row', 'field-batch', 501, 'synthetic-field-test-site', ?, 'preview', ?, '[]', CURRENT_TIMESTAMP)
`).run(COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID, JSON.stringify(fieldSummary));
fieldSqlite.prepare(`
  INSERT INTO collection_import_rows (
    id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
  ) VALUES ('decoy-row', 'field-batch', 1, 'synthetic-test-site', 'decoy-site', 'preview', ?, '[]', CURRENT_TIMESTAMP)
`).run(JSON.stringify(summary({
  sourceId: "decoy-site",
  customerName: "Nesmí se zařadit",
  pickupDaysText: "úterý lichá, úterý sudá"
})));

const tomasManager = {
  id: "tomas-manager",
  name: "Tomáš Test",
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
const fieldEnv = {
  COLLECTION_ROUTES_TEST_DB: new D1Database(fieldSqlite),
  AUTH_USERS_JSON: JSON.stringify([tomasManager, otherManager])
};
const fieldPreview = await previewCollectionDailyRoute(fieldEnv, tomasManager, {
  scope: "test",
  testMode: COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  routeDate: "2026-07-14",
  vehicleCode: "A",
  sourceRowIds: ["decoy-row"]
});
assert.equal(fieldPreview.testMode, COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD);
assert.equal(fieldPreview.vehicle.code, "FIELD");
assert.equal(fieldPreview.scheduleBypassed, true);
assert.equal(fieldPreview.selectedCount, 1);
assert.equal(fieldPreview.eligibleCount, 1);
assert.equal(fieldPreview.eligibleRows[0].sourceRowId, "field-row");
assert.equal(fieldPreview.eligibleRows[0].customerName, "Firma test 501");

const fieldRoute = await createCollectionDailyRouteDraft(fieldEnv, tomasManager, {
  scope: "test",
  testMode: COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  routeDate: "2026-07-14",
  vehicleCode: "FIELD",
  sourceBatchId: "field-batch",
  sourceRowIds: ["decoy-row"]
});
assert.equal(fieldRoute.run.vehicleCode, "FIELD");
assert.equal(fieldRoute.run.driverUserId, "");
assert.equal(fieldRoute.run.metadata.fieldTesterUserId, tomasManager.id);
assert.equal(fieldRoute.run.metadata.fieldTesterName, tomasManager.name);
assert.equal(fieldRoute.run.metadata.fieldTesterRole, "management");
assert.equal(fieldRoute.run.metadata.scheduleBypassedForPhysicalTest, true);
assert.equal(fieldRoute.run.metadata.sendsNotifications, false);
assert.equal(fieldRoute.stops.length, 1);
assert.equal(fieldRoute.stops[0].customerName, "Firma test 501");
assert.match(fieldRoute.stops[0].addressText, /Trnkova 3052\/137/);
await assert.rejects(
  assignCollectionDailyRouteDriver(fieldEnv, tomasManager, fieldRoute.run.id, { scope: "test", driverUserId: "driver-1" }),
  (error) => error.code === "collection_daily_route_field_test_driver_forbidden"
);
const fieldConfirmed = await transitionCollectionDailyRoute(fieldEnv, otherManager, fieldRoute.run.id, {
  scope: "test",
  action: "confirm",
  idempotencyKey: "field-confirm"
});
assert.equal(fieldConfirmed.run.status, "confirmed");
assert.equal(fieldConfirmed.run.driverUserId, "");
const fieldStarted = await transitionCollectionDailyRoute(fieldEnv, tomasManager, fieldRoute.run.id, {
  scope: "test",
  action: "start",
  idempotencyKey: "field-start"
});
assert.equal(fieldStarted.run.status, "active");
await assert.rejects(
  transitionCollectionDailyRoute(fieldEnv, tomasManager, fieldRoute.run.id, {
    scope: "test",
    action: "complete",
    idempotencyKey: "field-complete-without-gps"
  }),
  (error) => error.code === "collection_daily_route_test_gps_required"
);
const fieldGpsNeedsReview = await confirmCollectionRoutesTestGps(fieldEnv, tomasManager, {
  runId: fieldRoute.run.id,
  stopId: fieldRoute.stops[0].id,
  latitude: fieldSummary.latitude,
  longitude: fieldSummary.longitude,
  accuracyMeters: 22,
  sampleCount: 3,
  speedMps: 0,
  capturedAt: new Date().toISOString(),
  idempotencyKey: "field-gps-needs-review"
});
assert.equal(fieldGpsNeedsReview.confirmation.status, "needs-review");
assert.equal(fieldGpsNeedsReview.confirmation.routingCandidate, false);
const fieldCompletedWithReview = await transitionCollectionDailyRoute(fieldEnv, tomasManager, fieldRoute.run.id, {
  scope: "test",
  action: "complete",
  idempotencyKey: "field-complete-with-gps-review"
});
assert.equal(fieldCompletedWithReview.run.status, "completed");
assert.equal(fieldCompletedWithReview.run.summary.plannedCount, 0);
assert.equal(fieldCompletedWithReview.run.summary.doneCount, 1);
assert.equal(fieldCompletedWithReview.stops[0].status, "done");
assert.equal(
  fieldSqlite.prepare("SELECT status FROM collection_route_test_gps_confirmations WHERE id = ?")
    .get(fieldGpsNeedsReview.confirmation.id).status,
  "needs-review"
);
assert.equal(
  fieldSqlite.prepare("SELECT routing_candidate FROM collection_route_test_gps_confirmations WHERE id = ?")
    .get(fieldGpsNeedsReview.confirmation.id).routing_candidate,
  0
);
assert.equal(
  fieldSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE run_id = ? AND event_type = 'done'")
    .get(fieldRoute.run.id).count,
  1
);
assert.equal((await transitionCollectionDailyRoute(fieldEnv, tomasManager, fieldRoute.run.id, {
  scope: "test",
  action: "complete",
  idempotencyKey: "field-complete-with-gps-review"
})).run.status, "completed");
const fieldReopened = await transitionCollectionDailyRoute(fieldEnv, otherManager, fieldRoute.run.id, {
  scope: "test",
  action: "reopen",
  idempotencyKey: "field-reopen-other-manager"
});
assert.equal(fieldReopened.run.status, "active");
assert.equal(fieldReopened.run.summary.plannedCount, 1);
assert.equal(fieldReopened.run.summary.doneCount, 0);
assert.equal(fieldReopened.stops[0].status, "planned");
assert.equal(
  fieldSqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_gps_confirmations WHERE id = ?")
    .get(fieldGpsNeedsReview.confirmation.id).count,
  1
);
assert.equal(
  fieldSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE run_id = ? AND event_type = 'stop_reopened'")
    .get(fieldRoute.run.id).count,
  1
);
const fieldCompletedAgain = await transitionCollectionDailyRoute(fieldEnv, tomasManager, fieldRoute.run.id, {
  scope: "test",
  action: "complete",
  idempotencyKey: "field-complete-again"
});
assert.equal(fieldCompletedAgain.run.status, "completed");
const fieldPrepared = await transitionCollectionDailyRoute(fieldEnv, otherManager, fieldRoute.run.id, {
  scope: "test",
  action: "prepare",
  idempotencyKey: "field-prepare-other-manager"
});
assert.equal(fieldPrepared.run.status, "confirmed");
assert.equal(fieldPrepared.run.summary.plannedCount, 1);
assert.equal(fieldPrepared.run.summary.doneCount, 0);
assert.equal(fieldPrepared.stops[0].status, "planned");
assert.equal(
  fieldSqlite.prepare("SELECT actor_user_id FROM collection_daily_route_events WHERE run_id = ? AND event_type = 'route_test_prepared'")
    .get(fieldRoute.run.id).actor_user_id,
  otherManager.id
);
await assert.rejects(
  transitionCollectionDailyRoute(env, dispatcher, completed.run.id, {
    action: "prepare",
    idempotencyKey: "production-prepare-forbidden"
  }),
  (error) => error.code === "collection_daily_route_prepare_invalid"
);

const accurateFieldRoute = await createCollectionDailyRouteDraft(fieldEnv, tomasManager, {
  scope: "test",
  testMode: COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  routeDate: "2026-07-15",
  vehicleCode: "FIELD",
  sourceBatchId: "field-batch"
});
await transitionCollectionDailyRoute(fieldEnv, tomasManager, accurateFieldRoute.run.id, {
  scope: "test",
  action: "confirm",
  idempotencyKey: "accurate-field-confirm"
});
await transitionCollectionDailyRoute(fieldEnv, tomasManager, accurateFieldRoute.run.id, {
  scope: "test",
  action: "start",
  idempotencyKey: "accurate-field-start"
});
const accurateFieldGps = await confirmCollectionRoutesTestGps(fieldEnv, tomasManager, {
  runId: accurateFieldRoute.run.id,
  stopId: accurateFieldRoute.stops[0].id,
  latitude: fieldSummary.latitude,
  longitude: fieldSummary.longitude,
  accuracyMeters: 10,
  sampleCount: 4,
  speedMps: 0,
  capturedAt: new Date().toISOString(),
  idempotencyKey: "accurate-field-gps"
});
assert.equal(accurateFieldGps.confirmation.status, "field-tester-measured");
assert.equal(accurateFieldGps.confirmation.routingCandidate, true);
const accurateFieldCompleted = await transitionCollectionDailyRoute(fieldEnv, tomasManager, accurateFieldRoute.run.id, {
  scope: "test",
  action: "complete",
  idempotencyKey: "accurate-field-complete"
});
assert.equal(accurateFieldCompleted.run.status, "completed");
assert.equal(accurateFieldCompleted.stops[0].status, "done");
await assert.rejects(
  previewCollectionRoutesTestNotifications(fieldEnv, tomasManager, { runId: fieldRoute.run.id }),
  (error) => error.code === "collection_routes_test_notification_stationary_field_forbidden"
);

const isolatedTestSqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0001_create_users.sql",
  "../migrations/0002_add_user_manager.sql",
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql",
  "../migrations/test/0002_create_collection_route_here_optimization.sql",
  "../migrations/test/0003_configure_collection_route_test_operations_and_gps.sql"
]) {
  isolatedTestSqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}
isolatedTestSqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count,
    created_by_user_id, created_at, finished_at, metadata_json
  ) VALUES (
    'collection-import-batch-test-brno-500-v2', 'synthetic-test', 'synthetic-brno-test',
    'preview', 'ready', 'TEST Brno 501', 501, 0,
    'seed', '2026-07-17T07:00:00.000Z', '2026-07-17T07:00:00.000Z', '{}'
  )
`).run();
isolatedTestSqlite.prepare(`
  INSERT INTO collection_import_rows (
    id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
  ) VALUES (
    'collection-import-row-test-brno-v2-0501',
    'collection-import-batch-test-brno-500-v2',
    501,
    'synthetic-field-test-site',
    'test-field-site-501',
    'preview',
    ?,
    '[]',
    '2026-07-17T07:00:00.000Z'
  )
`).run(JSON.stringify({
  sourceId: "test-field-site-501",
  sourceContractId: "test-contract-field-501",
  contractNumber: "TEST-501",
  customerName: "Firma test 501",
  addressPlaceRaw: "Trnkova 3052/137, 628 00 Brno",
  stationName: "Firma test 501 · stanoviště Trnkova",
  wasteType: "SKO",
  wasteCode: "200301",
  containerVolume: 120,
  containerCount: 1,
  containerType: "nádoba",
  frequency: "1x7",
  pickupDaysText: "středa lichá, středa sudá"
}));
const isolatedSeedSql = readFileSync(
  new URL("../migrations/test/0007_seed_driver_tablet_test_miroslav_vasek.sql", import.meta.url),
  "utf8"
);
isolatedTestSqlite.exec(isolatedSeedSql);
isolatedTestSqlite.exec(isolatedSeedSql);

const isolatedProductionSqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0001_create_users.sql",
  "../migrations/0002_add_user_manager.sql",
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0038_create_collection_daily_routes.sql"
]) {
  isolatedProductionSqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}
const miroslav = {
  id: "pneumatiky-miroslav-vasek",
  name: "Miroslav Vašek",
  role: "ridic",
  status: "active",
  active: true
};
const foreignDriver = {
  id: "pneumatika-cizi-ridic",
  name: "Cizí řidič",
  role: "ridic",
  status: "active",
  active: true
};
const isolatedManager = {
  id: "management-isolated-test",
  name: "Management TEST",
  role: "management",
  status: "active",
  active: true
};
const isolatedAdmin = {
  id: "admin-isolated-test",
  name: "Admin TEST",
  role: "admin",
  status: "active",
  active: true
};
const isolatedEnv = {
  SMART_ODPADY_DB: new D1Database(isolatedProductionSqlite),
  COLLECTION_ROUTES_TEST_DB: new D1Database(isolatedTestSqlite),
  SMART_ODPADY_DOCUMENTS: new FakeR2Bucket(),
  AUTH_USERS_JSON: JSON.stringify([miroslav, foreignDriver, isolatedManager, isolatedAdmin]),
  AUTH_SESSION_SECRET: "isolated-driver-tablet-test-session-secret"
};
const seededRunId = "collection-daily-route-test-tablet-miroslav-vasek-20260717";
const seededStopId = "collection-daily-stop-test-tablet-miroslav-vasek-501";

assert.equal(isolatedTestSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 1);
assert.equal(isolatedTestSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_stops").get().count, 1);
assert.equal(isolatedTestSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events").get().count, 1);
const seededRunRow = isolatedTestSqlite.prepare("SELECT * FROM collection_daily_route_runs WHERE id = ?").get(seededRunId);
const seededMetadata = JSON.parse(seededRunRow.metadata_json);
assert.equal(seededRunRow.driver_user_id, miroslav.id);
assert.equal(seededRunRow.driver_name, miroslav.name);
assert.equal(seededRunRow.status, "confirmed");
assert.equal(seededMetadata.dataScope, "test");
assert.equal(seededMetadata.physicalTesterName, "Tomáš Gaží");
assert.equal(seededMetadata.externalEffectsDisabled, true);
assert.equal(seededMetadata.notificationsDisabled, true);
assert.equal(seededMetadata.vistosWritesDisabled, true);
assert.equal(seededMetadata.productionRouteWritesDisabled, true);
assert.equal(collectionDailyRouteExternalEffectsDisabled({ metadata_json: seededRunRow.metadata_json }), true);
assert.equal(seededRunRow.created_by_name, miroslav.name);
assert.equal(seededRunRow.confirmed_by_name, miroslav.name);
assert.equal(isolatedTestSqlite.prepare("SELECT actor_user_id FROM collection_daily_route_events WHERE run_id = ?").get(seededRunId).actor_user_id, miroslav.id);
assert.equal(isolatedTestSqlite.prepare("SELECT actor_name FROM collection_daily_route_events WHERE run_id = ?").get(seededRunId).actor_name, miroslav.name);
assert.equal(isolatedTestSqlite.prepare("SELECT customer_name FROM collection_daily_route_stops WHERE id = ?").get(seededStopId).customer_name, "Firma test 501");
assert.equal(isolatedTestSqlite.prepare("SELECT address_text FROM collection_daily_route_stops WHERE id = ?").get(seededStopId).address_text, "Trnkova 3052/137, 628 00 Brno");

const myIsolatedTest = await getMyCollectionDailyRoute(isolatedEnv, miroslav, { scope: "test" });
assert.equal(myIsolatedTest.run.id, seededRunId);
assert.equal(myIsolatedTest.stops.length, 1);
assert.equal(myIsolatedTest.driverMap.totalStopCount, 1);
assert.equal(myIsolatedTest.driverMap.mappedStopCount, 1);
assert.equal(myIsolatedTest.driverMap.points[0].current, true);
assert.equal(myIsolatedTest.driverMap.ordering.mode, "current-order");
assert.equal(await getMyCollectionDailyRoute(isolatedEnv, miroslav), null, "Produkční scope nesmí vrátit TEST záznam.");
assert.equal(await getMyCollectionDailyRoute(isolatedEnv, foreignDriver, { scope: "test" }), null);
await assert.rejects(
  getCollectionDailyRoute(isolatedEnv, foreignDriver, seededRunId, { scope: "test" }),
  (error) => error.status === 404 && error.code === "collection_daily_route_not_found"
);
await assert.rejects(
  transitionCollectionDailyRoute(isolatedEnv, foreignDriver, seededRunId, { scope: "test", action: "start" }),
  (error) => error.status === 404 && error.code === "collection_daily_route_not_found"
);
await assert.rejects(
  listCollectionDailyRoutes(isolatedEnv, { scope: "test" }, miroslav),
  (error) => error.status === 403
);
assert.equal((await listCollectionDailyRoutes(isolatedEnv, { scope: "test" }, isolatedManager)).length, 1);

async function isolatedAuthenticatedRequest(url, user, init = {}) {
  const cookie = (await createSessionCookie(isolatedEnv, user)).split(";")[0];
  const headers = new Headers(init.headers || {});
  headers.set("Cookie", cookie);
  return new Request(url, { ...init, headers });
}

const originalRouteMapFetch = globalThis.fetch;
let routeMapProviderCalls = 0;
globalThis.fetch = async (url) => {
  routeMapProviderCalls += 1;
  assert.equal(new URL(url).hostname, "image.maps.hereapi.com");
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { "Content-Type": "image/png" }
  });
};
try {
  const mapEnv = { ...isolatedEnv, HERE_MAPS_API_KEY: "server-only-test-key" };
  const ownMapResponse = await driverRouteMapApi({
    request: await isolatedAuthenticatedRequest(
      `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/map?scope=test`,
      miroslav
    ),
    env: mapEnv,
    params: { runId: seededRunId }
  });
  assert.equal(ownMapResponse.status, 200);
  assert.equal(ownMapResponse.headers.get("Content-Type"), "image/png");
  assert.equal(routeMapProviderCalls, 1);

  for (const privilegedUser of [isolatedManager, isolatedAdmin]) {
    const privilegedMapResponse = await driverRouteMapApi({
      request: await isolatedAuthenticatedRequest(
        `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/map?scope=test`,
        privilegedUser
      ),
      env: mapEnv,
      params: { runId: seededRunId }
    });
    assert.equal(privilegedMapResponse.status, 200, `${privilegedUser.role} musí zachovat správu TEST mapy.`);
  }
  assert.equal(routeMapProviderCalls, 3);

  const foreignMapResponse = await driverRouteMapApi({
    request: await isolatedAuthenticatedRequest(
      `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/map?scope=test`,
      foreignDriver
    ),
    env: mapEnv,
    params: { runId: seededRunId }
  });
  assert.equal(foreignMapResponse.status, 404, "Cizí řidič nesmí zjistit ani existenci TEST mapy.");
  assert.equal(routeMapProviderCalls, 3, "Cizí řidič nesmí vyvolat HERE požadavek pro cizí trasu.");

  const productionScopeMapResponse = await driverRouteMapApi({
    request: await isolatedAuthenticatedRequest(
      `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/map`,
      miroslav
    ),
    env: mapEnv,
    params: { runId: seededRunId }
  });
  assert.equal(productionScopeMapResponse.status, 404, "Produkční scope nesmí načíst TEST mapu.");
  assert.equal(routeMapProviderCalls, 3);

  const anonymousMapResponse = await driverRouteMapApi({
    request: new Request(`https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/map?scope=test`),
    env: mapEnv,
    params: { runId: seededRunId }
  });
  assert.equal(anonymousMapResponse.status, 401);
  assert.equal(routeMapProviderCalls, 3);
} finally {
  globalThis.fetch = originalRouteMapFetch;
}

const miroslavTestApiResponse = await myDailyRouteApi({
  request: await isolatedAuthenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes/my?scope=test", miroslav),
  env: isolatedEnv
});
assert.equal(miroslavTestApiResponse.status, 200);
assert.equal((await miroslavTestApiResponse.json()).route.run.id, seededRunId);
const miroslavProductionApiResponse = await myDailyRouteApi({
  request: await isolatedAuthenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes/my", miroslav),
  env: isolatedEnv
});
assert.equal(miroslavProductionApiResponse.status, 200);
assert.equal((await miroslavProductionApiResponse.json()).route, null);
const foreignDriverTestApiResponse = await myDailyRouteApi({
  request: await isolatedAuthenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes/my?scope=test", foreignDriver),
  env: isolatedEnv
});
assert.equal(foreignDriverTestApiResponse.status, 200);
assert.equal((await foreignDriverTestApiResponse.json()).route, null);
const foreignDriverListResponse = await listDailyRoutesApi({
  request: await isolatedAuthenticatedRequest("https://smart-odpady.ai/api/collection-routes/daily-routes?scope=test", foreignDriver),
  env: isolatedEnv
});
assert.equal(foreignDriverListResponse.status, 403);

const navigationRequests = [];
const navigationFetch = async (url) => {
  navigationRequests.push(new URL(url));
  assert.equal(new URL(url).hostname, "router.hereapi.com");
  assert.equal(new URL(url).searchParams.get("transportMode"), "truck");
  assert.equal(new URL(url).searchParams.get("return"), "polyline,summary,actions,instructions");
  return new Response(JSON.stringify({
    routes: [{
      sections: [{
        polyline: "BFoz5xJ67i1B1B7PzIhaxL7Y",
        summary: { length: 1250, duration: 240 },
        turnByTurnActions: [{ action: "turn", direction: "right", instruction: "Odboč vpravo.", offset: 0, length: 140, duration: 30 }]
      }]
    }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const navigationEnv = { ...isolatedEnv, HERE_MAPS_API_KEY: "server-only-test-key", __HERE_ROUTING_FETCH: navigationFetch };
const ownNavigationResponse = await driverRouteNavigationApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/navigation?scope=test&fromPointId=depot&toPointId=${seededStopId}`,
    miroslav
  ),
  env: navigationEnv,
  params: { runId: seededRunId }
});
assert.equal(ownNavigationResponse.status, 200);
const ownNavigation = await ownNavigationResponse.json();
assert.equal(ownNavigation.navigation.provider, "here-routing-v8");
assert.equal(ownNavigation.navigation.mode, "truck");
assert.equal(ownNavigation.navigation.summary.lengthMeters, 1250);
assert.ok(ownNavigation.navigation.points.length >= 2);
assert.equal(ownNavigation.navigation.maneuvers[0].instruction, "Odboč vpravo.");
const liveNavigationResponse = await driverRouteNavigationApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/navigation?scope=test&fromPointId=live-position&toPointId=${seededStopId}&originLatitude=49.1901&originLongitude=16.6681`,
    miroslav
  ),
  env: navigationEnv,
  params: { runId: seededRunId }
});
assert.equal(liveNavigationResponse.status, 200);
assert.equal(navigationRequests.at(-1).searchParams.get("origin"), "49.1901,16.6681");
const foreignNavigationResponse = await driverRouteNavigationApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/navigation?scope=test&fromPointId=depot&toPointId=${seededStopId}`,
    foreignDriver
  ),
  env: navigationEnv,
  params: { runId: seededRunId }
});
assert.equal(foreignNavigationResponse.status, 404, "Cizí řidič nesmí získat ani geometrii cizí TEST trasy.");
const productionNavigationResponse = await driverRouteNavigationApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/navigation?fromPointId=depot&toPointId=${seededStopId}`,
    miroslav
  ),
  env: navigationEnv,
  params: { runId: seededRunId }
});
assert.equal(productionNavigationResponse.status, 404, "Produkční scope nesmí vrátit geometrii TEST trasy.");

await transitionCollectionDailyRoute(isolatedEnv, miroslav, seededRunId, {
  scope: "test",
  action: "start",
  idempotencyKey: "miroslav-isolated-test-start"
});
const miroslavGps = await confirmCollectionRoutesTestGps(isolatedEnv, miroslav, {
  runId: seededRunId,
  stopId: seededStopId,
  latitude: 49.19126,
  longitude: 16.67021,
  accuracyMeters: 7,
  sampleCount: 4,
  speedMps: 0,
  capturedAt: new Date().toISOString(),
  idempotencyKey: "miroslav-own-gps"
});
assert.equal(miroslavGps.confirmation.createdByUserId, miroslav.id);
assert.equal((await listCollectionRoutesTestGpsConfirmations(isolatedEnv, miroslav, { runId: seededRunId })).confirmations.length, 1);
const ownGpsApiResponse = await testGpsListApi({
  request: await isolatedAuthenticatedRequest(`https://smart-odpady.ai/api/collection-routes/test-gps-confirmations?runId=${seededRunId}`, miroslav),
  env: isolatedEnv
});
assert.equal(ownGpsApiResponse.status, 200);
assert.equal((await ownGpsApiResponse.json()).confirmations.length, 1);
const foreignGpsApiResponse = await testGpsListApi({
  request: await isolatedAuthenticatedRequest(`https://smart-odpady.ai/api/collection-routes/test-gps-confirmations?runId=${seededRunId}`, foreignDriver),
  env: isolatedEnv
});
assert.equal(foreignGpsApiResponse.status, 404);
await assert.rejects(
  listCollectionRoutesTestGpsConfirmations(isolatedEnv, foreignDriver, { runId: seededRunId }),
  (error) => error?.status === 404,
  "Cizí řidič nesmí získat ani GPS metadata cizí TEST trasy."
);
await assert.rejects(
  confirmCollectionRoutesTestGps(isolatedEnv, foreignDriver, {
    runId: seededRunId,
    stopId: seededStopId,
    latitude: 49.19126,
    longitude: 16.67021,
    accuracyMeters: 7,
    sampleCount: 4,
    speedMps: 0,
    capturedAt: new Date().toISOString(),
    idempotencyKey: "foreign-driver-gps"
  }),
  (error) => error?.status === 404,
  "Cizí řidič nesmí uložit GPS do cizí TEST trasy."
);
const breakApiResponse = await stopEventApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/stops/${seededStopId}/events`,
    miroslav,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "test",
        action: "break",
        payload: { phase: "started" },
        idempotencyKey: "miroslav-isolated-test-break-start"
      })
    }
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, stopId: seededStopId }
});
assert.equal(breakApiResponse.status, 200);
await recordCollectionDailyRouteStopEvent(isolatedEnv, miroslav, seededRunId, seededStopId, {
  scope: "test",
  action: "break",
  payload: { phase: "ended" },
  idempotencyKey: "miroslav-isolated-test-break-end"
});
const dumpStarted = await recordCollectionDailyRouteStopEvent(isolatedEnv, miroslav, seededRunId, seededStopId, {
  scope: "test",
  action: "dump",
  payload: { phase: "started", destinationId: "sako-brno" },
  idempotencyKey: "miroslav-isolated-test-dump-start"
});
assert.equal(dumpStarted.events.find((event) => event.idempotencyKey === "miroslav-isolated-test-dump-start").payload.destination.name, "SAKO Brno");
await recordCollectionDailyRouteStopEvent(isolatedEnv, miroslav, seededRunId, seededStopId, {
  scope: "test",
  action: "dump",
  payload: { phase: "ended" },
  idempotencyKey: "miroslav-isolated-test-dump-end"
});

function reportForm(idempotencyKey, photoCount = 1) {
  const form = new FormData();
  form.set("scope", "test");
  form.set("type", "overfilled_container");
  form.set("note", "Izolované TEST hlášení s fotografií");
  form.set("idempotencyKey", idempotencyKey);
  for (let index = 0; index < photoCount; index += 1) {
    form.append("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9, index])], { type: "image/jpeg" }), `hlaseni-${index + 1}.jpg`);
  }
  return form;
}
const foreignReportResponse = await driverReportApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/stops/${seededStopId}/report`,
    foreignDriver,
    { method: "POST", body: reportForm("foreign-report") }
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, stopId: seededStopId }
});
assert.equal(foreignReportResponse.status, 404, "Cizí řidič nesmí zapsat ani odvodit cizí TEST hlášení.");
assert.equal(isolatedEnv.SMART_ODPADY_DOCUMENTS.objects.size, 0);
const productionScopeReportResponse = await driverReportApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/stops/${seededStopId}/report`,
    miroslav,
    { method: "POST", body: (() => {
      const form = reportForm("production-scope-report");
      form.delete("scope");
      return form;
    })() }
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, stopId: seededStopId }
});
assert.equal(productionScopeReportResponse.status, 404, "Produkční scope nesmí přijmout hlášení pro TEST trasu.");
assert.equal(isolatedEnv.SMART_ODPADY_DOCUMENTS.objects.size, 0);
const reportWithoutPhotoResponse = await driverReportApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/stops/${seededStopId}/report`,
    miroslav,
    { method: "POST", body: reportForm("miroslav-isolated-test-report-without-photo", 0) }
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, stopId: seededStopId }
});
assert.equal(reportWithoutPhotoResponse.status, 400, "Řidič nesmí uložit hlášení bez fotografie.");
const reportWithoutPhoto = await reportWithoutPhotoResponse.json();
assert.equal(reportWithoutPhoto.code, "collection_daily_route_report_photo_required");
assert.equal(isolatedEnv.SMART_ODPADY_DOCUMENTS.objects.size, 0);
const reportResponse = await driverReportApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai/api/collection-routes/daily-routes/${seededRunId}/stops/${seededStopId}/report`,
    miroslav,
    { method: "POST", body: reportForm("miroslav-isolated-test-report", 2) }
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, stopId: seededStopId }
});
assert.equal(reportResponse.status, 201);
const reportResult = await reportResponse.json();
assert.equal(reportResult.report.actorUserId, miroslav.id);
assert.equal(reportResult.report.actorName, miroslav.name);
assert.equal(reportResult.report.payload.sendsNotifications, false);
assert.equal(reportResult.report.payload.changesVistos, false);
assert.equal(reportResult.report.payload.photoCount, 2);
assert.equal(reportResult.report.payload.photos.length, 2);
assert.equal(reportResult.sendsNotifications, false);
assert.equal(reportResult.writesVistos, false);
assert.equal(isolatedEnv.SMART_ODPADY_DOCUMENTS.objects.size, 2);
const ownPhotoResponse = await driverReportPhotoApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai${reportResult.report.payload.photoUrl}`,
    miroslav
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, reportId: reportResult.report.id }
});
assert.equal(ownPhotoResponse.status, 200);
assert.equal(ownPhotoResponse.headers.get("Content-Type"), "image/jpeg");
const secondPhotoResponse = await driverReportPhotoApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai${reportResult.report.payload.photos[1].url}`,
    miroslav
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, reportId: reportResult.report.id }
});
assert.equal(secondPhotoResponse.status, 200);
const foreignPhotoResponse = await driverReportPhotoApi({
  request: await isolatedAuthenticatedRequest(
    `https://smart-odpady.ai${reportResult.report.payload.photoUrl}`,
    foreignDriver
  ),
  env: isolatedEnv,
  params: { runId: seededRunId, reportId: reportResult.report.id }
});
assert.equal(foreignPhotoResponse.status, 404, "Cizí řidič nesmí načíst fotografii hlášení.");
await recordCollectionDailyRouteStopEvent(isolatedEnv, miroslav, seededRunId, seededStopId, {
  scope: "test",
  action: "done",
  idempotencyKey: "miroslav-isolated-test-done"
});
const completedIsolatedTest = await transitionCollectionDailyRoute(isolatedEnv, miroslav, seededRunId, {
  scope: "test",
  action: "complete",
  idempotencyKey: "miroslav-isolated-test-complete"
});
assert.equal(completedIsolatedTest.run.status, "completed");
assert.ok(completedIsolatedTest.events.every((event) => event.actorUserId === miroslav.id));
assert.ok(completedIsolatedTest.events.every((event) => event.actorName === miroslav.name));
for (const [eventType, count] of [["break", 2], ["dump", 2], ["problem", 1], ["done", 1]]) {
  assert.equal(
    isolatedTestSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE run_id = ? AND event_type = ?").get(seededRunId, eventType).count,
    count,
    `Izolovaný TEST musí auditovat akci ${eventType}.`
  );
}
assert.equal(isolatedProductionSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 0);
assert.equal(isolatedProductionSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events").get().count, 0);
await assert.rejects(
  previewCollectionRoutesTestNotifications(isolatedEnv, isolatedManager, { runId: seededRunId }),
  (error) => error.code === "collection_routes_test_notification_stationary_field_forbidden"
);
const incidentWorkflowSource = readFileSync(
  new URL("../functions/_lib/collection-routes-test-incident-workflow.js", import.meta.url),
  "utf8"
);
assert.ok(incidentWorkflowSource.includes("collectionDailyRouteExternalEffectsDisabled"));
assert.ok(incidentWorkflowSource.includes("collection_routes_test_incident_workflow_notifications_disabled"));

console.log("collection daily routes tests: ok");
