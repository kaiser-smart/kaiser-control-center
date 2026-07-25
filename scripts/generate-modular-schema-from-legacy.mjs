import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaPath = resolve(process.argv[2] || "");
if (!schemaPath) throw new Error("Použití: node scripts/generate-modular-schema-from-legacy.mjs <schema.sql>");

const architecture = readFileSync(new URL("../docs/D1_MODULAR_ARCHITECTURE.md", import.meta.url), "utf8");
const schema = readFileSync(schemaPath, "utf8");
const sections = {
  core: ["### CORE", "### MESSAGES"],
  messages: ["### MESSAGES", "### AUDIT"],
  audit: ["### AUDIT", "### ARCHIVE a R2"],
  archive: ["### ARCHIVE a R2", "## Stav fází"]
};

const domainTables = {};
for (const [domain, [start, end]] of Object.entries(sections)) {
  const section = architecture.slice(architecture.indexOf(start), architecture.indexOf(end));
  domainTables[domain] = new Set(
    [...section.matchAll(/`([a-z][a-z0-9_]*)`/g)]
      .map((match) => match[1])
      .filter((name) => !["d1_migrations", "r2_object_key"].includes(name))
  );
}

domainTables.audit.add("ai_action_logs");
domainTables.core.add("fleet_vehicle_technical_profiles");
domainTables.audit.add("fleet_vehicle_technical_profile_events");

const tableDomain = new Map();
for (const [domain, tables] of Object.entries(domainTables)) {
  for (const table of tables) {
    if (tableDomain.has(table) && tableDomain.get(table) !== domain) {
      throw new Error(`Duplicitní doména tabulky ${table}.`);
    }
    tableDomain.set(table, domain);
  }
}

function statementTable(statement) {
  const createTable = statement.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+"?([^"\s(]+)"?/i);
  if (createTable) return createTable[1];
  const createIndex = statement.match(/^CREATE(?: UNIQUE)? INDEX(?: IF NOT EXISTS)?\s+"?[^"\s]+\s+ON\s+"?([^"\s(]+)"?/i);
  return createIndex?.[1] || "";
}

function makeIdempotent(statement) {
  if (/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS\s/i.test(statement)) {
    return statement;
  }
  if (/^CREATE TABLE\s/i.test(statement)) {
    return statement.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
  }
  if (/^CREATE UNIQUE INDEX\s/i.test(statement)) {
    return statement.replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ");
  }
  if (/^CREATE INDEX\s/i.test(statement)) {
    return statement.replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ");
  }
  return statement;
}

function removeCrossDomainReferences(statement, sourceTable) {
  const sourceDomain = tableDomain.get(sourceTable);
  let output = statement.replace(
    /,\s*FOREIGN KEY\s*\([^)]*\)\s+REFERENCES\s+"?([a-z][a-z0-9_]*)"?\s*\([^)]*\)(?:\s+ON DELETE\s+\w+)?/gi,
    (match, referencedTable) => tableDomain.get(referencedTable) === sourceDomain ? match : ""
  );
  output = output.replace(
    /\s+REFERENCES\s+"?([a-z][a-z0-9_]*)"?\s*\([^)]*\)(?:\s+ON DELETE\s+\w+)?/gi,
    (match, referencedTable) => tableDomain.get(referencedTable) === sourceDomain ? match : ""
  );
  return output;
}

const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(statement));

const outputs = Object.fromEntries(Object.keys(domainTables).map((domain) => [domain, []]));
const sourceTables = new Set();
for (const statement of statements) {
  const table = statementTable(statement);
  const domain = tableDomain.get(table);
  if (!domain || table === "d1_migrations") continue;
  sourceTables.add(table);
  outputs[domain].push(`${removeCrossDomainReferences(makeIdempotent(statement), table)};`);
}

const missing = [...tableDomain.keys()].filter((table) => !sourceTables.has(table));
const allowedMissing = new Set([
  "database_migration_log",
  "cross_database_workflows",
  "retention_policies",
  "rcs_sms_conversations",
  "rcs_sms_messages",
  "rcs_sms_requests",
  "rcs_sms_action_grants",
  "rcs_sms_tool_runs",
  "rcs_sms_webhook_events",
  "rcs_sms_events",
  "rcs_sms_idempotency_keys",
  "rcs_sms_runtime_config",
  "audit_events",
  "workflow_attempts",
  "database_capacity_snapshots",
  "database_capacity_objects",
  "migration_preflight_runs",
  "archive_runs",
  "archive_batches",
  "archive_objects",
  "archive_integrity_checks",
  "ai_action_logs",
  "fleet_vehicle_technical_profiles",
  "fleet_vehicle_technical_profile_events"
]);
const unexpectedMissing = missing.filter((table) => !allowedMissing.has(table));
if (unexpectedMissing.length) {
  throw new Error(`Ve zdrojovém schématu chybí tabulky: ${unexpectedMissing.join(", ")}`);
}

const targets = {
  core: new URL("../migrations/modular/core/0003_remaining_core_schema.sql", import.meta.url),
  messages: new URL("../migrations/modular/messages/0005_remaining_messages_schema.sql", import.meta.url),
  audit: new URL("../migrations/modular/audit/0003_remaining_audit_schema.sql", import.meta.url),
  archive: new URL("../migrations/modular/archive/0002_remaining_archive_schema.sql", import.meta.url)
};
for (const [domain, target] of Object.entries(targets)) {
  const header = `-- Generated from the production legacy schema. No data and no cross-D1 foreign keys.\n`;
  writeFileSync(target, `${header}${outputs[domain].join("\n\n")}\n`);
}

console.log(JSON.stringify({
  generated: Object.fromEntries(Object.entries(outputs).map(([domain, items]) => [domain, items.length])),
  sourceTables: sourceTables.size,
  missing: [...allowedMissing].filter((table) => missing.includes(table))
}, null, 2));
