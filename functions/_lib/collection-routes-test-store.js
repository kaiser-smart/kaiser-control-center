import { normalizeRole } from "../../src/permissions.js";
import {
  COLLECTION_ROUTES_TEST_DATASET_KEY,
  COLLECTION_ROUTES_TEST_DATASET_NAME,
  buildCollectionRoutesTestDataset
} from "./collection-routes-test-data.js";

const TEST_DB_BINDING = "COLLECTION_ROUTES_TEST_DB";
const TEST_SMS_TO_ENV = "COLLECTION_ROUTES_TEST_SMS_TO";
const TEST_EMAIL_TO_ENV = "COLLECTION_ROUTES_TEST_EMAIL_TO";
const TEST_DATASET_ID = "collection-route-test-dataset-brno-500-v2";
const TEST_BATCH_ID = "collection-import-batch-test-brno-500-v2";
const D1_MAX_BOUND_PARAMETERS = 100;
const IMPORT_ROW_BINDINGS = 9;
const IMPORT_ROWS_PER_INSERT = Math.floor(D1_MAX_BOUND_PARAMETERS / IMPORT_ROW_BINDINGS);

export class CollectionRoutesTestStoreError extends Error {
  constructor(message, status = 400, code = "collection_routes_test_error") {
    super(message);
    this.name = "CollectionRoutesTestStoreError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function jsonString(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function nowIso() {
  return new Date().toISOString();
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function testDatabase(env, required = false) {
  const db = env?.[TEST_DB_BINDING] || null;
  if (!db && required) {
    throw new CollectionRoutesTestStoreError(
      "Oddělená databáze TEST Brno 500 není připojená.",
      503,
      "collection_routes_test_database_missing"
    );
  }
  return db;
}

export function collectionRoutesTestDatabase(env, required = false) {
  return testDatabase(env, required);
}

function testRecipient(env) {
  const phone = cleanString(env?.[TEST_SMS_TO_ENV]).replace(/[\s().-]+/g, "");
  const email = cleanString(env?.[TEST_EMAIL_TO_ENV]).toLowerCase();
  if (!/^\+\d{8,15}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CollectionRoutesTestStoreError(
      "Chybí chráněný SMS nebo e-mailový cíl testovací sady.",
      503,
      "collection_routes_test_recipient_missing"
    );
  }
  return { phone, email };
}

export function collectionRoutesTestRecipient(env) {
  return testRecipient(env);
}

export function assertCollectionRoutesTestManager(user) {
  const role = normalizeRole(user?.role);
  if (!user || !["admin", "management"].includes(role)) {
    throw new CollectionRoutesTestStoreError(
      "Testovací sada Brno 500 je dostupná pouze roli Management a Admin.",
      403,
      "collection_routes_test_forbidden"
    );
  }
}

function storeError(error) {
  if (error instanceof CollectionRoutesTestStoreError) return error;
  const message = cleanString(error?.message);
  if (/no such table[^\n]*(collection_route_test_|collection_import_)/i.test(message)) {
    return new CollectionRoutesTestStoreError(
      "Schéma oddělené TEST databáze ještě není připravené.",
      503,
      "collection_routes_test_migration_missing"
    );
  }
  console.error("collection_routes_test.store_failed", { message });
  return new CollectionRoutesTestStoreError(
    "Testovací sada Brno 500 se teď nepodařila načíst nebo uložit.",
    500,
    "collection_routes_test_store_failed"
  );
}

function rowToDataset(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    key: cleanString(row.dataset_key),
    name: cleanString(row.name),
    status: cleanString(row.status),
    sourceBatchId: cleanString(row.source_batch_id),
    seed: Number(row.seed) || 0,
    companyCount: Number(row.company_count) || 0,
    siteCount: Number(row.site_count) || 0,
    addressSource: cleanString(row.address_source),
    metadata: parseJson(row.metadata_json, {}),
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToImportRow(row) {
  const summary = parseJson(row?.summary_json, {});
  return {
    id: cleanString(row?.id),
    batchId: cleanString(row?.batch_id),
    rowNumber: Number(row?.row_number) || 0,
    sourceEntity: cleanString(row?.source_entity),
    sourceId: cleanString(row?.source_id),
    status: cleanString(row?.status),
    svozKaiserIncluded: summary.svozKaiserIncluded === true,
    summary,
    issues: parseJson(row?.issues_json, []),
    createdAt: cleanString(row?.created_at)
  };
}

function importRowStatements(db, rows, createdAt) {
  const values = rows.map((row, index) => [
    `collection-import-row-test-brno-v2-${String(index + 1).padStart(4, "0")}`,
    TEST_BATCH_ID,
    row.rowNumber,
    row.sourceEntity,
    row.sourceId,
    "preview",
    jsonString(row),
    "[]",
    createdAt
  ]);
  return chunks(values, IMPORT_ROWS_PER_INSERT).map((valueChunk) => {
    const placeholders = valueChunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    return db.prepare(`
      INSERT INTO collection_import_rows (
        id, batch_id, row_number, source_entity, source_id, status,
        summary_json, issues_json, created_at
      ) VALUES ${placeholders}
    `).bind(...valueChunk.flat());
  });
}

async function loadDatasetRow(db) {
  return db.prepare(`
    SELECT *
    FROM collection_route_test_datasets
    WHERE dataset_key = ?
    LIMIT 1
  `).bind(COLLECTION_ROUTES_TEST_DATASET_KEY).first();
}

async function loadDatasetRows(db, batchId, limit = 500) {
  const result = await db.prepare(`
    SELECT *
    FROM collection_import_rows
    WHERE batch_id = ?
    ORDER BY row_number ASC
    LIMIT ?
  `).bind(batchId, Math.max(1, Math.min(Number(limit) || 500, 500))).all();
  return (result.results || []).map(rowToImportRow);
}

export async function getCollectionRoutesTestDataset(env, user, { includeRows = true, limit = 500 } = {}) {
  assertCollectionRoutesTestManager(user);
  const db = testDatabase(env, true);
  try {
    const dataset = rowToDataset(await loadDatasetRow(db));
    if (!dataset) {
      return {
        status: "empty",
        apiStatus: "waiting",
        dataset: null,
        rows: [],
        createsOperationalRoutes: false,
        sendsEmailOrSms: false
      };
    }
    const rows = includeRows ? await loadDatasetRows(db, dataset.sourceBatchId, limit) : [];
    return {
      status: dataset.status,
      apiStatus: "ready",
      dataset,
      rows,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function ensureCollectionRoutesTestDataset(env, user, { confirmation = "" } = {}) {
  assertCollectionRoutesTestManager(user);
  if (cleanString(confirmation) !== "create-test-brno-500") {
    throw new CollectionRoutesTestStoreError(
      "Založení sady vyžaduje potvrzení create-test-brno-500.",
      400,
      "collection_routes_test_confirmation_required"
    );
  }
  const db = testDatabase(env, true);
  try {
    const existing = rowToDataset(await loadDatasetRow(db));
    if (existing) {
      const rows = await loadDatasetRows(db, existing.sourceBatchId, 500);
      return { created: false, dataset: existing, rows, apiStatus: "ready" };
    }

    const recipient = testRecipient(env);
    const generated = buildCollectionRoutesTestDataset(recipient);
    const createdAt = nowIso();
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || user?.phone);
    const batchMetadata = {
      phase: "TEST-Brno-500",
      mode: "synthetic-brno-test",
      source: "gis-brno-open-data",
      datasetKey: generated.key,
      datasetName: generated.name,
      seed: generated.seed,
      companyCount: generated.companyCount,
      siteCount: generated.siteCount,
      addressSource: generated.source,
      summary: generated.summary,
      dataScope: "test",
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    };
    const batchInsert = db.prepare(`
      INSERT INTO collection_import_batches (
        id, source, source_mode, status, api_status, message, row_count,
        issue_count, created_by_user_id, created_at, finished_at, metadata_json
      ) VALUES (?, 'synthetic-test', 'synthetic-brno-test', 'preview', 'ready', ?, ?, 0, ?, ?, ?, ?)
    `).bind(
      TEST_BATCH_ID,
      "Oddělená testovací sada 500 veřejných adresních bodů Brna.",
      generated.rows.length,
      actorId,
      createdAt,
      createdAt,
      jsonString(batchMetadata)
    );
    const datasetInsert = db.prepare(`
      INSERT INTO collection_route_test_datasets (
        id, dataset_key, name, status, source_batch_id, seed, company_count,
        site_count, address_source, metadata_json, created_by_user_id,
        created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      TEST_DATASET_ID,
      generated.key,
      generated.name,
      TEST_BATCH_ID,
      generated.seed,
      generated.companyCount,
      generated.siteCount,
      generated.source,
      jsonString({
        summary: generated.summary,
        recipientPhone: recipient.phone,
        recipientEmail: recipient.email,
        dataScope: "test"
      }),
      actorId,
      actorName,
      createdAt,
      createdAt
    );
    await db.batch([
      batchInsert,
      ...importRowStatements(db, generated.rows, createdAt),
      datasetInsert
    ]);
    const dataset = rowToDataset(await loadDatasetRow(db));
    return {
      created: true,
      dataset,
      rows: await loadDatasetRows(db, TEST_BATCH_ID, 500),
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getCollectionRoutesTestSnapshot(env, user, { limit = 10000 } = {}) {
  assertCollectionRoutesTestManager(user);
  const result = await getCollectionRoutesTestDataset(env, user, {
    includeRows: true,
    limit: Math.min(Number(limit) || 10000, 10000)
  });
  if (!result.dataset) {
    return {
      status: "empty",
      apiStatus: "waiting",
      sourceMode: "synthetic-brno-test",
      rowCount: 0,
      totalRows: 0,
      batch: null,
      summary: {},
      metadata: {},
      rows: []
    };
  }
  return {
    status: "snapshot",
    apiStatus: "ready",
    source: "d1-synthetic-brno-test",
    sourceMode: "synthetic-brno-test",
    rowCount: result.rows.length,
    loadedRowCount: result.rows.length,
    totalRows: result.dataset.siteCount,
    batch: {
      id: result.dataset.sourceBatchId,
      source: "synthetic-test",
      sourceMode: "synthetic-brno-test",
      status: "preview",
      apiStatus: "ready",
      message: "Oddělená testovací sada Brno 500.",
      rowCount: result.dataset.siteCount,
      issueCount: 0,
      createdByUserId: result.dataset.createdByUserId,
      createdAt: result.dataset.createdAt,
      finishedAt: result.dataset.createdAt,
      metadata: result.dataset.metadata
    },
    summary: result.dataset.metadata?.summary || {},
    metadata: result.dataset.metadata || {},
    rows: result.rows
  };
}

export function collectionRoutesTestDbError(error) {
  return storeError(error);
}

export const __test = {
  TEST_DB_BINDING,
  TEST_SMS_TO_ENV,
  TEST_EMAIL_TO_ENV,
  TEST_DATASET_ID,
  TEST_BATCH_ID,
  IMPORT_ROWS_PER_INSERT,
  testRecipient,
  importRowStatements,
  rowToDataset,
  rowToImportRow
};
