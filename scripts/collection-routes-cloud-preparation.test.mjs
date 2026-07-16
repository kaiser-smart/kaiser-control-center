import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { runCollectionDailyRoutePreparationAutomation } from "../functions/_lib/collection-routes-automation-runner.js";

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

const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "../migrations/0001_create_users.sql",
  "../migrations/0002_add_user_manager.sql",
  "../migrations/0015_create_module_rules.sql",
  "../migrations/0016_create_module_automation_runner_runs.sql",
  "../migrations/0017_create_collection_routes_phase1a.sql",
  "../migrations/0033_create_orwii_fuel_sync.sql",
  "../migrations/0034_add_orwii_fuel_sync_lock.sql",
  "../migrations/0037_create_vehicle_tracking_gps_history.sql",
  "../migrations/0038_create_collection_daily_routes.sql",
  "../migrations/0041_create_fleet_trip_job_pairing.sql",
  "../migrations/0042_activate_fleet_fuel_and_daily_route_phase1b.sql"
]) {
  sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
}
const db = new D1Database(sqlite);

sqlite.prepare(`
  INSERT INTO collection_import_batches (
    id, source, source_mode, status, api_status, message, row_count, issue_count,
    created_by_user_id, created_at, finished_at, metadata_json
  ) VALUES (
    'batch-phase1b', 'vistos', 'vistos-komunal-preview', 'preview', 'ready', 'test', 9, 0,
    'cloud-test', '2026-07-16T08:00:00.000Z', '2026-07-16T08:00:00.000Z', '{}'
  )
`).run();

for (let index = 1; index <= 9; index += 1) {
  const summary = {
    sourceContractId: `contract-${index}`,
    contractId: `contract-${index}`,
    contractNumber: `KS-${index}`,
    customerName: `Zákazník ${index}`,
    addressPlaceRaw: `Ulice ${index}, Brno`,
    stationName: `Stanoviště ${index}`,
    wasteType: "SKO",
    wasteCode: "20 03 01",
    frequency: "1x7",
    containerVolume: 1100,
    containerCount: 1,
    containerType: "nádoba",
    pickupDaysText: "čtvrtek lichá, čtvrtek sudá",
    serviceMode: "regular",
    onDemand: false,
    svozKaiserIncluded: true,
    issueCount: 0
  };
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES (?, 'batch-phase1b', ?, 'ContractRow', ?, 'preview', ?, '[]', '2026-07-16T08:00:00.000Z')
  `).run(`row-${index}`, index, `source-${index}`, JSON.stringify(summary));
}

const env = { SMART_ODPADY_DB: db };
const scheduledTime = new Date("2026-07-16T08:05:00.000Z").getTime();
const first = await runCollectionDailyRoutePreparationAutomation(env, {
  scheduledTime,
  cron: "*/15 * * * *",
  triggeredBy: "test"
});
assert.equal(first.status, "completed");
assert.equal(first.createdRuns, 3);
assert.equal(first.createdStops, 9);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 3);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_stops").get().count, 9);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs WHERE status = 'draft'").get().count, 3);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs WHERE confirmed_at IS NOT NULL OR started_at IS NOT NULL OR completed_at IS NOT NULL").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT source_row_id) AS count FROM collection_daily_route_stops").get().count, 9);
const metadata = JSON.parse(sqlite.prepare("SELECT metadata_json FROM collection_daily_route_runs ORDER BY vehicle_code LIMIT 1").get().metadata_json);
assert.equal(metadata.automation.ruleId, "collection-routes-daily-draft-preparation-phase1b");
assert.equal(metadata.automation.autoConfirmed, false);
assert.equal(metadata.automation.sendsNotifications, false);

const second = await runCollectionDailyRoutePreparationAutomation(env, {
  scheduledTime,
  cron: "*/15 * * * *",
  triggeredBy: "test"
});
assert.equal(second.status, "skipped");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 3);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM module_automation_runs WHERE rule_id = 'collection-routes-daily-draft-preparation-phase1b'").get().count, 1);

console.log("collection routes cloud preparation tests passed");
