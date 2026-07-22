import { hasPermission } from "../../src/permissions.js";

const FEEDBACK_DB_BINDING = "SMART_ODPADY_DB";
const PRIORITIES = new Set(["Nízká", "Běžná", "Důležitá", "Kritická"]);
const STATUSES = new Set(["Nová", "Převzato", "V řešení", "Hotovo", "Zamítnuto", "Archiv"]);
const FINISHED_STATUSES = new Set(["Hotovo", "Zamítnuto", "Archiv"]);
const CENTRAL_CREATE_ROLES = new Set(["admin", "management"]);

const STATUS_API_TO_LABEL = {
  new: "Nová",
  accepted: "Převzato",
  in_progress: "V řešení",
  done: "Hotovo",
  rejected: "Zamítnuto",
  archived: "Archiv"
};

export class ModuleFeedbackStoreError extends Error {
  constructor(message, status = 400, code = "module_feedback_store_error") {
    super(message);
    this.name = "ModuleFeedbackStoreError";
    this.status = status;
    this.code = code;
  }
}

function feedbackDatabase(env, required = false) {
  const db = env?.[FEEDBACK_DB_BINDING] || null;

  if (!db && required) {
    throw new ModuleFeedbackStoreError(
      "Databáze připomínek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "module_feedback_database_missing"
    );
  }

  return db;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function randomId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `module-feedback-${suffix}`;
}

function normalizePriority(value) {
  const cleaned = cleanString(value);
  return PRIORITIES.has(cleaned) ? cleaned : "Běžná";
}

function normalizeStatus(value) {
  const cleaned = cleanString(value);
  const apiStatus = STATUS_API_TO_LABEL[cleaned];
  const label = apiStatus || cleaned;

  if (!STATUSES.has(label)) {
    throw new ModuleFeedbackStoreError("Vyberte platný stav připomínky.", 400, "module_feedback_status_invalid");
  }

  return label;
}

function normalizeRole(value) {
  return String(value || "readonly").trim().toLowerCase();
}

function composeAdminMessage(title, description) {
  return `${title}\n\n${description}`.trim();
}

