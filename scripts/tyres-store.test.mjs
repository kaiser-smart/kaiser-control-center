import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  createTyre,
  createTyreMeasurement,
  createTyreServiceRecord,
  getTyresDashboard,
  importLegacyTyres,
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
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0050_create_tyres_module.sql", import.meta.url), "utf8"));
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
  note: "Kontrolní servis"
});
assert.equal(service.type, "kontrola");

await assert.rejects(
  createTyreMeasurement(env, technician, { vehicle: "1AB1234", position: "L", tread: 6 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_vehicle_unknown"
);

sqlite.prepare(`
  INSERT INTO tyre_vehicle_profiles (id, license_plate, normalized_license_plate)
  VALUES ('tyre-vehicle-1ab1234', '1AB 1234', '1AB1234')
`).run();

await assert.rejects(
  createTyreMeasurement(env, technician, { tyreId: updated.id, vehicle: "1AB1234", position: "L", tread: 6 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_measurement_vehicle_mismatch"
);

await assert.rejects(
  createTyreMeasurement(env, technician, { tyreId: updated.id, vehicle: "3BH5548", position: "P", tread: -1 }),
  (error) => error instanceof TyresStoreError && error.code === "tyres_tread_invalid"
);

assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM tyre_audit_log").get().count, 7);

console.log("tyres store tests: ok");
