import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MAIN_DASHBOARD_ECONOMICS_METRICS,
  MAIN_DASHBOARD_ECONOMICS_SOURCES,
  mainDashboardDistanceCompositionRows,
  mainDashboardEconomicsReady,
  mainDashboardPeriod,
  mainDashboardUnitEconomicsRows,
  mainDashboardVehicleSnapshot
} from "../src/data/mainDashboard.js";

{
  assert.equal(mainDashboardPeriod("today").label, "Dnes");
  assert.equal(mainDashboardPeriod("unknown").id, "30d");
  assert.equal(MAIN_DASHBOARD_ECONOMICS_METRICS.length, 5);
  assert.equal(MAIN_DASHBOARD_ECONOMICS_SOURCES.length, 3);
  assert.deepEqual(MAIN_DASHBOARD_ECONOMICS_SOURCES.find((source) => source.id === "cost-data"), {
    id: "cost-data",
    label: "Náklady a PHM",
    state: "running",
    status: "Běží",
    detail: "ORWII PHM se automaticky synchronizuje do D1 a je dostupné pro read-only statistiky. Úplné přímé náklady čekají na další zdroje."
  });
}

{
  const snapshot = mainDashboardVehicleSnapshot([
    { id: "moving", speedKmh: 48 },
    { id: "standing", speedKmh: 0 },
    { id: "unknown" }
  ], [{ id: "offline" }]);
  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.movingCount, 1);
  assert.equal(snapshot.standingCount, 1);
  assert.equal(snapshot.unknownMotionCount, 1);
  assert.equal(snapshot.noSignalCount, 1);
  assert.equal(snapshot.fastestLocation.id, "moving");
  assert.equal(snapshot.fastestSpeed, 48);
  assert.equal(snapshot.averageMovingSpeed, 48);
}

{
  const rows = mainDashboardDistanceCompositionRows([
    { id: "truck-a", label: "MAN 01", productiveKm: 120, deadheadKm: 30, totalKm: 180 },
    { id: "truck-b", label: "MAN 02", productiveKm: 80, deadheadKm: 20, unclassifiedKm: 10 }
  ]);
  assert.equal(rows[0].unclassifiedKm, 30);
  assert.equal(rows[0].productiveShare, 2 / 3);
  assert.equal(rows[0].classifiedCoverage, 5 / 6);
  assert.equal(rows[1].totalKm, 110);
}

{
  const rows = mainDashboardUnitEconomicsRows([
    { id: "truck-a", totalKm: 200, revenue: 10000, directCost: 7000 },
    { id: "truck-b", totalKm: 0, revenue: 5000, directCost: 4000 }
  ]);
  assert.equal(rows[0].revenuePerKm, 50);
  assert.equal(rows[0].costPerKm, 35);
  assert.equal(rows[0].marginPerKm, 15);
  assert.equal(rows[0].comparable, true);
  assert.equal(rows[1].comparable, false);
}

{
  assert.equal(mainDashboardEconomicsReady({
    "trip-history": "ready",
    "job-pairing": "ready",
    "cost-data": "ready"
  }), true);
  assert.equal(mainDashboardEconomicsReady({ "trip-history": "ready" }), false);
}

{
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /Produktivní vs\. přejezdové km/);
  assert.match(appSource, /Výnos\/km vs\. náklad\/km/);
  assert.match(appSource, /Nezařazené km/);
  assert.match(appSource, /data-main-dashboard-period/);
  assert.match(appSource, /Tankování za zvolené období/);
  assert.match(styleSource, /\.main-dashboard-economics/);
  assert.match(styleSource, /\.main-dashboard-chart/);
}

console.log("main dashboard tests: ok");
