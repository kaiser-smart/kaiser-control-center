import { getDataBoxMessage } from "./data-box-store.js";
import { sendDataBoxForwardNotification } from "./notification-service.js";

const DB_BINDING = "SMART_ODPADY_DB";
const ACTION_STATUSES = new Set(["prepared", "requires_confirmation", "confirmed", "sent", "archived", "blocked", "failed", "skipped"]);

export class DataBoxActionError extends Error {
  constructor(message, status = 400, code = "data_box_action_error") {
    super(message);
    this.name = "DataBoxActionError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new DataBoxActionError(
      "Databáze akcí Datové schránky není dostupná. Chybí Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "data_box_action_database_missing"
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

function lower(value) {
  return cleanString(value).toLowerCase();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function rowToAction(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    dataBoxId: cleanString(row.data_box_id),
    actionType: cleanString(row.action_type),
    status: cleanString(row.status),
    recipient: cleanString(row.recipient),
    subject: cleanString(row.subject),
    bodyPreview: cleanString(row.body_preview),
    dedupeKey: cleanString(row.dedupe_key),
    requestedByUserId: cleanString(row.requested_by_user_id),
    requestedAt: cleanString(row.requested_at),
    confirmedAt: cleanString(row.confirmed_at),
    completedAt: cleanString(row.completed_at),
    provider: cleanString(row.provider),
    providerMessageId: cleanString(row.provider_message_id),
    result: parseJson(row.result_json, null),
    errorCode: cleanString(row.error_code),
    errorMessage: cleanString(row.error_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function normalizeEmail(value) {
  const email = lower(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeStatus(value, fallback = "prepared") {
  const status = cleanString(value).toLowerCase();
  return ACTION_STATUSES.has(status) ? status : fallback;
}

async function existingActionByDedupe(db, dedupeKey) {
  const row = await db
    .prepare("SELECT * FROM data_box_actions WHERE dedupe_key = ? LIMIT 1")
    .bind(dedupeKey)
    .first();
  return rowToAction(row);
}

async function insertAction(db, input) {
  const now = new Date().toISOString();
  const id = randomId("data-box-action");
  const status = normalizeStatus(input.status);

  await db
    .prepare(`
      INSERT INTO data_box_actions (
        id,
        message_id,
        data_box_id,
        action_type,
        status,
        recipient,
        subject,
        body_preview,
        dedupe_key,
        requested_by_user_id,
        requested_at,
        confirmed_at,
        completed_at,
        provider,
        provider_message_id,
        result_json,
        error_code,
        error_message,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      input.messageId,
      nullableString(input.dataBoxId),
      input.actionType,
      status,
      nullableString(input.recipient),
      nullableString(input.subject),
      nullableString(cleanString(input.bodyPreview).slice(0, 500)),
      input.dedupeKey,
      nullableString(input.userId),
      now,
      status === "confirmed" || status === "sent" || status === "archived" ? now : null,
      status === "sent" || status === "archived" || status === "blocked" || status === "failed" ? now : null,
      nullableString(input.provider),
      nullableString(input.providerMessageId),
      input.result ? safeJson(input.result) : null,
      nullableString(input.errorCode),
      nullableString(input.errorMessage),
      now,
      now
    )
    .run();

  return getAction(db, id);
}

async function updateAction(db, id, patch) {
  const now = new Date().toISOString();
  const status = normalizeStatus(patch.status);

  await db
    .prepare(`
      UPDATE data_box_actions
      SET
        status = ?,
        confirmed_at = COALESCE(confirmed_at, ?),
        completed_at = ?,
        provider = ?,
        provider_message_id = ?,
        result_json = ?,
        error_code = ?,
        error_message = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      status,
      status === "confirmed" || status === "sent" || status === "archived" ? now : null,
      status === "sent" || status === "archived" || status === "blocked" || status === "failed" || status === "skipped" ? now : null,
      nullableString(patch.provider),
      nullableString(patch.providerMessageId),
      patch.result ? safeJson(patch.result) : null,
      nullableString(patch.errorCode),
      nullableString(patch.errorMessage),
      now,
      id
    )
    .run();

  return getAction(db, id);
}

async function getAction(db, id) {
  const row = await db
    .prepare("SELECT * FROM data_box_actions WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  return rowToAction(row);
}

async function loadMessage(env, messageId) {
  const message = await getDataBoxMessage(env, messageId);
  if (!message?.id) {
    throw new DataBoxActionError("Datová zpráva nebyla nalezena.", 404, "data_box_action_message_missing");
  }
  return message;
}

function ensureConfirmed(payload) {
  if (payload?.confirmed !== true) {
    throw new DataBoxActionError("Akce vyžaduje potvrzení uživatele.", 409, "data_box_action_confirmation_required");
  }
}

export async function archiveDataBoxMessage(env, messageId, payload = {}, currentUser = {}) {
  ensureConfirmed(payload);
  const db = database(env, true);
  const message = await loadMessage(env, messageId);
  const dedupeKey = `data-box:archive:${message.id}`;
  const existing = await existingActionByDedupe(db, dedupeKey);

  if (existing) {
    return {
      action: existing,
      message,
      status: "skipped",
      apiStatus: "ready",
      notice: "Tato zpráva už byla archivována nebo má připravenou archivaci."
    };
  }

  const action = await insertAction(db, {
    messageId: message.id,
    dataBoxId: message.dataBoxId,
    actionType: "archive",
    status: "archived",
    recipient: "",
    subject: message.subject,
    bodyPreview: "Archivováno po potvrzení uživatele.",
    dedupeKey,
    userId: cleanString(currentUser?.id),
    result: { previousStatus: message.status, archivedAt: new Date().toISOString() }
  });

  await db
    .prepare("UPDATE data_box_messages SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(message.id)
    .run();

  return {
    action,
    message: await loadMessage(env, message.id),
    status: "archived",
    apiStatus: "ready",
    notice: "Zpráva byla archivována."
  };
}

export async function sendDataBoxMessageEmail(env, messageId, payload = {}, currentUser = {}) {
  ensureConfirmed(payload);
  const db = database(env, true);
  const message = await loadMessage(env, messageId);
  const recipientEmail = normalizeEmail(payload.recipientEmail || payload.recipient || payload.to);
  if (!recipientEmail) {
    throw new DataBoxActionError("Nelze odeslat: chybí platný e-mail příjemce.", 400, "data_box_email_recipient_missing");
  }

  const subject = cleanString(payload.subject || message.subject || "Datová zpráva");
  const body = cleanString(payload.body || payload.note);
  const dedupeKey = `data-box:email:${message.id}:${recipientEmail}`;
  const existing = await existingActionByDedupe(db, dedupeKey);
  if (existing && existing.status === "sent") {
    throw new DataBoxActionError("Tato zpráva už byla tomuto příjemci odeslána e-mailem.", 409, "data_box_email_duplicate");
  }

  const action = existing || await insertAction(db, {
    messageId: message.id,
    dataBoxId: message.dataBoxId,
    actionType: "email",
    status: "confirmed",
    recipient: recipientEmail,
    subject,
    bodyPreview: body || subject,
    dedupeKey,
    userId: cleanString(currentUser?.id)
  });

  const result = await sendDataBoxForwardNotification(env, message, {
    recipientEmail,
    subject,
    body,
    fromName: "Kaiser Smart"
  });

  const nextStatus = result.status === "sent" ? "sent" : result.status === "skipped" ? "blocked" : "failed";
  const updatedAction = await updateAction(db, action.id, {
    status: nextStatus,
    provider: "SendGrid",
    result,
    errorCode: result.status === "sent" ? "" : "data_box_email_send_failed",
    errorMessage: result.errorMessage || ""
  });

  if (nextStatus !== "sent") {
    throw new DataBoxActionError(
      result.errorMessage || "E-mail se nepodařilo odeslat.",
      result.status === "skipped" ? 503 : 502,
      "data_box_email_send_failed"
    );
  }

  return {
    action: updatedAction,
    message,
    status: "sent",
    apiStatus: "ready",
    notice: "Datová zpráva byla odeslána e-mailem."
  };
}

async function sendReplyViaConfiguredEndpoint(env, message, payload) {
  const endpoint = cleanString(env.DATA_BOX_REPLY_ENDPOINT || env.DATA_BOX_SEND_REPLY_ENDPOINT || env.KNF_DATA_BOX_REPLY_ENDPOINT);
  const apiKey = cleanString(env.DATA_BOX_REPLY_API_KEY || env.KNF_DATA_BOX_REPLY_API_KEY);

  if (!endpoint || !apiKey) {
    throw new DataBoxActionError(
      "Odpověď se nepodařilo odeslat: chybí server-side KNF/DS endpoint pro odesílání odpovědí.",
      503,
      "data_box_reply_sender_missing"
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sourceMailboxId: message.dataBoxId,
      originalMessageId: message.id,
      originalIsdsMessageId: message.isdsMessageId,
      recipientDataBoxId: cleanString(payload.recipientDataBoxId || message.senderBoxId || message.recipientBoxId),
      subject: cleanString(payload.subject),
      body: cleanString(payload.body)
    })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new DataBoxActionError(
      cleanString(result.error || result.message) || `Odeslání DS odpovědi selhalo (${response.status}).`,
      502,
      "data_box_reply_send_failed"
    );
  }

  return {
    success: true,
    sentMessageId: cleanString(result.sentMessageId || result.messageId),
    sentAt: cleanString(result.sentAt || new Date().toISOString()),
    rawStatus: cleanString(result.status || "sent")
  };
}

export async function sendDataBoxReply(env, messageId, payload = {}, currentUser = {}) {
  ensureConfirmed(payload);
  const db = database(env, true);
  const message = await loadMessage(env, messageId);
  const body = cleanString(payload.body || payload.text);
  if (!body) {
    throw new DataBoxActionError("Nelze odeslat: text odpovědi je prázdný.", 400, "data_box_reply_body_missing");
  }

  const recipientDataBoxId = cleanString(payload.recipientDataBoxId || message.senderBoxId || message.recipientBoxId);
  if (!recipientDataBoxId) {
    throw new DataBoxActionError("Nelze odeslat: chybí adresát datové zprávy.", 400, "data_box_reply_recipient_missing");
  }

  const subject = cleanString(payload.subject || (message.subject?.toLowerCase?.().startsWith("re:") ? message.subject : `Re: ${message.subject || "Datová zpráva"}`));
  const dedupeKey = `data-box:reply:${message.id}`;
  const existing = await existingActionByDedupe(db, dedupeKey);
  if (existing && ["sent", "confirmed"].includes(existing.status)) {
    throw new DataBoxActionError("Na tuto zprávu už byla odpověď odeslána nebo je rozpracovaná k odeslání.", 409, "data_box_reply_duplicate");
  }

  const action = existing || await insertAction(db, {
    messageId: message.id,
    dataBoxId: message.dataBoxId,
    actionType: "reply",
    status: "confirmed",
    recipient: recipientDataBoxId,
    subject,
    bodyPreview: body,
    dedupeKey,
    userId: cleanString(currentUser?.id)
  });

  try {
    const result = await sendReplyViaConfiguredEndpoint(env, message, {
      ...payload,
      subject,
      body,
      recipientDataBoxId
    });
    const updatedAction = await updateAction(db, action.id, {
      status: "sent",
      provider: "KNF/DS",
      providerMessageId: result.sentMessageId,
      result
    });

    return {
      action: updatedAction,
      message,
      status: "sent",
      apiStatus: "ready",
      notice: "Odpověď byla odeslána přes datovou schránku."
    };
  } catch (error) {
    await updateAction(db, action.id, {
      status: error instanceof DataBoxActionError && error.code === "data_box_reply_sender_missing" ? "blocked" : "failed",
      provider: "KNF/DS",
      errorCode: cleanString(error?.code || "data_box_reply_send_failed"),
      errorMessage: cleanString(error?.message)
    });
    throw error;
  }
}

export async function prepareDataBoxAction(env, message, actionType, input = {}, currentUser = {}) {
  const db = database(env, true);
  const recipient = cleanString(input.recipient);
  const dedupeKey = cleanString(input.dedupeKey);
  const existing = await existingActionByDedupe(db, dedupeKey);
  if (existing) {
    return existing;
  }

  return insertAction(db, {
    messageId: message.id,
    dataBoxId: message.dataBoxId,
    actionType,
    status: "requires_confirmation",
    recipient,
    subject: cleanString(input.subject || message.subject),
    bodyPreview: cleanString(input.bodyPreview || input.reason || ""),
    dedupeKey,
    userId: cleanString(currentUser?.id),
    result: input.result
  });
}

export async function confirmDataBoxAction(env, actionId, payload = {}, currentUser = {}) {
  ensureConfirmed(payload);
  const db = database(env, true);
  const action = await getAction(db, cleanString(actionId));

  if (!action?.id) {
    throw new DataBoxActionError("Koncept akce nebyl nalezen.", 404, "data_box_action_missing");
  }

  if (!["prepared", "requires_confirmation", "confirmed"].includes(action.status)) {
    throw new DataBoxActionError("Tuto akci už nejde potvrdit.", 409, "data_box_action_not_confirmable");
  }

  const message = await loadMessage(env, action.messageId);

  if (action.actionType === "archive") {
    await db
      .prepare("UPDATE data_box_messages SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message.id)
      .run();
    const updatedAction = await updateAction(db, action.id, {
      status: "archived",
      provider: "Kaiser Smart",
      result: {
        source: action.result?.source || "manual_confirmation",
        previousStatus: message.status,
        archivedAt: new Date().toISOString(),
        confirmedBy: cleanString(currentUser?.id)
      }
    });

    return {
      action: updatedAction,
      message: await loadMessage(env, message.id),
      status: "archived",
      apiStatus: "ready",
      notice: "AI Boost koncept byl potvrzen a zpráva byla archivována."
    };
  }

  if (action.actionType === "email") {
    const recipientEmail = normalizeEmail(action.recipient);
    if (!recipientEmail) {
      throw new DataBoxActionError("Nelze potvrdit e-mail: chybí platný příjemce.", 400, "data_box_email_recipient_missing");
    }

    const result = await sendDataBoxForwardNotification(env, message, {
      recipientEmail,
      subject: action.subject || message.subject || "Datová zpráva",
      body: action.bodyPreview || action.result?.reason || "",
      fromName: "Kaiser Smart"
    });
    const nextStatus = result.status === "sent" ? "sent" : result.status === "skipped" ? "blocked" : "failed";
    const updatedAction = await updateAction(db, action.id, {
      status: nextStatus,
      provider: "SendGrid",
      result: {
        ...(action.result || {}),
        sendResult: result,
        confirmedBy: cleanString(currentUser?.id)
      },
      errorCode: result.status === "sent" ? "" : "data_box_email_send_failed",
      errorMessage: result.errorMessage || ""
    });

    if (nextStatus !== "sent") {
      throw new DataBoxActionError(
        result.errorMessage || "E-mail se nepodařilo odeslat.",
        result.status === "skipped" ? 503 : 502,
        "data_box_email_send_failed"
      );
    }

    return {
      action: updatedAction,
      message,
      status: "sent",
      apiStatus: "ready",
      notice: "AI Boost koncept byl potvrzen a e-mail byl odeslán."
    };
  }

  throw new DataBoxActionError(
    "Tento typ AI Boost konceptu zatím nejde potvrdit přímo. Otevřete zprávu a dokončete akci v detailu.",
    409,
    "data_box_action_confirm_unsupported"
  );
}

function ensureDraftAction(action) {
  if (!action?.id) {
    throw new DataBoxActionError("Koncept akce nebyl nalezen.", 404, "data_box_action_missing");
  }

  if (!["prepared", "requires_confirmation", "confirmed"].includes(action.status)) {
    throw new DataBoxActionError("Tuto akci už nejde upravit.", 409, "data_box_action_not_editable");
  }
}

function normalizeActionType(value, fallback = "review") {
  const type = cleanString(value || fallback).toLowerCase();
  return ["archive", "email", "reply", "review", "ai_boost"].includes(type) ? type : fallback;
}

export async function updateDataBoxActionDraft(env, actionId, payload = {}, currentUser = {}) {
  const db = database(env, true);
  const action = await getAction(db, cleanString(actionId));
  ensureDraftAction(action);

  const actionType = normalizeActionType(payload.actionType, action.actionType || "review");
  const recipient = actionType === "email"
    ? normalizeEmail(payload.recipient || payload.recipientEmail || action.recipient)
    : cleanString(payload.recipient || action.recipient);

  if (actionType === "email" && !recipient) {
    throw new DataBoxActionError("E-mailový návrh musí mít platného příjemce.", 400, "data_box_action_recipient_missing");
  }

  const subject = cleanString(payload.subject || action.subject || "Datová zpráva");
  const bodyPreview = cleanString(payload.bodyPreview || payload.body || action.bodyPreview || "");
  const editNote = cleanString(payload.editNote || payload.reason || "");
  const now = new Date().toISOString();

  const result = {
    ...(action.result || {}),
    recommendedAction: actionType,
    reason: bodyPreview || action.result?.reason || "",
    lastEditedAt: now,
    lastEditedBy: cleanString(currentUser?.id),
    editNote
  };

  await db
    .prepare(`
      UPDATE data_box_actions
      SET
        action_type = ?,
        status = 'requires_confirmation',
        recipient = ?,
        subject = ?,
        body_preview = ?,
        result_json = ?,
        error_code = NULL,
        error_message = NULL,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      actionType,
      nullableString(recipient),
      nullableString(subject),
      nullableString(bodyPreview.slice(0, 500)),
      safeJson(result),
      now,
      action.id
    )
    .run();

  return {
    action: await getAction(db, action.id),
    status: "requires_confirmation",
    apiStatus: "ready",
    notice: "AI Boost návrh byl upraven a čeká na potvrzení."
  };
}

export async function rejectDataBoxActionDraft(env, actionId, payload = {}, currentUser = {}) {
  const db = database(env, true);
  const action = await getAction(db, cleanString(actionId));
  ensureDraftAction(action);

  const reason = cleanString(payload.reason || "Zamítnuto uživatelem.");
  const updatedAction = await updateAction(db, action.id, {
    status: "skipped",
    provider: "Kaiser Smart",
    result: {
      ...(action.result || {}),
      rejectedAt: new Date().toISOString(),
      rejectedBy: cleanString(currentUser?.id),
      reason
    },
    errorCode: "",
    errorMessage: reason
  });

  return {
    action: updatedAction,
    status: "skipped",
    apiStatus: "ready",
    notice: "AI Boost návrh byl zamítnut."
  };
}

export async function listDataBoxActions(env, filters = {}) {
  const db = database(env, true);
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 200);
  const actionType = cleanString(filters.actionType || "");
  const status = cleanString(filters.status || "");
  const clauses = [];
  const bindings = [];

  if (actionType) {
    clauses.push("action_type = ?");
    bindings.push(actionType);
  }

  if (status) {
    clauses.push("status = ?");
    bindings.push(status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db
    .prepare(`
      SELECT *
      FROM data_box_actions
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(...bindings, limit)
    .all();
  return (result.results || []).map(rowToAction);
}

export function dataBoxActionErrorResponse(error) {
  if (error instanceof DataBoxActionError) {
    return {
      payload: { error: error.message, code: error.code, apiStatus: "ready" },
      status: error.status
    };
  }

  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return {
      payload: {
        error: "Tabulka DS akcí není v D1 připravená. Spusťte migraci 0021_create_data_box_actions.sql.",
        code: "data_box_actions_migration_missing",
        apiStatus: "waiting"
      },
      status: 503
    };
  }

  console.error("data_box.action_failed", { message });
  return {
    payload: { error: "Akci Datové schránky se nepodařilo dokončit.", code: "data_box_action_failed", apiStatus: "ready" },
    status: 500
  };
}
