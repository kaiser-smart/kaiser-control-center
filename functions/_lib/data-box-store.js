const DATA_BOX_DB_BINDING = "SMART_ODPADY_DB";
const DATA_BOX_DOCUMENTS_BINDING = "SMART_ODPADY_DOCUMENTS";
const MESSAGE_DIRECTIONS = new Set(["received", "sent"]);
const MESSAGE_STATUSES = new Set(["new", "read", "archived", "draft", "sent", "failed"]);

export class DataBoxStoreError extends Error {
  constructor(message, status = 400, code = "data_box_error") {
    super(message);
    this.name = "DataBoxStoreError";
    this.status = status;
    this.code = code;
  }
}

function dataBoxDatabase(env, required = false) {
  const db = env?.[DATA_BOX_DB_BINDING] || null;

  if (!db && required) {
    throw new DataBoxStoreError(
      "Databaze Datove schranky neni nastavena. Pridejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "data_box_database_missing"
    );
  }

  return db;
}

function dataBoxDocumentsBucket(env) {
  return env?.[DATA_BOX_DOCUMENTS_BINDING] || null;
}

export function dataBoxApiStatus(env) {
  return dataBoxDatabase(env) ? "ready" : "waiting";
}

export function dataBoxStorageStatus(env) {
  return dataBoxDocumentsBucket(env) ? "ready" : "waiting";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function limitValue(value, fallback = 50, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(number), max);
}

function normalizeDirection(value) {
  const direction = cleanString(value).toLowerCase();
  return MESSAGE_DIRECTIONS.has(direction) ? direction : "";
}

function normalizeStatus(value) {
  const status = cleanString(value).toLowerCase();
  return MESSAGE_STATUSES.has(status) ? status : "";
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return new DataBoxStoreError(
      "Tabulky Datove schranky nejsou v D1 pripravene. Spustte migraci 0017_create_data_box_tables.sql.",
      503,
      "data_box_migration_missing"
    );
  }

  console.error("data_box.store_failed", { message });
  return new DataBoxStoreError("Datovou schranku se ted nepodarilo nacist.", 500, "data_box_store_failed");
}

