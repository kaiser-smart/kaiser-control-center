import { getArchiveDatabase, getAuditDatabase, getLegacyDatabase } from "./databases.js";

const MAX_BATCH_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 500;
const SOURCE_DOMAIN = "legacy";
const SOURCES = Object.freeze({
  collection_import_rows: {
    table: "collection_import_rows",
    prefix: "collection-import",
    objectPath: "collection-import-rows",
    selectSql: `
      SELECT
        r.id, r.batch_id, r.row_number, r.source_entity, r.source_id, r.status,
        r.summary_json, r.issues_json, r.created_at
      FROM collection_import_rows r
      INNER JOIN collection_import_batches b ON b.id = r.batch_id
      WHERE b.finished_at IS NOT NULL
        AND b.status IN ('preview', 'warning')
        AND r.created_at < ?
        AND (
          ? = ''
          OR r.created_at > ?
          OR (r.created_at = ? AND r.id > ?)
        )
      ORDER BY r.created_at, r.id
      LIMIT ?
    `
  },
  receivable_import_rows: {
    table: "receivable_import_rows",
    prefix: "receivable-import",
    objectPath: "receivable-import-rows",
    selectSql: `
      SELECT
        r.id, r.batch_id, r.row_number, r.entity_kind, r.preview_status,
        r.confidence, r.issue_code, r.issue_message, r.normalized_json,
        r.raw_payload, r.created_at
      FROM receivable_import_rows r
      INNER JOIN receivable_import_batches b ON b.id = r.batch_id
      WHERE b.status IN ('preview', 'completed', 'verified', 'archived')
        AND b.updated_at < ?
        AND r.created_at < ?
        AND (
          ? = ''
          OR r.created_at > ?
          OR (r.created_at = ? AND r.id > ?)
        )
      ORDER BY r.created_at, r.id
      LIMIT ?
    `,
    bind(cursor, cutoffIso, batchSize) {
      return [cutoffIso, cutoffIso, cursor.createdAt, cursor.createdAt, cursor.createdAt, cursor.id, batchSize];
    }
  }
});

function clean(value) {
  return String(value ?? "").trim();
}

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function latestCursor(archiveDb, sourceTable) {
  const row = await archiveDb.prepare(`
    SELECT metadata_json
    FROM archive_batches
    WHERE source_domain = ? AND source_table = ? AND status = 'verified'
    ORDER BY verified_at DESC
    LIMIT 1
  `).bind(SOURCE_DOMAIN, sourceTable).first();
  if (!row?.metadata_json) return { createdAt: "", id: "" };
  try {
    const metadata = JSON.parse(row.metadata_json);
    return {
      createdAt: clean(metadata?.cursor?.createdAt),
      id: clean(metadata?.cursor?.id)
    };
  } catch {
    return { createdAt: "", id: "" };
  }
}

async function selectEligibleRows(sourceDb, source, cursor, cutoffIso, batchSize) {
  const bindings = source.bind
    ? source.bind(cursor, cutoffIso, batchSize)
    : [cutoffIso, cursor.createdAt, cursor.createdAt, cursor.createdAt, cursor.id, batchSize];
  const result = await sourceDb.prepare(source.selectSql).bind(...bindings).all();
  return result.results || [];
}

async function recordArchiveObjects(archiveDb, archiveBatchId, rows, objectKey, checksum) {
  const statements = rows.map((row) => archiveDb.prepare(`
    INSERT INTO archive_objects (
      id, archive_batch_id, source_id, source_created_at, r2_object_key,
      payload_checksum, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(archive_batch_id, source_id) DO NOTHING
  `).bind(
    uuid("archive-object"),
    archiveBatchId,
    row.id,
    row.created_at,
    objectKey,
    checksum,
    JSON.stringify({ batchId: row.batch_id, rowNumber: row.row_number })
  ));
  for (let index = 0; index < statements.length; index += 50) {
    await archiveDb.batch(statements.slice(index, index + 50));
  }
}

async function recordAudit(auditDb, run, sourceTable) {
  await auditDb.prepare(`
    INSERT INTO archive_runs (
      id, source_domain, source_table, status, selected_rows, transferred_rows,
      deleted_rows, checksum_source, checksum_target, error_message, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `).bind(
    run.id,
    SOURCE_DOMAIN,
    sourceTable,
    run.status,
    run.selectedRows,
    run.transferredRows,
    run.sourceChecksum || null,
    run.targetChecksum || null,
    run.errorMessage || null,
    run.startedAt,
    run.finishedAt
  ).run();
}

export async function archiveCollectionSnapshotChunk(env, options = {}) {
  return archiveSnapshotChunk(env, { ...options, sourceTable: "collection_import_rows" });
}

export async function archiveReceivableSnapshotChunk(env, options = {}) {
  return archiveSnapshotChunk(env, { ...options, sourceTable: "receivable_import_rows" });
}

