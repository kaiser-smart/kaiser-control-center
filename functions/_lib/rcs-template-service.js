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
  cancelRcsSendGrant,
  claimRcsSendGrant,
  createRcsTaskReplyGrants,
  expireRcsSendGrant,
  getRcsDispatchById,
  getRcsTemplateSyncRow,
  listRcsDispatches,
  listRcsTemplateSyncRows,
  recordRcsSendGrantEvent,
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
  const mode = cleanString(env.KSO_CUSTOMER_MESSAGING_MODE || "off").toLowerCase();
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

function rcsSendGrantTtlSeconds(env = {}) {
  const raw = Number(env.RCS_TEMPLATE_SEND_GRANT_TTL_SECONDS || 180);
  return Math.max(30, Math.min(Number.isFinite(raw) ? raw : 180, 300));
}

function rcsSendGrantExpiresAt(createdAt, env = {}) {
  return new Date(Date.parse(createdAt) + (rcsSendGrantTtlSeconds(env) * 1000)).toISOString();
}

function adminTestEventId(templateKey) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `admin-test:${templateKey}:${suffix}`;
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

async function recordGrantEvent(env, dependencies, input) {
  return (dependencies.recordGrantEvent || recordRcsSendGrantEvent)(env, input);
}

async function rejectRcsSendGrant(env, dependencies, grant, actor, reason, message) {
  try {
    await recordGrantEvent(env, dependencies, {
      grantId: grant?.id,
      eventType: "rcs_send_grant_rejected",
      status: "blocked",
      detail: message,
      metadata: {
        reason,
        templateKey: cleanString(grant?.templateKey),
        recipientMasked: cleanString(grant?.recipientMasked),
        actorUserId: cleanString(actor?.id)
      }
    });
  } catch (error) {
    console.error("rcs_template.send_grant_rejection_audit_failed", {
      reason,
      message: cleanString(error.message)
    });
  }
  throw new Error(message);
}

export async function prepareRcsTemplateSendGrant(env, input = {}, actor = {}, dependencies = {}) {
  const allowedKeys = ["templateKey", "recipient", "variables"];
  const unknownKeys = Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) throw new Error(`Příprava obsahuje nepovolená pole: ${unknownKeys.join(", ")}.`);

  const config = twilioConfig(env);
  if (config.mode !== "off") {
    throw new Error("Jednorázové RCS oprávnění lze připravit jen při globálním režimu odesílání off.");
  }
  if (!config.accountSid || !config.authPassword || !config.messagingServiceSid) {
    throw new Error("Chybí úplná serverová konfigurace Twilio.");
  }

  const actorUserId = cleanString(actor.id);
  const actorPhone = normalizeCustomerPhone(actor.phone);
  const phone = normalizeCustomerPhone(input.recipient);
  const templateKey = cleanString(input.templateKey);
  if (!actorUserId || !actorPhone) {
    throw new Error("Přihlášený správce nemá ověřený uživatelský telefon.");
  }
  if (!phone || phone !== actorPhone) {
    throw new Error("Jednorázový RCS test lze připravit jen na ověřený telefon přihlášeného správce.");
  }

  const rendered = renderRcsTemplate(templateKey, input.variables, env);
  const sync = dependencies.syncRow || await getRcsTemplateSyncRow(env, templateKey);
  if (!sync?.contentSid || sync.syncStatus !== "ready") {
    throw new Error("Šablona nemá připravený Twilio Content SID.");
  }
  if (await (dependencies.isOptedOut || isCustomerMessageOptedOut)(env, phone)) {
    throw new Error("Telefon je v opt-out seznamu.");
  }

  const eventId = adminTestEventId(templateKey);
  const key = await idempotencyKey(eventId, templateKey, phone);
  const reservation = await (dependencies.reserveDispatch || reserveRcsDispatch)(env, {
    idempotencyKey: key,
    eventId,
    templateKey,
    recipientPhone: phone,
    recipientMasked: maskRcsRecipient(phone),
    recipientHash: await recipientHash(phone),
    messageBody: rendered.body,
    variables: rendered.variables,
    contentSid: sync.contentSid,
    actorUserId,
    actorName: actor.name,
    initialStatus: "confirmation_pending"
  });
  if (!reservation.created || !reservation.dispatch?.id) {
    throw new Error("Jednorázové RCS oprávnění se nepodařilo vytvořit.");
  }

  const expiresAt = rcsSendGrantExpiresAt(reservation.dispatch.createdAt, env);
  try {
    await recordGrantEvent(env, dependencies, {
      grantId: reservation.dispatch.id,
      eventType: "rcs_send_grant_created",
      status: "confirmation_pending",
      detail: "Bylo vytvořeno krátké jednorázové oprávnění pro přesnou RCS šablonu a příjemce.",
      metadata: {
        templateKey,
        recipientMasked: maskRcsRecipient(phone),
        actorUserId,
        expiresAt
      }
    });
  } catch (error) {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, reservation.dispatch.id, {
      status: "blocked",
      errorMessage: "Audit jednorázového oprávnění selhal."
    });
    throw new Error("Jednorázové RCS oprávnění nebylo aktivováno, protože se nepodařilo uložit audit.");
  }

  return {
    grantId: reservation.dispatch.id,
    templateKey,
    templateLabel: cleanString(getRcsTemplate(templateKey).label || templateKey),
    recipient: maskRcsRecipient(phone),
    preview: rendered,
    expiresAt,
    status: "confirmation_pending"
  };
}

