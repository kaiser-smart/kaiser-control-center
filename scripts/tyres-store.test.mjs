import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  createTyre,
  createTyreMeasurement,
  createTyreMeasurements,
  createTyreServiceRecord,
  fitTyre,
  getTyreDetail,
  getTyresDashboard,
  getTyresHistory,
  getTyresOverview,
  getTyresVehicleDetail,
  getTyresVehicles,
  importLegacyTyres,
  listTyres,
  TyresStoreError,
  updateTyre
} from "../functions/_lib/tyres-store.js";

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

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0050_create_tyres_module.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0052_extend_tyres_workflows.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0053_restore_tyre_vehicle_profiles.sql", import.meta.url), "utf8"));
const env = { SMART_ODPADY_DB: new D1Database(sqlite) };
const manager = { id: "tyres-manager", name: "Testovací správce" };
const technician = { id: "tyres-technician", name: "Testovací dílna" };

const legacyState = {
  vehicles: [
    {
      spz: "3BH 5548",
      type: "Nákladní vozidlo",
      driver: "Testovací řidič",
      odometer: 125000,
      depot: "Brno",
      configuration: ["L", "P", "HL vnitřní", "HP vnější"]
    }
  ],
  tires: [
    {
      id: "KS-315-001",
      manufacturer: "Hankook",
      model: "AH31",
      size: "315/80 R22,5",
      index: "156/150K",
      dot: "1823",
      type: "nová",
      priceEx: 9456,
      supplier: "Dodavatel pneu",
      purchaseDate: "2026-03-13",
      invoice: "FV-1",
      state: "na vozidle",
      vehicle: "3BH5548",
      position: "HL vnější",
      mounted: "2026-03-15",
      mountedOdo: 110000,
      currentTread: 3.3,
      pressure: 8.6,
      mileage: 15000,
      defects: 0
    }
  ],
  measurements: [
    {
      date: "2026-07-20",
      vehicle: "3BH5548",
      position: "HL vnější",
      tread: 3.3,
      pressure: 8.6,
      odometer: 125000,
      note: "Kontrola"
    }
  ],
  services: [
    {
      id: "S-1",
      date: "2026-07-01",
      vehicle: "3BH5548",
      person: "Dílna",
      type: "výměna",
      supplier: "Dodavatel pneu",
      labor: 1200,
      material: 300,
      tireCost: 9456,
      invoice: "FV-1",
      tireTypes: ["315/80 R22,5"],
      note: "Výměna pneumatiky"
    }
  ]
};

const imported = await importLegacyTyres(env, manager, {
  source: "legacy-test",
  state: legacyState,
  sourceUpdatedAt: "2026-07-22T08:00:00.000Z"
});
assert.deepEqual(imported.summary, { vehicles: 1, tyres: 1, measurements: 1, services: 1 });

const importedAgain = await importLegacyTyres(env, manager, { source: "legacy-test", state: legacyState });
assert.equal(importedAgain.summary.tyres, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_inventory").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_measurements").get().count, 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_service_records").get().count, 1);

const dashboard = await getTyresDashboard(env);
assert.equal(dashboard.apiStatus, "ready");
assert.equal(dashboard.summary.totalTyres, 1);
assert.equal(dashboard.summary.mountedTyres, 1);
assert.equal(dashboard.summary.lowTreadTyres, 1);
assert.equal(dashboard.summary.serviceCostYtd, 10956);
assert.equal(dashboard.vehicles[0].licensePlate, "3BH 5548");
assert.equal(dashboard.latestImport.status, "completed");
assert.deepEqual(dashboard.latestImport.summary, { vehicles: 1, tyres: 1, measurements: 1, services: 1 });

await importLegacyTyres(env, manager, {
  source: "legacy-profile-protection-test",
  state: { vehicles: [{ spz: "3BH5548" }], tires: [], measurements: [], services: [] }
});
const preservedVehicle = sqlite.prepare(`
  SELECT vehicle_type AS type, driver_label AS driver, odometer_km AS odometer,
    depot, wheel_positions_json AS positions
  FROM tyre_vehicle_profiles
  WHERE normalized_license_plate = '3BH5548'
`).get();
assert.equal(preservedVehicle.type, "Nákladní vozidlo");
assert.equal(preservedVehicle.driver, "Testovací řidič");
assert.equal(preservedVehicle.odometer, 125000);
assert.equal(preservedVehicle.depot, "Brno");
assert.deepEqual(JSON.parse(preservedVehicle.positions), ["L", "P", "HL vnitřní", "HP vnější"]);

