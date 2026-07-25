import { isCustomerMessageOptedOut } from "./customer-message-store.js";
import { normalizeCustomerPhone } from "./customer-messaging-service.js";
import {
  RCS_TEMPLATE_REGISTRY,
  getRcsTemplate,
  rcsContentVariables,
  rcsTemplatePreviewList,
  renderRcsTemplate,
  twilioContentDefinition
} from "./rcs-template-registry.js";
import {
  acquireRcsTemplateSyncLock,
  createRcsTaskReplyGrants,
  getRcsTemplateSyncRow,
  listRcsDispatches,
  listRcsTemplateSyncRows,
  reserveRcsDispatch,
  releaseRcsTemplateSyncLock,
  saveRcsTemplateSyncRow,
  updateRcsDispatch
} from "./rcs-template-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function base64Encode(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function twilioConfig(env = {}) {
  const accountSid = cleanString(env.TWILIO_KAISER_ACCOUNT_SID || env.KAISER_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID);
  const authToken = cleanString(env.TWILIO_KAISER_AUTH_TOKEN || env.KAISER_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN);
  const apiKeySid = cleanString(env.TWILIO_KAISER_API_KEY_SID || env.KAISER_TWILIO_API_KEY_SID || env.TWILIO_API_KEY_SID || env.TWILIO_API_KEY);
  const apiKeySecret = cleanString(env.TWILIO_KAISER_API_KEY_SECRET || env.KAISER_TWILIO_API_KEY_SECRET || env.TWILIO_API_KEY_SECRET || env.TWILIO_API_SECRET);
  const messagingServiceSid = cleanString(env.TWILIO_KAISER_MESSAGING_SERVICE_SID || env.KAISER_TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_MESSAGING_SERVICE_SID);
  const statusCallbackUrl = cleanString(env.TWILIO_STATUS_CALLBACK_URL || env.TWILIO_KAISER_STATUS_CALLBACK_URL || env.KSO_TWILIO_STATUS_CALLBACK_URL);
  const authPassword = apiKeySecret || authToken;
  const mode = cleanString(env.KSO_CUSTOMER_MESSAGING_MODE || (accountSid && authPassword && messagingServiceSid ? "live" : "off")).toLowerCase();
  return {
    accountSid,
    authUsername: apiKeySid || accountSid,
    authPassword,
    messagingServiceSid,
    statusCallbackUrl,
    mode: ["off", "test", "live"].includes(mode) ? mode : "off"
  };
}