async function archiveSnapshotChunk(env, options = {}) {
  const sourceDb = getLegacyDatabase(env);
  const archiveDb = getArchiveDatabase(env);
  const auditDb = getAuditDatabase(env);
  const bucket = env?.R2_ARCHIVE;
  if (!bucket) throw new Error("Chybí R2 binding R2_ARCHIVE.");
  const sourceTable = clean(options.sourceTable);
  const source = SOURCES[sourceTable];
  if (!source) throw new Error(`Nepodporovaný archivní zdroj: ${sourceTable || "(prázdný)"}.`);

  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(options.batchSize || DEFAULT_BATCH_SIZE)));
  const retentionDays = Math.max(1, Number(options.retentionDays || 2));
  const now = new Date(Number(options.scheduledTime || Date.now()));
  const cutoffIso = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
  const startedAt = new Date().toISOString();
  const runId = uuid("archive-run");
  let selectedRows = 0;
  let transferredRows = 0;
  let sourceChecksum = "";
  let targetChecksum = "";

  try {
    const cursor = await latestCursor(archiveDb, sourceTable);
    const rows = await selectEligibleRows(sourceDb, source, cursor, cutoffIso, batchSize);
    selectedRows = rows.length;
    if (!rows.length) {
      const finishedAt = new Date().toISOString();
      await recordAudit(auditDb, {
        id: runId, status: "completed", selectedRows: 0, transferredRows: 0,
        startedAt, finishedAt
      }, sourceTable);
      return { status: "completed", sourceTable, selectedRows: 0, transferredRows: 0, deletedRows: 0, cutoffIso };
    }

    const encoder = new TextEncoder();
    const payload = encoder.encode(rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    sourceChecksum = await sha256(payload);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const chunkKey = `${first.created_at}:${first.id}:${last.created_at}:${last.id}`;
    const archiveBatchId = `${source.prefix}-${sourceChecksum.slice(0, 24)}`;
    const objectKey = `${source.objectPath}/${first.created_at.slice(0, 10)}/${archiveBatchId}.ndjson`;

    await archiveDb.prepare(`
      INSERT INTO archive_batches (
        id, source_domain, source_table, source_batch_id, status,
        selected_rows, transferred_rows, checksum_value, r2_object_key, metadata_json
      ) VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)
      ON CONFLICT(source_domain, source_table, source_batch_id) DO NOTHING
    `).bind(
      archiveBatchId,
      SOURCE_DOMAIN,
      sourceTable,
      chunkKey,
      rows.length,
      sourceChecksum,
      objectKey,
      JSON.stringify({ cutoffIso, cursor: { createdAt: last.created_at, id: last.id } })
    ).run();

    await bucket.put(objectKey, payload, {
      httpMetadata: { contentType: "application/x-ndjson" },
      customMetadata: { sha256: sourceChecksum, rowCount: String(rows.length) }
    });
    const object = await bucket.head(objectKey);
    targetChecksum = clean(object?.customMetadata?.sha256);
    if (!object || Number(object.size) !== payload.byteLength || targetChecksum !== sourceChecksum) {
      throw new Error("R2 archiv neprošel kontrolou velikosti a SHA-256.");
    }

    await recordArchiveObjects(archiveDb, archiveBatchId, rows, objectKey, sourceChecksum);
    const count = await archiveDb.prepare(`
      SELECT COUNT(*) AS count FROM archive_objects WHERE archive_batch_id = ?
    `).bind(archiveBatchId).first();
    transferredRows = Number(count?.count || 0);
    if (transferredRows !== rows.length) {
      throw new Error(`Archiv obsahuje ${transferredRows} z očekávaných ${rows.length} metadat.`);
    }

    await archiveDb.batch([
      archiveDb.prepare(`
        UPDATE archive_batches
        SET status = 'verified', transferred_rows = ?, verified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(transferredRows, archiveBatchId),
      archiveDb.prepare(`
        INSERT INTO archive_integrity_checks (
          id, archive_batch_id, source_count, target_count, source_checksum,
          target_checksum, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'verified')
      `).bind(
        uuid("archive-integrity"),
        archiveBatchId,
        rows.length,
        transferredRows,
        sourceChecksum,
        targetChecksum
      )
    ]);

    const finishedAt = new Date().toISOString();
    await recordAudit(auditDb, {
      id: runId,
      status: "completed",
      selectedRows,
      transferredRows,
      sourceChecksum,
      targetChecksum,
      startedAt,
      finishedAt
    }, sourceTable);
    return {
      status: "completed",
      sourceTable,
      archiveBatchId,
      objectKey,
      selectedRows,
      transferredRows,
      deletedRows: 0,
      checksum: sourceChecksum,
      cutoffIso
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    try {
      await recordAudit(auditDb, {
        id: runId,
        status: "failed",
        selectedRows,
        transferredRows,
        sourceChecksum,
        targetChecksum,
        errorMessage: String(error?.message || error),
        startedAt,
        finishedAt
      }, sourceTable);
    } catch {
      // Audit DB failure must not trigger source deletion or hide the original failure.
    }
    throw error;
  }
}

export const __test = { MAX_BATCH_SIZE, DEFAULT_BATCH_SIZE, SOURCES, bytesToHex };
