import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tyresHistoryQuery,
  tyresInventoryQuery,
  tyresPositionCode,
  tyresPositionLayout,
  tyresServiceTotal,
  tyresTab
} from "../src/data/tyresUi.js";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tyresUi = readFileSync(new URL("../src/data/tyresUi.js", import.meta.url), "utf8");
const tyresApi = readFileSync(new URL("../functions/api/tyres.js", import.meta.url), "utf8");
const fitmentsApi = readFileSync(new URL("../functions/api/tyres/fitments.js", import.meta.url), "utf8");
const bulkApi = readFileSync(new URL("../functions/api/tyres/measurements/bulk.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0052_extend_tyres_workflows.sql", import.meta.url), "utf8");
const moduleData = readFileSync(new URL("../src/data/modules.js", import.meta.url), "utf8");
const targets = readFileSync(new URL("../functions/_lib/self-repair-targets.js", import.meta.url), "utf8");

assert.match(app, /function tyresModulePage\(/);
assert.match(app, /if \(moduleItem\.id === "tyres"\) \{\s*return tyresModulePage\(moduleItem, user\);/);
assert.match(app, /apiJson\("\/api\/tyres"\)/);
assert.match(app, /data-tyres-tyre-form/);
assert.match(app, /data-tyres-measurement-form/);
assert.match(app, /data-tyres-service-form/);
assert.match(app, /data-tyres-refresh/);
assert.match(app, /data-tyres-edit/);
assert.match(app, /data-tyres-tab/);
assert.match(app, /data-tyres-search/);
assert.match(app, /data-tyres-filter/);
assert.match(app, /data-tyres-sort/);
assert.match(app, /data-tyres-page-size/);
assert.match(app, /data-tyres-open-detail/);
assert.match(app, /data-tyres-open-vehicle/);
assert.match(app, /data-tyres-vehicle-position/);
assert.match(app, /data-tyres-fitment-form/);
assert.match(app, /data-tyres-mm-toggle/);
assert.match(app, /data-tyres-bulk-measurement-form/);
assert.match(app, /data-tyres-service-total/);
assert.match(app, /Data se nepodařilo načíst/);
assert.match(app, /Žádné výsledky vyhledávání/);
assert.match(app, /Nemáte oprávnění zapisovat měření/);
assert.match(app, /function currentTyresDirtyTarget\(/);
assert.match(app, /function saveTyresDirtyChanges\(/);
assert.match(app, /data-tyres-measurement-tyre/);
assert.match(app, /latestImport/);
assert.match(app, /Převod zatím nebyl v této evidenci spuštěn/);
assert.doesNotMatch(app, /kaiser-smart\.github\.io\/kaiser-pneu-evidence/);
assert.doesNotMatch(app, /TYRES_MODULE_URL/);

assert.match(styles, /\.tyres-page/);
assert.match(styles, /\.tyres-kpi-grid/);
assert.match(styles, /\.tyres-form__grid/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(styles, /\.tyres-data-table/);
assert.match(styles, /\.tyres-detail-drawer/);
assert.match(styles, /\.tyres-vehicle-map/);
assert.match(styles, /\.tyres-mm-panel/);
assert.match(styles, /@media \(max-width: 1050px\)/);
assert.match(styles, /@media \(max-width: 390px\)/);
assert.match(tyresUi, /Přehled/);
assert.match(tyresUi, /Servis a náklady/);
assert.match(tyresUi, /pageSize/);
assert.match(tyresApi, /view === "inventory"/);
assert.match(tyresApi, /view === "overview"/);
assert.match(fitmentsApi, /fitTyre/);
assert.match(bulkApi, /createTyreMeasurements/);
assert.match(migration, /tyre_service_record_tyres/);
assert.match(moduleData, /id: "tyres"[\s\S]*?status: "Funkční přes API"/);
assert.match(targets, /tyres: \{ moduleKey: "tyres", moduleName: "Pneumatiky", repoKey: "kaiser-control-center", productionUrl: "https:\/\/smart-odpady\.ai\/pneumatiky" \}/);

assert.equal(tyresTab("vehicles"), "vehicles");
assert.equal(tyresTab("unknown"), "overview");
assert.equal(tyresServiceTotal({ labor: 1000, material: "250", tireCost: 500 }), 1750);
assert.equal(tyresServiceTotal({ labor: -100, material: "bad", tireCost: 50 }), 50);
assert.equal(tyresPositionCode("L"), "row-0-left-single");
assert.equal(tyresPositionCode("HL vnitřní", 2, ["L", "P", "HL vnitřní", "HL vnější"]), "row-1-left-inner");
assert.equal(tyresPositionLayout("VL", 2, ["L", "P", "VL", "VP", "ZL", "ZP"]).row, 1);
assert.equal(tyresPositionLayout("ZL", 4, ["L", "P", "VL", "VP", "ZL", "ZP"]).row, 2);
assert.equal(tyresPositionLayout("VL vnější", 7, ["L", "P", "HL vnitřní", "HL vnější", "HP vnitřní", "HP vnější", "VL vnitřní", "VL vnější", "VP vnitřní", "VP vnější"]).row, 2);
const inventoryQuery = new URL(tyresInventoryQuery({ q: "AH31", page: 0, pageSize: 100, state: "sklad", direction: "asc" }), "https://local.test");
assert.equal(inventoryQuery.searchParams.get("view"), "inventory");
assert.equal(inventoryQuery.searchParams.get("q"), "AH31");
assert.equal(inventoryQuery.searchParams.get("page"), "1");
assert.equal(inventoryQuery.searchParams.get("pageSize"), "100");
assert.equal(inventoryQuery.searchParams.get("state"), "sklad");
const historyQuery = new URL(tyresHistoryQuery({ type: "services", page: 2, pageSize: 50 }), "https://local.test");
assert.equal(historyQuery.searchParams.get("type"), "services");
assert.equal(historyQuery.searchParams.get("page"), "2");
assert.equal(historyQuery.searchParams.get("pageSize"), "50");

console.log("tyres UI tests: ok");
