import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  readVehicleTrackingPreferences,
  saveVehicleTrackingPreferences
} from "../functions/_lib/vehicle-tracking-preferences-store.js";

const database = new DatabaseSync(":memory:");
database.exec(readFileSync(new URL("../migrations/0001_create_users.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../migrations/0039_create_vehicle_tracking_user_preferences.sql", import.meta.url), "utf8"));
database.prepare(`
  INSERT INTO users (id, name, role, status, active, permissions_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run("user-1", "Test User", "readonly", "active", 1, "[]", new Date().toISOString(), new Date().toISOString());

const d1 = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {
      bind(...values) {
        return {
          async first() {
            return statement.get(...values) || null;
          },
          async run() {
            return statement.run(...values);
          }
        };
      }
    };
  }
};

const env = { SMART_ODPADY_DB: d1 };
const initial = await readVehicleTrackingPreferences(env, "user-1");
assert.equal(initial.infoStyle, "compact");
assert.equal(initial.userId, "user-1");

const saved = await saveVehicleTrackingPreferences(env, "user-1", { infoStyle: "telemetry" });
assert.equal(saved.infoStyle, "telemetry");
assert.equal(saved.userId, "user-1");

const loaded = await readVehicleTrackingPreferences(env, "user-1");
assert.equal(loaded.infoStyle, "telemetry");
assert.ok(loaded.updatedAt);

const normalized = await saveVehicleTrackingPreferences(env, "user-1", { infoStyle: "neplatné" });
assert.equal(normalized.infoStyle, "compact");

console.log("vehicle-tracking preferences tests: ok");
