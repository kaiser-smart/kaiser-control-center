import { hasPermission } from "../../src/permissions.js";

const FEEDBACK_DB_BINDING = "SMART_ODPADY_DB";
const PRIORITIES = new Set(["Nízká", "Běžná", "Důležitá", "Kritická"]);
const STATUSES = new Set(["Nová", "Převzato", "V řešení", "Hotovo", "Zamítnuto", "Archiv"]);
const FINISHED_STATUSES = new Set(["Hotovo", "Zamítnuto", "Archiv"]);

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
    internalNote: cleanString(row.internal_note)
  };
}

export function canEditModuleFeedback(user) {
  return hasPermission(user, "feedback", "edit") || hasPermission(user, "feedback", "manage");
}

export async function listModuleFeedback(env, currentUser) {
  const db = feedbackDatabase(env, true);
  const result = await db
    .prepare(`
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
    .all();
  const items = (result.results || []).map(rowToFeedback).filter(Boolean);

  if (canEditModuleFeedback(currentUser)) {
    return items;
  }

  return items.filter((item) => sameUser(item.userId, currentUser?.id));
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
