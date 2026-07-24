import { listStoredUsers } from "./users-store.js";
import { isCustomerMessageOptedOut } from "./customer-message-store.js";
import { normalizeCustomerPhone } from "./customer-messaging-service.js";

const DB_BINDING = "SMART_ODPADY_DB";
const TEMPLATE_KEY = "data_box_new_message";
const RECIPIENTS = [
  { key: "radim-oplustil", name: "Radim Opluštil" },
  { key: "alena-trneckova", name: "Alena Trnečková" }
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function base64Encode(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function twilioBasicAuthHeader(username, password) {
  return `Basic ${base64Encode(`${username}:${password}`)}`;
}

function idValue(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function personKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ing|mgr|bc|mudr|judr|phdr|phd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) throw new Error("Chybí D1 binding SMART_ODPADY_DB.");
  return db;
}

function config(env = {}) {
  const accountSid = cleanString(env.TWILIO_KAISER_ACCOUNT_SID || env.KAISER_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID);
  const authToken = cleanString(env.TWILIO_KAISER_AUTH_TOKEN || env.KAISER_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN);
  const apiKeySid = cleanString(env.TWILIO_KAISER_API_KEY_SID || env.KAISER_TWILIO_API_KEY_SID || env.TWILIO_API_KEY_SID || env.TWILIO_API_KEY);
  const apiKeySecret = cleanString(env.TWILIO_KAISER_API_KEY_SECRET || env.KAISER_TWILIO_API_KEY_SECRET || env.TWILIO_API_KEY_SECRET || env.TWILIO_API_SECRET);
  const messagingServiceSid = cleanString(env.TWILIO_KAISER_MESSAGING_SERVICE_SID || env.KAISER_TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_MESSAGING_SERVICE_SID);
  const rcsSenderId = cleanString(env.TWILIO_RCS_SENDER_ID || env.TWILIO_RCS_SENDER);
  const contentSid = cleanString(env.TWILIO_DATA_BOX_RCS_CONTENT_SID);
  const statusCallbackUrl = cleanString(
    env.TWILIO_STATUS_CALLBACK_URL
      || env.TWILIO_KAISER_STATUS_CALLBACK_URL
      || env.KAISER_TWILIO_STATUS_CALLBACK_URL
      || env.KSO_TWILIO_STATUS_CALLBACK_URL
  );
  const mode = cleanString(
    env.KSO_CUSTOMER_MESSAGING_MODE || (accountSid && (apiKeySecret || authToken) && messagingServiceSid ? "live" : "off")
  ).toLowerCase();
  const publicAppUrl = cleanString(env.PUBLIC_APP_URL || env.APP_PUBLIC_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
  return {
    accountSid,
    authUsername: apiKeySid || accountSid,
    authPassword: apiKeySecret || authToken,
    messagingServiceSid,
    rcsSenderId,
    contentSid,
    statusCallbackUrl,
    publicAppUrl,
    mode: ["off", "test", "live"].includes(mode) ? mode : "off"
  };
}

function safeProviderError(payload = {}, fallback = "") {
  return {
    code: cleanString(payload.code || payload.error_code),
    message: cleanString(payload.message || payload.error_message || fallback).slice(0, 600)
  };
}

function notificationRow(row = {}) {
  return {
    id: cleanString(row.id),
    messageId: cleanString(row.message_id),
    recipientKey: cleanString(row.recipient_key),
    recipientUserId: cleanString(row.recipient_user_id),
    recipientName: cleanString(row.recipient_name),
    status: cleanString(row.status),
    providerMessageId: cleanString(row.provider_message_id),
    providerStatus: cleanString(row.provider_status),
    usedChannel: cleanString(row.used_channel),
    lastAttemptAt: cleanString(row.last_attempt_at),
    deliveredAt: cleanString(row.delivered_at),
    readAt: cleanString(row.read_at),
    errorCode: cleanString(row.error_code),
    errorMessage: cleanString(row.error_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at || row.created_at)
  };
}

async function writeActionLog(db, notification, status, errorMessage = "") {
  const noteByStatus = {
    prepared: "RCS upozornění bylo připravené k bezpečnému serverovému odeslání.",
    provider_sent: "Poskytovatel přijal požadavek na RCS upozornění.",
    delivered: "Poskytovatel potvrdil doručení RCS upozornění.",
    read: "Poskytovatel potvrdil přečtení RCS upozornění.",
    failed: errorMessage || "RCS upozornění selhalo.",
    skipped_missing_phone: errorMessage || "RCS upozornění nebylo odeslané, protože chybí ověřený telefon.",
    blocked_duplicate: "Duplicitní RCS upozornění bylo zablokované idempotencí."
  };
  await db.prepare(`
    INSERT INTO data_box_plus_action_log (
      id, message_id, recommendation_id, actor, action_type, action_payload, created_at, result, audit_note
    ) VALUES (?, ?, NULL, 'system', 'RCS upozornění', ?, ?, ?, ?)
  `).bind(
    idValue("dbp-action"),
    notification.messageId,
    JSON.stringify({
      notificationId: notification.id,
      recipientKey: notification.recipientKey,
      recipientName: notification.recipientName,
      recipientUserId: notification.recipientUserId || null,
      providerMessageId: notification.providerMessageId || null
    }),
    new Date().toISOString(),
    status,
    noteByStatus[status] || errorMessage || status
  ).run();
}

async function writeEvent(db, notification, status, details = {}) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO data_box_plus_rcs_notification_events (
      id, notification_id, status, provider_message_id, error_code, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    idValue("dbp-rcs-event"),
    notification.id,
    status,
    nullableString(details.providerMessageId || notification.providerMessageId),
    nullableString(details.errorCode),
    nullableString(details.errorMessage),
    now
  ).run();
  await writeActionLog(db, {
    ...notification,
    providerMessageId: details.providerMessageId || notification.providerMessageId
  }, status, cleanString(details.errorMessage));
}

async function updateNotification(db, notification, patch = {}) {
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE data_box_plus_rcs_notifications
    SET recipient_user_id = COALESCE(?, recipient_user_id),
        recipient_phone = COALESCE(?, recipient_phone),
        provider_message_id = COALESCE(?, provider_message_id),
        provider_status = COALESCE(?, provider_status),
        used_channel = COALESCE(?, used_channel),
        status = ?,
        last_attempt_at = COALESCE(?, last_attempt_at),
        provider_status_at = COALESCE(?, provider_status_at),
        delivered_at = COALESCE(?, delivered_at),
        read_at = COALESCE(?, read_at),
        failed_at = COALESCE(?, failed_at),
        error_code = ?,
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    nullableString(patch.recipientUserId),
    nullableString(patch.recipientPhone),
    nullableString(patch.providerMessageId),
    nullableString(patch.providerStatus),
    nullableString(patch.usedChannel),
    cleanString(patch.status || notification.status || "prepared"),
    nullableString(patch.lastAttemptAt),
    nullableString(patch.providerStatusAt),
    nullableString(patch.deliveredAt),
    nullableString(patch.readAt),
    nullableString(patch.failedAt),
    nullableString(patch.errorCode),
    nullableString(patch.errorMessage),
    now,
    notification.id
  ).run();
  Object.assign(notification, patch, { updatedAt: now });
  return notification;
}

