import {
  isCustomerMessageOptedOut
} from "./customer-message-store.js";
import {
  sendReviewedCustomerMessage
} from "./customer-messaging-service.js";
import {
  appendRcsSmsEvent,
  cancelRcsSmsReviewSendGrant,
  claimRcsSmsReviewSendGrant,
  createRcsSmsReviewSendGrant,
  expireRcsSmsReviewSendGrant,
  getRcsSmsReviewCandidate,
  getRcsSmsReviewSendGrant,
  getRcsSmsRuntimeConfig,
  insertRcsSmsOutboundMessage,
  setRcsSmsConversationState,
  setRcsSmsMessageState,
  updateRcsSmsReviewSendGrant
} from "./rcs-sms-autopilot-store.js";

const MAX_REPLY_LENGTH = 1200;
const DEFAULT_GRANT_TTL_SECONDS = 180;
const STOP_SENTENCE = "Pro odhlášení odpovězte STOP.";
const APPROVER_ROLES = new Set(["admin", "management"]);

export class RcsSmsReviewSendError extends Error {
  constructor(message, status = 400, code = "rcs_sms_review_send_error") {
    super(message);
    this.name = "RcsSmsReviewSendError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeRole(value) {
  return cleanString(value).toLowerCase();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function reviewPilotUserIds(env = {}) {
  return [...new Set(
    cleanString(env.RCS_SMS_AUTOPILOT_REVIEW_USER_IDS)
      .split(/[\s,;]+/)
      .map(cleanString)
      .filter(Boolean)
  )];
}

function effectiveMode(env = {}, runtimeConfig = {}) {
  const configured = cleanString(env.RCS_SMS_AUTOPILOT_MODE || "off").toLowerCase();
  if (configured === "off" || runtimeConfig.autopilotEnabled !== true) return "off";
  if (configured === "review" || runtimeConfig.outboundEnabled !== true) return "review";
  return "live";
}

function grantTtlSeconds(env = {}) {
  return Math.max(
    60,
    Math.min(Number(env.RCS_SMS_REVIEW_SEND_GRANT_TTL_SECONDS || DEFAULT_GRANT_TTL_SECONDS), 600)
  );
}

function maskPhone(value) {
  const phone = cleanString(value);
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)} *** **${phone.slice(-2)}`;
}

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value ?? ""))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertApprover(actor = {}) {
  if (!cleanString(actor.id) || !APPROVER_ROLES.has(normalizeRole(actor.role))) {
    throw new RcsSmsReviewSendError(
      "Jednorázové odeslání může schválit pouze Admin nebo Management.",
      403,
      "rcs_sms_review_approver_forbidden"
    );
  }
}

function assertReviewRuntime(env, runtimeConfig) {
  if (
    effectiveMode(env, runtimeConfig) !== "review"
    || runtimeConfig.autopilotEnabled !== true
    || runtimeConfig.outboundEnabled !== false
  ) {
    throw new RcsSmsReviewSendError(
      "Jednorázové odeslání je povolené jen v review režimu s vypnutým automatickým outboundem.",
      409,
      "rcs_sms_review_runtime_mismatch"
    );
  }
}

function assertExactInput(input = {}, allowedKeys = []) {
  const unknown = Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));
  if (unknown.length) {
    throw new RcsSmsReviewSendError(
      `Požadavek obsahuje nepovolená pole: ${unknown.join(", ")}.`,
      400,
      "rcs_sms_review_payload_invalid"
    );
  }
}

function validateReplyText(value) {
  const replyText = cleanString(value);
  if (!replyText) {
    throw new RcsSmsReviewSendError(
      "Text jednorázové odpovědi je prázdný.",
      400,
      "rcs_sms_review_reply_empty"
    );
  }
  if (replyText.length > MAX_REPLY_LENGTH) {
    throw new RcsSmsReviewSendError(
      `Text jednorázové odpovědi může mít nejvýše ${MAX_REPLY_LENGTH} znaků.`,
      400,
      "rcs_sms_review_reply_too_long"
    );
  }
  return replyText;
}

function assertCandidate(env, candidate) {
  const conversation = candidate?.conversation;
  const message = candidate?.message;
  if (
    !conversation
    || !message
    || message.direction !== "inbound"
    || message.status !== "review_ready"
    || conversation.contactType !== "employee"
    || !cleanString(conversation.userId)
    || !reviewPilotUserIds(env).includes(cleanString(conversation.userId))
    || ["opted_out", "unknown"].includes(conversation.contactType)
    || ["opted_out", "unknown"].includes(cleanString(message.senderType))
  ) {
    throw new RcsSmsReviewSendError(
      "Konverzace nemá aktuální bezpečný návrh z interního review pilotu.",
      409,
      "rcs_sms_review_candidate_invalid"
    );
  }
  if (!cleanString(conversation.phone)) {
    throw new RcsSmsReviewSendError(
      "Konverzace nemá validního příjemce.",
      409,
      "rcs_sms_review_recipient_missing"
    );
  }
  return { conversation, message };
}

function dependencies(overrides = {}) {
  return {
    appendEvent: appendRcsSmsEvent,
    cancelGrant: cancelRcsSmsReviewSendGrant,
    claimGrant: claimRcsSmsReviewSendGrant,
    createGrant: createRcsSmsReviewSendGrant,
    expireGrant: expireRcsSmsReviewSendGrant,
    getCandidate: getRcsSmsReviewCandidate,
    getGrant: getRcsSmsReviewSendGrant,
    getRuntimeConfig: getRcsSmsRuntimeConfig,
    insertOutbound: insertRcsSmsOutboundMessage,
    isOptedOut: isCustomerMessageOptedOut,
    sendMessage: sendReviewedCustomerMessage,
    setConversationState: setRcsSmsConversationState,
    setMessageState: setRcsSmsMessageState,
    updateGrant: updateRcsSmsReviewSendGrant,
    ...overrides
  };
}

async function reject(env, deps, grant, actor, reason, message, status = 409) {
  try {
    await deps.appendEvent(env, {
      conversationId: grant?.conversationId,
      messageId: grant?.inboundMessageId,
      eventType: "review_send_grant_rejected",
      status: "blocked",
      detail: message,
      metadata: {
        grantId: cleanString(grant?.id),
        reason,
        actorUserId: cleanString(actor?.id)
      }
    });
  } catch {
    // Rejection must remain fail-closed even if supplemental audit is unavailable.
  }
  throw new RcsSmsReviewSendError(message, status, reason);
}

export async function prepareRcsSmsReviewSendGrant(env, conversationId, input = {}, actor = {}, overrides = {}) {
  assertExactInput(input, ["replyText"]);
  assertApprover(actor);
  const deps = dependencies(overrides);
  const runtimeConfig = await deps.getRuntimeConfig(env);
  assertReviewRuntime(env, runtimeConfig);
  const candidate = assertCandidate(env, await deps.getCandidate(env, cleanString(conversationId)));
  const replyText = validateReplyText(input.replyText);
  if (await deps.isOptedOut(env, candidate.conversation.phone)) {
    throw new RcsSmsReviewSendError(
      "Telefon je v opt-out seznamu.",
      409,
      "rcs_sms_review_recipient_opted_out"
    );
  }

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(createdAt) + (grantTtlSeconds(env) * 1000)
  ).toISOString();
  let grant;
  try {
    grant = await deps.createGrant(env, {
      id: randomId("rcs-sms-review-send"),
      conversationId: candidate.conversation.id,
      inboundMessageId: candidate.message.id,
      actorUserId: cleanString(actor.id),
      actorName: cleanString(actor.name),
      recipientPhone: candidate.conversation.phone,
      recipientPhoneHash: await sha256(candidate.conversation.phone),
      channel: candidate.message.channel || candidate.conversation.channel,
      intent: candidate.message.intent,
      replyText,
      replyTextHash: await sha256(replyText),
      expiresAt,
      createdAt
    });
  } catch (error) {
    if (error?.code === "rcs_sms_review_send_in_progress") {
      throw new RcsSmsReviewSendError(error.message, 409, error.code);
    }
    throw error;
  }
  try {
    await deps.appendEvent(env, {
      conversationId: grant.conversationId,
      messageId: grant.inboundMessageId,
      eventType: "review_send_grant_created",
      status: "confirmation_pending",
      detail: "Vzniklo krátké jednorázové oprávnění pro přesný text, příjemce a příchozí zprávu.",
      metadata: {
        grantId: grant.id,
        actorUserId: grant.actorUserId,
        recipientMasked: maskPhone(grant.recipientPhone),
        channel: grant.channel,
        replyTextHash: grant.replyTextHash,
        expiresAt: grant.expiresAt,
        toolExecution: "disabled"
      }
    });
  } catch {
    await deps.updateGrant(env, grant.id, {
      status: "failed",
      errorMessage: "Audit vytvoření jednorázového oprávnění selhal."
    });
    throw new RcsSmsReviewSendError(
      "Oprávnění nebylo aktivováno, protože se nepodařilo uložit audit.",
      503,
      "rcs_sms_review_grant_audit_failed"
    );
  }
  return {
    grantId: grant.id,
    status: grant.status,
    conversationId: grant.conversationId,
    inboundMessageId: grant.inboundMessageId,
    recipient: maskPhone(grant.recipientPhone),
    channel: grant.channel,
    intent: grant.intent,
    preview: `${grant.replyText} ${STOP_SENTENCE}`,
    replyText: grant.replyText,
    expiresAt: grant.expiresAt,
    toolExecution: "disabled"
  };
}

export async function cancelRcsSmsReviewSend(env, conversationId, input = {}, actor = {}, overrides = {}) {
  assertExactInput(input, ["grantId"]);
  assertApprover(actor);
  const deps = dependencies(overrides);
  const grant = await deps.getGrant(env, cleanString(input.grantId));
  if (
    !grant
    || grant.conversationId !== cleanString(conversationId)
    || grant.actorUserId !== cleanString(actor.id)
    || grant.status !== "confirmation_pending"
  ) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_cancel_scope_mismatch",
      "Jednorázové oprávnění nelze zrušit."
    );
  }
  if (!(await deps.cancelGrant(env, { grantId: grant.id, actorUserId: actor.id }))) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_cancel_failed",
      "Jednorázové oprávnění už není aktivní."
    );
  }
  await deps.appendEvent(env, {
    conversationId: grant.conversationId,
    messageId: grant.inboundMessageId,
    eventType: "review_send_grant_cancelled",
    status: "cancelled",
    detail: "Správce zrušil jednorázové oprávnění bez odeslání.",
    metadata: {
      grantId: grant.id,
      actorUserId: cleanString(actor.id)
    }
  });
  return { cancelled: true, grantId: grant.id, status: "cancelled" };
}

export async function confirmRcsSmsReviewSend(env, conversationId, input = {}, actor = {}, overrides = {}) {
  assertExactInput(input, ["grantId", "confirm"]);
  assertApprover(actor);
  if (input.confirm !== "send-one-reviewed-reply") {
    throw new RcsSmsReviewSendError(
      "Odeslání vyžaduje výslovné potvrzení této jedné odpovědi.",
      409,
      "rcs_sms_review_confirmation_required"
    );
  }
  const deps = dependencies(overrides);
  const runtimeConfig = await deps.getRuntimeConfig(env);
  assertReviewRuntime(env, runtimeConfig);
  const grant = await deps.getGrant(env, cleanString(input.grantId));
  if (
    !grant
    || grant.conversationId !== cleanString(conversationId)
    || grant.actorUserId !== cleanString(actor.id)
  ) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_grant_scope_mismatch",
      "Jednorázové oprávnění nepatří této konverzaci a přihlášenému správci."
    );
  }
  if (grant.status !== "confirmation_pending") {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_grant_not_pending",
      "Jednorázové oprávnění už bylo použito nebo není aktivní."
    );
  }
  if (Date.parse(grant.expiresAt) <= Date.now()) {
    await deps.expireGrant(env, grant.id);
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_grant_expired",
      "Jednorázové oprávnění vypršelo."
    );
  }

  const candidate = assertCandidate(env, await deps.getCandidate(env, grant.conversationId));
  if (
    candidate.message.id !== grant.inboundMessageId
    || candidate.conversation.phone !== grant.recipientPhone
    || await sha256(grant.recipientPhone) !== grant.recipientPhoneHash
    || await sha256(grant.replyText) !== grant.replyTextHash
  ) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_grant_content_mismatch",
      "Konverzace, příjemce nebo přesný text se od vytvoření oprávnění změnil."
    );
  }
  if (await deps.isOptedOut(env, grant.recipientPhone)) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_recipient_opted_out",
      "Telefon je v opt-out seznamu."
    );
  }
  if (!(await deps.claimGrant(env, { grantId: grant.id, actorUserId: actor.id }))) {
    return reject(
      env,
      deps,
      grant,
      actor,
      "rcs_sms_review_atomic_claim_failed",
      "Jednorázové oprávnění už bylo použito nebo vypršelo."
    );
  }

  try {
    await deps.appendEvent(env, {
      conversationId: grant.conversationId,
      messageId: grant.inboundMessageId,
      eventType: "review_send_grant_claimed",
      status: "claimed",
      detail: "Jednorázové oprávnění bylo atomicky spotřebováno před voláním Twilia.",
      metadata: {
        grantId: grant.id,
        actorUserId: cleanString(actor.id),
        replyTextHash: grant.replyTextHash,
        toolExecution: "disabled"
      }
    });
  } catch {
    await deps.updateGrant(env, grant.id, {
      status: "failed",
      errorMessage: "Audit spotřeby jednorázového oprávnění selhal."
    });
    throw new RcsSmsReviewSendError(
      "Zpráva nebyla odeslána, protože se nepodařilo uložit audit spotřeby oprávnění.",
      503,
      "rcs_sms_review_claim_audit_failed"
    );
  }

  const result = await deps.sendMessage(env, {
    phone: grant.recipientPhone,
    template: "autopilot_reply",
    variables: { replyText: grant.replyText },
    channelPreference: grant.channel,
    customerId: candidate.conversation.customerId,
    userId: candidate.conversation.userId,
    relatedEntityType: "rcs_sms_conversation",
    relatedEntityId: grant.conversationId,
    eventId: `review-send:${grant.id}`,
    reason: "provozní odpověď na příchozí RCS/SMS požadavek",
    legalBasis: "odpověď na příchozí provozní požadavek",
    consent: true,
    dedupeWindowSeconds: 60
  });

  if (!result.sent) {
    await deps.updateGrant(env, grant.id, {
      status: "failed",
      providerStatus: result.status || "failed",
      errorMessage: result.errorMessage || "Twilio zprávu nepřijalo."
    });
    await deps.setMessageState(env, grant.inboundMessageId, {
      status: "review_ready",
      responseMode: "human",
      requiresHuman: true,
      errorCode: "review_reply_not_sent",
      errorMessage: result.errorMessage || "Twilio zprávu nepřijalo."
    });
    await deps.appendEvent(env, {
      conversationId: grant.conversationId,
      messageId: grant.inboundMessageId,
      eventType: "review_send_grant_provider_result",
      status: "failed",
      detail: "Twilio jednorázově schválenou odpověď nepřijalo; automatický retry není povolený.",
      metadata: {
        grantId: grant.id,
        actorUserId: cleanString(actor.id),
        providerStatus: cleanString(result.status),
        toolExecution: "disabled",
        retry: "disabled"
      }
    });
    return {
      sent: false,
      grantId: grant.id,
      status: result.status || "failed",
      errorMessage: result.errorMessage || "Twilio zprávu nepřijalo.",
      retry: "disabled"
    };
  }

  await deps.updateGrant(env, grant.id, {
    status: "provider_accepted",
    providerMessageSid: result.twilioMessageSid,
    providerStatus: result.status || "accepted",
    errorMessage: ""
  });
  await deps.insertOutbound(env, {
    conversationId: grant.conversationId,
    channel: grant.channel,
    twilioMessageSid: result.twilioMessageSid,
    body: result.messageBody || `${grant.replyText} ${STOP_SENTENCE}`,
    status: result.status || "pending",
    senderType: "human",
    intent: grant.intent,
    responseMode: "human_approved"
  });
  await deps.setMessageState(env, grant.inboundMessageId, {
    status: "replied",
    responseMode: "human_approved",
    replyText: grant.replyText,
    requiresHuman: false,
    reason: "Přesný text jednorázově schválil oprávněný správce KSO.",
    nextRetryAt: "",
    errorCode: "",
    errorMessage: "",
    processed: true
  });
  await deps.setConversationState(env, grant.conversationId, {
    status: "open",
    humanTakeover: false,
    awaitingField: ""
  });
  await deps.appendEvent(env, {
    conversationId: grant.conversationId,
    messageId: grant.inboundMessageId,
    eventType: "review_send_grant_provider_result",
    status: "provider_accepted",
    detail: "Twilio přijalo přesně jednu člověkem schválenou RCS/SMS odpověď.",
    metadata: {
      grantId: grant.id,
      actorUserId: cleanString(actor.id),
      recipientMasked: maskPhone(grant.recipientPhone),
      twilioMessageSid: cleanString(result.twilioMessageSid),
      providerStatus: cleanString(result.status),
      replyTextHash: grant.replyTextHash,
      toolExecution: "disabled",
      retry: "disabled"
    }
  });
  return {
    sent: true,
    grantId: grant.id,
    status: result.status || "accepted",
    twilioMessageSid: cleanString(result.twilioMessageSid),
    recipient: maskPhone(grant.recipientPhone),
    channel: grant.channel,
    auditWarning: cleanString(result.auditWarning),
    retry: "disabled"
  };
}

export const __test = {
  APPROVER_ROLES,
  effectiveMode,
  grantTtlSeconds,
  maskPhone,
  reviewPilotUserIds,
  validateReplyText
};
