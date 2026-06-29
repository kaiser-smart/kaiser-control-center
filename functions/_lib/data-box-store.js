import {
  dataBoxIsdsAccountConfigs,
  dataBoxIsdsStatus,
  fetchDataBoxMessageAttachments,
  fetchDataBoxMessageMetadata
} from "./data-box-isds-client.js";

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

function idValue(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function safeIdPart(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeFilename(value, fallback = "priloha") {
  return cleanString(value || fallback)
    .replace(/[\r\n"]/g, "")
    .replace(/[/:\\]+/g, "-")
    .trim()
    .slice(0, 180) || fallback;
}

function contentDispositionFilename(name) {
  return `inline; filename*=UTF-8''${encodeURIComponent(safeFilename(name, "priloha"))}`;
}

function attachmentRecordId(messageId, attachment, index = 0) {
  const suffix = safeIdPart(attachment?.fileGuid || attachment?.filename || `attachment-${index + 1}`) || `attachment-${index + 1}`;
  return `data-box-attachment-${safeIdPart(messageId) || "message"}-${Number(index) + 1}-${suffix}`;
}

function dataBoxAttachmentStorageKey(dataBoxId, message, attachmentId, filename) {
  const boxPart = safeIdPart(dataBoxId) || "primary";
  const messagePart = safeIdPart(message?.isdsMessageId || message?.id) || "message";
  return `data-box/${boxPart}/${messagePart}/${safeIdPart(attachmentId) || "attachment"}-${safeFilename(filename)}`;
}

function dataBoxAttachmentOpenUrl(attachment) {
  if (!attachment?.storageKey || cleanString(attachment?.status) !== "stored") {
    return "";
  }

  return `/api/data-box/messages/${encodeURIComponent(attachment.messageId)}/attachments/${encodeURIComponent(attachment.id)}`;
}

function bytesToArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) {
    return bytes;
  }

  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  return new Uint8Array().buffer;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function shortDiagnostic(value, maxLength = 180) {
  return cleanString(value)
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function messageRecordId(dataBoxId, direction, isdsMessageId) {
  const safeDataBoxId = safeIdPart(dataBoxId) || "primary";
  const safeMessageId = safeIdPart(isdsMessageId) || idValue("isds-message");
  return `data-box-${safeDataBoxId}-${normalizeDirection(direction) || "message"}-${safeMessageId}`;
}

function normalizeDirection(value) {
  const direction = cleanString(value).toLowerCase();
  return MESSAGE_DIRECTIONS.has(direction) ? direction : "";
}

function normalizeStatus(value) {
  const status = cleanString(value).toLowerCase();
  return MESSAGE_STATUSES.has(status) ? status : "";
}

function messageObservedDataBoxId(message) {
  const direction = normalizeDirection(message?.direction) || "received";
  return cleanString(direction === "sent" ? message?.senderBoxId : message?.recipientBoxId);
}

function observedDataBoxIds(messages = []) {
  const seen = new Set();
  for (const message of messages) {
    const observedId = messageObservedDataBoxId(message);
    if (observedId) {
      seen.add(observedId);
    }
  }
  return Array.from(seen);
}

function configuredAccountIsdsId(account) {
  const expectedIsdsId = cleanString(account?.isdsId);
  const username = cleanString(account?.username);
  const slot = Number(account?.slot || 0);

  if (slot > 1 && expectedIsdsId && username && expectedIsdsId === username) {
    return "";
  }

  return expectedIsdsId;
}

function assertAccountMessageSource(account, messages = [], knownObservedIds = new Set()) {
  const expectedIsdsId = configuredAccountIsdsId(account);
  const observedIds = observedDataBoxIds(messages);
  const slot = Number(account?.slot || 0);
  const label = cleanString(account?.label || account?.id || "Datova schranka");

  if (observedIds.length > 1) {
    throw new DataBoxStoreError(
      `${label}: ISDS vratilo zpravy pro vice datovych schranek (${observedIds.join(", ")}). Zkontrolujte login, heslo a DATA_BOX_ISDS_ID_${slot || ""}.`,
      409,
      "data_box_isds_mapping_ambiguous"
    );
  }

  if (!expectedIsdsId && slot > 1 && observedIds.length && knownObservedIds.has(observedIds[0])) {
    throw new DataBoxStoreError(
      `${label}: ISDS vratilo stejne ID schranky (${observedIds[0]}) jako jina nakonfigurovana DS. Sync byl zastaven kvuli ochrane pred michanim firem.`,
      409,
      "data_box_isds_mapping_duplicate"
    );
  }

  if (expectedIsdsId && observedIds.length && !observedIds.includes(expectedIsdsId)) {
    throw new DataBoxStoreError(
      `${label}: prihlaseni vratilo jinou datovou schranku (${observedIds[0]}) nez ocekavana DATA_BOX_ISDS_ID_${slot || ""} (${expectedIsdsId}). Zkontrolujte login, heslo a ID schranky.`,
      409,
      "data_box_isds_mapping_mismatch"
    );
  }

  return {
    expectedIsdsId,
    observedIsdsId: observedIds[0] || ""
  };
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
    dataBoxLabel: cleanString(row.data_box_label),
    dataBoxIsdsId: cleanString(row.data_box_isds_id),
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
  const attachment = {
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
  return {
    ...attachment,
    openUrl: dataBoxAttachmentOpenUrl(attachment)
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
    dataBoxLabel: cleanString(row.data_box_label),
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

async function ensurePrimaryDataBox(db) {
  const existing = await primaryDataBox(db);
  if (existing.id) {
    return existing;
  }

  await db
    .prepare(`
      INSERT INTO data_boxes (
        id,
        label,
        mode,
        status,
        last_sync_status,
        last_sync_message
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      "kaiser-primary",
      "Kaiser Smart Datova schranka",
      "pilot",
      "inactive",
      "waiting",
      "ISDS integrace neni aktivni."
    )
    .run();

  return primaryDataBox(db);
}

async function listDataBoxes(db) {
  const result = await db
    .prepare("SELECT * FROM data_boxes ORDER BY created_at ASC, label ASC")
    .all();
  return (result.results || []).map(rowToBox);
}

function accountDataBoxId(account) {
  const explicit = cleanString(account?.id);
  if (explicit) {
    return explicit;
  }

  return Number(account?.slot) === 1 ? "kaiser-primary" : `kaiser-data-box-${Number(account?.slot) || "extra"}`;
}

async function ensureDataBoxForAccount(db, account) {
  const dataBoxId = accountDataBoxId(account);
  const label = cleanString(account?.label) || "Datova schranka";
  const isdsId = cleanString(account?.isdsId);

  await db
    .prepare(`
      INSERT INTO data_boxes (
        id,
        label,
        isds_id,
        mode,
        status,
        last_sync_status,
        last_sync_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        isds_id = CASE
          WHEN excluded.isds_id <> '' THEN excluded.isds_id
          ELSE data_boxes.isds_id
        END,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      dataBoxId,
      label,
      isdsId,
      "read-only-pilot",
      "waiting",
      "waiting",
      "Ceka na prvni rucni read-only sync."
    )
    .run();

  const row = await db.prepare("SELECT * FROM data_boxes WHERE id = ? LIMIT 1").bind(dataBoxId).first();
  return rowToBox(row);
}

async function syncRunById(db, runId) {
  const row = await db.prepare("SELECT * FROM data_box_sync_runs WHERE id = ? LIMIT 1").bind(runId).first();
  return rowToSyncRun(row);
}

async function createSyncRun(db, dataBox, currentUser, startedAt) {
  const runId = idValue("data-box-sync");
  await db
    .prepare(`
      INSERT INTO data_box_sync_runs (
        id,
        data_box_id,
        trigger_type,
        started_at,
        status,
        dedupe_key,
        created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      runId,
      dataBox.id || null,
      "manual",
      startedAt,
      "running",
      `manual:${dataBox.id || "primary"}:${startedAt}:${runId}`,
      cleanString(currentUser?.id)
    )
    .run();
  return runId;
}

async function finishSyncRun(db, runId, patch) {
  await db
    .prepare(`
      UPDATE data_box_sync_runs
      SET
        finished_at = ?,
        status = ?,
        messages_found = ?,
        messages_created = ?,
        messages_updated = ?,
        attachments_found = ?,
        error_code = ?,
        message = ?
      WHERE id = ?
    `)
    .bind(
      patch.finishedAt,
      patch.status,
      numberValue(patch.messagesFound),
      numberValue(patch.messagesCreated),
      numberValue(patch.messagesUpdated),
      numberValue(patch.attachmentsFound),
      cleanString(patch.errorCode),
      cleanString(patch.message),
      runId
    )
    .run();
  return syncRunById(db, runId);
}

async function updateDataBoxSyncState(db, dataBoxId, patch) {
  if (!dataBoxId) {
    return;
  }

  await db
    .prepare(`
      UPDATE data_boxes
      SET
        mode = ?,
        status = ?,
        last_sync_at = ?,
        last_sync_status = ?,
        last_sync_message = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      patch.mode,
      patch.status,
      patch.lastSyncAt,
      patch.lastSyncStatus,
      patch.lastSyncMessage,
      dataBoxId
    )
    .run();
}

async function updateDataBoxIsdsId(db, dataBoxId, isdsId) {
  const normalizedIsdsId = cleanString(isdsId);
  if (!dataBoxId || !normalizedIsdsId) {
    return;
  }

  await db
    .prepare(`
      UPDATE data_boxes
      SET
        isds_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(normalizedIsdsId, dataBoxId)
    .run();
}

async function upsertMessageMetadata(db, dataBoxId, message) {
  const isdsMessageId = cleanString(message.isdsMessageId);
  if (!dataBoxId || !isdsMessageId) {
    return "skipped";
  }

  const existing = await db
    .prepare("SELECT id FROM data_box_messages WHERE data_box_id = ? AND isds_message_id = ? LIMIT 1")
    .bind(dataBoxId, isdsMessageId)
    .first();

  const values = [
    dataBoxId,
    isdsMessageId,
    normalizeDirection(message.direction) || "received",
    cleanString(message.subject),
    cleanString(message.senderName),
    cleanString(message.senderBoxId),
    cleanString(message.recipientName),
    cleanString(message.recipientBoxId),
    cleanString(message.deliveredAt),
    cleanString(message.acceptedAt),
    cleanString(message.status || "metadata"),
    cleanString(message.priority || "normal"),
    message.hasAttachments ? 1 : 0,
    numberValue(message.attachmentsCount),
    cleanString(message.source || "isds_metadata"),
    cleanString(message.isdsState)
  ];

  if (existing?.id) {
    await db
      .prepare(`
        UPDATE data_box_messages
        SET
          data_box_id = ?,
          isds_message_id = ?,
          direction = ?,
          subject = ?,
          sender_name = ?,
          sender_box_id = ?,
          recipient_name = ?,
          recipient_box_id = ?,
          delivered_at = ?,
          accepted_at = ?,
          status = ?,
          priority = ?,
          has_attachments = ?,
          attachments_count = ?,
          source = ?,
          isds_state = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(...values, existing.id)
      .run();
    return "updated";
  }

  await db
    .prepare(`
      INSERT INTO data_box_messages (
        id,
        data_box_id,
        isds_message_id,
        direction,
        subject,
        sender_name,
        sender_box_id,
        recipient_name,
        recipient_box_id,
        delivered_at,
        accepted_at,
        status,
        priority,
        has_attachments,
        attachments_count,
        source,
        isds_state
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(messageRecordId(dataBoxId, message.direction, isdsMessageId), ...values)
    .run();

  return "created";
}

async function attachmentSyncState(db, messageId) {
  const row = await db
    .prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN status = 'stored' AND storage_key <> '' THEN 1 ELSE 0 END) AS stored_count,
        SUM(CASE WHEN status = 'download_failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'metadata_only' THEN 1 ELSE 0 END) AS metadata_count
      FROM data_box_attachments
      WHERE message_id = ?
    `)
    .bind(messageId)
    .first();

  return {
    totalCount: numberValue(row?.total_count),
    storedCount: numberValue(row?.stored_count),
    failedCount: numberValue(row?.failed_count),
    metadataCount: numberValue(row?.metadata_count)
  };
}

async function updateMessageAttachmentCount(db, messageId, attachmentsCount) {
  await db
    .prepare(`
      UPDATE data_box_messages
      SET
        has_attachments = ?,
        attachments_count = ?,
        source = CASE
          WHEN source = 'isds_metadata' THEN 'isds_detail'
          ELSE source
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(attachmentsCount > 0 ? 1 : 0, numberValue(attachmentsCount), messageId)
    .run();
}

async function upsertDataBoxAttachment(db, attachment) {
  await db
    .prepare(`
      INSERT INTO data_box_attachments (
        id,
        message_id,
        filename,
        content_type,
        size_bytes,
        storage_key,
        checksum_sha256,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        content_type = excluded.content_type,
        size_bytes = excluded.size_bytes,
        storage_key = excluded.storage_key,
        checksum_sha256 = excluded.checksum_sha256,
        status = excluded.status
    `)
    .bind(
      cleanString(attachment.id),
      cleanString(attachment.messageId),
      safeFilename(attachment.filename, "priloha"),
      cleanString(attachment.contentType || "application/octet-stream"),
      numberValue(attachment.sizeBytes),
      cleanString(attachment.storageKey),
      cleanString(attachment.checksumSha256),
      cleanString(attachment.status || "metadata_only")
    )
    .run();
}

async function syncDataBoxMessageAttachments(db, env, account, dataBox, message, messageId) {
  const existingState = await attachmentSyncState(db, messageId);
  if (
    existingState.totalCount > 0
    && existingState.storedCount === existingState.totalCount
    && existingState.failedCount === 0
    && existingState.metadataCount === 0
  ) {
    return {
      checked: 0,
      downloaded: 0,
      failed: 0,
      metadataOnly: 0,
      skipped: existingState.totalCount
    };
  }

  let detail;
  try {
    detail = await fetchDataBoxMessageAttachments(env, account, message);
  } catch (error) {
    const errorCode = cleanString(error?.code || "data_box_attachment_detail_failed");
    const firstOperationError = Array.isArray(error?.operationErrors) ? error.operationErrors[0] : null;
    const errorMessage = shortDiagnostic(
      firstOperationError
        ? `${firstOperationError.endpoint || ""} ${firstOperationError.operation}: ${firstOperationError.message}`
        : error?.message
    );
    console.warn("data_box.attachment_check", {
      messageId,
      attachmentsCount: 0,
      downloadStatus: "error",
      errorCode,
      errorMessage,
      checkedAt: new Date().toISOString()
    });
    return {
      checked: 0,
      downloaded: 0,
      failed: 1,
      metadataOnly: 0,
      skipped: 0,
      errorCode,
      errorMessage
    };
  }

  const attachments = detail.attachments || [];
  const bucket = dataBoxDocumentsBucket(env);
  let downloaded = 0;
  let failed = 0;
  let metadataOnly = 0;

  await updateMessageAttachmentCount(db, messageId, attachments.length);

  for (const attachment of attachments) {
    const attachmentId = attachmentRecordId(messageId, attachment, attachment.index);
    const filename = safeFilename(attachment.filename, `priloha-${Number(attachment.index || 0) + 1}`);
    const contentType = cleanString(attachment.contentType || "application/octet-stream");
    const storageKey = dataBoxAttachmentStorageKey(dataBox.id, message, attachmentId, filename);
    let status = "metadata_only";
    let savedStorageKey = "";
    let checksumSha256 = "";
    let errorCode = "";

    try {
      if (!bucket) {
        errorCode = "data_box_storage_missing";
      } else if (!attachment.bytes?.byteLength) {
        errorCode = "data_box_attachment_content_missing";
      } else {
        const body = bytesToArrayBuffer(attachment.bytes);
        checksumSha256 = await sha256Hex(body);
        await bucket.put(storageKey, body, {
          httpMetadata: { contentType },
          customMetadata: {
            module: "data-box",
            messageId,
            isdsMessageId: cleanString(message.isdsMessageId),
            filename
          }
        });
        status = "stored";
        savedStorageKey = storageKey;
        downloaded += 1;
      }
    } catch (error) {
      status = "download_failed";
      errorCode = cleanString(error?.code || error?.name || "data_box_attachment_store_failed");
      failed += 1;
    }

    if (status === "metadata_only") {
      metadataOnly += 1;
    }

    await upsertDataBoxAttachment(db, {
      id: attachmentId,
      messageId,
      filename,
      contentType,
      sizeBytes: attachment.sizeBytes,
      storageKey: savedStorageKey,
      checksumSha256,
      status
    });

    console.info("data_box.attachment_check", {
      messageId,
      attachmentsCount: attachments.length,
      filename,
      sizeBytes: numberValue(attachment.sizeBytes),
      mimeType: contentType,
      downloadStatus: status === "stored" ? "ok" : status,
      errorCode,
      downloadedAt: new Date().toISOString()
    });
  }

  return {
    checked: attachments.length,
    downloaded,
    failed,
    metadataOnly,
    skipped: 0
  };
}

export async function getDataBoxStatus(env) {
  const db = dataBoxDatabase(env);
  const storageStatus = dataBoxStorageStatus(env);
  const isdsStatus = dataBoxIsdsStatus(env);

  if (!db) {
    return {
      apiStatus: "waiting",
      storageStatus,
      integrationStatus: "inactive",
      isdsActive: false,
      mode: "pilot",
      isds: isdsStatus,
      dataBox: null,
      summary: { received: 0, sent: 0, attachments: 0, syncRuns: 0, lastSyncAt: "" },
      message: "Cloud D1 binding SMART_ODPADY_DB zatim neni dostupny."
    };
  }

  try {
    const dataBoxes = await listDataBoxes(db);
    const dataBox = dataBoxes[0] || await primaryDataBox(db);
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
      integrationStatus: isdsStatus.configured ? "configured" : (dataBox.status || "inactive"),
      isdsActive: isdsStatus.configured,
      mode: dataBox.mode || "pilot",
      isds: isdsStatus,
      dataBox,
      dataBoxes,
      summary: {
        received: numberValue(summaryRow?.received),
        sent: numberValue(summaryRow?.sent),
        attachments: numberValue(summaryRow?.attachments),
        dataBoxes: dataBoxes.length,
        configuredDataBoxes: numberValue(isdsStatus.configuredAccounts),
        syncRuns: numberValue(syncRow?.sync_runs),
        lastSyncAt: cleanString(syncRow?.last_sync_at || dataBox.lastSyncAt)
      },
      message: dataBox.lastSyncAt && dataBox.lastSyncMessage
        ? dataBox.lastSyncMessage
        : (
          isdsStatus.configured
            ? `ISDS read-only konfigurace je nastavena pro ${numberValue(isdsStatus.configuredAccounts)} datovych schranek. Sync se spousti jen rucne.`
            : "ISDS integrace neni aktivni."
        )
    };
  } catch (error) {
    throw dbError(error);
  }
}

async function syncDataBoxAccount(db, env, account, currentUser, startedAt, knownObservedIds = new Set()) {
  const dataBox = await ensureDataBoxForAccount(db, account);
  const runId = await createSyncRun(db, dataBox, currentUser, startedAt);

  try {
    const result = await fetchDataBoxMessageMetadata(env, account);
    const sourceCheck = assertAccountMessageSource(account, result.messages, knownObservedIds);
    const verifiedIsdsId = sourceCheck.expectedIsdsId || sourceCheck.observedIsdsId;
    if (verifiedIsdsId) {
      await updateDataBoxIsdsId(db, dataBox.id, verifiedIsdsId);
    }

    let messagesCreated = 0;
    let messagesUpdated = 0;
    let attachmentsFound = 0;
    let attachmentsChecked = 0;
    let attachmentsDownloaded = 0;
    let attachmentsFailed = 0;
    let attachmentsMetadataOnly = 0;
    let firstAttachmentError = "";

    for (const message of result.messages) {
      const writeState = await upsertMessageMetadata(db, dataBox.id, message);
      if (writeState === "created") messagesCreated += 1;
      if (writeState === "updated") messagesUpdated += 1;
      if (message.hasAttachments) {
        attachmentsFound += 1;
        const localMessageId = messageRecordId(dataBox.id, message.direction, message.isdsMessageId);
        const attachmentResult = await syncDataBoxMessageAttachments(db, env, account, dataBox, message, localMessageId);
        attachmentsChecked += numberValue(attachmentResult.checked);
        attachmentsDownloaded += numberValue(attachmentResult.downloaded);
        attachmentsFailed += numberValue(attachmentResult.failed);
        attachmentsMetadataOnly += numberValue(attachmentResult.metadataOnly);
        if (!firstAttachmentError && attachmentResult.errorMessage) {
          firstAttachmentError = shortDiagnostic(`${attachmentResult.errorCode}: ${attachmentResult.errorMessage}`, 220);
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const attachmentSummary = attachmentsFound
      ? ` Prilohy: ${attachmentsDownloaded} ulozenych, ${attachmentsMetadataOnly} jen metadata, ${attachmentsFailed} chyb.`
      : "";
    const attachmentErrorSummary = firstAttachmentError
      ? ` Prvni chyba priloh: ${firstAttachmentError}.`
      : "";
    const message = `${dataBox.label}: read-only ISDS sync ulozil metadata: ${result.messages.length} obalek, ${messagesCreated} novych, ${messagesUpdated} aktualizovanych.${attachmentSummary}${attachmentErrorSummary}`;
    const sync = await finishSyncRun(db, runId, {
      finishedAt,
      status: "success",
      messagesFound: result.messages.length,
      messagesCreated,
      messagesUpdated,
      attachmentsFound,
      errorCode: "",
      message
    });

    await updateDataBoxSyncState(db, dataBox.id, {
      mode: "read-only-pilot",
      status: "ready",
      lastSyncAt: finishedAt,
      lastSyncStatus: "success",
      lastSyncMessage: message
    });

    return {
      status: "success",
      dataBox,
      sync,
      messagesFound: result.messages.length,
      messagesCreated,
      messagesUpdated,
      attachmentsFound,
      attachmentsChecked,
      attachmentsDownloaded,
      attachmentsFailed,
      attachmentsMetadataOnly,
      observedIsdsId: sourceCheck.observedIsdsId || verifiedIsdsId,
      message
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const isConfigMissing = error?.code === "data_box_isds_not_configured";
    const status = isConfigMissing ? "configuration_missing" : "failed";
    const errorCode = cleanString(error?.code || "data_box_isds_sync_failed");
    const message = `${dataBox.label}: ${cleanString(error?.message || "ISDS synchronizace se nepodarila.")}`;
    const sync = await finishSyncRun(db, runId, {
      finishedAt,
      status,
      messagesFound: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
      attachmentsFound: 0,
      errorCode,
      message
    });

    await updateDataBoxSyncState(db, dataBox.id, {
      mode: "read-only-pilot",
      status: isConfigMissing ? "inactive" : "error",
      lastSyncAt: finishedAt,
      lastSyncStatus: status,
      lastSyncMessage: message
    });

    return {
      status,
      dataBox,
      sync,
      messagesFound: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
      attachmentsFound: 0,
      message
    };
  }
}

export async function runDataBoxManualSync(env, currentUser) {
  const db = dataBoxDatabase(env, true);
  const startedAt = new Date().toISOString();

  try {
    const accounts = dataBoxIsdsAccountConfigs(env);
    if (!accounts.length) {
      const fallbackAccount = dataBoxIsdsStatus(env).accounts?.[0] || {
        id: "kaiser-primary",
        slot: 1,
        label: "Kaiser Smart Datova schranka",
        configured: false
      };
      const result = await syncDataBoxAccount(db, env, fallbackAccount, currentUser, startedAt);
      return {
        apiStatus: "ready",
        sync: result.sync,
        syncRuns: [result.sync],
        isds: dataBoxIsdsStatus(env),
        message: result.message
      };
    }

    const results = [];
    const knownObservedIds = new Set();
    for (const account of accounts) {
      const result = await syncDataBoxAccount(db, env, account, currentUser, startedAt, knownObservedIds);
      if (result.observedIsdsId) {
        knownObservedIds.add(result.observedIsdsId);
      }
      results.push(result);
    }

    const totals = results.reduce((sum, result) => ({
      messagesFound: sum.messagesFound + result.messagesFound,
      messagesCreated: sum.messagesCreated + result.messagesCreated,
      messagesUpdated: sum.messagesUpdated + result.messagesUpdated,
      attachmentsFound: sum.attachmentsFound + result.attachmentsFound
    }), {
      messagesFound: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
      attachmentsFound: 0
    });
    const failedCount = results.filter((result) => result.status !== "success").length;
    const message = failedCount
      ? `Rucni read-only sync prosel ${results.length} datovych schranek s chybami: ${totals.messagesFound} obalek, ${totals.messagesCreated} novych, ${totals.messagesUpdated} aktualizovanych, ${failedCount} chyb.`
      : `Rucni read-only sync prosel ${results.length} datovych schranek: ${totals.messagesFound} obalek, ${totals.messagesCreated} novych, ${totals.messagesUpdated} aktualizovanych.`;

    return {
      apiStatus: "ready",
      sync: results[0]?.sync || null,
      syncRuns: results.map((result) => result.sync),
      isds: dataBoxIsdsStatus(env),
      message
    };
  } catch (error) {
    if (error instanceof DataBoxStoreError) throw error;
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
    where.push("m.direction = ?");
    bindings.push(direction);
  }
  if (status) {
    where.push("m.status = ?");
    bindings.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const result = await db
      .prepare(`
        SELECT
          m.*,
          b.label AS data_box_label,
          b.isds_id AS data_box_isds_id
        FROM data_box_messages m
        LEFT JOIN data_boxes b ON b.id = m.data_box_id
        ${whereSql}
        ORDER BY COALESCE(m.delivered_at, m.accepted_at, m.stored_at) DESC, m.stored_at DESC
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
    const row = await db.prepare(`
      SELECT
        m.*,
        b.label AS data_box_label,
        b.isds_id AS data_box_isds_id
      FROM data_box_messages m
      LEFT JOIN data_boxes b ON b.id = m.data_box_id
      WHERE m.id = ?
      LIMIT 1
    `).bind(messageId).first();
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

export async function getDataBoxAttachmentFile(env, messageId, attachmentId) {
  const db = dataBoxDatabase(env, true);
  const bucket = dataBoxDocumentsBucket(env);
  if (!bucket) {
    throw new DataBoxStoreError(
      "Uloziste priloh Datove schranky neni nastavene. Pridejte Cloudflare R2 binding SMART_ODPADY_DOCUMENTS.",
      503,
      "data_box_storage_missing"
    );
  }

  const row = await db
    .prepare(`
      SELECT *
      FROM data_box_attachments
      WHERE id = ? AND message_id = ?
      LIMIT 1
    `)
    .bind(cleanString(attachmentId), cleanString(messageId))
    .first();
  const attachment = rowToAttachment(row);
  if (!attachment?.id) {
    throw new DataBoxStoreError("Priloha nebyla nalezena.", 404, "data_box_attachment_not_found");
  }
  if (attachment.status !== "stored" || !attachment.storageKey) {
    throw new DataBoxStoreError("Priloha zatim neni ulozena a nejde otevrit.", 409, "data_box_attachment_not_stored");
  }

  const object = await bucket.get(attachment.storageKey);
  if (!object) {
    throw new DataBoxStoreError("Priloha je evidovana, ale soubor nebyl nalezen v cloudovem ulozisti.", 404, "data_box_attachment_object_missing");
  }

  return {
    attachment,
    body: object.body,
    headers: {
      "Content-Type": attachment.contentType || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": contentDispositionFilename(attachment.filename),
      "Cache-Control": "no-store"
    }
  };
}

export async function listDataBoxSyncRuns(env, filters = {}) {
  const db = dataBoxDatabase(env, true);
  const limit = limitValue(filters.limit, 50, 100);

  try {
    const result = await db
      .prepare(`
        SELECT
          r.*,
          b.label AS data_box_label
        FROM data_box_sync_runs r
        LEFT JOIN data_boxes b ON b.id = r.data_box_id
        ORDER BY r.started_at DESC
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
