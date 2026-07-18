import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  UI_ACTION_AUDIT_CASES,
  auditUiActionContractSources,
  uiActionAuditHarnessHtml,
  uiActionContractAttributes,
  uiActionContractView
} from "../src/data/uiActionContract.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.equal(UI_ACTION_AUDIT_CASES.length, 4);
assert.deepEqual(auditUiActionContractSources(appSource, stylesSource), []);

const busy = uiActionContractView({
  id: "safe-action",
  busy: true,
  idleLabel: "Spustit",
  busyLabel: "Pracuji…",
  successLabel: "Hotovo"
});
assert.deepEqual(busy, {
  id: "safe-action",
  state: "busy",
  label: "Pracuji…",
  busy: true,
  disabled: true
});
assert.match(uiActionContractAttributes(busy), /data-ui-action-state="busy"/);
assert.match(uiActionContractAttributes(busy), /aria-busy="true"/);
assert.match(uiActionContractAttributes(busy), /disabled/);

const success = uiActionContractView({
  id: "safe-action",
  outcome: "success",
  idleLabel: "Spustit",
  successLabel: "Hotovo"
});
assert.equal(success.state, "success");
assert.equal(success.label, "Hotovo");
assert.equal(success.disabled, false);

const harness = uiActionAuditHarnessHtml(stylesSource);
assert.match(harness, /Izolovaný audit odezvy tlačítek/);
assert.match(harness, /dataset\.uiDuplicateBlocked/);
assert.match(harness, /button\.disabled = true/);
assert.match(harness, /}, 3000\);/);
assert.doesNotMatch(harness, /\bfetch\s*\(/);
assert.doesNotMatch(harness, /XMLHttpRequest/);

const lateRenderSource = appSource.replace(
  "collectionRoutesPilotState.kommunalPairingLoading = true;",
  "await Promise.resolve();\n  collectionRoutesPilotState.kommunalPairingLoading = true;"
);
assert.ok(
  auditUiActionContractSources(lateRenderSource, stylesSource)
    .some((finding) => finding.key.includes("collection-routes-vistos-refresh:busy_render_late"))
);

console.log("UI action contract tests passed.");