const placeholderImport = await importLegacyTyres(env, manager, {
  source: "legacy-placeholder-test",
  state: {
    vehicles: [{ spz: "NEZJISTENO" }],
    tires: [],
    measurements: [],
    services: [{ id: "S-unknown", date: "2026-07-21", vehicle: "NEZJISTENO", type: "kontrola" }]
  }
});
assert.deepEqual(placeholderImport.summary, { vehicles: 0, tyres: 0, measurements: 0, services: 1 });
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_vehicle_profiles WHERE normalized_license_plate = 'NEZJISTENO'").get().count, 0);
assert.equal(sqlite.prepare("SELECT vehicle_license_plate AS vehicle FROM tyre_service_records WHERE legacy_id = 'S-unknown'").get().vehicle, "");

const created = await createTyre(env, technician, {
  manufacturer: "Pirelli",
  model: "R02",
  size: "385/65 R22,5",
  type: "nová",
  state: "sklad",
  currentTread: 16
});
assert.equal(created.manufacturer, "Pirelli");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_inventory").get().count, 2);

const updated = await updateTyre(env, technician, created.id, {
  ...created,
  vehicle: "3BH5548",
  position: "P",
  state: "na vozidle",
  pressure: 8.2
});
assert.equal(updated.vehicle, "3BH 5548");
assert.equal(updated.position, "P");
assert.equal(updated.state, "na vozidle");

const measurement = await createTyreMeasurement(env, technician, {
  tyreId: updated.id,
  vehicle: "3BH5548",
  position: "P",
  tread: 15.7,
  pressure: 8.4,
  odometer: 125001,
  measuredAt: "2026-07-22",
  note: "Kontrola po montáži"
});
assert.equal(measurement.vehicle, "3BH 5548");
assert.equal(sqlite.prepare("SELECT current_tread_mm AS tread FROM tyre_inventory WHERE id = ?").get(updated.id).tread, 15.7);

const service = await createTyreServiceRecord(env, technician, {
  date: "2026-07-22",
  vehicle: "3BH5548",
  type: "kontrola",
  labor: 350,
  material: 0,
  tireCost: 0,
  note: "Kontrolní servis",
  tyreIds: [updated.id]
});
assert.equal(service.type, "kontrola");
assert.deepEqual(service.tyreIds, [updated.id]);

const overview = await getTyresOverview(env);
assert.equal(overview.summary.totalTyres, 2);
assert.equal(overview.summary.mountedTyres, 2);
assert.equal(overview.summary.serviceCostYtd, 11306);
assert.ok(Array.isArray(overview.attention));

const inventory = await listTyres(env, { q: "Pirelli", page: 1, pageSize: 25, sort: "name", direction: "asc" });
assert.equal(inventory.total, 1);
assert.equal(inventory.items[0].manufacturer, "Pirelli");
assert.ok(inventory.facets.manufacturers.includes("Hankook"));

const detail = await getTyreDetail(env, updated.id);
assert.equal(detail.tyre.id, updated.id);
assert.equal(detail.measurements.length, 1);
assert.equal(detail.services.length, 1);
assert.equal(detail.costs, 350);

const vehicles = await getTyresVehicles(env);
assert.equal(vehicles.length, 1);
assert.equal(vehicles[0].mountedCount, 2);
const vehicleDetail = await getTyresVehicleDetail(env, "3BH5548");
assert.equal(vehicleDetail.tyres.length, 2);

const history = await getTyresHistory(env, { type: "services", page: 1, pageSize: 25 });
assert.equal(history.total, 3);
assert.ok(history.items.some((item) => item.tyreIds.includes(updated.id)));

await fitTyre(env, technician, { tyreId: updated.id, action: "dismount" });
const remounted = await fitTyre(env, technician, { tyreId: updated.id, action: "mount", vehicle: "3BH5548", position: "P", mountedOdo: 125010 });
assert.equal(remounted.position, "P");

