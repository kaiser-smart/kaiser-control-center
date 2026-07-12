import assert from "node:assert/strict";
import {
  COLLECTION_ROUTES_TEST_ALLOWED_CONTAINER_VOLUMES,
  COLLECTION_ROUTES_TEST_COMPANY_COUNT,
  COLLECTION_ROUTES_TEST_SITE_COUNT,
  buildCollectionRoutesTestDataset
} from "../functions/_lib/collection-routes-test-data.js";

const input = {
  phone: "+420600000000",
  email: "route-test@example.invalid"
};
const first = buildCollectionRoutesTestDataset(input);
const second = buildCollectionRoutesTestDataset(input);

assert.equal(first.siteCount, COLLECTION_ROUTES_TEST_SITE_COUNT);
assert.equal(first.companyCount, COLLECTION_ROUTES_TEST_COMPANY_COUNT);
assert.equal(first.rows.length, 500);
assert.deepEqual(first.rows, second.rows, "Generátor musí být deterministický.");
assert.equal(new Set(first.rows.map((row) => row.sourceId)).size, 500);
assert.equal(new Set(first.rows.map((row) => row.siteKey)).size, 500);
assert.equal(new Set(first.rows.map((row) => row.customerName)).size, 100);
assert.ok(first.rows.every((row) => row.customerName.startsWith("Test ") && row.customerName.endsWith(" s.r.o.")));
assert.ok(first.rows.every((row) => row.phone === input.phone && row.email === input.email));
assert.ok(first.rows.every((row) => row.dataScope === "test" && row.svozKaiserIncluded === true));
assert.ok(first.rows.every((row) => row.issueCount === 0 && row.issues.length === 0));
assert.ok(first.rows.every((row) => row.addressCity === "Brno" && row.addressRaw.includes("Brno")));
assert.ok(first.rows.every((row) => row.latitude >= 49.05 && row.latitude <= 49.35));
assert.ok(first.rows.every((row) => row.longitude >= 16.35 && row.longitude <= 16.85));
assert.ok(first.rows.every((row) => COLLECTION_ROUTES_TEST_ALLOWED_CONTAINER_VOLUMES.includes(row.containerVolume)));
assert.deepEqual(first.summary.containerVolumeCounts, { "120": 225, "240": 175, "1100": 100 });
assert.equal(first.summary.wasteCounts.SKO, 350);
assert.equal(Object.values(first.summary.wasteCounts).reduce((sum, value) => sum + value, 0), 500);
assert.deepEqual(Object.keys(first.summary.frequencyCounts).sort(), ["1x14", "1x30", "1x7", "2x7", "3x7", "5x7"]);

const weeklyDayCounts = { "1x7": 1, "2x7": 2, "3x7": 3, "5x7": 5 };
for (const [frequency, dayCount] of Object.entries(weeklyDayCounts)) {
  const rows = first.rows.filter((row) => row.frequency === frequency);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.pickupSchedule.mode === "weekly"));
  assert.ok(rows.every((row) => row.pickupSchedule.dayCodes.length === dayCount));
  assert.ok(rows.every((row) => row.pickupSchedule.parities.join(",") === "odd,even"));
  assert.ok(rows.every((row) => {
    const entries = row.pickupDaysText.split(", ");
    return entries.length === dayCount * 2 && row.pickupSchedule.dayCodes.every((_dayCode, index) => {
      const odd = entries[index * 2].replace(/ lichá$/, "");
      const even = entries[(index * 2) + 1].replace(/ sudá$/, "");
      return entries[index * 2].endsWith(" lichá") && entries[(index * 2) + 1].endsWith(" sudá") && odd === even;
    });
  }), `${frequency} musí mít každý den zrcadlený 1:1 do lichého i sudého týdne.`);
}

const fortnightlyRows = first.rows.filter((row) => row.frequency === "1x14");
assert.ok(fortnightlyRows.every((row) => row.pickupSchedule.mode === "fortnightly"));
assert.ok(fortnightlyRows.every((row) => row.pickupSchedule.dayCodes.length === 1));
assert.ok(fortnightlyRows.every((row) => row.pickupSchedule.parities.length === 1));

const monthlyRows = first.rows.filter((row) => row.frequency === "1x30");
assert.equal(monthlyRows.length, 25);
assert.ok(monthlyRows.every((row) => row.pickupSchedule.mode === "monthly-weekday"));
assert.ok(monthlyRows.every((row) => row.pickupSchedule.dayCodes.length === 1));
assert.ok(monthlyRows.every((row) => row.pickupSchedule.parities.join(",") === "all"));
assert.ok(monthlyRows.every((row) => row.pickupSchedule.weekOfMonth >= 1 && row.pickupSchedule.weekOfMonth <= 4));
assert.ok(monthlyRows.every((row) => /^\d\. (pondělí|úterý|středa|čtvrtek|pátek) v měsíci$/.test(row.pickupDaysText)));

for (let companyNumber = 1; companyNumber <= 100; companyNumber += 1) {
  const companyRows = first.rows.filter((row) => row.customerName === `Test ${companyNumber} s.r.o.`);
  assert.equal(companyRows.length, 5);
  assert.ok(companyRows.every((row) => row.contact === `Radim${companyNumber} Test${companyNumber}`));
}

assert.throws(
  () => buildCollectionRoutesTestDataset({ phone: "604000000", email: input.email }),
  /mezinárodním formátu/
);
assert.throws(
  () => buildCollectionRoutesTestDataset({ phone: input.phone, email: "invalid" }),
  /platný serverový e-mailový cíl/
);

console.log("Collection routes TEST Brno 500 data tests passed.");
