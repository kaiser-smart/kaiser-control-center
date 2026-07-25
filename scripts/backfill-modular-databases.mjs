import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const APPLY_TOKEN = "D1_MODULAR_BACKFILL_APPLY";
const apply = process.env[APPLY_TOKEN] === "true";
const schemaPath = resolve(process.argv.find((item) => item.startsWith("--schema="))?.slice(9) || "");
const domainFilter = process.argv.find((item) => item.startsWith("--domain="))?.slice(9) || "";
const tableFilter = process.argv.find((item) => item.startsWith("--table="))?.slice(8) || "";
const listOnly = process.argv.includes("--list");
if (!schemaPath) throw new Error("Chybí --schema=<legacy-schema.sql>.");

const architecture = readFileSync(new URL("../docs/D1_MODULAR_ARCHITECTURE.md", import.meta.url), "utf8");
const schema = readFileSync(schemaPath, "utf8");
const tempDirectory = listOnly ? "" : mkdtempSync(join(tmpdir(), "kcc-d1-modular-backfill-"));
const wranglerCommand = process.env.WRANGLER_COMMAND || "pnpm";
const wranglerPrefix = wranglerCommand === "pnpm" ? ["dlx", "wrangler@4.45.3"] : [];
const databases = {
  core: "SMART_ODPADY_CORE",
  messages: "SMART_ODPADY_MESSAGES",
  audit: "SMART_ODPADY_AUDIT",
  archive: "SMART_ODPADY_ARCHIVE"
};
const sectionBounds = {
  core: ["### CORE", "### MESSAGES"],
  messages: ["### MESSAGES", "### AUDIT"],
  audit: ["### AUDIT", "### ARCHIVE a R2"],
  archive: ["### ARCHIVE a R2", "## Stav fází"]
};
const protectedTables = new Set([
  "absence_requests",
  "absence_settings",
  "database_migration_log",
  "cross_database_workflows",
  "retention_policies",
  "fleet_vehicle_technical_profiles",
  "communication_events",
  "communication_messages",
  "communication_threads",
  "communication_unmatched_replies",
  "customer_message_consent",
  "customer_message_inbound",
  "customer_message_log",
  "customer_message_opt_out",
  "notification_logs",
  "rcs_message_dispatches",
  "rcs_template_sync",
  "rcs_template_sync_locks",
  "data_box_plus_rcs_notification_events",
  "data_box_plus_rcs_notifications",
  "rcs_sms_conversations",
  "rcs_sms_messages",
  "rcs_sms_requests",
  "rcs_sms_action_grants",
  "rcs_sms_tool_runs",
  "rcs_sms_webhook_events",
  "rcs_sms_events",
  "rcs_sms_idempotency_keys",
  "rcs_sms_runtime_config",
  "absence_approval_history",
  "audit_events",
  "workflow_attempts",
  "database_capacity_snapshots",
  "database_capacity_objects",
  "migration_preflight_runs",
  "archive_runs",
  "fleet_vehicle_technical_profile_events",
  "archive_batches",
  "archive_objects",
  "archive_integrity_checks"
]);
const r2ArchiveTables = new Set(["collection_import_rows", "receivable_import_rows"]);

function runWrangler(args, options = {}) {
  return execFileSync(wranglerCommand, [...wranglerPrefix, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
}

function tablesForDomain(domain) {
  const [start, end] = sectionBounds[domain];
  const section = architecture.slice(architecture.indexOf(start), architecture.indexOf(end));
  return [...new Set(
    [...section.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1])
  )].filter((name) => ![
    "d1_migrations",
    "r2_object_key",
    ...protectedTables,
    ...r2ArchiveTables
  ].includes(name));
}

function dependenciesFor(table) {
  const create = schema.match(new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${table}"?\\s*\\(([\\s\\S]*?)\\);`,
    "i"
  ))?.[1] || "";
  return [...new Set([...create.matchAll(/REFERENCES\s+"?([a-z][a-z0-9_]*)"?/gi)].map((match) => match[1]))];
}

function dependencyOrder(tables) {
  const selected = new Set(tables);
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(table) {
    if (visited.has(table)) return;
    if (visiting.has(table)) throw new Error(`Cyklická závislost tabulky ${table}.`);
    visiting.add(table);
    for (const dependency of dependenciesFor(table)) {
      if (selected.has(dependency)) visit(dependency);
    }
    visiting.delete(table);
    visited.add(table);
    ordered.push(table);
  }
  for (const table of tables) visit(table);
  return ordered;
}

