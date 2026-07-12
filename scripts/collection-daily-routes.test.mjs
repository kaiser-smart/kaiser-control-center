import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/_lib/auth.js";
import { onRequestGet as listDailyRoutesApi } from "../functions/api/collection-routes/daily-routes.js";
import { onRequestGet as myDailyRouteApi } from "../functions/api/collection-routes/daily-routes/my.js";
import {
  __collectionDailyRouteEligibilityForTest,
  __collectionDailyRoutePickupScheduleForTest,
  assignCollectionDailyRouteDriver,
  collectionDailyRouteDateInfo,
  createCollectionDailyRouteDraft,
  getCollectionDailyRoute,
  getMyCollectionDailyRoute,
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
const driver = { id: "driver-1", name: "Řidič Test", role: "ridic", status: "active", active: true };
const otherDriver = { id: "driver-2", name: "Jiný řidič", role: "ridic", status: "active", active: true };
const readonly = { id: "readonly-1", name: "Readonly Test", role: "readonly", status: "active", active: true };
const env = {
  SMART_ODPADY_DB: new D1Database(sqlite),
  AUTH_USERS_JSON: JSON.stringify([dispatcher, driver, otherDriver, readonly]),
  AUTH_SESSION_SECRET: "collection-daily-routes-test-session-secret"
};

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

await recordCollectionDailyRouteStopEvent(env, driver, created.run.id, created.stops[0].id, {
  action: "break",
  note: "Pauza 15 minut",
  idempotencyKey: "break-route-1"
});
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

const routes = await listCollectionDailyRoutes(env, { limit: 10 });
assert.equal(routes.length, 1);
assert.equal(routes[0].summary.problemCount, 1);
assert.ok((await getCollectionDailyRoute(env, driver, created.run.id)).events.length >= 9);

console.log("collection daily routes tests: ok");
