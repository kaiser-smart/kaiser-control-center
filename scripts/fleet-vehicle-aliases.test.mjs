import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  loadFleetVehiclesFromAliases,
  upsertFleetVehicleAliasesFromTcars
} from "../functions/_lib/fleet-vehicle-aliases.js";
import { reconcileStoredOrwiiFuelTransactions } from "../functions/_lib/orwii-fuel-store.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
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
  "../migrations/0015_create_module_rules.sql",
  "../migrations/0016_create_module_automation_runner_runs.sql",
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
const updatedAt = "2026-07-16T08:00:00.000Z";

const aliasSync = await upsertFleetVehicleAliasesFromTcars(db, [
  { vehicleKey: "tcars-1", licensePlate: "1AB 2345" },
  { vehicleKey: "tcars-1", licensePlate: "1AB 2345" },
  { vehicleKey: "tcars-2", licensePlate: "2BC 3456" },
  { vehicleKey: "missing-plate", licensePlate: "" }
], { updatedAt });
assert.equal(aliasSync.seen, 2);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM fleet_vehicle_external_aliases WHERE external_system = 'tcars'").get().count, 2);
assert.deepEqual((await loadFleetVehiclesFromAliases(db)).map((vehicle) => vehicle.id), ["tcars-1", "tcars-2"]);

sqlite.prepare(`
  INSERT INTO fleet_orwii_fuel_transactions (
    external_id, occurred_at, liters, license_plate, orwii_vehicle_id, fuel_chip_id, match_status
  ) VALUES (?, ?, ?, ?, ?, ?, 'unmatched')
`).run("tx-plate", "2026-07-15T08:00:00.000Z", 40, "1AB 2345", "orwii-1", "CHIP-1");
sqlite.prepare(`
  INSERT INTO fleet_orwii_fuel_transactions (
    external_id, occurred_at, liters, license_plate, orwii_vehicle_id, fuel_chip_id, match_status
  ) VALUES (?, ?, ?, ?, ?, ?, 'unmatched')
`).run("tx-alias", "2026-07-15T09:00:00.000Z", 20, "", "orwii-1", "CHIP-1");
sqlite.prepare(`
  INSERT INTO fleet_orwii_fuel_transactions (
    external_id, occurred_at, liters, license_plate, orwii_vehicle_id, fuel_chip_id, match_status
  ) VALUES (?, ?, ?, ?, ?, ?, 'unmatched')
`).run("tx-unknown", "2026-07-15T10:00:00.000Z", 10, "9ZZ 9999", "orwii-unknown", "CHIP-X");

const first = await reconcileStoredOrwiiFuelTransactions(db, { updatedAt: "2026-07-16T08:01:00.000Z" });
assert.equal(first.total, 3);
assert.equal(first.summary.matched, 2);
assert.equal(first.summary.unmatched, 1);
assert.equal(sqlite.prepare("SELECT matched_vehicle_id FROM fleet_orwii_fuel_transactions WHERE external_id = 'tx-plate'").get().matched_vehicle_id, "tcars-1");
assert.equal(sqlite.prepare("SELECT match_method FROM fleet_orwii_fuel_transactions WHERE external_id = 'tx-alias'").get().match_method, "orwii_vehicle_id");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM fleet_vehicle_external_aliases WHERE external_system IN ('orwii_vehicle_id', 'orwii_fuel_chip')").get().count, 2);

const second = await reconcileStoredOrwiiFuelTransactions(db, { updatedAt: "2026-07-16T08:02:00.000Z" });
assert.equal(second.updated, 0);
assert.equal(second.summary.matched, 2);

console.log("fleet vehicle aliases tests passed");