function rowToBox(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    label: cleanString(row.label),
    isdsId: cleanString(row.isds_id),
    mode: cleanString(row.mode || "pilot"),
    status: cleanString(row.status || "inactive"),
    lastSyncAt: cleanString(row.last_sync_at),
    lastSyncStatus: cleanString(row.last_sync_status || "waiting"),
    lastSyncMessage: cleanString(row.last_sync_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToMessage(row) {
  return {
    id: cleanString(row.id),
    dataBoxId: cleanString(row.data_box_id),
    isdsMessageId: cleanString(row.isds_message_id),
    direction: normalizeDirection(row.direction) || "received",
    subject: cleanString(row.subject),
    senderName: cleanString(row.sender_name),
    senderBoxId: cleanString(row.sender_box_id),
    recipientName: cleanString(row.recipient_name),
    recipientBoxId: cleanString(row.recipient_box_id),
    deliveredAt: cleanString(row.delivered_at),
    acceptedAt: cleanString(row.accepted_at),
    readAt: cleanString(row.read_at),
    status: cleanString(row.status || "new"),
    priority: cleanString(row.priority || "normal"),
    hasAttachments: Boolean(Number(row.has_attachments || 0)),
    attachmentsCount: numberValue(row.attachments_count),
    aiStatus: cleanString(row.ai_status || "not_evaluated"),
    source: cleanString(row.source || "cloud_metadata"),
    isdsState: cleanString(row.isds_state),
    storedAt: cleanString(row.stored_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToAttachment(row) {
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    filename: cleanString(row.filename),
    contentType: cleanString(row.content_type),
    sizeBytes: numberValue(row.size_bytes),
    storageKey: cleanString(row.storage_key),
    checksumSha256: cleanString(row.checksum_sha256),
    status: cleanString(row.status || "metadata_only"),
    createdAt: cleanString(row.created_at)
  };
}

function rowToAiEvaluation(row) {
  if (!row) return null;
  let result = null;
  try {
    result = row.result_json ? JSON.parse(row.result_json) : null;
  } catch {
    result = null;
  }
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    model: cleanString(row.model),
    status: cleanString(row.status || "draft"),
    label: cleanString(row.label),
    priority: cleanString(row.priority),
    confidence: row.confidence === null || row.confidence === undefined ? null : numberValue(row.confidence, null),
    summary: cleanString(row.summary),
    suggestedAction: cleanString(row.suggested_action),
    result,
    createdByUserId: cleanString(row.created_by_user_id),
    createdAt: cleanString(row.created_at)
  };
}

function rowToSyncRun(row) {
  return {
    id: cleanString(row.id),
    dataBoxId: cleanString(row.data_box_id),
    triggerType: cleanString(row.trigger_type),
    startedAt: cleanString(row.started_at),
    finishedAt: cleanString(row.finished_at),
    status: cleanString(row.status),
    messagesFound: numberValue(row.messages_found),
    messagesCreated: numberValue(row.messages_created),
    messagesUpdated: numberValue(row.messages_updated),
    attachmentsFound: numberValue(row.attachments_found),
    errorCode: cleanString(row.error_code),
    message: cleanString(row.message),
    dedupeKey: cleanString(row.dedupe_key),
    createdByUserId: cleanString(row.created_by_user_id)
  };
}

async function primaryDataBox(db) {
  const row = await db.prepare("SELECT * FROM data_boxes ORDER BY created_at ASC LIMIT 1").first();
  return rowToBox(row) || {
    id: "",
    label: "Kaiser Smart Datova schranka",
    isdsId: "",
    mode: "pilot",
    status: "inactive",
    lastSyncAt: "",
    lastSyncStatus: "waiting",
    lastSyncMessage: "ISDS integrace neni aktivni.",
    createdAt: "",
    updatedAt: ""
  };
}

export async function getDataBoxStatus(env) {
  const db = dataBoxDatabase(env);
  const storageStatus = dataBoxStorageStatus(env);

  if (!db) {
    return {
      apiStatus: "waiting",
      storageStatus,
      integrationStatus: "inactive",
      isdsActive: false,
      mode: "pilot",
      dataBox: null,
      summary: { received: 0, sent: 0, attachments: 0, syncRuns: 0, lastSyncAt: "" },
      message: "Cloud D1 binding SMART_ODPADY_DB zatim neni dostupny."
    };
  }

  try {
    const dataBox = await primaryDataBox(db);
    const summaryRow = await db
      .prepare(`
        SELECT
          SUM(CASE WHEN direction = 'received' THEN 1 ELSE 0 END) AS received,
          SUM(CASE WHEN direction = 'sent' THEN 1 ELSE 0 END) AS sent,
          SUM(attachments_count) AS attachments
        FROM data_box_messages
      `)
      .first();
    const syncRow = await db
      .prepare(`
        SELECT COUNT(*) AS sync_runs, MAX(started_at) AS last_sync_at
        FROM data_box_sync_runs
      `)
      .first();

    return {
      apiStatus: "ready",
      storageStatus,
      integrationStatus: dataBox.status || "inactive",
      isdsActive: false,
      mode: dataBox.mode || "pilot",
      dataBox,
      summary: {
        received: numberValue(summaryRow?.received),
        sent: numberValue(summaryRow?.sent),
        attachments: numberValue(summaryRow?.attachments),
        syncRuns: numberValue(syncRow?.sync_runs),
        lastSyncAt: cleanString(syncRow?.last_sync_at || dataBox.lastSyncAt)
      },
      message: dataBox.lastSyncMessage || "ISDS integrace neni aktivni."
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function listDataBoxMessages(env, filters = {}) {
  const db = dataBoxDatabase(env, true);
  const direction = normalizeDirection(filters.direction);
  const status = normalizeStatus(filters.status);
  const limit = limitValue(filters.limit);
  const where = [];
  const bindings = [];

  if (direction) {
    where.push("direction = ?");
    bindings.push(direction);
  }
  if (status) {
    where.push("status = ?");
    bindings.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM data_box_messages
        ${whereSql}
        ORDER BY COALESCE(delivered_at, accepted_at, stored_at) DESC, stored_at DESC
        LIMIT ?
      `)
      .bind(...bindings, limit)
      .all();
    return (result.results || []).map(rowToMessage);
  } catch (error) {
    throw dbError(error);
  }
}

export async function getDataBoxMessage(env, id) {
  const db = dataBoxDatabase(env, true);
  const messageId = cleanString(id);

  try {
    const row = await db.prepare("SELECT * FROM data_box_messages WHERE id = ? LIMIT 1").bind(messageId).first();
    if (!row) {
      throw new DataBoxStoreError("Zprava nebyla nalezena.", 404, "data_box_message_not_found");
    }

    const attachmentsResult = await db
      .prepare("SELECT * FROM data_box_attachments WHERE message_id = ? ORDER BY filename")
      .bind(messageId)
      .all();
    const evaluationRow = await db
      .prepare("SELECT * FROM data_box_ai_evaluations WHERE message_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(messageId)
      .first();

    return {
      ...rowToMessage(row),
      attachments: (attachmentsResult.results || []).map(rowToAttachment),
      latestAiEvaluation: rowToAiEvaluation(evaluationRow)
    };
  } catch (error) {
    if (error instanceof DataBoxStoreError) throw error;
    throw dbError(error);
  }
}

export async function listDataBoxSyncRuns(env, filters = {}) {
  const db = dataBoxDatabase(env, true);
  const limit = limitValue(filters.limit, 50, 100);

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM data_box_sync_runs
        ORDER BY started_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();
    return (result.results || []).map(rowToSyncRun);
  } catch (error) {
    throw dbError(error);
  }
}

export function dataBoxStoreErrorResponse(error) {
  if (error instanceof DataBoxStoreError) {
    return {
      payload: { error: error.message, code: error.code, apiStatus: "waiting" },
      status: error.status
    };
  }

  console.error("data_box.api_failed", { message: error?.message });
  return {
    payload: { error: "Datovou schranku se ted nepodarilo nacist.", apiStatus: "waiting" },
    status: 500
  };
}
