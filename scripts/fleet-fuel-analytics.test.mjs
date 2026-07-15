import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { FLEET_REQUIRED_SECTIONS } from "../src/data/fleet.js";
import {
  filterOrwiiFuelTransactions,
  orwiiFuelPeriod,
  orwiiFuelSummary,
  orwiiFuelVehicleSummary
} from "../src/data/orwiiFuelAnalytics.js";

assert.equal(orwiiFuelPeriod("12m").label, "12 měsíců");
assert.equal(orwiiFuelPeriod("unknown").id, "30d");
const vehicleIndex = FLEET_REQUIRED_SECTIONS.findIndex((section) => section.id === "vehicles");
assert.equal(FLEET_REQUIRED_SECTIONS[vehicleIndex + 1].id, "fuel");

const analytics = {
  summary: { transactionCount: 3, liters: 70, totalCost: 2320, averageUnitPrice: 33.143, matchedCount: 1, unmatchedCount: 1, ambiguousCount: 1, matchCoverage: 0.3333 },
  byVehicle: [{ key: "vehicle-1", transactionCount: 1, liters: 40, totalCost: 1520 }]
};
assert.equal(orwiiFuelSummary(analytics).liters, 70);
assert.equal(orwiiFuelVehicleSummary(analytics, "vehicle-1").totalCost, 1520);
assert.equal(orwiiFuelVehicleSummary(analytics, "vehicle-2"), null);

const transactions = [
  { externalId: "a", licensePlate: "1AB 2345", fuelType: "Nafta", matchStatus: "matched" },
  { externalId: "b", licensePlate: "9ZZ 9999", fuelType: "AdBlue", matchStatus: "unmatched" }
];
assert.equal(filterOrwiiFuelTransactions(transactions, { status: "matched" }).length, 1);
assert.equal(filterOrwiiFuelTransactions(transactions, { search: "9zz", fuelType: "all", status: "all" })[0].externalId, "b");

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
assert.match(appSource, /Seznam tankování/);
assert.match(appSource, /PHM podle období a vozidel/);
assert.match(appSource, /transakční hodnota CZK z ORWII/);
assert.doesNotMatch(appSource, /Cena PHM/);
assert.match(appSource, /Report tankování a PHM/);
assert.match(appSource, /data-fuel-period/);
assert.doesNotMatch(appSource, /Načíst tankování|Načíst PHM|Importovat tankování/);
assert.match(styleSource, /\.fuel-kpis/);
assert.match(styleSource, /@media \(max-width: 430px\)/);

console.log("fleet fuel analytics tests: ok");
