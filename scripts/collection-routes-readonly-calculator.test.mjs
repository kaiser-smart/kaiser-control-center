import assert from "node:assert/strict";
import {
  calculateCollectionRoutesReadonlyPlan,
  collectionRoutesCalculatorWasteType
} from "../src/data/collectionRoutesReadonlyCalculator.js";
import { COLLECTION_ROUTE_VEHICLES } from "../src/data/collectionRouteVehicles.js";
import { buildCollectionRoutesTestDataset } from "../functions/_lib/collection-routes-test-data.js";

function sourceRow(id, rowNumber, summary) {
  return { id, rowNumber, summary: { customerName: `Test ${rowNumber}`, stationName: `Stanoviště ${rowNumber}`, ...summary } };
}

const sourceRows = [
  sourceRow("sko-1100", 1, { wasteType: "SKO", containerVolume: 1100, containerCount: 2 }),
  sourceRow("sko-240", 2, { wasteType: "směsný komunální", containerVolume: 240, containerCount: 1 }),
  sourceRow("paper-120", 3, { wasteType: "PAPÍR", containerVolume: 120, containerCount: 2 }),
  sourceRow("plastic-1100", 4, { wasteType: "PLAST", containerVolume: 1100, containerCount: 1 }),
  sourceRow("bio-240", 5, { wasteType: "BIO", containerVolume: 240, containerCount: 1 })
];
const eligibleRows = sourceRows.map((row) => ({ sourceRowId: row.id }));

const calculation = calculateCollectionRoutesReadonlyPlan({
  routeDate: "2026-07-13",
  dateInfo: { routeDate: "2026-07-13", dayLabel: "pondělí", weekMode: "lichý týden" },
  eligibleRows,
  sourceRows
});

assert.equal(calculation.version, "1.1");
assert.equal(calculation.status, "needs-review");
assert.equal(calculation.statusLabel, "READ-ONLY · POTŘEBUJE DOPLNĚNÍ");
assert.deepEqual(calculation.totals, {
  stopCount: 5,
  containerCount: 7,
  serviceMinutes: 27,
  knownWeightTons: 0.159,
  unknownWeightStopCount: 1
});
assert.equal(calculation.vehicles.length, 3);
assert.equal(calculation.vehicles.reduce((sum, vehicle) => sum + vehicle.stopCount, 0), 5);
assert.equal(calculation.vehicles.reduce((sum, vehicle) => sum + vehicle.containerCount, 0), 7);
assert.equal(calculation.vehicles.reduce((sum, vehicle) => sum + vehicle.serviceMinutes, 0), 27);
assert.equal(calculation.createsRoute, false);
assert.equal(calculation.writesData, false);
assert.equal(calculation.sendsNotifications, false);
assert.deepEqual(
  calculation.vehicles.map((vehicle) => [vehicle.code, vehicle.capacities.SKO]),
  [["A", 5.5], ["B", 5.8], ["C", 9.6]]
);

for (const vehicle of COLLECTION_ROUTE_VEHICLES) {
  assert.equal(
    vehicle.technical.maximumPermittedWeightKg - vehicle.technical.emptyWeightKg,
    vehicle.technical.payloadCapacityKg,
    `Vůz ${vehicle.code} musí mít nosnost rovnou rozdílu nejvyšší a prázdné hmotnosti.`
  );
  assert.ok(
    Object.values(vehicle.capacitiesTons).every((capacityTons) => capacityTons * 1000 <= vehicle.technical.payloadCapacityKg),
    `Provozní kapacita vozu ${vehicle.code} nesmí překročit nosnost.`
  );
}
assert.equal(COLLECTION_ROUTE_VEHICLES.find((vehicle) => vehicle.code === "C")?.capacitiesTons.SKO, 9.6);

const wasteSummaries = calculation.vehicles.flatMap((vehicle) => vehicle.wasteSummaries);
assert.ok(wasteSummaries.some((waste) => waste.wasteType === "SKO" && waste.capacityKnown));
assert.ok(wasteSummaries.some((waste) => waste.wasteType === "PLAST" && waste.operatingWindow.status === "blocked"));
assert.ok(wasteSummaries.some((waste) => waste.wasteType === "BIO" && !waste.capacityKnown));
assert.ok(calculation.blockers.some((message) => message.includes("Fertia")));
assert.ok(calculation.blockers.some((message) => message.includes("Interní a veřejná provozní doba")));
assert.ok(calculation.limitations.some((message) => message.includes("Neurčuje pořadí ulic ani optimální trasu")));
assert.deepEqual(
  calculation,
  calculateCollectionRoutesReadonlyPlan({
    routeDate: "2026-07-13",
    dateInfo: { routeDate: "2026-07-13", dayLabel: "pondělí", weekMode: "lichý týden" },
    eligibleRows,
    sourceRows
  }),
  "Stejný vstup musí dát přesně stejný read-only výsledek."
);

assert.equal(collectionRoutesCalculatorWasteType("papír a lepenka"), "PAPIR");
assert.equal(collectionRoutesCalculatorWasteType("směsný komunální odpad"), "SKO");
assert.equal(collectionRoutesCalculatorWasteType("biologicky rozložitelný"), "BIO");

const empty = calculateCollectionRoutesReadonlyPlan({ routeDate: "2026-07-14" });
assert.equal(empty.status, "empty");
assert.equal(empty.totals.stopCount, 0);
assert.equal(empty.vehicles.length, 3);
assert.equal(empty.createsRoute, false);

const incomplete = calculateCollectionRoutesReadonlyPlan({
  routeDate: "2026-07-13",
  eligibleRows: [{ sourceRowId: "missing", wasteType: "SKO", containerVolume: 1100 }],
  sourceRows: []
});
assert.ok(incomplete.blockers.some((message) => message.includes("nemá úplný zdrojový TEST řádek")));

const generated = buildCollectionRoutesTestDataset({
  phone: "+420700000000",
  email: "readonly-calculator@example.test"
});
const generatedSourceRows = generated.rows.map((summary, index) => ({
  id: `generated-${index + 1}`,
  rowNumber: summary.rowNumber,
  summary
}));
const scaleCalculation = calculateCollectionRoutesReadonlyPlan({
  routeDate: "2026-07-13",
  eligibleRows: generatedSourceRows.map((row) => ({ sourceRowId: row.id })),
  sourceRows: generatedSourceRows
});
assert.equal(scaleCalculation.totals.stopCount, 501);
assert.equal(scaleCalculation.vehicles.reduce((sum, vehicle) => sum + vehicle.stopCount, 0), 501);
assert.ok(scaleCalculation.totals.containerCount >= 501);
assert.ok(scaleCalculation.totals.serviceMinutes > 0);
assert.ok(scaleCalculation.totals.knownWeightTons > 0);

console.log("Collection routes read-only calculator tests passed.");
