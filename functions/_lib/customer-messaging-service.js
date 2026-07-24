import {
  addCustomerMessageOptOut,
  findRecentDuplicateMessage,
  insertCustomerMessageInbound,
  insertCustomerMessageLog,
  isCustomerMessageOptedOut,
  updateCustomerMessageLog,
  updateCustomerMessageStatusByTwilioSid
} from "./customer-message-store.js";
import {
  appendStopSentence,
  renderCustomerMessageTemplate
} from "./customer-message-templates.js";

const DEFAULT_DEDUPE_WINDOW_SECONDS = 300;
const STOP_CONFIRMATION = "Kaiser servis: Odhlášení potvrzeno. Na toto číslo už nebudeme posílat RCS/SMS zprávy.";

function cleanString(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return cleanString(value).toLowerCase();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function twilioConfig(env = {}) {
  const accountSid = cleanString(env.TWILIO_KAISER_ACCOUNT_SID || env.KAISER_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID);
  const authToken = cleanString(env.TWILIO_KAISER_AUTH_TOKEN || env.KAISER_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN);
  const messagingServiceSid = cleanString(env.TWILIO_KAISER_MESSAGING_SERVICE_SID || env.KAISER_TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_MESSAGING_SERVICE_SID);
  const rcsSenderId = cleanString(env.TWILIO_RCS_SENDER_ID || env.TWILIO_RCS_SENDER || env.TWILIO_KAISER_RCS_SENDER_ID);
  const statusCallbackUrl = cleanString(env.TWILIO_STATUS_CALLBACK_URL || env.TWILIO_KAISER_STATUS_CALLBACK_URL || env.KSO_TWILIO_STATUS_CALLBACK_URL);
  const mode = lower(env.KSO_CUSTOMER_MESSAGING_MODE || env.KSO_SMS_MODE || (accountSid && authToken && messagingServiceSid ? "live" : "off"));
  return {
    accountSid,
    authToken,
    messagingServiceSid,
    rcsSenderId,
    statusCallbackUrl,
    mode: ["off", "test", "live"].includes(mode) ? mode : "off",
    inboundWebhookSecretConfigured: Boolean(cleanString(env.TWILIO_INBOUND_WEBHOOK_SECRET || env.TWILIO_KAISER_INBOUND_WEBHOOK_TOKEN || env.KAISER_TWILIO_INBOUND_WEBHOOK_TOKEN))
  };
}

export function normalizeCustomerPhone(value) {
  const raw = cleanString(value).replace(/[^\d+]/g, "");
  if (!raw) return "";
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  if (/^00\d{8,15}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^\d{9}$/.test(raw)) return `+420${raw}`;
  if (/^420\d{9}$/.test(raw)) return `+${raw}`;
  return "";
}

function isTransactionalReason(reason) {
  const normalized = lower(reason)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return false;
  if (/(marketing|promo|akce|newsletter|reklama|nabidka)/i.test(normalized)) {
    return false;
  }
  return /(provozni|transactional|transakcni|service|sluzb|pozadavek|dispatch|dispec|zakaznick|legal|smlouva|opravneny zajem|souhlas)/i.test(normalized);
}

function hasLegalBasis(input = {}) {
  return input.consent === true || Boolean(cleanString(input.legalBasis)) || isTransactionalReason(input.reason);
}

function requestedChannel(value) {
  const channel = lower(value || "rcs");
  return ["rcs", "sms"].includes(channel) ? channel : "rcs";
}

function usedChannelForRequest(channel) {
  return channel === "sms" ? "sms" : "rcs_sms_auto_fallback";
}

function outboundErrorMessage(config, phone, body) {
  if (!phone) return "Chybí validní telefonní číslo.";
  if (!body) return "Zpráva je prázdná.";
  if (!config.accountSid) return "Chybí TWILIO_ACCOUNT_SID.";
  if (!config.authToken) return "Chybí TWILIO_AUTH_TOKEN.";
  if (!config.messagingServiceSid) return "Chybí TWILIO_MESSAGING_SERVICE_SID.";
  if (config.mode === "off") return "Zákaznické RCS/SMS odesílání je vypnuté.";
  return "";
}

async function twilioPostMessage(config, { to, body, channel }) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      To: channel === "rcs_no_fallback" ? `rcs:${to}` : to,
      MessagingServiceSid: config.messagingServiceSid,
      Body: body,
      ...(config.statusCallbackUrl ? { StatusCallback: config.statusCallbackUrl } : {})
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = cleanString(payload.message || payload.error_message || `Twilio ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function sendCustomerMessage(env, input = {}) {
  const config = twilioConfig(env);
  const phone = normalizeCustomerPhone(input.phone);
  const channel = requestedChannel(input.channelPreference);
  const reason = cleanString(input.reason);
  let rendered = null;
  let messageBody = "";

  try {
    rendered = renderCustomerMessageTemplate(input.template, input.variables || {});
    messageBody = appendStopSentence(rendered.body);
  } catch (error) {
    await insertCustomerMessageLog(env, {
      phone: cleanString(input.phone),
      requestedChannel: channel,
      usedChannel: "blocked",
      templateKey: cleanString(input.template || "unknown"),
      messageBody: "",
      status: "blocked",
      errorMessage: error.message,
      customerId: input.customerId,
      relatedEntityType: input.relatedEntityType || input.entityType,
      relatedEntityId: input.relatedEntityId || input.jobId,
      reason
    });
    return { status: "blocked", sent: false, errorMessage: error.message };
  }

  const baseLog = {
    customerId: cleanString(input.customerId),
    phone: phone || cleanString(input.phone),
    requestedChannel: channel,
    usedChannel: usedChannelForRequest(channel),
    templateKey: rendered.key,
    messageBody,
    relatedEntityType: cleanString(input.relatedEntityType || input.entityType || (input.jobId ? "job" : "")),
    relatedEntityId: cleanString(input.relatedEntityId || input.jobId),
    reason,
    metadata: {
      channelPreference: channel,
      templateLabel: rendered.label,
      legalBasis: cleanString(input.legalBasis),
      consent: input.consent === true,
      rcsSenderConfigured: Boolean(config.rcsSenderId)
    }
  };

  const staticError = outboundErrorMessage(config, phone, messageBody);
  if (staticError) {
    const log = await insertCustomerMessageLog(env, { ...baseLog, usedChannel: "blocked", status: "blocked", errorMessage: staticError });
    return { id: log.id, status: "blocked", sent: false, errorMessage: staticError };
  }

  if (!hasLegalBasis(input)) {
    const errorMessage = "Chybí souhlas nebo právní důvod pro zákaznickou RCS/SMS zprávu.";
    const log = await insertCustomerMessageLog(env, { ...baseLog, usedChannel: "blocked", status: "blocked", errorMessage });
    return { id: log.id, status: "blocked", sent: false, errorMessage };
  }

  if (!isTransactionalReason(reason)) {
    const errorMessage = "Zákaznické RCS/SMS jsou povolené pouze pro provozní nebo transakční komunikaci.";
    const log = await insertCustomerMessageLog(env, { ...baseLog, usedChannel: "blocked", status: "blocked", errorMessage });
    return { id: log.id, status: "blocked", sent: false, errorMessage };
  }

  if (await isCustomerMessageOptedOut(env, phone)) {
    const errorMessage = "Telefon je v opt-out seznamu.";
    const log = await insertCustomerMessageLog(env, { ...baseLog, usedChannel: "blocked", status: "opted_out", errorMessage });
    return { id: log.id, status: "opted_out", sent: false, errorMessage };
  }

  const duplicate = await findRecentDuplicateMessage(env, {
    phone,
    messageBody,
    windowSeconds: input.dedupeWindowSeconds || DEFAULT_DEDUPE_WINDOW_SECONDS
  });
  if (duplicate) {
    const errorMessage = "Stejná zpráva na stejné číslo byla v krátkém čase už založená.";
    const log = await insertCustomerMessageLog(env, { ...baseLog, usedChannel: "blocked", status: "blocked", errorMessage, metadata: { ...baseLog.metadata, duplicateOf: duplicate.id } });
    return { id: log.id, status: "blocked", sent: false, errorMessage, duplicateOf: duplicate.id };
  }

  const log = await insertCustomerMessageLog(env, { ...baseLog, status: "pending" });

  if (config.mode === "test") {
    await updateCustomerMessageLog(env, log.id, { status: "pending", errorMessage: "Test režim: zpráva nebyla odeslána do Twilia." });
    return { id: log.id, status: "pending", sent: false, testMode: true, messageBody };
  }

  let payload;
  try {
    payload = await twilioPostMessage(config, { to: phone, body: messageBody, channel });
  } catch (error) {
    const errorMessage = cleanString(error.message) || "Twilio odeslání selhalo.";
    try {
      await updateCustomerMessageLog(env, log.id, {
        status: "failed",
        errorMessage,
        metadata: { ...baseLog.metadata, twilioError: error.payload || { message: errorMessage } }
      });
    } catch (auditError) {
      console.error("customer_message.failure_audit_failed", { message: auditError.message });
    }
    return { id: log.id, status: "failed", sent: false, errorMessage, messageBody };
  }

  const sid = cleanString(payload.sid);
  const providerStatus = cleanString(payload.status || "accepted");
  let auditWarning = "";
  try {
    await updateCustomerMessageLog(env, log.id, {
      status: ["sent", "delivered"].includes(providerStatus) ? providerStatus : "pending",
      twilioMessageSid: sid,
      usedChannel: usedChannelForRequest(channel),
      metadata: { ...baseLog.metadata, twilioResponse: { sid, status: providerStatus } }
    });
  } catch (error) {
    auditWarning = "SMS byla přijatá poskytovatelem, ale nepodařilo se aktualizovat její auditní záznam.";
    console.error("customer_message.success_audit_failed", { message: error.message });
  }
  return {
    id: log.id,
    status: providerStatus || "pending",
    sent: true,
    twilioMessageSid: sid,
    messageBody,
    auditWarning
  };
}

export function isStopMessage(body) {
  const normalized = lower(body)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(stop|stop sms|neposilat|neposilat sms)$/i.test(normalized);
}

export async function processCustomerInboundMessage(env, payload = {}) {
  const phone = normalizeCustomerPhone(payload.From || payload.from || payload.phone);
  const body = cleanString(payload.Body || payload.body);
  const messageSid = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid);

  await insertCustomerMessageInbound(env, {
    phone: phone || cleanString(payload.From || payload.from),
    body,
    twilioMessageSid: messageSid,
    rawPayload: payload
  });

  const stopped = isStopMessage(body);
  if (stopped && phone) {
    await addCustomerMessageOptOut(env, {
      phone,
      source: "twilio_inbound",
      reason: body || "STOP"
    });
  }

  return {
    apiStatus: "ready",
    phone,
    stopped,
    twilioMessageSid: messageSid,
    reply: stopped ? STOP_CONFIRMATION : ""
  };
}

export async function processCustomerStatusCallback(env, payload = {}) {
  const twilioMessageSid = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid);
  const status = cleanString(payload.MessageStatus || payload.SmsStatus || payload.status || "callback_received");
  const errorMessage = cleanString(payload.ErrorMessage || payload.errorMessage || payload.ErrorCode || payload.errorCode);
  const result = await updateCustomerMessageStatusByTwilioSid(env, {
    twilioMessageSid,
    status,
    errorMessage,
    payload
  });
  return { apiStatus: "ready", status, matched: result.matched, twilioMessageSid };
}

export function customerMessagingStatus(env = {}) {
  const config = twilioConfig(env);
  return {
    mode: config.mode,
    twilioConfigured: Boolean(config.accountSid && config.authToken && config.messagingServiceSid),
    messagingServiceSidConfigured: Boolean(config.messagingServiceSid),
    rcsSenderIdConfigured: Boolean(config.rcsSenderId),
    statusCallbackUrlConfigured: Boolean(config.statusCallbackUrl),
    inboundWebhookSecretConfigured: config.inboundWebhookSecretConfigured,
    fallbackModel: "Twilio Messaging Service sender pool: RCS first, SMS fallback"
  };
}

export const __test = {
  STOP_CONFIRMATION,
  normalizeCustomerPhone,
  isStopMessage,
  isTransactionalReason,
  hasLegalBasis,
  twilioConfig
};
