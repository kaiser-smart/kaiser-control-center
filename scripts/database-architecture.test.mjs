import assert from "node:assert/strict";
import {
  databaseAvailability,
  getAuditDatabase,
  getCoreDatabase,
  getMessagesDatabase
} from "../functions/_lib/databases.js";
import {
  capacityState,
  estimateDaysToFull,
  migrationCapacityPreflight
} from "../functions/_lib/database-capacity.js";
import { runCollectionRoutesSnapshotAutomation } from "../functions/_lib/collection-routes-automation-runner.js";
import { runReceivablesInvoiceSyncAutomation } from "../functions/_lib/receivables-invoice-sync-runner.js";

const env = {
  DB_CORE: { name: "core" },
  DB_MESSAGES: { name: "messages" },
  DB_AUDIT: { name: "audit" },
  DB_ARCHIVE: { name: "archive" },
  SMART_ODPADY_DB: { name: "legacy" }
};

assert.equal(getCoreDatabase(env).name, "core");
assert.equal(getMessagesDatabase(env).name, "messages");
assert.equal(getAuditDatabase(env).name, "audit");
assert.equal(databaseAvailability(env).messages.binding, "DB_MESSAGES");
assert.throws(() => getMessagesDatabase({ SMART_ODPADY_DB: env.SMART_ODPADY_DB }), /DB_MESSAGES/);

assert.equal(capacityState(6_000_000_000).level, "information");
assert.equal(capacityState(7_000_000_000).level, "warning");
assert.equal(capacityState(8_000_000_000).reduceNonEssentialLogging, true);
assert.equal(capacityState(8_500_000_000).accelerateArchive, true);
assert.equal(capacityState(9_000_000_000).criticalIncident, true);
assert.equal(capacityState(9_500_000_000).blockBulkMigrations, true);

const days = estimateDaysToFull([
  { recordedAt: "2026-07-20T00:00:00.000Z", sizeBytes: 8_000_000_000 },
  { recordedAt: "2026-07-21T00:00:00.000Z", sizeBytes: 8_500_000_000 }
]);
assert.equal(days, 3);

assert.equal(migrationCapacityPreflight({
  currentSizeBytes: 8_000_000_000,
  estimatedTableBytes: 600_000_000,
  bookmark: "bookmark",
  rollbackCommand: "restore"
}).allowed, false);
assert.equal(migrationCapacityPreflight({
  currentSizeBytes: 5_000_000_000,
  estimatedTableBytes: 100_000_000,
  estimatedIndexBytes: 100_000_000,
  bookmark: "bookmark",
  rollbackCommand: "restore"
}).allowed, true);
assert.equal(migrationCapacityPreflight({
  currentSizeBytes: 1_000_000,
  estimatedIndexBytes: 10_000,
  indexedRowCount: 1_000_000,
  bookmark: "bookmark",
  rollbackCommand: "restore"
}).allowed, false);

let legacyCalls = 0;
const blocked = await runCollectionRoutesSnapshotAutomation({
  SMART_ODPADY_DB: {
    prepare() {
      legacyCalls += 1;
      throw new Error("Kapacitní pojistka nesmí zapisovat.");
    }
  },
  D1_CAPACITY_BLOCK_BULK_WRITES: "true"
}, { scheduledTime: Date.parse("2026-07-25T10:00:00.000Z") });
assert.equal(blocked.status, "blocked");
assert.equal(blocked.capacityGuard, true);
assert.equal(legacyCalls, 0);

const blockedReceivables = await runReceivablesInvoiceSyncAutomation({
  SMART_ODPADY_DB: {
    prepare() {
      legacyCalls += 1;
      throw new Error("Kapacitní pojistka nesmí zapisovat.");
    }
  },
  D1_CAPACITY_BLOCK_BULK_WRITES: "true"
}, { scheduledTime: Date.parse("2026-07-25T10:30:00.000Z") });
assert.equal(blockedReceivables.status, "blocked");
assert.equal(blockedReceivables.capacityGuard, true);
assert.equal(legacyCalls, 0);

console.log("database architecture tests: ok");
