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
assert.match(backend, /allTerminal/);
assert.match(frontend, /SMART_ODPADY_DB – legacy pouze pro auditované čtení/);
assert.match(frontend, /Ukončení cloudových cronů/);
assert.match(frontend, /kontrola \$\{formatDateTime\(database\.recorded_at\)\}/);

console.log("system check modular database and cron status tests: ok");
