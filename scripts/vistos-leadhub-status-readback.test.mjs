import assert from "node:assert/strict";
import { readVistosLeadHubProfileSyncStatus } from "../functions/_lib/vistos-leadhub-profile-sync.js";

const prefix = "protected-sync/vistos-leadhub-profiles";
const stateKey = `${prefix}/state.json`;
const lockKey = `${prefix}/writer-lock.json`;
const now = new Date();
const finishedAt = new Date(now.getTime() - 60_000).toISOString();
const startedAt = new Date(now.getTime() - 120_000).toISOString();
const state = {
  status: "ACTIVE",
  checkpoint: finishedAt,
  initializedAt: startedAt,
  totals: { created: 10, updated: 4, subscriptionChanges: 0, messagesSent: 0 },
  pending: [],
  profiles: {},
  lastRun: {
    status: "completed",
    startedAt,
    finishedAt,
    readbackConfirmed: 6,
    metrics: { rateLimits: 1 },
    messagesSent: 0,
    restoredSubscriptions: 0
  },
  csvBatch: {
    id: "synthetic-batch",
    phase: "VERIFY",
    scope: "remaining",
    receipt: "SECRET RECEIPT THAT MUST NOT LEAVE STORAGE",
    submittedObservedAt: finishedAt,
    items: [
      { contactId: "1", normalizedEmail: "private@example.test", status: "ADOPTED" },
      { contactId: "2", normalizedEmail: "private2@example.test", status: "CHECKED" },
      { contactId: "3", normalizedEmail: "private3@example.test", status: "SKIP" },
      { contactId: "4", normalizedEmail: "private4@example.test", status: "RESERVED" },
      { contactId: "5", normalizedEmail: "private5@example.test", status: "QUARANTINED" }
    ]
  }
};

class MemoryR2 {
  constructor() {
    this.values = new Map([
      [stateKey, state],
      [lockKey, { owner: "SECRET OWNER", startedAt }]
    ]);
  }
  async get(key) {
    const value = this.values.get(key);
    return value ? { json: async () => structuredClone(value) } : null;
  }
}

const result = await readVistosLeadHubProfileSyncStatus({ R2_ARCHIVE: new MemoryR2() });
assert.equal(result.syncStatus, "WRITER_BUSY_OR_RECONCILIATION_REQUIRED");
assert.deepEqual(result.csvBatch.counts, {
  RESERVED: 1,
  CHECKED: 1,
  SKIP: 1,
  ADOPTED: 1,
  QUARANTINED: 1,
  total: 5
});
assert.equal(result.csvBatch.receiptStored, true);
assert.equal(result.csvBatch.importSubmitted, true);
assert.equal(result.csvBatch.importConfirmed, false);
assert.equal(result.lastRunSummary.readbackConfirmed, 6);
assert.equal(result.lastRunSummary.rateLimits, 1);
assert.equal(result.writerLock.active, true);
const serialized = JSON.stringify(result);
assert.ok(!serialized.includes("SECRET RECEIPT"));
assert.ok(!serialized.includes("SECRET OWNER"));
assert.ok(!serialized.includes("private@example.test"));
assert.ok(!serialized.includes("contactId"));

console.log("Vistos LeadHub protected status readback: OK");
