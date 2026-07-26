import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("functions/_lib/production-monitor-store.js", "utf8");
const frontend = readFileSync("src/app.js", "utf8");

for (const domain of ["core", "messages", "audit", "archive"]) {
  assert.match(backend, new RegExp(`["']${domain}["']`));
}
assert.match(backend, /modularComplete:\s*databases\.length === 4/);
assert.match(backend, /legacyDatabase/);
assert.match(backend, /nonTerminalCount/);
assert.match(backend, /nonTerminalBySource/);
for (const table of [
  "module_automation_runner_runs",
  "module_automation_runs",
  "data_box_plus_sync_runs",
  "vehicle_tracking_history_runs",
  "vehicle_tracking_analytics_runs",
  "fleet_trip_job_pairing_runs",
  "fleet_orwii_fuel_sync_runs",
  "archive_runs"
]) {
  assert.match(backend, new RegExp(`SELECT COUNT\\(\\*\\) FROM ${table}`));
}
assert.match(backend, /allTerminal/);
assert.match(frontend, /SMART_ODPADY_DB – legacy pouze pro auditované čtení/);
assert.match(frontend, /Ukončení cloudových cronů/);
assert.match(frontend, /kontrola \$\{formatDateTime\(database\.recorded_at\)\}/);
assert.match(frontend, /const displayStatus = !item\.terminal\s*\? "WARNING"/);

console.log("system check modular database and cron status tests: ok");