function authHeader(config) {
  return `Basic ${base64Encode(`${config.authUsername}:${config.authPassword}`)}`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recipientHash(phone) {
  return sha256(`kaiser-rcs:${phone}`);
}

export function maskRcsRecipient(phone) {
  const value = cleanString(phone);
  if (value.length < 7) return "***";
  return `${value.slice(0, 4)} *** **${value.slice(-2)}`;
}

async function idempotencyKey(eventId, templateKey, phone) {
  return sha256(`${cleanString(eventId)}\n${cleanString(templateKey)}\n${phone}`);
}

function providerError(payload = {}, fallback = "") {
  return cleanString(payload.message || payload.error_message || fallback).slice(0, 600);
}

function taskReplyGrantExpiresAt(env = {}) {
  const raw = Number(env.RCS_SMS_ACTION_GRANT_TTL_SECONDS || 172800);
  const ttlSeconds = Math.max(300, Math.min(Number.isFinite(raw) ? raw : 172800, 604800));
  return new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
}

async function contentExists(config, contentSid, fetchImpl) {
  if (!contentSid) return false;
  const response = await fetchImpl(`https://content.twilio.com/v1/Content/${encodeURIComponent(contentSid)}`, {
    headers: { Authorization: authHeader(config) }
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(providerError(payload, `Twilio Content API ${response.status}`));
  }
  return true;
}

async function createContent(config, definition, fetchImpl) {
  const response = await fetchImpl("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(definition)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(payload, `Twilio Content API ${response.status}`));
  const contentSid = cleanString(payload.sid);
  if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) throw new Error("Twilio Content API nevrátilo platný Content SID.");
  return contentSid;
}

export async function listRcsTemplateCenter(env, dependencies = {}) {
  const syncRows = dependencies.syncRows || await listRcsTemplateSyncRows(env);
  const dispatches = dependencies.dispatches || await listRcsDispatches(env, 50);
  return {
    templates: rcsTemplatePreviewList(env, syncRows),
    dispatches,
    apiStatus: "ready"
  };
}

export async function synchronizeRcsTemplates(env, actor = {}, dependencies = {}) {
  const config = twilioConfig(env);
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  if (!config.accountSid || !config.authUsername || !config.authPassword) {
    throw new Error("Chybí serverová autentizace Twilio Content API.");
  }
  const lockAcquired = await (dependencies.acquireLock || acquireRcsTemplateSyncLock)(env);
  if (!lockAcquired) throw new Error("Synchronizace RCS šablon už probíhá.");
  const results = [];
  try {
    for (const templateKey of Object.keys(RCS_TEMPLATE_REGISTRY)) {
      const definition = twilioContentDefinition(templateKey, env);
      const registryDefinition = getRcsTemplate(templateKey);
      if (definition.status === "asset_missing") {
        const row = await saveRcsTemplateSyncRow(env, {
          templateKey,
          friendlyName: registryDefinition.friendlyName,
          syncStatus: "asset_missing",
          errorMessage: "Schválený banner chybí."
        });
        results.push(row);
        continue;
      }
      const fingerprint = await sha256(JSON.stringify(definition));
      const current = await getRcsTemplateSyncRow(env, templateKey);
      try {
        if (current?.contentSid && current.contentFingerprint === fingerprint && await contentExists(config, current.contentSid, fetchImpl)) {
          const row = await saveRcsTemplateSyncRow(env, {
            ...current,
            syncStatus: "ready",
            errorMessage: "",
            lastSyncedAt: new Date().toISOString()
          });
          results.push({ ...row, reused: true });
          continue;
        }
        const contentSid = await createContent(config, definition, fetchImpl);
        const row = await saveRcsTemplateSyncRow(env, {
          templateKey,
          friendlyName: registryDefinition.friendlyName,
          contentSid,
          contentFingerprint: fingerprint,
          syncStatus: "ready",
          errorMessage: "",
          lastSyncedAt: new Date().toISOString(),
          actorUserId: actor.id,
          actorName: actor.name
        });
        results.push({ ...row, created: true });
      } catch (error) {
        const row = await saveRcsTemplateSyncRow(env, {
          templateKey,
          friendlyName: registryDefinition.friendlyName,
          contentSid: current?.contentSid,
          contentFingerprint: current?.contentFingerprint,
          syncStatus: "error",
          errorMessage: cleanString(error.message)
        });
        results.push(row);
      }
    }
  } finally {
    await (dependencies.releaseLock || releaseRcsTemplateSyncLock)(env);
  }
  return { templates: rcsTemplatePreviewList(env, results), apiStatus: "ready" };
}

async function postMessage(config, phone, contentSid, contentVariables, fetchImpl) {
  const response = await fetchImpl(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(config),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: phone,
        MessagingServiceSid: config.messagingServiceSid,
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(contentVariables),
        ...(config.statusCallbackUrl ? { StatusCallback: config.statusCallbackUrl } : {})
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(payload, `Twilio ${response.status}`));
  if (!cleanString(payload.sid)) throw new Error("Twilio nevrátilo Message SID.");
  return payload;
}

export async function sendRcsTemplateMessage(env, input = {}, actor = {}, dependencies = {}) {
  const allowedKeys = [
    "templateKey",
    "recipient",
    "variables",
    "eventId",
    "userId",
    "customerId",
    "relatedEntityType",
    "relatedEntityId"
  ];
  const unknownKeys = Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) throw new Error(`Odeslání obsahuje nepovolená pole: ${unknownKeys.join(", ")}.`);

  const templateKey = cleanString(input.templateKey);
  const eventId = cleanString(input.eventId);
  const phone = normalizeCustomerPhone(input.recipient);
  const userId = cleanString(input.userId);
  const customerId = cleanString(input.customerId);
  const relatedEntityType = cleanString(input.relatedEntityType);
  const relatedEntityId = cleanString(input.relatedEntityId);
  if (!eventId || eventId.length > 180) throw new Error("Chybí platný eventId.");
  if (!phone) throw new Error("Příjemce nemá platné telefonní číslo.");
  if ([userId, customerId, relatedEntityType, relatedEntityId].some((value) => value.length > 180)) {
    throw new Error("Serverová vazba RCS zprávy je příliš dlouhá.");
  }
  if (templateKey === "task.new" && relatedEntityId && relatedEntityType !== "task") {
    throw new Error("RCS úkol může vytvořit odpovědní grant pouze s vazbou typu task.");
  }
  if (templateKey === "task.new" && relatedEntityId && !userId) {
    throw new Error("RCS úkol s odpovědním grantem musí být navázaný na konkrétního uživatele.");
  }
  const rendered = renderRcsTemplate(templateKey, input.variables, env);
  const sync = dependencies.syncRow || await getRcsTemplateSyncRow(env, templateKey);
  if (!sync?.contentSid || sync.syncStatus !== "ready") throw new Error("Šablona nemá připravený Twilio Content SID.");
  if (await (dependencies.isOptedOut || isCustomerMessageOptedOut)(env, phone)) {
    throw new Error("Telefon je v opt-out seznamu.");
  }

  const key = await idempotencyKey(eventId, templateKey, phone);
  const reservation = await (dependencies.reserveDispatch || reserveRcsDispatch)(env, {
    idempotencyKey: key,
    eventId,
    templateKey,
    recipientPhone: phone,
    recipientMasked: maskRcsRecipient(phone),
    recipientHash: await recipientHash(phone),
    userId,
    customerId,
    relatedEntityType,
    relatedEntityId,
    messageBody: rendered.body,
    variables: rendered.variables,
    contentSid: sync.contentSid,
    actorUserId: actor.id,
    actorName: actor.name
  });
  if (!reservation.created) {
    return {
      sent: false,
      duplicate: true,
      status: "blocked_duplicate",
      dispatch: reservation.dispatch
    };
  }

  const config = twilioConfig(env);
  if (config.mode !== "live") {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, reservation.dispatch.id, {
      status: config.mode === "test" ? "test_only" : "blocked",
      errorMessage: config.mode === "test" ? "Test režim: Twilio nebylo voláno." : "RCS/SMS odesílání je vypnuté."
    });
    return { sent: false, status: config.mode === "test" ? "test_only" : "blocked", dispatch: reservation.dispatch };
  }
  if (!config.accountSid || !config.authPassword || !config.messagingServiceSid) {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, reservation.dispatch.id, {
      status: "failed",
      errorMessage: "Chybí úplná serverová konfigurace Twilio."
    });
    return { sent: false, status: "failed", dispatch: reservation.dispatch };
  }

  try {
    const payload = await postMessage(
      config,
      phone,
      sync.contentSid,
      rcsContentVariables(templateKey, input.variables, env),
      dependencies.fetch || globalThis.fetch
    );
    const status = cleanString(payload.status || "accepted");
    await (dependencies.updateDispatch || updateRcsDispatch)(env, reservation.dispatch.id, {
      twilioMessageSid: payload.sid,
      contentSid: sync.contentSid,
      usedChannel: "rcs_sms_auto_fallback",
      status
    });
    let replyGrants = null;
    let auditWarning = "";
    if (templateKey === "task.new" && relatedEntityType === "task" && relatedEntityId) {
      try {
        replyGrants = await (dependencies.createTaskReplyGrants || createRcsTaskReplyGrants)(env, {
          outboundMessageSid: cleanString(payload.sid),
          phone,
          taskId: relatedEntityId,
          createdByUserId: cleanString(actor.id),
          expiresAt: taskReplyGrantExpiresAt(env)
        });
      } catch (error) {
        auditWarning = "RCS úkol byl odeslaný, ale nevzniklo oprávnění pro odpověď. Odpověď proto zůstane fail-closed.";
        console.error("rcs_template.reply_grant_failed", { message: cleanString(error.message) });
      }
    }
    return {
      sent: true,
      status,
      twilioMessageSid: cleanString(payload.sid),
      contentSid: sync.contentSid,
      channel: "rcs_sms_auto_fallback",
      recipient: maskRcsRecipient(phone),
      preview: rendered,
      replyGrants,
      auditWarning
    };
  } catch (error) {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, reservation.dispatch.id, {
      status: "failed",
      errorMessage: cleanString(error.message)
    });
    return { sent: false, status: "failed", errorMessage: cleanString(error.message), dispatch: reservation.dispatch };
  }
}

export const __test = {
  idempotencyKey,
  recipientHash,
  sha256,
  taskReplyGrantExpiresAt,
  twilioConfig
};
