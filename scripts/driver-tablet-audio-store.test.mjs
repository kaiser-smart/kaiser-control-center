import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  claimDriverTabletIntro,
  logDriverTabletAudioEvent,
  readDriverTabletPreferences,
  saveDriverTabletPreferences
} from "../functions/_lib/collection-route-driver-tablet-audio-store.js";
import { driverTabletRouteSessionId } from "../src/data/driverTabletAudioContract.js";

class D1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.database, this.sql, values); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async run() { return { success: true, meta: this.database.prepare(this.sql).run(...this.values) }; }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
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

function database(test = false) {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0001_create_users.sql",
    "../migrations/0002_add_user_manager.sql",
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    test ? "../migrations/test/0010_create_collection_route_driver_tablet_audio.sql" : "../migrations/0054_create_collection_route_driver_tablet_audio.sql"
  ]) sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  sqlite.prepare(`
    INSERT INTO users (id, name, email, role, status, active, permissions_json, created_at, updated_at)
    VALUES ('driver-1', 'Řidič Test', 'driver@example.test', 'ridic', 'active', 1, '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count, issue_count,
      created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES ('batch-1', 'test', 'vistos-komunal-preview', 'preview', 'ready', '', 1, 0, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '{}')
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES ('row-1', 'batch-1', 1, 'test', 'source-1', 'preview', '{}', '[]', CURRENT_TIMESTAMP)
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_daily_route_runs (
      id, route_key, source_batch_id, source_mode, route_date, route_day_code, route_week_mode,
      vehicle_code, vehicle_registration, vehicle_label, driver_user_id, driver_name,
      title, status, stop_count, metadata_json, started_by_user_id, started_by_name, started_at,
      created_by_user_id, created_by_name
    ) VALUES (
      'route-1', 'route-key-1', 'batch-1', 'vistos-komunal-preview', '2026-07-22', 'ST', 'sudý',
      'A', '3BN 3558', 'Vůz A · 3BN 3558', 'driver-1', 'Řidič Test',
      'Denní trasa', 'active', 1, ?, 'driver-1', 'Řidič Test', '2026-07-22T08:00:00.000Z',
      'admin', 'Admin'
    )
  `).run(JSON.stringify(test ? { dataScope: "test" } : {}));
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, status, source_summary_json
    ) VALUES ('stop-1', 'route-1', '2026-07-22', 'batch-1', 'row-1', 1, 'Firma', 'Brno', 'planned', '{}')
  `).run();
  return { sqlite, d1: new D1Database(sqlite) };
}

const production = database(false);
const test = database(true);
const env = { SMART_ODPADY_DB: production.d1, COLLECTION_ROUTES_TEST_DB: test.d1 };
const driver = { id: "driver-1", name: "Řidič Test", role: "ridic", status: "active", active: true };

assert.equal((await readDriverTabletPreferences(env, driver.id, { scope: "production" })).soundMode, "standard");
assert.equal((await saveDriverTabletPreferences(env, driver.id, { scope: "production", soundMode: "quiet" })).soundMode, "quiet");
assert.equal((await readDriverTabletPreferences(env, driver.id, { scope: "production" })).soundMode, "quiet");
assert.equal((await readDriverTabletPreferences(env, driver.id, { scope: "test" })).soundMode, "standard", "TEST preference nesmí číst PROVOZ.");
await saveDriverTabletPreferences(env, driver.id, { scope: "test", soundMode: "off" });
assert.equal((await readDriverTabletPreferences(env, driver.id, { scope: "production" })).soundMode, "quiet", "TEST zápis nesmí změnit PROVOZ.");

const route = { id: "route-1", scope: "production", startedAt: "2026-07-22T08:00:00.000Z" };
const routeSessionId = driverTabletRouteSessionId(route);
const payload = { action: "claim_intro", runId: "route-1", scope: "production", routeSessionId, introVersion: "1" };
assert.equal((await claimDriverTabletIntro(env, driver, payload)).claimed, true);
assert.equal((await claimDriverTabletIntro(env, driver, payload)).claimed, false, "Druhé intro stejné relace musí být atomicky odmítnuto.");
assert.equal(production.sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_driver_tablet_audio_events WHERE event_type = 'intro_started'").get().count, 1);
assert.equal(production.sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_driver_tablet_audio_events WHERE event_type = 'duplicate_blocked'").get().count, 1);
assert.equal(test.sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_driver_tablet_audio_events").get().count, 0, "PROVOZ intro nesmí zapsat TEST.");

assert.equal((await logDriverTabletAudioEvent(env, driver, {
  runId: "route-1",
  scope: "production",
  routeSessionId,
  eventType: "asset_failed",
  soundEvent: "tablet_intro",
  result: "failed",
  error: "DecodeError: bezpečně zkráceno",
  idempotencyKey: `${routeSessionId}:asset-failed:1`
})).logged, true);
assert.equal(production.sqlite.prepare("SELECT error_code FROM collection_route_driver_tablet_audio_events WHERE event_type = 'asset_failed'").get().error_code, "DecodeError: bezpečně zkráceno");

console.log("driver tablet audio store tests: ok");