function countInsertRows(sql, table) {
  const pattern = new RegExp(`^INSERT INTO "${table}"`, "gm");
  return [...sql.matchAll(pattern)].length;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function attachmentMetadataImport() {
  const columns = [
    "id", "message_id", "file_name", "mime_type", "size_bytes", "storage_key",
    "storage_status", "text_extraction_status", "error_reason",
    "created_at", "updated_at"
  ];
  const raw = runWrangler([
    "d1", "execute", "smart-odpady", "--remote",
    "--command", `SELECT ${columns.map((column) => `"${column}"`).join(",")} FROM "data_box_plus_attachments" ORDER BY "id";`,
    "--json"
  ]);
  const rows = JSON.parse(raw)?.[0]?.results || [];
  const statements = ["PRAGMA defer_foreign_keys=TRUE;"];
  for (const row of rows) {
    if (!String(row.storage_key || "").trim() && Number(row.size_bytes || 0) > 0) {
      throw new Error(`Nenulová příloha ${row.id} nemá R2 storage_key.`);
    }
    const values = columns.map((column) => sqlValue(row[column]));
    statements.push(
      `INSERT OR REPLACE INTO "data_box_plus_attachments" (${columns.map((column) => `"${column}"`).join(",")}) VALUES(${values.join(",")});`
    );
  }
  const sql = `${statements.join("\n")}\n`;
  return { rows: rows.length, sql, checksum: createHash("sha256").update(sql).digest("hex") };
}

function targetCount(database, table) {
  const raw = runWrangler([
    "d1", "execute", database, "--remote",
    "--command", `SELECT COUNT(*) AS count FROM "${table}";`,
    "--json"
  ]);
  const parsed = JSON.parse(raw);
  return Number(parsed?.[0]?.results?.[0]?.count || 0);
}

const domains = domainFilter ? [domainFilter] : Object.keys(databases);
const report = [];
for (const domain of domains) {
  if (!databases[domain]) throw new Error(`Neznámá doména ${domain}.`);
  let tables = dependencyOrder(tablesForDomain(domain));
  if (tableFilter) tables = tables.filter((table) => table === tableFilter);
  if (listOnly) {
    report.push({ domain, tables });
    continue;
  }

  for (const table of tables) {
    const exportPath = join(tempDirectory, `${domain}-${table}-source.sql`);
    const importPath = join(tempDirectory, `${domain}-${table}-target.sql`);
    if (table === "data_box_plus_attachments") {
      process.stderr.write(`[${domain}] select metadata ${table}\n`);
      const attachmentImport = attachmentMetadataImport();
      if (!apply) {
        report.push({
          domain,
          table,
          sourceRows: attachmentImport.rows,
          targetRows: null,
          checksum: attachmentImport.checksum,
          status: "planned"
        });
        continue;
      }
      writeFileSync(importPath, attachmentImport.sql);
      process.stderr.write(`[${domain}] import metadata ${table} (${attachmentImport.rows})\n`);
      runWrangler([
        "d1", "execute", databases[domain], "--remote", "--file", importPath
      ], { stdio: ["ignore", "ignore", "pipe"] });
      const targetRows = targetCount(databases[domain], table);
      if (targetRows !== attachmentImport.rows) {
        throw new Error(`${domain}.${table}: zdroj ${attachmentImport.rows}, cíl ${targetRows}.`);
      }
      report.push({
        domain,
        table,
        sourceRows: attachmentImport.rows,
        targetRows,
        checksum: attachmentImport.checksum,
        status: "verified_metadata_only"
      });
      continue;
    }
    process.stderr.write(`[${domain}] export ${table}\n`);
    runWrangler([
      "d1", "export", "smart-odpady", "--remote", "--no-schema",
      "--table", table, "--output", exportPath
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const sourceSql = readFileSync(exportPath, "utf8");
    const sourceRows = countInsertRows(sourceSql, table);
    const checksum = createHash("sha256").update(sourceSql).digest("hex");
    if (!sourceRows) {
      report.push({ domain, table, sourceRows: 0, targetRows: targetCount(databases[domain], table), checksum, status: "empty" });
      continue;
    }
    if (!apply) {
      report.push({ domain, table, sourceRows, targetRows: null, checksum, status: "planned" });
      continue;
    }
    const importSql = sourceSql.replace(
      new RegExp(`^INSERT INTO "${table}"`, "gm"),
      `INSERT OR REPLACE INTO "${table}"`
    );
    writeFileSync(importPath, importSql);
    process.stderr.write(`[${domain}] import ${table} (${sourceRows})\n`);
    runWrangler([
      "d1", "execute", databases[domain], "--remote", "--file", importPath
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const targetRows = targetCount(databases[domain], table);
    if (targetRows !== sourceRows) {
      throw new Error(`${domain}.${table}: zdroj ${sourceRows}, cíl ${targetRows}.`);
    }
    report.push({ domain, table, sourceRows, targetRows, checksum, status: "verified" });
  }
}

console.log(JSON.stringify({
  apply,
  protectedTables: [...protectedTables],
  r2ArchiveTables: [...r2ArchiveTables],
  report
}, null, 2));
