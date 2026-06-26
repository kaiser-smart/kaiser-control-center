import { json, normalizeIdentifier, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import { sendAiAssistantNotification } from "../../../_lib/notification-service.js";

const DB_BINDING = "SMART_ODPADY_DB";
const NOTIFICATION_TYPE = "ai_vehicle_tracking_message";
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();

function cleanString(value) {
  return String(value ?? "").trim();
}

function requireAiConfirmation(payload) {
  return payload?.confirmed === true && payload?.confirmationSource === "ai_ui";
}

function normalizeChannel(value) {
  const channel = cleanString(value).toLowerCase();
  return ["sms", "email"].includes(channel) ? channel : "";
}

function recipientFor(channel, payload) {
  const direct = cleanString(payload.recipient || payload.to);
  if (direct) {
    return channel === "sms" ? normalizeIdentifier(direct) : direct.toLowerCase();
  }

  if (channel === "sms") {
    return normalizeIdentifier(payload.phone || payload.driverPhone);
  }

  return cleanString(payload.email || payload.driverEmail).toLowerCase();
}

function maskRecipient(channel, recipient) {
  const value = cleanString(recipient);
  if (!value) {
    return "";
  }

  if (channel === "email") {
    const [name, domain] = value.split("@");
    return domain ? `${name.slice(0, 2)}***@${domain}` : "***";
  }

  return value.length > 6 ? `${value.slice(0, 4)}***${value.slice(-3)}` : "***";
}

function contextFromPayload(payload) {
  return {
    vehicleId: cleanString(payload.vehicleId),
    licensePlate: cleanString(payload.licensePlate),
    wimSiteId: cleanString(payload.wimSiteId || payload.siteId),
    reason: cleanString(payload.reason)
  };
}

function validationError(message, code) {
  return json({ error: message, code, apiStatus: "waiting" }, 400);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function dedupeKeyFor({ channel, recipient, message, context }) {
  const fingerprint = JSON.stringify({
    channel,
    recipient,
    message,
    vehicleId: context.vehicleId,
    licensePlate: context.licensePlate,
    wimSiteId: context.wimSiteId
  });
  return `ai-vehicle-tracking-${await sha256Hex(fingerprint)}`;
}

async function hasRecentSentNotification(env, dedupeKey) {
  const db = env?.[DB_BINDING] || null;
  if (!db) {
    return false;
  }

  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  try {
    const result = await db
      .prepare(`
        SELECT id
        FROM notification_logs
        WHERE type = ?
          AND related_entity_id = ?
          AND status = 'sent'
          AND created_at >= ?
        LIMIT 1
      `)
      .bind(NOTIFICATION_TYPE, dedupeKey, cutoff)
      .first();
    return Boolean(result?.id);
  } catch (error) {
    console.error("ai.vehicle_tracking.dedupe_failed", { message: error.message });
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "vehicle-tracking", "manage");

  if (response) {
    return response;
  }

  const payload = await readJson(request);

  if (!requireAiConfirmation(payload)) {
    return json({ error: "AI akce vyžaduje potvrzení uživatele.", code: "ai_confirmation_required" }, 409);
  }

  const channel = normalizeChannel(payload.channel);
  if (!channel) {
    return validationError("Zvolte kanál sms nebo email.", "ai_vehicle_tracking_channel_required");
  }

  const recipient = recipientFor(channel, payload);
  if (!recipient || (channel === "email" && !recipient.includes("@"))) {
    return validationError("Chybí platný příjemce zprávy.", "ai_vehicle_tracking_recipient_required");
  }

  const message = cleanString(payload.message || payload.body);
  if (!message) {
    return validationError("Chybí text zprávy.", "ai_vehicle_tracking_message_required");
  }

  const maxLength = channel === "sms" ? 480 : 3000;
  if (message.length > maxLength) {
    return validationError(`Text zprávy je příliš dlouhý. Limit je ${maxLength} znaků.`, "ai_vehicle_tracking_message_too_long");
  }

  const context = contextFromPayload(payload);
  const subject = cleanString(payload.subject) || "Kaiser Smart - zpráva ke Sledování vozidel";
  const dedupeKey = cleanString(payload.dedupeKey) || await dedupeKeyFor({ channel, recipient, message, context });
  const assistantId = cleanString(payload.assistantId || "sarlota");
  const assistantName = cleanString(payload.assistantName || "Šarlota");

  if (await hasRecentSentNotification(env, dedupeKey)) {
    await recordAiAction(env, user, {
      assistantId,
      assistantName,
      actionType: "write",
      toolName: "ai_vehicle_tracking_notify",
      input: {
        channel,
        recipient: maskRecipient(channel, recipient),
        messageLength: message.length,
        context
      },
      result: { skipped: true, reason: "duplicate_recent" },
      status: "skipped"
    });

    return json({
      notification: {
        status: "skipped",
        errorMessage: "Stejná zpráva už byla v posledních 5 minutách odeslána."
      },
      dedupeKey,
      apiStatus: "ready"
    });
  }

  const notification = await sendAiAssistantNotification(env, {
    type: NOTIFICATION_TYPE,
    moduleId: "vehicle-tracking",
    channel,
    to: recipient,
    subject,
    message,
    relatedEntityType: "vehicle_tracking_ai_message",
    relatedEntityId: dedupeKey,
    recipientName: cleanString(payload.recipientName || payload.driverName),
    assistantName
  });

  await recordAiAction(env, user, {
    assistantId,
    assistantName,
    actionType: "write",
    toolName: "ai_vehicle_tracking_notify",
    input: {
      channel,
      recipient: maskRecipient(channel, recipient),
      messageLength: message.length,
      context
    },
    result: {
      notificationStatus: notification.status,
      errorMessage: cleanString(notification.errorMessage)
    },
    status: notification.status === "sent" ? "ok" : notification.status === "failed" ? "error" : "skipped"
  });

  return json({
    notification,
    dedupeKey,
    apiStatus: notification.status === "sent" ? "ready" : "waiting"
  });
}