const bulk = await createTyreMeasurements(env, technician, [{
  tyreId: updated.id,
  vehicle: "3BH5548",
  position: "P",
  tread: 15.5,
  pressure: 8.3,
  odometer: 125020,
  measuredAt: "2026-07-22"
}]);
assert.equal(bulk.length, 1);

await assert.rejects(
  createTyreMeasurement(env, technician, { vehicle: "1AB1234", position: "L", tread: 6 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_vehicle_unknown"
);

sqlite.prepare(`
  INSERT INTO tyre_vehicle_profiles (id, license_plate, normalized_license_plate, wheel_positions_json)
  VALUES ('tyre-vehicle-1ab1234', '1AB 1234', '1AB1234', '["L"]')
`).run();

await assert.rejects(
  createTyreMeasurement(env, technician, { tyreId: updated.id, vehicle: "1AB1234", position: "L", tread: 6 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_measurement_vehicle_mismatch"
);

sqlite.prepare(`
  INSERT INTO tyre_vehicle_profiles (id, license_plate, normalized_license_plate)
  VALUES ('tyre-vehicle-2ab1234', '2AB 1234', '2AB1234')
`).run();

await assert.rejects(
  fitTyre(env, technician, { tyreId: created.id, action: "mount", vehicle: "2AB1234", position: "L" }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_vehicle_positions_missing"
);

await assert.rejects(
  createTyreMeasurement(env, technician, { tyreId: updated.id, vehicle: "3BH5548", position: "P", tread: -1 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_tread_invalid"
);

assert.ok(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_audit_log").get().count >= 10);

const recoverySqlite = new DatabaseSync(":memory:");
recoverySqlite.exec(readFileSync(new URL("../migrations/0050_create_tyres_module.sql", import.meta.url), "utf8"));
const recoveryMigration = readFileSync(new URL("../migrations/0053_restore_tyre_vehicle_profiles.sql", import.meta.url), "utf8");
const restoredPlateKeys = [...recoveryMigration.matchAll(/^\s+\('([A-Z0-9]+)'/gm)].map((match) => match[1]);
assert.equal(restoredPlateKeys.length, 28);
recoverySqlite.prepare(`
  INSERT INTO tyre_vehicle_profiles (id, license_plate, normalized_license_plate)
  VALUES (?, ?, ?)
`).run("tyre-vehicle-1bf9638", "1BF 9638", "1BF9638");
recoverySqlite.prepare(`
  INSERT INTO tyre_vehicle_profiles (
    id, license_plate, normalized_license_plate, vehicle_type, wheel_positions_json
  ) VALUES (?, ?, ?, ?, ?)
`).run("tyre-vehicle-custom", "3BH 5548", "3BH5548", "Ručně ověřený typ", '["VL","VP"]');
const recoveryInsert = recoverySqlite.prepare(`
  INSERT OR IGNORE INTO tyre_vehicle_profiles (id, license_plate, normalized_license_plate)
  VALUES (?, ?, ?)
`);
restoredPlateKeys.forEach((plate) => recoveryInsert.run(`tyre-vehicle-${plate.toLowerCase()}`, plate, plate));
recoverySqlite.exec(recoveryMigration);
assert.equal(recoverySqlite.prepare(`
  SELECT COUNT(*) AS count
  FROM tyre_vehicle_profiles
  WHERE wheel_positions_json <> '[]'
`).get().count, 28);
const recoveredVehicle = recoverySqlite.prepare(`
  SELECT vehicle_type AS type, driver_label AS driver, wheel_positions_json AS positions
  FROM tyre_vehicle_profiles
  WHERE normalized_license_plate = '1BF9638'
`).get();
assert.equal(recoveredVehicle.type, "MINI Cooper 2017");
assert.equal(recoveredVehicle.driver, "bez řidiče");
assert.deepEqual(JSON.parse(recoveredVehicle.positions), ["L", "P", "ZL", "ZP"]);
const untouchedVehicle = recoverySqlite.prepare(`
  SELECT vehicle_type AS type, wheel_positions_json AS positions
  FROM tyre_vehicle_profiles
  WHERE normalized_license_plate = '3BH5548'
`).get();
assert.equal(untouchedVehicle.type, "Ručně ověřený typ");
assert.deepEqual(JSON.parse(untouchedVehicle.positions), ["VL", "VP"]);

console.log("tyres store tests: ok");
