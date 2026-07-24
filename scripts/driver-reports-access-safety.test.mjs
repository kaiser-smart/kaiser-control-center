import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  collectionRoutesDriverKioskRedirectPath
} from "../src/data/collectionRoutesDriverKiosk.js";
import { hasPermission } from "../src/permissions.js";
import {
  driverPartRequestPermissionSummary
} from "../functions/_lib/driver-part-requests-store.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const modulesSource = readFileSync(new URL("../src/data/modules.js", import.meta.url), "utf8");
const serveSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");

const driver = {
  id: "driver-1",
  role: "ridic",
  active: true,
  status: "active",
  modules: ["tyres", "absence", "vehicle-tracking"]
};
const deniedDriver = {
  ...driver,
  deniedModules: ["driver-reports"]
};
const garageMaster = {
  id: "garage-1",
  role: "garazmistr",
  active: true,
  status: "active"
};

assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/hlaseni-ridicu"), "");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/hlaseni-ridicu/"), "");
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, "/vozovy-park"), "/trasy-svozu");

assert.equal(hasPermission(driver, "driver-reports", "view"), true);
assert.equal(hasPermission(driver, "driver-reports", "create"), true);
assert.equal(hasPermission(deniedDriver, "driver-reports", "view"), false);
assert.equal(hasPermission(deniedDriver, "driver-reports", "create"), false);

const garagePermissions = driverPartRequestPermissionSummary(garageMaster);
assert.equal(garagePermissions.canManage, true);
assert.equal(garagePermissions.canCreate, true);

assert.match(appSource, /handoffAfterCreate: false/);
assert.match(appSource, /Volba je výchozí vypnutá/);
assert.match(appSource, /Bez zaškrtnutí se hlášení jen uloží do servisní fronty a nic se neodešle mimo systém/);
assert.doesNotMatch(appSource, /Modul nic neodesílá automaticky\./);

assert.match(appSource, /function currentDriverReportDirtyTarget/);
assert.match(appSource, /return submitDriverReportForm\(driverReportTarget\.form\)/);
assert.match(appSource, /Rozepsané hlášení bylo zahozeno/);
assert.match(appSource, /guardedAccessAction\(\(\) => \{\s+setDriverReportTab/);

assert.match(appSource, /function driverReportMobileOwnReports/);
assert.match(appSource, /Moje hlášení/);
assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.driver-report-mobile-reports \{\s+display: grid;/);

assert.match(appSource, /driverReportTabButton\("rules", "Pravidla a automatizace", "Cloud"\)/);
assert.match(appSource, /function driverReportsRulesSection/);
assert.match(appSource, /ensureModuleRulesData\("driver-reports"\)/);
assert.match(appSource, /Seznam pravidel a automatizace/);

assert.match(appSource, /function driverReportPartslink24SelectionPanel/);
assert.match(appSource, /Výběr ND podle VIN/);
assert.match(appSource, /https:\/\/www\.partslink24\.com\//);
assert.doesNotMatch(appSource, /href="https:\/\/www\.partslink24\.com\/partslink24\/user\/login\.do"/);
assert.match(appSource, /data-driver-report-partslink24-selection-form/);
assert.match(serveSource, /\/api\/modules\/driver-reports\/rules/);
assert.match(serveSource, /\/api\/modules\/driver-reports\/automation-runs/);

assert.match(modulesSource, /id: "driver-reports"[\s\S]*?status: "Pilot"/);
assert.match(appSource, /moduleEventLogForModule\(\{ id: "driver-reports"[\s\S]*?status: "Pilot"/);
assert.doesNotMatch(appSource, /id: "driver-reports"[\s\S]{0,180}status: "Testování"/);

console.log("Driver reports access and safety: ok");
