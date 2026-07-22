import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
assert.match(moduleData, /id: "tyres"[\s\S]*?status: "Funkční přes API"/);
assert.match(targets, /tyres: \{ moduleKey: "tyres", moduleName: "Pneumatiky", repoKey: "kaiser-control-center", productionUrl: "https:\/\/smart-odpady\.ai\/pneumatiky" \}/);

console.log("tyres UI tests: ok");
