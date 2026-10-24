import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { reviewFuelIdentityRows, loadFuelIdentityReview } from "../functions/_lib/fleet-fuel-identity-review.js";
import { upsertFleetVehicleAliasesFromTcars } from "../functions/_lib/fleet-vehicle-aliases.js";
const alias = (id, vehicle, extra = {}) => ({ id, vehicle_id: vehicle, external_system: "orwii_fuel_chip", external_key: "CHIP1", normalized_license_plate: "1AB2345", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_to: null, metadata_json: JSON.stringify({ historicalIdentityVerified: true, sourceSystem: "orwii", sourceEvidenceId: "source-" + id }), ...extra });
const tx = (id, extra = {}) => ({ external_id: id, occurred_at: "2026-10-01T12:00:00Z", license_plate: "1AB 2345", fuel_chip_id: "CHIP-1", orwii_vehicle_id: "", matched_vehicle_id: "", match_status: "unmatched", ...extra });
const historical = [alias("old", "vistos-1", { status: "active", valid_to: "2026-10-01T12:00:00Z" }), alias("new", "vistos-2", { valid_from: "2026-10-01T12:00:00Z" })];
assert.equal(reviewFuelIdentityRows([tx("boundary")], historical).rows[0].proposedVehicleId, "vistos-2");
assert.equal(reviewFuelIdentityRows([tx("before", { occurred_at: "2026-10-01T11:59:59Z" })], historical).rows[0].proposedVehicleId, "vistos-1");
assert.equal(reviewFuelIdentityRows([tx("conflict")], [alias("a", "vistos-1"), alias("b", "vistos-2")]).rows[0].reviewStatus, "conflict");
assert.equal(reviewFuelIdentityRows([tx("stored", { matched_vehicle_id: "other", match_status: "matched" })], [alias("a", "vistos-1")]).rows[0].reviewStatus, "conflict");
assert.equal(reviewFuelIdentityRows([tx("plate-only", { fuel_chip_id: "" })], [alias("a", "vistos-1")]).rows[0].reviewStatus, "needs_evidence");
assert.equal(reviewFuelIdentityRows([tx("time", { occurred_at: "2026-10-01T12:00:00" })], [alias("a", "vistos-1")]).rows[0].reviewStatus, "needs_evidence");
assert.equal(reviewFuelIdentityRows([tx("unknown", { fuel_chip_id: "", license_plate: "" })], []).rows[0].reviewStatus, "unidentifiable");
for (const extra of [{ metadata_json: "null" }, { metadata_json: "[]" }, { metadata_json: "false" }, { metadata_json: "{}" }, { metadata_json: "invalid" }, { valid_from: null }, { valid_to: "2025-01-01T00:00:00Z" }, { metadata_json: JSON.stringify({ historicalIdentityVerified: true, sourceSystem: "orwii" }) }]) {
  assert.equal(reviewFuelIdentityRows([tx("unproven")], [alias("a", "vistos-1", extra)]).summary.verified, 0);
}
assert.equal(reviewFuelIdentityRows([tx("archived", { occurred_at: "2026-10-01T11:59:59Z" })], [{ ...historical[0], status: "historical" }, historical[1]]).rows[0].proposedVehicleId, "vistos-1");
const cohort = reviewFuelIdentityRows([tx("original"), tx("new")], [], new Set(["original", "missing"]));
assert.equal(cohort.originalCohort.expected, 2); assert.equal(cohort.originalCohort.missing, 1); assert.equal(cohort.originalCohort.summary.total, 1);
const immutable = [tx("legacy", { match_status: "matched", matched_vehicle_id: "1220" })];
const snapshot = JSON.stringify(immutable); reviewFuelIdentityRows(immutable, [alias("legacy", "1220", { metadata_json: "{}" })]); assert.equal(JSON.stringify(immutable), snapshot);
class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async all() { assert.match(this.sql.trim(), /^SELECT /); return { success: true, results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { return { success: true, meta: this.db.prepare(this.sql).run(...this.args) }; }
}
class D1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) { this.db.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }
}
const core = new DatabaseSync(":memory:"), archive = new DatabaseSync(":memory:");
core.exec(readFileSync(new URL("../migrations/0041_create_fleet_trip_job_pairing.sql", import.meta.url), "utf8").split("CREATE TABLE IF NOT EXISTS fleet_trip_job_pairing_runs")[0]);
archive.exec("CREATE TABLE fleet_orwii_fuel_transactions (external_id TEXT PRIMARY KEY, occurred_at TEXT, license_plate TEXT, orwii_vehicle_id TEXT, fuel_chip_id TEXT, matched_vehicle_id TEXT, match_status TEXT, updated_at TEXT)");
archive.exec("CREATE TABLE fleet_orwii_fuel_backup_20261022 (external_id TEXT PRIMARY KEY, match_status TEXT)");
const coreDb = new D1(core), archiveDb = new D1(archive);
const insert = core.prepare("INSERT INTO fleet_vehicle_external_aliases (id,vehicle_id,external_system,external_key,normalized_license_plate,status,match_method,valid_from,valid_to,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
for (const [key, vehicle, status, method, end] of [["canonical", "vistos-151", "active", "verified_source", null], ["inactive", "inactive", "inactive", "tcars_readonly_master", null], ["closed", "closed", "active", "tcars_readonly_master", "2026-09-01T00:00:00Z"], ["changed", "changed", "active", "tcars_readonly_master", null], ["same", "same", "active", "tcars_readonly_master", null]]) {
  insert.run(key, vehicle, "tcars", key, "1AB2345", status, method, "2026-01-01T00:00:00Z", end, '{"evidence":"keep"}', "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
}
const protectedRows = core.prepare("SELECT * FROM fleet_vehicle_external_aliases WHERE external_key <> 'same' ORDER BY id").all();
const observed = await upsertFleetVehicleAliasesFromTcars(coreDb, ["canonical", "inactive", "closed", "changed", "same"].map(key => ({ vehicleKey: key, licensePlate: key === "changed" ? "2BC3456" : "1AB2345" })), { updatedAt: "2026-10-24T00:00:00Z" });
assert.equal(observed.written, 1); assert.equal(observed.held, 4);
assert.deepEqual(core.prepare("SELECT * FROM fleet_vehicle_external_aliases WHERE external_key <> 'same' ORDER BY id").all(), protectedRows);
assert.equal(core.prepare("SELECT metadata_json FROM fleet_vehicle_external_aliases WHERE external_key='same'").get().metadata_json, '{"evidence":"keep"}');
const duplicates = await upsertFleetVehicleAliasesFromTcars(coreDb, [{ vehicleKey: "collision", licensePlate: "1AB2345" }, { vehicleKey: "collision", licensePlate: "2BC3456" }]);
assert.equal(duplicates.sourceConflicts, 1); assert.equal(duplicates.written, 0);
assert.equal(core.prepare("SELECT COUNT(*) AS n FROM fleet_vehicle_external_aliases WHERE external_key='collision'").get().n, 0);
await upsertFleetVehicleAliasesFromTcars(coreDb, [{ vehicleKey: "new", licensePlate: "3CD4567" }]);
assert.equal(core.prepare("SELECT vehicle_id FROM fleet_vehicle_external_aliases WHERE external_key='new'").get().vehicle_id, "new");
const addTx = archive.prepare("INSERT INTO fleet_orwii_fuel_transactions VALUES (?,?,?,?,?,?,?,?)");
for (let index = 0; index < 201; index++) addTx.run("tx-" + String(index).padStart(3, "0"), "2026-10-01T12:00:00Z", "", "", "", index ? "" : "1220", index ? "unmatched" : "matched", "2026-10-01T12:00:00Z");
archive.prepare("INSERT INTO fleet_orwii_fuel_backup_20261022 VALUES (?,?)").run("tx-001", "unmatched");
const beforeCore = JSON.stringify(core.prepare("SELECT * FROM fleet_vehicle_external_aliases ORDER BY id").all());
const beforeArchive = JSON.stringify(archive.prepare("SELECT * FROM fleet_orwii_fuel_transactions ORDER BY external_id").all());
const env = { DB_CORE: coreDb, DB_ARCHIVE: archiveDb };
const report = await loadFuelIdentityReview(env);
assert.equal(report.summary.total, 201); assert.equal(report.rows.length, 100); assert.equal(report.pagination.nextOffset, 100); assert.equal(report.completeScan, true); assert.equal(report.summary.verified, 0);
assert.equal((await loadFuelIdentityReview(env, { cohort: "original" })).rows.length, 1);
assert.equal((await loadFuelIdentityReview(env, { offset: 200 })).rows.length, 1);
assert.equal(JSON.stringify(core.prepare("SELECT * FROM fleet_vehicle_external_aliases ORDER BY id").all()), beforeCore);
assert.equal(JSON.stringify(archive.prepare("SELECT * FROM fleet_orwii_fuel_transactions ORDER BY external_id").all()), beforeArchive);
await assert.rejects(loadFuelIdentityReview({ DB_ARCHIVE: archiveDb }), error => error.code === "database_binding_missing");
archive.exec("DROP TABLE fleet_orwii_fuel_backup_20261022");
assert.equal((await loadFuelIdentityReview(env)).originalCohort.available, false);
const badArchive = { prepare() { return { async all() { return { success: true, results: Array(20001).fill({}) }; } }; } };
await assert.rejects(loadFuelIdentityReview({ DB_CORE: coreDb, DB_ARCHIVE: badArchive }), error => error.code === "identity_review_scan_limit");
const api = readFileSync(new URL("../functions/api/fleet/fuel-identity-review.js", import.meta.url), "utf8");
assert.ok(api.includes('requireUserPermission(env, request, "fleet", "view")'));
assert.ok(api.indexOf("requireUserPermission(env") < api.indexOf("await loadFuelIdentityReview(env"));
assert.equal((api.match(/export async function onRequest/g) || []).length, 1);
assert.match(api, /onRequestGet/);
console.log("fuel identity review and alias preservation tests passed");