function sameUser(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function rowToFeedback(row) {
  if (!row) {
    return null;
  }

  return {
    id: cleanString(row.id),
    moduleId: cleanString(row.module_id),
    moduleName: cleanString(row.module_name),
    userId: cleanString(row.user_id),
    userName: cleanString(row.user_name),
    userRole: cleanString(row.user_role),
    message: cleanString(row.message),
    priority: normalizePriority(row.priority),
    status: STATUSES.has(cleanString(row.status)) ? cleanString(row.status) : "Nová",
    createdAt: cleanString(row.created_at),
    resolvedAt: row.resolved_at || null,
    resolvedByUserId: row.resolved_by_user_id || null,
    internalNote: cleanString(row.internal_note),
    attachments: []
  };
}

function rowToFeedbackAttachment(row) {
  const caseId = cleanString(row?.case_id);
  const id = cleanString(row?.id);
  if (!caseId || !id) return null;
  return {
    id,
    caseId,
    feedbackId: cleanString(row.feedback_id),
    filename: cleanString(row.file_name),
    contentType: cleanString(row.content_type),
    sizeBytes: Math.max(0, Number(row.size_bytes || 0)),
    createdAt: cleanString(row.created_at),
    openUrl: `/api/self-repair/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(id)}`
  };
}

export function canEditModuleFeedback(user) {
  return hasPermission(user, "feedback", "edit") || hasPermission(user, "feedback", "manage");
}

export function canCreateCentralModuleFeedback(user) {
  return CENTRAL_CREATE_ROLES.has(normalizeRole(user?.role));
}

export async function listModuleFeedback(env, currentUser) {
  const db = feedbackDatabase(env, true);
  const [result, attachmentResult] = await Promise.all([
    db.prepare(`
      SELECT
        id,
        module_id,
        module_name,
        user_id,
        user_name,
        user_role,
        message,
        priority,
        status,
        created_at,
        resolved_at,
        resolved_by_user_id,
        internal_note
      FROM module_feedback
      ORDER BY created_at DESC
      LIMIT 500
    `)
      .all(),
    db.prepare(`
      SELECT id, case_id, feedback_id, file_name, content_type, size_bytes, created_at
      FROM self_repair_case_attachments
      WHERE feedback_id IN (
        SELECT id FROM module_feedback ORDER BY created_at DESC LIMIT 500
      )
      ORDER BY created_at ASC
    `).all()
  ]);
  const attachmentsByFeedback = new Map();
  for (const row of attachmentResult.results || []) {
    const attachment = rowToFeedbackAttachment(row);
    if (!attachment?.feedbackId) continue;
    const items = attachmentsByFeedback.get(attachment.feedbackId) || [];
    items.push(attachment);
    attachmentsByFeedback.set(attachment.feedbackId, items);
  }
  const items = (result.results || [])
    .map(rowToFeedback)
    .filter(Boolean)
    .map((item) => ({ ...item, attachments: attachmentsByFeedback.get(item.id) || [] }));

  if (canEditModuleFeedback(currentUser)) {
    return items;
  }

  return items.filter((item) => sameUser(item.userId, currentUser?.id));
}

export async function createCentralModuleFeedbackRecord(env, currentUser, input = {}) {
  const db = feedbackDatabase(env, true);
  const moduleId = cleanString(input.moduleId);
  const moduleName = cleanString(input.moduleName);
  const title = cleanString(input.title);
  const description = cleanString(input.description || input.message);

  if (!moduleId || !moduleName) {
    throw new ModuleFeedbackStoreError("Vyberte modul připomínky.", 400, "module_feedback_module_required");
  }

  if (!title) {
    throw new ModuleFeedbackStoreError("Vyplňte název připomínky.", 400, "module_feedback_title_required");
  }

  if (!description) {
    throw new ModuleFeedbackStoreError("Vyplňte popis připomínky.", 400, "module_feedback_description_required");
  }

  const priority = cleanString(input.priority || "Běžná");
  if (!PRIORITIES.has(priority)) {
    throw new ModuleFeedbackStoreError("Vyberte platnou prioritu připomínky.", 400, "module_feedback_priority_invalid");
  }

  const now = new Date().toISOString();
  const status = normalizeStatus(input.status || "Nová");
  const resolvedAt = FINISHED_STATUSES.has(status) ? now : null;
  const resolvedByUserId = FINISHED_STATUSES.has(status) ? (cleanString(currentUser?.id) || null) : null;
  const feedback = {
    id: randomId(),
    moduleId,
    moduleName,
    userId: cleanString(currentUser?.id),
    userName: cleanString(currentUser?.name || currentUser?.email || "Uživatel"),
    userRole: cleanString(currentUser?.role || "readonly"),
    message: composeAdminMessage(title, description),
    priority,
    status,
    createdAt: now,
    resolvedAt,
    resolvedByUserId,
    internalNote: cleanString(input.internalNote)
  };

  await db
    .prepare(`
      INSERT INTO module_feedback (
        id,
        module_id,
        module_name,
        user_id,
        user_name,
        user_role,
        message,
        priority,
        status,
        created_at,
        resolved_at,
        resolved_by_user_id,
        internal_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      feedback.id,
      feedback.moduleId,
      feedback.moduleName,
      feedback.userId,
      feedback.userName,
      feedback.userRole,
      feedback.message,
      feedback.priority,
      feedback.status,
      feedback.createdAt,
      feedback.resolvedAt,
      feedback.resolvedByUserId,
      feedback.internalNote
    )
    .run();

  return feedback;
}

export async function createModuleFeedbackRecord(env, currentUser, input = {}) {
  const db = feedbackDatabase(env, true);
  const message = cleanString(input.message);

  if (!message) {
    throw new ModuleFeedbackStoreError("Vyplňte text připomínky.", 400, "module_feedback_message_required");
  }

  const now = new Date().toISOString();
  const feedback = {
    id: randomId(),
    moduleId: cleanString(input.moduleId),
    moduleName: cleanString(input.moduleName),
    userId: cleanString(currentUser?.id),
    userName: cleanString(currentUser?.name || currentUser?.email || "Uživatel"),
    userRole: cleanString(currentUser?.role || "readonly"),
    message,
    priority: normalizePriority(input.priority),
    status: "Nová",
    createdAt: now,
    resolvedAt: null,
    resolvedByUserId: null,
    internalNote: ""
  };

  await db
    .prepare(`
      INSERT INTO module_feedback (
        id,
        module_id,
        module_name,
        user_id,
        user_name,
        user_role,
        message,
        priority,
        status,
        created_at,
        resolved_at,
        resolved_by_user_id,
        internal_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      feedback.id,
      feedback.moduleId,
      feedback.moduleName,
      feedback.userId,
      feedback.userName,
      feedback.userRole,
      feedback.message,
      feedback.priority,
      feedback.status,
      feedback.createdAt,
      feedback.resolvedAt,
      feedback.resolvedByUserId,
      feedback.internalNote
    )
    .run();

  return feedback;
}

export async function updateModuleFeedbackRecord(env, currentUser, id, input = {}) {
  const db = feedbackDatabase(env, true);
  const feedbackId = cleanString(id);

  if (!feedbackId) {
    throw new ModuleFeedbackStoreError("Připomínka nebyla nalezena.", 404, "module_feedback_missing");
  }

  const existingResult = await db
    .prepare("SELECT * FROM module_feedback WHERE id = ?")
    .bind(feedbackId)
    .first();

  const existing = rowToFeedback(existingResult);
  if (!existing) {
    throw new ModuleFeedbackStoreError("Připomínka nebyla nalezena.", 404, "module_feedback_not_found");
  }

  const status = Object.prototype.hasOwnProperty.call(input, "status")
    ? normalizeStatus(input.status)
    : existing.status;
  const internalNote = Object.prototype.hasOwnProperty.call(input, "internalNote")
    ? cleanString(input.internalNote)
    : existing.internalNote;
  const resolvedAt = FINISHED_STATUSES.has(status) ? (existing.resolvedAt || new Date().toISOString()) : null;
  const resolvedByUserId = FINISHED_STATUSES.has(status)
    ? (existing.resolvedByUserId || cleanString(currentUser?.id) || null)
    : null;

  await db
    .prepare(`
      UPDATE module_feedback
      SET
        status = ?,
        internal_note = ?,
        resolved_at = ?,
        resolved_by_user_id = ?
      WHERE id = ?
    `)
    .bind(status, internalNote, nullableString(resolvedAt), nullableString(resolvedByUserId), feedbackId)
    .run();

  return {
    ...existing,
    previousStatus: existing.status,
    status,
    internalNote,
    resolvedAt,
    resolvedByUserId
  };
}
