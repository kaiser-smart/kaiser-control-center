import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("This preparation runs only in cloud CI.");
const file = "src/app.js";
const source = readFileSync(file, "utf8");
const blob = createHash("sha1").update("blob " + Buffer.byteLength(source) + "\0").update(source).digest("hex");
const edits = [
  [
    "orwiiFuelVehicleSummary(fleetFuelState.analytics || {}, vehicle.id)",
    "orwiiFuelVehicleSummary(fleetFuelState.analytics || {}, vehicle)"
  ],
  [
    "${hasCosts ? `\n        <div class=\"fleet-cost-grid\">",
    "${hasCosts ? `\n        ${fuel?.identityScope === \"stored_transaction_group\" ? `<p class=\"fuel-source-note\">Částky odpovídají uloženému spárování tankování. Historie změn identity zatím není ověřená.</p>` : \"\"}\n        <div class=\"fleet-cost-grid\">"
  ]
];
const alreadyApplied = edits.every(([before, after]) => !source.includes(before) && source.split(after).length - 1 === 1);
if (!alreadyApplied && blob !== "8a910c8d91a70039001d9dbbd10e8ad3ac26038a") throw new Error("Source changed; re-read and review instead of overwriting.");
let result = source;
for (const [before, after] of alreadyApplied ? [] : edits) {
  if (result.split(before).length - 1 !== 1) throw new Error("Expected exactly one edit anchor.");
  result = result.replace(before, after);
}
if (process.argv.includes("--apply") && !alreadyApplied) writeFileSync(file, result);
console.log(JSON.stringify({ file, sourceBlob: blob, edits: edits.length, alreadyApplied, appliedInCloudWorkspace: process.argv.includes("--apply"), commitsOrPushes: false }));