export async function cancelRcsTemplateSendGrant(env, input = {}, actor = {}, dependencies = {}) {
  const allowedKeys = ["grantId"];
  const unknownKeys = Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) throw new Error(`Zrušení obsahuje nepovolená pole: ${unknownKeys.join(", ")}.`);

  const grantId = cleanString(input.grantId);
  const grant = grantId
    ? await (dependencies.getDispatch || getRcsDispatchById)(env, grantId)
    : null;
  if (!grant) throw new Error("Jednorázové RCS oprávnění neexistuje.");

  const actorUserId = cleanString(actor.id);
  if (
    !actorUserId
    || grant.actorUserId !== actorUserId
    || grant.status !== "confirmation_pending"
  ) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "grant_cancel_scope_mismatch",
      "Jednorázové RCS oprávnění nelze zrušit."
    );
  }

  const cancelled = await (dependencies.cancelGrant || cancelRcsSendGrant)(env, {
    grantId,
    actorUserId
  });
  if (!cancelled) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "grant_cancel_failed",
      "Jednorázové RCS oprávnění už není aktivní."
    );
  }

  let auditWarning = "";
  try {
    await recordGrantEvent(env, dependencies, {
      grantId,
      eventType: "rcs_send_grant_cancelled",
      status: "cancelled",
      detail: "Uživatel zrušil jednorázové RCS oprávnění bez odeslání.",
      metadata: {
        templateKey: grant.templateKey,
        recipientMasked: grant.recipientMasked,
        actorUserId
      }
    });
  } catch (error) {
    auditWarning = "Oprávnění bylo zrušeno, ale doplňkový audit zrušení se nepodařilo uložit.";
    console.error("rcs_template.send_grant_cancel_audit_failed", {
      grantId,
      message: cleanString(error.message)
    });
  }
  return {
    cancelled: true,
    grantId,
    status: "cancelled",
    auditWarning
  };
}

