import { capacityState, estimateDaysToFull } from "./database-capacity.js";
import {
  getArchiveDatabase,
  getAuditDatabase,
  getCoreDatabase,
  getLegacyDatabase,
  getMessagesDatabase
} from "./databases.js";

const DATABASES = Object.freeze([
  {
    domain: "legacy",
    name: "SMART_ODPADY_DB",
    id: "6d9ab099-fa10-4245-b06b-e146b63450a9",
    get: (env) => getLegacyDatabase(env, {
      moduleName: "database-capacity-monitor",
      purpose: "capacity and object inventory read"
    })
  },
  { domain: "core", name: "SMART_ODPADY_CORE", id: "7babb37a-dc19-4bbc-b4f8-3346f4e1aa23", get: getCoreDatabase },
  { domain: "messages", name: "SMART_ODPADY_MESSAGES", id: "8aeb65e8-9f53-4c93-869e-1f58484b1319", get: getMessagesDatabase },
  { domain: "audit", name: "SMART_ODPADY_AUDIT", id: "5abc8fa4-c155-4bf0-9c46-2db73d6d98e0", get: getAuditDatabase },
  { domain: "archive", name: "SMART_ODPADY_ARCHIVE", id: "b10566be-ebb1-414c-beab-eac03f1a909b", get: getArchiveDatabase }
]);

const OBJECT_PROBES = Object.freeze({
  legacy: [
    ["collection_import_rows", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(summary_json)+LENGTH(issues_json)),0) AS logical_payload_bytes FROM collection_import_rows"],
    ["receivable_import_rows", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(normalized_json)+LENGTH(raw_payload)),0) AS logical_payload_bytes FROM receivable_import_rows"]
  ],
  messages: [
    ["notification_logs", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(error_message)),0) AS logical_payload_bytes FROM notification_logs"],
    ["customer_message_log", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(message_body)+LENGTH(metadata_json)),0) AS logical_payload_bytes FROM customer_message_log"],
    ["communication_events", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(raw_payload)),0) AS logical_payload_bytes FROM communication_events"],
    ["rcs_sms_messages", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(body)+LENGTH(media_json)+LENGTH(tool_arguments_json)),0) AS logical_payload_bytes FROM rcs_sms_messages"]
  ],
  audit: [
    ["audit_events", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(metadata_json)+LENGTH(detail)),0) AS logical_payload_bytes FROM audit_events"],
    ["workflow_attempts", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(metadata_json)+LENGTH(error_message)),0) AS logical_payload_bytes FROM workflow_attempts"]
  ],
  archive: [
    ["archive_objects", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(metadata_json)),0) AS logical_payload_bytes FROM archive_objects"]
  ],
  core: [
    ["cross_database_workflows", "SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(payload_json)+LENGTH(last_error)),0) AS logical_payload_bytes FROM cross_database_workflows"]
  ]
});

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function pageStats(db) {
  const sizeProbe = await db.prepare("SELECT 1 AS capacity_probe").all();
  const sizeBytes = Number(sizeProbe?.meta?.size_after || 0);
  const pageSize = 4096;
  return {
    pageCount: Math.ceil(sizeBytes / pageSize),
    freePageCount: null,
    pageSize,
    sizeBytes
  };
}

async function priorSamples(auditDb, domain, nowIso) {
  const result = await auditDb.prepare(`
    SELECT size_bytes AS sizeBytes, recorded_at AS recordedAt
    FROM database_capacity_snapshots
    WHERE database_domain = ?
      AND recorded_at >= datetime(?, '-25 hours')
    ORDER BY recorded_at ASC
  `).bind(domain, nowIso).all();
  return result.results || [];
}

