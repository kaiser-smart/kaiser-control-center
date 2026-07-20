import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  getCollectionDailyRouteTabletTestContext,
  getCollectionDailyRouteTabletTestLauncher,
  resetCollectionDailyRouteTabletTestSession,
  startCollectionDailyRouteTabletTestSession
} from "../functions/_lib/collection-daily-routes-store.js";
import { buildCollectionRoutesSarlotaContext } from "../functions/_lib/collection-routes-sarlota-context.js";

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
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function createRoutesDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0001_create_users.sql",
    "../migrations/0002_add_user_manager.sql",
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql",
    "../migrations/test/0002_create_collection_route_here_optimization.sql",
    "../migrations/test/0003_configure_collection_route_test_operations_and_gps.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return sqlite;
}

const testSqlite = createRoutesDb();
const productionSqlite = createRoutesDb();
testSqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count,
    created_by_user_id, created_at, finished_at, metadata_json
  ) VALUES ('tablet-batch', 'synthetic', 'synthetic-brno-test', 'preview', 'ready', 'test', 1, 0,
    'radim-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '{}')
`).run();
testSqlite.prepare(`
  INSERT INTO collection_import_rows (
    id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
  ) VALUES ('tablet-row', 'tablet-batch', 1, 'test-site', 'tablet-site', 'preview', '{}', '[]', CURRENT_TIMESTAMP)
`).run();
testSqlite.prepare(`
  INSERT INTO collection_daily_route_runs (
    id, route_key, source_batch_id, source_mode, route_date, route_day_code, route_week_mode,
    vehicle_code, vehicle_registration, vehicle_label, driver_user_id, driver_name,
    title, status, stop_count, metadata_json, created_by_user_id, created_by_name
  ) VALUES (
    'tablet-route-miroslav', 'tablet-route-key', 'tablet-batch', 'synthetic-brno-test',
    '2026-07-17', 'PÁ', 'sudý týden', 'FIELD', '', 'Stacionární TEST tabletu',
    'pneumatiky-miroslav-vasek', 'Miroslav Vašek', 'TEST tabletu Vašek Miroslav',
    'completed', 1,
    '{"dataScope":"test","externalEffectsDisabled":true,"notificationsDisabled":true,"vistosWritesDisabled":true,"productionRouteWritesDisabled":true}',
    'radim-admin', 'Radim Admin'
  )
`).run();
testSqlite.prepare(`
  INSERT INTO collection_daily_route_stops (
    id, run_id, route_date, source_batch_id, source_row_id, route_order,
    customer_name, address_text, station_name, waste_type, container_volume,
    container_count, status, source_summary_json
  ) VALUES (
    'tablet-stop-1', 'tablet-route-miroslav', '2026-07-17', 'tablet-batch', 'tablet-row', 1,
    'Firma test 501', 'Trnkova 3052/137, Brno', 'TEST stanoviště', 'SKO', 1100, 1,
    'done', '{}'
  )
`).run();
testSqlite.prepare(`
  INSERT INTO collection_route_test_gps_confirmations (
    id, run_id, stop_id, source_row_id, measured_latitude, measured_longitude,
    accuracy_m, sample_count, status, routing_candidate, idempotency_key, captured_at
  ) VALUES ('old-gps', 'tablet-route-miroslav', 'tablet-stop-1', 'tablet-row', 49.19, 16.67,
    8, 5, 'driver-measured', 1, 'old-gps', CURRENT_TIMESTAMP)
`).run();

const admin = {
  id: "radim-admin",
  name: "Radim Admin",
  email: "Radim@nanolab.cz",
  role: "admin",
  status: "active",
  active: true
};
const driver = {
  id: "pneumatiky-miroslav-vasek",
  name: "Miroslav Vašek",
  email: "miroslav.vasek@kaiser.local",
  role: "ridic",
  status: "active",
  active: true
};
const otherAdmin = {
  id: "other-admin",
  name: "Jiný Admin",
  email: "other@example.test",
  role: "admin",
  status: "active",
  active: true
};
const env = {
  SMART_ODPADY_DB: new D1Database(productionSqlite),
  COLLECTION_ROUTES_TEST_DB: new D1Database(testSqlite),
  AUTH_USERS_JSON: JSON.stringify([admin, driver, otherAdmin])
};

const launcher = await getCollectionDailyRouteTabletTestLauncher(env, admin);
assert.equal(launcher.driver.name, "Vašek Miroslav");
assert.equal(launcher.routes.length, 1);
assert.equal(launcher.routes[0].scope, "test");
assert.equal(launcher.session, null);
assert.deepEqual(launcher.safety, {
  scope: "test",
  writesProductionRoutes: false,
  writesVistos: false,
  sendsNotifications: false,
  writesProductionGps: false
});

const started = await startCollectionDailyRouteTabletTestSession(env, admin, { runId: "tablet-route-miroslav" });
assert.equal(started.session.active, true);
assert.equal(started.session.actorEmail, "Radim@nanolab.cz");
assert.equal(started.session.simulatedDriverName, "Vašek Miroslav");
assert.equal(started.route.run.status, "active");
assert.equal(started.route.stops[0].status, "planned");
assert.equal(testSqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_gps_confirmations").get().count, 0);
assert.equal(productionSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 0);

const context = await getCollectionDailyRouteTabletTestContext(env, admin, started.session.id);
assert.equal(context.simulatedUser.id, driver.id);
assert.equal(context.route.run.id, "tablet-route-miroslav");
const voiceContext = await buildCollectionRoutesSarlotaContext(env, admin, {
  scope: "test",
  simulatedUser: context.simulatedUser,
  detailOverride: context.route,
  trustTestRouteVehicle: true,
  vehiclesOverride: { vehiclesVerified: false, vehicles: [] },
  usersOverride: [admin, driver],
  weatherOverride: { verified: true, status: "ready", summary: "TEST počasí načteno." },
  availabilityOverride: [],
  memoryOverride: { available: false, consent: false, apiStatus: "unavailable_test_scope" },
  newsOverride: { ok: true, status: "ready", source: "test", sourceUrl: "", fetchedAt: "", items: [] }
});
assert.equal(voiceContext.actor.id, driver.id);
assert.equal(voiceContext.authenticatedActor.id, admin.id);
assert.equal(voiceContext.simulation.active, true);
assert.equal(voiceContext.route.driverVerified, true);
assert.equal(voiceContext.vehicle.status, "verified");
assert.equal(voiceContext.memory.apiStatus, "unavailable_test_scope");
assert.equal(voiceContext.introAnnouncement, "KSO_INTRO_GENERATION_PENDING");
assert.doesNotMatch(voiceContext.introAnnouncement, /Mirku|Dnešní trasu|můžeme vyrazit/i);
await assert.rejects(
  getCollectionDailyRouteTabletTestContext(env, otherAdmin, started.session.id),
  (error) => error.code === "collection_daily_route_tablet_test_session_missing"
);

const reset = await resetCollectionDailyRouteTabletTestSession(env, admin, {
  runId: started.session.runId,
  sessionId: started.session.id
});
assert.equal(reset.reset, true);
assert.equal(testSqlite.prepare("SELECT status FROM collection_daily_route_runs WHERE id = 'tablet-route-miroslav'").get().status, "confirmed");
assert.equal(testSqlite.prepare("SELECT status FROM collection_daily_route_stops WHERE id = 'tablet-stop-1'").get().status, "planned");
assert.equal((await getCollectionDailyRouteTabletTestLauncher(env, admin)).session, null);
assert.equal(
  testSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE event_type IN ('tablet_test_session_started', 'tablet_test_session_reset')").get().count,
  2
);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const signedUrlSource = readFileSync(new URL("../functions/api/ai/elevenlabs/signed-url.js", import.meta.url), "utf8");
assert.match(appSource, /data-collection-routes-admin-tablet-test-open>TEST TABLETU/);
assert.match(appSource, /TEST REŽIM · ŘIDIČ: VAŠEK MIROSLAV/);
assert.match(appSource, /UKONČIT A RESETOVAT TEST/);
assert.match(appSource, /Tato funkce zatím není v testovacím režimu dostupná/);
assert.match(appSource, /Stav testu/);
assert.match(appSource, /prepareVoiceInput/);
assert.match(appSource, /Prompt Šarloty načten/);
assert.match(appSource, /Úvod přes Prompt \+ KB/);
assert.match(appSource, /Znalosti Šarloty načteny/);
assert.match(appSource, /Tools Šarloty načteny/);
const restoreTestStart = appSource.indexOf("async function loadCollectionRoutesAdminTabletTest");
const restoreTestEnd = appSource.indexOf("async function openCollectionRoutesAdminTabletTest", restoreTestStart);
assert.ok(restoreTestStart >= 0 && restoreTestEnd > restoreTestStart);
const restoreTestSource = appSource.slice(restoreTestStart, restoreTestEnd);
assert.match(restoreTestSource, /shouldRestoreSarlota/);
assert.match(restoreTestSource, /myDailyRouteSarlotaAutoAttemptedRunId !== restoredRun\.id/);
assert.match(restoreTestSource, /enableCollectionDailyDriverSarlota\(\{ promptForMemory: false, invocation: "automatic" \}\)/);
const startTestStart = appSource.indexOf("async function startCollectionRoutesAdminTabletTest");
const startTestEnd = appSource.indexOf("async function resetCollectionRoutesAdminTabletTest", startTestStart);
assert.ok(startTestStart >= 0 && startTestEnd > startTestStart);
const startTestSource = appSource.slice(startTestStart, startTestEnd);
assert.match(startTestSource, /myDailyRouteSarlotaEnabled = false/);
assert.match(startTestSource, /myDailyRouteSarlotaConnecting = false/);
assert.match(startTestSource, /myDailyRouteSarlotaAutoAttemptedRunId = ""/);
assert.match(signedUrlSource, /voiceIdentity = tabletTest\?\.simulatedUser \|\| user/);
assert.match(signedUrlSource, /SARLOTA_TEST_VOICE_RUNTIME_NOT_READY/);
assert.match(signedUrlSource, /tabletTestVoiceRuntimeVerification/);
assert.match(signedUrlSource, /if \(!tabletTest\) await recordAiAction/);
assert.match(signedUrlSource, /if \(!tabletTest\) await recordSarlotaIntroAnnouncement/);

console.log("collection routes admin tablet TEST session: ok");
