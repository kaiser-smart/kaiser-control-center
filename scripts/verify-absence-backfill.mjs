import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [
  sourceRequestsPath,
  targetRequestsPath,
  sourceHistoryPath,
  targetHistoryPath
] = process.argv.slice(2);

if (!targetHistoryPath) {
  throw new TypeError(
    "Použití: node scripts/verify-absence-backfill.mjs <source-requests> <target-requests> <source-history> <target-history>"
  );
}

function loadDatabase(schemaPath, dataPath) {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(schemaPath, "utf8"));
  database.exec(readFileSync(dataPath, "utf8"));
  return database;
}

function tableRows(database, table) {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => String(column.name));
  return database
    .prepare(`SELECT ${columns.map((column) => `"${column}"`).join(", ")} FROM ${table} ORDER BY id`)
    .all();
}

function checksum(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

const coreSchema = new URL("../migrations/modular/core/0002_absence_core.sql", import.meta.url);
const auditSchema = new URL("../migrations/modular/audit/0002_absence_history.sql", import.meta.url);

const sourceCore = loadDatabase(coreSchema, sourceRequestsPath);
const targetCore = loadDatabase(coreSchema, targetRequestsPath);
const sourceAudit = loadDatabase(auditSchema, sourceHistoryPath);
const targetAudit = loadDatabase(auditSchema, targetHistoryPath);

const sourceRequests = tableRows(sourceCore, "absence_requests");
const targetRequests = tableRows(targetCore, "absence_requests");
const sourceHistory = tableRows(sourceAudit, "absence_approval_history");
const targetHistory = tableRows(targetAudit, "absence_approval_history");

const result = {
  requests: {
    sourceCount: sourceRequests.length,
    targetCount: targetRequests.length,
    sourceChecksum: checksum(sourceRequests),
    targetChecksum: checksum(targetRequests)
  },
  history: {
    sourceCount: sourceHistory.length,
    targetCount: targetHistory.length,
    sourceChecksum: checksum(sourceHistory),
    targetChecksum: checksum(targetHistory)
  },
  orphanHistory: targetHistory.filter(
    (history) => !targetRequests.some((request) => request.id === history.absence_request_id)
  ).length
};

assert.equal(result.requests.targetCount, result.requests.sourceCount);
assert.equal(result.requests.targetChecksum, result.requests.sourceChecksum);
assert.equal(result.history.targetCount, result.history.sourceCount);
assert.equal(result.history.targetChecksum, result.history.sourceChecksum);
assert.equal(result.orphanHistory, 0);

console.log(JSON.stringify(result, null, 2));
