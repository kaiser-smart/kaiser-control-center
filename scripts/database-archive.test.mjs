import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  archiveCollectionSnapshotChunk,
  archiveReceivableSnapshotChunk
} from "../functions/_lib/collection-snapshot-archive.js";

class D1Statement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new D1Statement(this.owner, this.sql, values);
  }
  async all() {
    return { results: this.owner.sqlite.prepare(this.sql).all(...this.values) };
  }
  async first() {
    return this.owner.sqlite.prepare(this.sql).get(...this.values) || null;
  }
  async run() {
    return { success: true, meta: this.owner.sqlite.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }
  prepare(sql) {
    return new D1Statement(this, sql);
  }
  async batch(statements) {
    const results = [];
    this.sqlite.exec("BEGIN");
    try {
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryR2 {
  constructor() {
    this.objects = new Map();
  }
  async put(key, body, options = {}) {
    const bytes = new Uint8Array(body);
    this.objects.set(key, { bytes, customMetadata: options.customMetadata || {} });
  }
  async head(key) {
    const object = this.objects.get(key);
    return object ? { size: object.bytes.byteLength, customMetadata: object.customMetadata } : null;
  }
}

const sourceSqlite = new DatabaseSync(":memory:");
sourceSqlite.exec(`
  CREATE TABLE collection_import_batches (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, finished_at TEXT, created_at TEXT
  );
  CREATE TABLE collection_import_rows (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, row_number INTEGER,
    source_entity TEXT, source_id TEXT, status TEXT, summary_json TEXT,
    issues_json TEXT, created_at TEXT
  );
  INSERT INTO collection_import_batches VALUES
    ('closed', 'preview', '2026-07-20T01:00:00.000Z', '2026-07-20T00:00:00.000Z'),
    ('open', 'preview', NULL, '2026-07-20T00:00:00.000Z');
  INSERT INTO collection_import_rows VALUES
    ('row-1','closed',1,'route','1','preview','{"a":1}','[]','2026-07-20T00:00:01.000Z'),
    ('row-2','closed',2,'route','2','preview','{"a":2}','[]','2026-07-20T00:00:02.000Z'),
    ('row-open','open',1,'route','3','preview','{"a":3}','[]','2026-07-20T00:00:03.000Z');
  CREATE TABLE receivable_import_batches (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE receivable_import_rows (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, row_number INTEGER,
    entity_kind TEXT, preview_status TEXT, confidence REAL, issue_code TEXT,
    issue_message TEXT, normalized_json TEXT, raw_payload TEXT, created_at TEXT
  );
  INSERT INTO receivable_import_batches VALUES
    ('receivable-closed', 'preview', '2026-07-19T00:00:00.000Z'),
    ('receivable-recent', 'preview', '2026-07-25T11:30:00.000Z');
  INSERT INTO receivable_import_rows VALUES
    ('receivable-row-1','receivable-closed',1,'invoice','ready',1,NULL,NULL,'{"a":1}','{"raw":1}','2026-07-19T00:00:01.000Z'),
    ('receivable-row-recent','receivable-recent',1,'invoice','ready',1,NULL,NULL,'{"a":2}','{"raw":2}','2026-07-25T11:30:01.000Z');
`);

const archiveSqlite = new DatabaseSync(":memory:");
archiveSqlite.exec(readFileSync(new URL("../migrations/modular/archive/0001_archive_foundation.sql", import.meta.url), "utf8"));
const auditSqlite = new DatabaseSync(":memory:");
auditSqlite.exec(readFileSync(new URL("../migrations/modular/audit/0001_audit_foundation.sql", import.meta.url), "utf8"));
const r2 = new MemoryR2();
const env = {
  SMART_ODPADY_DB: new D1Database(sourceSqlite),
  DB_ARCHIVE: new D1Database(archiveSqlite),
  DB_AUDIT: new D1Database(auditSqlite),
  R2_ARCHIVE: r2
};

const result = await archiveCollectionSnapshotChunk(env, {
  batchSize: 500,
  retentionDays: 2,
  scheduledTime: Date.parse("2026-07-25T12:00:00.000Z")
});
assert.equal(result.status, "completed");
assert.equal(result.selectedRows, 2);
assert.equal(result.transferredRows, 2);
assert.equal(result.deletedRows, 0);
assert.equal(sourceSqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 3);
assert.equal(archiveSqlite.prepare("SELECT COUNT(*) AS count FROM archive_objects").get().count, 2);
assert.equal(archiveSqlite.prepare("SELECT status FROM archive_integrity_checks").get().status, "verified");
assert.equal(auditSqlite.prepare("SELECT deleted_rows FROM archive_runs").get().deleted_rows, 0);
assert.equal(r2.objects.size, 1);

const second = await archiveCollectionSnapshotChunk(env, {
  batchSize: 500,
  retentionDays: 2,
  scheduledTime: Date.parse("2026-07-25T12:05:00.000Z")
});
assert.equal(second.selectedRows, 0);
assert.equal(second.status, "skipped");
assert.equal(second.reason, "archive_backlog_empty");
assert.equal(sourceSqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 3);

const legacyReadsAfterEmptyCollection = auditSqlite.prepare(`
  SELECT COUNT(*) AS count
  FROM audit_events
  WHERE event_type = 'legacy_database_access'
    AND module_key = 'collection-snapshot-archive'
`).get().count;
const deferred = await archiveCollectionSnapshotChunk(env, {
  batchSize: 500,
  retentionDays: 2,
  scheduledTime: Date.parse("2026-07-25T12:10:00.000Z")
});
assert.equal(deferred.status, "skipped");
assert.equal(deferred.reason, "archive_backlog_probe_deferred");
assert.equal(deferred.legacySelectCount, 0);
assert.equal(auditSqlite.prepare(`
  SELECT COUNT(*) AS count
  FROM audit_events
  WHERE event_type = 'legacy_database_access'
    AND module_key = 'collection-snapshot-archive'
`).get().count, legacyReadsAfterEmptyCollection);
assert.equal(JSON.parse(auditSqlite.prepare(`
  SELECT metadata_json FROM audit_events
  WHERE event_type = 'archive_run'
    AND metadata_json LIKE '%archive_backlog_probe_deferred%'
  LIMIT 1
`).get().metadata_json).legacySelectCount, 0);

const receivables = await archiveReceivableSnapshotChunk(env, {
  batchSize: 500,
  retentionDays: 2,
  scheduledTime: Date.parse("2026-07-25T12:10:00.000Z")
});
assert.equal(receivables.sourceTable, "receivable_import_rows");
assert.equal(receivables.selectedRows, 1);
assert.equal(receivables.transferredRows, 1);
assert.equal(receivables.deletedRows, 0);
assert.equal(sourceSqlite.prepare("SELECT COUNT(*) AS count FROM receivable_import_rows").get().count, 2);
assert.equal(archiveSqlite.prepare(`
  SELECT COUNT(*) AS count FROM archive_objects
  WHERE archive_batch_id LIKE 'receivable-import-%'
`).get().count, 1);

let legacyCallsWithMissingAudit = 0;
await assert.rejects(
  () => archiveCollectionSnapshotChunk({
    ...env,
    DB_AUDIT: null,
    SMART_ODPADY_DB: {
      prepare() {
        legacyCallsWithMissingAudit += 1;
        throw new Error("Legacy D1 se nesmí otevřít bez AUDIT bindingu.");
      }
    }
  }, {
    scheduledTime: Date.parse("2026-07-26T12:00:00.000Z")
  }),
  /DB_AUDIT/
);
assert.equal(legacyCallsWithMissingAudit, 0);

console.log("database archive tests: ok");