async function objectStats(db, domain) {
  const rows = [];
  for (const [name, sql] of OBJECT_PROBES[domain] || []) {
    try {
      const result = await db.prepare(sql).first();
      rows.push({
        objectType: "table",
        objectName: name,
        tableName: name,
        rowCount: Number(result?.row_count || 0),
        logicalPayloadBytes: Number(result?.logical_payload_bytes || 0),
        estimateType: "logical_payload"
      });
    } catch (error) {
      rows.push({
        objectType: "table",
        objectName: name,
        tableName: name,
        rowCount: null,
        logicalPayloadBytes: null,
        estimateType: "unavailable",
        error: String(error?.message || error)
      });
    }
  }
  return rows.sort((a, b) => (b.logicalPayloadBytes || 0) - (a.logicalPayloadBytes || 0));
}

async function indexInventory(db) {
  const result = await db.prepare(`
    SELECT name AS object_name, tbl_name AS table_name
    FROM sqlite_schema
    WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
    ORDER BY name
    LIMIT 100
  `).all();
  return (result.results || []).map((row) => ({
    objectType: "index",
    objectName: row.object_name,
    tableName: row.table_name,
    rowCount: null,
    logicalPayloadBytes: null,
    estimateType: "d1_dbstat_unavailable"
  }));
}

async function persistSnapshot(auditDb, snapshot, objects) {
  await auditDb.prepare(`
    INSERT INTO database_capacity_snapshots (
      id, database_domain, database_name, database_id, size_bytes, max_bytes,
      usage_percent, level, growth_bytes_24h, estimated_days_to_full,
      page_count, free_page_count, source, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'd1-binding-meta', ?)
  `).bind(
    snapshot.id, snapshot.domain, snapshot.name, snapshot.databaseId,
    snapshot.sizeBytes, snapshot.maxBytes, snapshot.percent, snapshot.level,
    snapshot.growthBytes24h, snapshot.estimatedDaysToFull,
    snapshot.pageCount, snapshot.freePageCount, snapshot.recordedAt
  ).run();

  const statements = objects.slice(0, 100).map((object, position) => auditDb.prepare(`
    INSERT INTO database_capacity_objects (
      id, snapshot_id, object_type, object_name, table_name, row_count,
      logical_payload_bytes, size_estimate_type, rank_position, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id("capacity-object"), snapshot.id, object.objectType, object.objectName,
    object.tableName, object.rowCount, object.logicalPayloadBytes,
    object.estimateType, position + 1, JSON.stringify({ error: object.error || "" })
  ));
  if (statements.length) await auditDb.batch(statements);
}

export async function runDatabaseCapacityMonitor(env, options = {}) {
  const recordedAt = new Date(Number(options.scheduledTime || Date.now())).toISOString();
  const auditDb = getAuditDatabase(env);
  const results = [];

  for (const definition of DATABASES) {
    try {
      const db = definition.get(env);
      const [pages, history, tables, indexes] = await Promise.all([
        pageStats(db),
        priorSamples(auditDb, definition.domain, recordedAt),
        objectStats(db, definition.domain),
        indexInventory(db)
      ]);
      const state = capacityState(pages.sizeBytes);
      const samples = [...history, { recordedAt, sizeBytes: pages.sizeBytes }];
      const firstSize = Number(samples[0]?.sizeBytes || pages.sizeBytes);
      const snapshot = {
        id: id("capacity-snapshot"),
        domain: definition.domain,
        name: definition.name,
        databaseId: definition.id,
        recordedAt,
        ...pages,
        ...state,
        growthBytes24h: pages.sizeBytes - firstSize,
        estimatedDaysToFull: estimateDaysToFull(samples)
      };
      await persistSnapshot(auditDb, snapshot, [...tables, ...indexes]);
      results.push({ ok: true, ...snapshot, objectCount: tables.length + indexes.length });
    } catch (error) {
      results.push({
        ok: false,
        domain: definition.domain,
        name: definition.name,
        error: String(error?.message || error)
      });
    }
  }

  return {
    status: results.every((item) => item.ok) ? "completed" : "partial_failure",
    recordedAt,
    results
  };
}

export const __test = { DATABASES, OBJECT_PROBES, pageStats };