export async function confirmRcsTemplateSendGrant(env, input = {}, actor = {}, dependencies = {}) {
  const allowedKeys = ["grantId", "confirm"];
  const unknownKeys = Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) throw new Error(`Potvrzení obsahuje nepovolená pole: ${unknownKeys.join(", ")}.`);
  if (input.confirm !== "send-one-rcs-template") {
    throw new Error("Odeslání vyžaduje výslovné potvrzení jednorázového oprávnění.");
  }

  const grantId = cleanString(input.grantId);
  const grant = grantId
    ? await (dependencies.getDispatch || getRcsDispatchById)(env, grantId)
    : null;
  if (!grant) throw new Error("Jednorázové RCS oprávnění neexistuje.");

  const config = twilioConfig(env);
  if (config.mode !== "off") {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "global_mode_not_off",
      "Jednorázové odeslání bylo zablokováno, protože globální režim není off."
    );
  }

  const actorUserId = cleanString(actor.id);
  const actorPhone = normalizeCustomerPhone(actor.phone);
  const now = Date.now();
  const expiresAt = Date.parse(rcsSendGrantExpiresAt(grant.createdAt, env));
  if (grant.status !== "confirmation_pending") {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "grant_not_pending",
      "Jednorázové RCS oprávnění už bylo použito nebo není aktivní."
    );
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await (dependencies.expireGrant || expireRcsSendGrant)(env, grant.id);
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "grant_expired",
      "Jednorázové RCS oprávnění vypršelo."
    );
  }
  if (
    !actorUserId
    || grant.actorUserId !== actorUserId
    || !actorPhone
    || actorPhone !== grant.recipientPhone
  ) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "actor_scope_mismatch",
      "Jednorázové RCS oprávnění nepatří přihlášenému správci."
    );
  }
  if (!grant.eventId.startsWith(`admin-test:${grant.templateKey}:`)) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "event_scope_mismatch",
      "Jednorázové RCS oprávnění nemá platný testovací rozsah."
    );
  }

  let rendered;
  try {
    rendered = renderRcsTemplate(grant.templateKey, grant.variables, env);
  } catch {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "stored_variables_invalid",
      "Uložený obsah jednorázového RCS oprávnění není platný."
    );
  }
  if (rendered.body !== grant.messageBody) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "stored_message_mismatch",
      "Uložený obsah jednorázového RCS oprávnění se změnil."
    );
  }

  const sync = dependencies.syncRow || await getRcsTemplateSyncRow(env, grant.templateKey);
  if (!sync?.contentSid || sync.syncStatus !== "ready" || sync.contentSid !== grant.contentSid) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "content_sid_mismatch",
      "RCS šablona se od vytvoření oprávnění změnila."
    );
  }
  if (await (dependencies.isOptedOut || isCustomerMessageOptedOut)(env, grant.recipientPhone)) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "recipient_opted_out",
      "Telefon je v opt-out seznamu."
    );
  }
  if (!config.accountSid || !config.authPassword || !config.messagingServiceSid) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "twilio_config_missing",
      "Chybí úplná serverová konfigurace Twilio."
    );
  }

  const notBefore = new Date(now - (rcsSendGrantTtlSeconds(env) * 1000)).toISOString();
  const claimed = await (dependencies.claimGrant || claimRcsSendGrant)(env, {
    grantId: grant.id,
    actorUserId,
    notBefore
  });
  if (!claimed) {
    return rejectRcsSendGrant(
      env,
      dependencies,
      grant,
      actor,
      "atomic_claim_failed",
      "Jednorázové RCS oprávnění už bylo použito nebo vypršelo."
    );
  }

  try {
    await recordGrantEvent(env, dependencies, {
      grantId: grant.id,
      eventType: "rcs_send_grant_claimed",
      status: "sending",
      detail: "Jednorázové RCS oprávnění bylo atomicky spotřebováno.",
      metadata: {
        templateKey: grant.templateKey,
        recipientMasked: grant.recipientMasked,
        actorUserId
      }
    });
  } catch {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, grant.id, {
      status: "failed",
      errorMessage: "Audit spotřeby jednorázového oprávnění selhal."
    });
    throw new Error("RCS nebylo odesláno, protože se nepodařilo uložit audit spotřeby oprávnění.");
  }

  let payload;
  try {
    payload = await postMessage(
      config,
      grant.recipientPhone,
      grant.contentSid,
      rcsContentVariables(grant.templateKey, grant.variables, env),
      dependencies.fetch || globalThis.fetch
    );
  } catch (error) {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, grant.id, {
      status: "failed",
      errorMessage: cleanString(error.message)
    });
    try {
      await recordGrantEvent(env, dependencies, {
        grantId: grant.id,
        eventType: "rcs_send_grant_provider_result",
        status: "failed",
        detail: "Twilio jednorázově potvrzenou RCS zprávu nepřijalo.",
        metadata: {
          templateKey: grant.templateKey,
          recipientMasked: grant.recipientMasked,
          actorUserId
        }
      });
    } catch (auditError) {
      console.error("rcs_template.send_grant_provider_audit_failed", {
        message: cleanString(auditError.message)
      });
    }
    return {
      sent: false,
      status: "failed",
      errorMessage: cleanString(error.message),
      dispatch: grant
    };
  }

  const status = cleanString(payload.status || "accepted");
  let auditWarning = "";
  try {
    await (dependencies.updateDispatch || updateRcsDispatch)(env, grant.id, {
      twilioMessageSid: payload.sid,
      contentSid: grant.contentSid,
      usedChannel: "rcs_sms_auto_fallback",
      status
    });
    await recordGrantEvent(env, dependencies, {
      grantId: grant.id,
      eventType: "rcs_send_grant_provider_result",
      status,
      detail: "Twilio přijalo jednorázově potvrzenou RCS zprávu.",
      metadata: {
        templateKey: grant.templateKey,
        recipientMasked: grant.recipientMasked,
        actorUserId,
        twilioMessageSid: cleanString(payload.sid)
      }
    });
  } catch (error) {
    auditWarning = "Twilio zprávu přijalo, ale uložení výsledku auditu selhalo.";
    console.error("rcs_template.send_grant_accepted_audit_failed", {
      grantId: grant.id,
      message: cleanString(error.message)
    });
  }
  return {
    sent: true,
    status,
    twilioMessageSid: cleanString(payload.sid),
    contentSid: grant.contentSid,
    channel: "rcs_sms_auto_fallback",
    recipient: grant.recipientMasked,
    preview: rendered,
    auditWarning
  };
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
  adminTestEventId,
  idempotencyKey,
  recipientHash,
  rcsSendGrantExpiresAt,
  rcsSendGrantTtlSeconds,
  sha256,
  taskReplyGrantExpiresAt,
  twilioConfig
};