async function reserveNotification(db, messageId, recipient) {
  const id = idValue("dbp-rcs");
  const idempotencyKey = `data-box:${messageId}:${recipient.key}:rcs:v1`;
  const result = await db.prepare(`
    INSERT OR IGNORE INTO data_box_plus_rcs_notifications (
      id, message_id, recipient_key, recipient_name, channel, template_key,
      idempotency_key, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'rcs', ?, ?, 'prepared', ?, ?)
  `).bind(
    id,
    messageId,
    recipient.key,
    recipient.name,
    TEMPLATE_KEY,
    idempotencyKey,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
  const created = Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
  const row = created
    ? { id, message_id: messageId, recipient_key: recipient.key, recipient_name: recipient.name, status: "prepared" }
    : await db.prepare(`
        SELECT * FROM data_box_plus_rcs_notifications
        WHERE message_id = ? AND recipient_key = ? AND channel = 'rcs'
        LIMIT 1
      `).bind(messageId, recipient.key).first();
  return { created, notification: notificationRow(row) };
}

function findRecipientUser(users, recipient) {
  const wanted = personKey(recipient.name);
  const matches = (users || []).filter((user) => user?.active !== false
    && !["disabled", "vypnutý"].includes(cleanString(user?.status).toLowerCase())
    && personKey(user?.name) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function deliveredAtText(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return cleanString(value) || "čas neuveden";
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function contentVariables(input, cfg) {
  const messageId = cleanString(input.messageId);
  return {
    "1": cleanString(input.mailboxName) || "Datová schránka",
    "2": cleanString(input.senderName) || "Odesílatel neuveden",
    "3": cleanString(input.subject) || "Předmět neuveden",
    "4": deliveredAtText(input.deliveredAt),
    "5": encodeURIComponent(messageId)
  };
}

async function postTwilio(cfg, phone, variables, fetchImpl) {
  const response = await fetchImpl(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioBasicAuthHeader(cfg.authUsername, cfg.authPassword),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: phone,
        MessagingServiceSid: cfg.messagingServiceSid,
        ContentSid: cfg.contentSid,
        ContentVariables: JSON.stringify(variables),
        ...(cfg.statusCallbackUrl ? { StatusCallback: cfg.statusCallbackUrl } : {})
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerError = safeProviderError(payload, `Twilio ${response.status}`);
    const error = new Error(providerError.message);
    error.code = providerError.code;
    throw error;
  }
  return payload;
}

export async function notifyNewDataBoxMessage(env, input = {}, dependencies = {}) {
  const db = database(env);
  const messageId = cleanString(input.messageId);
  if (!messageId || cleanString(input.direction || "received") !== "received") return [];
  const users = dependencies.users || await listStoredUsers(env);
  const cfg = config(env);
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const results = [];

  for (const recipient of RECIPIENTS) {
    const reservation = await reserveNotification(db, messageId, recipient);
    const notification = reservation.notification;
    if (!reservation.created) {
      await writeEvent(db, notification, "blocked_duplicate");
      results.push({ ...notification, status: "blocked_duplicate", duplicate: true });
      continue;
    }

    await writeEvent(db, notification, "prepared");
    const user = findRecipientUser(users, recipient);
    const phone = normalizeCustomerPhone(user?.phone);
    if (!user || !phone) {
      const reason = !user
        ? "Uživatel nebyl jednoznačně nalezený v centrální evidenci aktivních uživatelů."
        : "Uživatel nemá v centrální evidenci platné ověřené telefonní číslo.";
      await updateNotification(db, notification, {
        recipientUserId: user?.id,
        status: "skipped_missing_phone",
        lastAttemptAt: new Date().toISOString(),
        errorCode: user ? "verified_phone_missing" : "recipient_user_missing",
        errorMessage: reason
      });
      await writeEvent(db, notification, "skipped_missing_phone", {
        errorCode: notification.errorCode,
        errorMessage: reason
      });
      results.push({ ...notification, sent: false });
      continue;
    }

    await updateNotification(db, notification, {
      recipientUserId: user.id,
      recipientPhone: phone,
      lastAttemptAt: new Date().toISOString()
    });

    let blockingError = "";
    let blockingCode = "";
    if (await isCustomerMessageOptedOut(env, phone)) {
      blockingCode = "recipient_opted_out";
      blockingError = "Telefon je v centrálním opt-out seznamu RCS/SMS.";
    } else if (cfg.mode !== "live") {
      blockingCode = "rcs_sending_not_live";
      blockingError = cfg.mode === "test"
        ? "Test režim: poskytovatel nebyl volán."
        : "RCS/SMS odesílání je vypnuté.";
    } else if (!cfg.accountSid || !cfg.authPassword || !cfg.messagingServiceSid || !cfg.rcsSenderId) {
      blockingCode = "twilio_rcs_configuration_missing";
      blockingError = "Chybí úplná serverová konfigurace Twilio Messaging Service a RCS sendera.";
    } else if (!cfg.contentSid) {
      blockingCode = "data_box_rcs_template_missing";
      blockingError = "Chybí schválená Twilio Content šablona TWILIO_DATA_BOX_RCS_CONTENT_SID.";
    }

    if (blockingError) {
      const status = cfg.mode === "test" ? "prepared" : "failed";
      await updateNotification(db, notification, {
        status,
        failedAt: status === "failed" ? new Date().toISOString() : "",
        errorCode: blockingCode,
        errorMessage: blockingError
      });
      await writeEvent(db, notification, status, { errorCode: blockingCode, errorMessage: blockingError });
      results.push({ ...notification, sent: false });
      continue;
    }

    try {
      const payload = await postTwilio(cfg, phone, contentVariables(input, cfg), fetchImpl);
      const providerMessageId = cleanString(payload.sid);
      const providerStatus = cleanString(payload.status || "accepted");
      if (!providerMessageId) throw Object.assign(new Error("Poskytovatel nevrátil message ID."), { code: "provider_message_id_missing" });
      await updateNotification(db, notification, {
        providerMessageId,
        providerStatus,
        usedChannel: "rcs_sms_auto_fallback",
        status: "provider_sent",
        providerStatusAt: new Date().toISOString(),
        errorCode: "",
        errorMessage: ""
      });
      await writeEvent(db, notification, "provider_sent", { providerMessageId });
      results.push({ ...notification, sent: true });
    } catch (error) {
      const errorMessage = cleanString(error?.message || "Twilio odeslání selhalo.").slice(0, 600);
      const errorCode = cleanString(error?.code || "twilio_send_failed");
      await updateNotification(db, notification, {
        status: "failed",
        failedAt: new Date().toISOString(),
        errorCode,
        errorMessage
      });
      await writeEvent(db, notification, "failed", { errorCode, errorMessage });
      results.push({ ...notification, sent: false });
    }
  }

  return results;
}

function callbackStatus(value) {
  const status = cleanString(value).toLowerCase();
  if (status === "read") return "read";
  if (status === "delivered") return "delivered";
  if (["failed", "undelivered", "canceled"].includes(status)) return "failed";
  if (["accepted", "queued", "sending", "sent", "scheduled"].includes(status)) return "provider_sent";
  return "";
}

function monotonicCallbackStatus(current, incoming) {
  const rank = {
    prepared: 0,
    provider_sent: 1,
    delivered: 2,
    read: 3
  };
  if (incoming === "failed") {
    return ["delivered", "read"].includes(current) ? current : incoming;
  }
  return (rank[current] ?? -1) > (rank[incoming] ?? -1) ? current : incoming;
}

export async function processDataBoxRcsStatusCallback(env, payload = {}) {
  const db = database(env);
  const providerMessageId = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid);
  if (!providerMessageId) return { matched: false, status: "" };
  const row = await db.prepare(`
    SELECT * FROM data_box_plus_rcs_notifications
    WHERE provider_message_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(providerMessageId).first();
  if (!row?.id) return { matched: false, status: "" };

  const notification = notificationRow(row);
  const providerStatus = cleanString(payload.MessageStatus || payload.SmsStatus || payload.status);
  const callbackState = callbackStatus(providerStatus);
  if (!callbackState) return { matched: true, status: notification.status, providerMessageId };
  const status = monotonicCallbackStatus(notification.status, callbackState);
  const providerError = safeProviderError({
    code: payload.ErrorCode || payload.errorCode,
    message: payload.ErrorMessage || payload.errorMessage
  });
  const now = new Date().toISOString();
  await updateNotification(db, notification, {
    status,
    providerStatus,
    usedChannel: cleanString(payload.ChannelPrefix || payload.channelPrefix),
    providerStatusAt: now,
    deliveredAt: ["delivered", "read"].includes(status) ? now : "",
    readAt: status === "read" ? now : "",
    failedAt: status === "failed" ? now : "",
    errorCode: providerError.code,
    errorMessage: providerError.message
  });
  await writeEvent(db, notification, status, {
    providerMessageId,
    errorCode: providerError.code,
    errorMessage: providerError.message
  });
  return { matched: true, status, providerMessageId };
}

export async function listDataBoxRcsNotifications(db, messageId) {
  const result = await db.prepare(`
    SELECT * FROM data_box_plus_rcs_notifications
    WHERE message_id = ?
    ORDER BY recipient_name COLLATE NOCASE ASC
  `).bind(cleanString(messageId)).all();
  return (result.results || []).map(notificationRow);
}

export const __test = {
  RECIPIENTS,
  TEMPLATE_KEY,
  callbackStatus,
  config,
  contentVariables,
  findRecipientUser,
  personKey
};
