import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orwiiFuelVehicleSummary } from "../src/data/orwiiFuelAnalytics.js";
const analytics = { summary: { liters: 100, totalCost: 2500 }, byVehicle: [{ key: "1220", liters: 100, totalCost: 2500, transactionCount: 2 }], recentTransactions: [{ externalId: "one", matchedVehicleId: "1220" }] };
const before = JSON.stringify(analytics);
assert.equal(orwiiFuelVehicleSummary(analytics, "1220"), analytics.byVehicle[0]);
const detail = orwiiFuelVehicleSummary(analytics, { id: "vistos-151", tcarsVehicleId: "1220" });
assert.equal(detail.key, "1220");
assert.equal(detail.liters, 100);
assert.equal(detail.totalCost, 2500);
assert.equal(detail.viewVehicleId, "vistos-151");
assert.equal(detail.historicalIdentityVerified, false);
assert.equal(detail.identityScope, "stored_transaction_group");
assert.equal(JSON.stringify(analytics), before, "source groups, transactions and company totals never change");
assert.equal(orwiiFuelVehicleSummary(analytics, { id: "vistos-999", licensePlate: "3BI2007" }), null, "no plate-based guess");
assert.equal(orwiiFuelVehicleSummary(analytics, {}), null);
assert.equal(orwiiFuelVehicleSummary({ byVehicle: [...analytics.byVehicle, { key: "vistos-151", liters: 90 }] }, { id: "vistos-151", tcarsVehicleId: "1220" }), null, "conflicting stored groups are not merged or selected arbitrarily");
if (process.env.GITHUB_ACTIONS === "true") {
  const app = readFileSync("src/app.js", "utf8");
  assert.ok(app.includes("orwiiFuelVehicleSummary(fleetFuelState.analytics || {}, vehicle)"));
  assert.ok(app.includes("Historie změn identity zatím není ověřená."));
}
console.log("Fuel detail uses one unchanged stored group through explicit IDs, rejects guesses/conflicts and discloses historical uncertainty.");
