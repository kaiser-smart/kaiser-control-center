import { normalizeCustomerPhone } from "./customer-messaging-service.js";
import { getCoreDatabase, getMessagesDatabase } from "./databases.js";

const MAX_PAGE_SIZE = 100;

export class RcsSmsAutopilotStoreError extends Error {
  constructor(message, status = 400, code = "rcs_sms_autopilot_store_error") {
    super(message);
    this.name = "RcsSmsAutopilotStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  try {
    return getMessagesDatabase(env, { required });
  } catch {
    throw new RcsSmsAutopilotStoreError(
      "Databáze RCS/SMS Autopilota není nastavená. Chybí D1 binding DB_MESSAGES.",
      503,
      "rcs_sms_autopilot_database_missing"
    );
  }
}

function identityDatabase(env) {
  return getCoreDatabase(env, { required: false });
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const text = cleanString(value);
  return text || null;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function dbError(error) {
  if (error instanceof RcsSmsAutopilotStoreError) return error;
  const message = cleanString(error?.message);
  if (
    /no such table.*(?:rcs_sms_|rcs_message_dispatches)|no such column.*recipient_phone/i
      .test(message)
  ) {
    return new RcsSmsAutopilotStoreError(
      "Tabulky RCS/SMS Autopilota nejsou v DB_MESSAGES připravené. Spusťte modulární migrace messages/0001, 0002, 0006 a 0007.",
      503,
      "rcs_sms_autopilot_migration_missing"
    );
  }
  console.error("rcs_sms_autopilot.store_failed", { message: message.slice(0, 300) });
  return new RcsSmsAutopilotStoreError(
    "RCS/SMS konverzace se teď nepodařilo načíst nebo uložit.",
    500,
    "rcs_sms_autopilot_store_failed"
  );
}

function channelFromPayload(payload = {}) {
  const channel = cleanString(
    payload.ChannelPrefix ||
    payload.channelPrefix ||
    payload.Channel ||
    payload.channel ||
    payload.From ||
    payload.from
  ).toLowerCase();
  return channel.includes("rcs:") || channel === "rcs" ? "rcs" : "sms";
}

function mediaFromPayload(payload = {}) {
  const count = Math.max(0, Math.min(Number(payload.NumMedia || payload.numMedia || 0), 10));
  return Array.from({ length: count }, (_, index) => ({
    index,
    contentType: cleanString(payload[`MediaContentType${index}`] || payload[`mediaContentType${index}`])
  }));
}

function phoneMatches(candidate, phone) {
  return normalizeCustomerPhone(candidate) === phone;
}

async function safeAll(db, sql, ...bindings) {
  try {
    const result = await db.prepare(sql).bind(...bindings).all();
    return result.results || [];
  } catch (error) {
    if (/no such table/i.test(cleanString(error?.message))) return [];
    throw error;
  }
}

async function safeFirst(db, sql, ...bindings) {
  try {
    return await db.prepare(sql).bind(...bindings).first();
  } catch (error) {
    if (/no such table/i.test(cleanString(error?.message))) return null;
    throw error;
  }
}

async function resolveIdentity(coreDb, messagesDb, phone) {
  const [users, customers, optOut] = await Promise.all([
    coreDb ? safeAll(
      coreDb,
      `SELECT id, name, phone, role, status, active
       FROM users
       WHERE phone IS NOT NULL AND phone <> ''`
    ) : [],
    coreDb ? safeAll(
      coreDb,
      `SELECT id, company_name, contact_phone, automation_status
       FROM receivable_customers
       WHERE contact_phone IS NOT NULL AND contact_phone <> ''
       LIMIT 1000`
    ) : [],
    safeFirst(messagesDb, "SELECT id FROM customer_message_opt_out WHERE phone = ? LIMIT 1", phone)
  ]);

  const matchedUsers = users.filter((item) => (
    phoneMatches(item.phone, phone) &&
    Number(item.active || 0) === 1 &&
    !["disabled", "vypnutý"].includes(cleanString(item.status).toLowerCase())
  ));
  const matchedCustomers = customers.filter((item) => phoneMatches(item.contact_phone, phone));

  if (optOut?.id) {
    return {
      senderType: "opted_out",
      contactName: matchedUsers[0]?.name || matchedCustomers[0]?.company_name || "",
      consentStatus: "opted_out",
      matchReason: "persistent_opt_out"
    };
  }

  if (matchedUsers.length === 1 && matchedCustomers.length === 0) {
    const user = matchedUsers[0];
    const employee = coreDb ? await safeFirst(
      coreDb,
      "SELECT id FROM employee_cards WHERE user_id = ? LIMIT 1",
      user.id
    ) : null;
    return {
      senderType: "employee",
      userId: cleanString(user.id),
      employeeId: cleanString(employee?.id),
      contactName: cleanString(user.name),
      role: cleanString(user.role),
      consentStatus: "internal_operational",
      matchReason: "unique_active_user_phone"
    };
  }

  if (matchedCustomers.length === 1 && matchedUsers.length === 0) {
    const customer = matchedCustomers[0];
    return {
      senderType: "customer",
      customerId: cleanString(customer.id),
      contactName: cleanString(customer.company_name),
      consentStatus: "inbound_operational_request",
      matchReason: "unique_customer_phone"
    };
  }

  return {
    senderType: "unknown",
    contactName: "",
    consentStatus: "unknown",
    matchReason: matchedUsers.length + matchedCustomers.length > 1
      ? "ambiguous_phone_match"
      : "no_phone_match"
  };
}

function replyToSidFromPayload(payload = {}) {
  return cleanString(
    payload.OriginalRepliedMessageSid
    || payload.originalRepliedMessageSid
    || payload.OriginalMessageSid
    || payload.originalMessageSid
    || payload.InReplyToMessageSid
    || payload.inReplyToMessageSid
    || payload.RepliedMessageSid
    || payload.repliedMessageSid
  );
}

function emptyOutbound() {
  return {
    messageSid: "",
    recipientPhone: "",
    templateKey: "",
    eventId: "",
    userId: "",
    customerId: "",
    relatedEntityType: "",
    relatedEntityId: "",
    body: "",
    channel: "",
    status: "",
    variables: {},
    sentAt: ""
  };
}

function customerOutbound(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json, {});
  return {
    messageSid: cleanString(row.twilio_message_sid),
    recipientPhone: cleanString(row.phone),
    templateKey: cleanString(row.template_key),
    eventId: cleanString(metadata.eventId || metadata.event_id),
    userId: cleanString(metadata.userId || metadata.user_id),
    customerId: cleanString(row.customer_id || metadata.customerId || metadata.customer_id),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    body: cleanString(row.message_body),
    channel: cleanString(row.used_channel),
    status: cleanString(row.status),
    variables: metadata.variables && typeof metadata.variables === "object"
      ? metadata.variables
      : {},
    sentAt: cleanString(row.created_at)
  };
}

function rcsDispatchOutbound(row) {
  if (!row) return null;
  return {
    messageSid: cleanString(row.twilio_message_sid),
    recipientPhone: cleanString(row.recipient_phone),
    templateKey: cleanString(row.template_key),
    eventId: cleanString(row.event_id),
    userId: cleanString(row.user_id),
    customerId: cleanString(row.customer_id),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    body: cleanString(row.message_body),
    channel: cleanString(row.used_channel),
    status: cleanString(row.status),
    variables: parseJson(row.variables_json, {}),
    sentAt: cleanString(row.created_at)
  };
}

function notificationOutbound(row) {
  if (!row) return null;
  return {
    ...emptyOutbound(),
    messageSid: cleanString(row.provider_message_id),
    recipientPhone: cleanString(row.recipient),
    templateKey: cleanString(row.type),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    body: cleanString(row.message_preview),
    channel: "sms",
    status: cleanString(row.status),
    sentAt: cleanString(row.created_at)
  };
}

async function resolveOutboundBySid(db, messageSid) {
  const sid = cleanString(messageSid);
  if (!sid) return null;
  const [customer, rcsDispatch, notification] = await Promise.all([
    safeFirst(
      db,
      `SELECT *
       FROM customer_message_log
       WHERE twilio_message_sid = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      sid
    ),
    safeFirst(
      db,
      `SELECT *
       FROM rcs_message_dispatches
       WHERE twilio_message_sid = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      sid
    ),
    safeFirst(
      db,
      `SELECT *
       FROM notification_logs
       WHERE provider_message_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      sid
    )
  ]);
  return customerOutbound(customer)
    || rcsDispatchOutbound(rcsDispatch)
    || notificationOutbound(notification);
}

async function resolveLastOutbound(db, phone, payload = {}) {
  const direct = await resolveOutboundBySid(db, replyToSidFromPayload(payload));
  if (direct && phoneMatches(direct.recipientPhone, phone)) return direct;

  const [customer, rcsDispatch, notificationRows] = await Promise.all([
    safeFirst(
      db,
      `SELECT *
       FROM customer_message_log
       WHERE phone = ?
         AND twilio_message_sid IS NOT NULL
         AND twilio_message_sid <> ''
       ORDER BY created_at DESC
       LIMIT 1`,
      phone
    ),
    safeFirst(
      db,
      `SELECT *
       FROM rcs_message_dispatches
       WHERE recipient_phone = ?
         AND twilio_message_sid IS NOT NULL
         AND twilio_message_sid <> ''
       ORDER BY created_at DESC
       LIMIT 1`,
      phone
    ),
    safeAll(
      db,
      `SELECT *
       FROM notification_logs
       WHERE channel = 'sms'
         AND provider_message_id IS NOT NULL
         AND provider_message_id <> ''
       ORDER BY created_at DESC
       LIMIT 250`
    )
  ]);
  const notification = notificationRows.find((item) => phoneMatches(item.recipient, phone));
  const candidates = [
    customerOutbound(customer),
    rcsDispatchOutbound(rcsDispatch),
    notificationOutbound(notification)
  ].filter(Boolean);
  candidates.sort((left, right) => right.sentAt.localeCompare(left.sentAt));
  return candidates[0] || emptyOutbound();
}

function conversationRow(row = {}) {
  return {
    id: cleanString(row.id),
    phone: cleanString(row.phone),
    contactType: cleanString(row.contact_type || "unknown"),
    userId: cleanString(row.user_id),
    employeeId: cleanString(row.employee_id),
    customerId: cleanString(row.customer_id),
    contactName: cleanString(row.contact_name),
    channel: cleanString(row.channel || "sms"),
    lastOutboundMessageSid: cleanString(row.last_outbound_message_sid),
    lastOutboundTemplateKey: cleanString(row.last_outbound_template_key),
    lastEventId: cleanString(row.last_event_id),
    openIntent: cleanString(row.open_intent),
    awaitingField: cleanString(row.awaiting_field),
    status: cleanString(row.status || "open"),
    humanTakeover: Boolean(Number(row.human_takeover || 0)),
    consentStatus: cleanString(row.consent_status || "unknown"),
    lastActivityAt: cleanString(row.last_activity_at),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function messageRow(row = {}) {
  return {
    id: cleanString(row.id),
    conversationId: cleanString(row.conversation_id),
    direction: cleanString(row.direction),
    channel: cleanString(row.channel || "sms"),
    twilioMessageSid: cleanString(row.twilio_message_sid),
    relatedOutboundMessageSid: cleanString(row.related_outbound_message_sid),
    body: cleanString(row.body),
    media: parseJson(row.media_json, []),
    status: cleanString(row.status),
    senderType: cleanString(row.sender_type || "unknown"),
    intent: cleanString(row.intent),
    confidence: Number(row.confidence || 0),
    responseMode: cleanString(row.response_mode),
    replyText: cleanString(row.reply_text),
    requestedTool: cleanString(row.requested_tool),
    toolArguments: parseJson(row.tool_arguments_json, {}),
    requiresHuman: Boolean(Number(row.requires_human || 0)),
    reason: cleanString(row.reason),
    openAiResponseId: cleanString(row.openai_response_id),
    openAiModel: cleanString(row.openai_model),
    processingAttempts: Number(row.processing_attempts || 0),
    nextRetryAt: cleanString(row.next_retry_at),
    errorCode: cleanString(row.error_code),
    errorMessage: cleanString(row.error_message),
    receivedAt: cleanString(row.received_at),
    processedAt: cleanString(row.processed_at),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function requestRow(row = {}) {
  return {
    id: cleanString(row.id),
    conversationId: cleanString(row.conversation_id),
    messageId: cleanString(row.message_id),
    requestType: cleanString(row.request_type),
    status: cleanString(row.status),
    contactType: cleanString(row.contact_type),
    userId: cleanString(row.user_id),
    customerId: cleanString(row.customer_id),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    summary: cleanString(row.summary),
    details: parseJson(row.details_json, {}),
    assignedToUserId: cleanString(row.assigned_to_user_id),
    idempotencyKey: cleanString(row.idempotency_key),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function toolRunRow(row = {}) {
  return {
    id: cleanString(row.id),
    conversationId: cleanString(row.conversation_id),
    messageId: cleanString(row.message_id),
    toolName: cleanString(row.tool_name),
    arguments: parseJson(row.arguments_json, {}),
    executionMode: cleanString(row.execution_mode),
    status: cleanString(row.status),
    idempotencyKey: cleanString(row.idempotency_key),
    result: parseJson(row.result_json, {}),
    errorCode: cleanString(row.error_code),
    errorMessage: cleanString(row.error_message),
    actorType: cleanString(row.actor_type),
    actorId: cleanString(row.actor_id),
    startedAt: cleanString(row.started_at),
    finishedAt: cleanString(row.finished_at)
  };
}

function eventRow(row = {}) {
  return {
    id: cleanString(row.id),
    conversationId: cleanString(row.conversation_id),
    messageId: cleanString(row.message_id),
    eventType: cleanString(row.event_type),
    status: cleanString(row.status),
    detail: cleanString(row.detail),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: cleanString(row.created_at)
  };
}

function reviewSendGrantRow(row = {}) {
  return {
    id: cleanString(row.id),
    conversationId: cleanString(row.conversation_id),
    inboundMessageId: cleanString(row.inbound_message_id),
    actorUserId: cleanString(row.actor_user_id),
    actorName: cleanString(row.actor_name),
    recipientPhone: cleanString(row.recipient_phone),
    recipientPhoneHash: cleanString(row.recipient_phone_hash),
    channel: cleanString(row.channel || "sms"),
    intent: cleanString(row.intent),
    replyText: cleanString(row.reply_text),
    replyTextHash: cleanString(row.reply_text_hash),
    status: cleanString(row.status),
    expiresAt: cleanString(row.expires_at),
    claimedAt: cleanString(row.claimed_at),
    cancelledAt: cleanString(row.cancelled_at),
    providerMessageSid: cleanString(row.provider_message_sid),
    providerStatus: cleanString(row.provider_status),
    errorMessage: cleanString(row.error_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

export async function appendRcsSmsEvent(env, input = {}) {
  const db = database(env, true);
  const id = cleanString(input.id) || randomId("rcs-sms-event");
  const createdAt = cleanString(input.createdAt) || nowIso();
  try {
    await db.prepare(`
      INSERT INTO rcs_sms_events (
        id, conversation_id, message_id, event_type, status, detail, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      nullableString(input.conversationId),
      nullableString(input.messageId),
      cleanString(input.eventType || "event"),
      cleanString(input.status || "recorded"),
      nullableString(input.detail),
      safeJson(input.metadata || {}),
      createdAt
    ).run();
    return { id, createdAt };
  } catch (error) {
    throw dbError(error);
  }
}

export async function ingestRcsSmsInbound(env, payload = {}) {
  const db = database(env, true);
  const coreDb = identityDatabase(env);
  const from = cleanString(payload.From || payload.from || payload.phone);
  const phone = normalizeCustomerPhone(from);
  const twilioMessageSid = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid);
  const body = cleanString(payload.Body || payload.body);
  if (!phone) {
    throw new RcsSmsAutopilotStoreError(
      "Příchozí zpráva nemá validní telefon.",
      400,
      "rcs_sms_inbound_phone_invalid"
    );
  }
  if (!twilioMessageSid) {
    throw new RcsSmsAutopilotStoreError(
      "Příchozí zpráva nemá Twilio Message SID.",
      400,
      "rcs_sms_inbound_sid_missing"
    );
  }

  try {
    const existing = await db
      .prepare("SELECT * FROM rcs_sms_messages WHERE twilio_message_sid = ? LIMIT 1")
      .bind(twilioMessageSid)
      .first();
    if (existing?.id) {
      return {
        duplicate: true,
        message: messageRow(existing),
        conversationId: cleanString(existing.conversation_id)
      };
    }

    const [identity, lastOutbound] = await Promise.all([
      resolveIdentity(coreDb, db, phone),
      resolveLastOutbound(db, phone, payload)
    ]);
    const existingConversation = await db
      .prepare("SELECT * FROM rcs_sms_conversations WHERE phone = ? LIMIT 1")
      .bind(phone)
      .first();
    const conversationId = cleanString(existingConversation?.id) || randomId("rcs-sms-conversation");
    const messageId = randomId("rcs-sms-message");
    const channel = channelFromPayload(payload);
    const now = nowIso();

    await db.prepare(`
      INSERT INTO rcs_sms_conversations (
        id, phone, contact_type, user_id, employee_id, customer_id, contact_name, channel,
        last_outbound_message_sid, last_outbound_template_key, last_event_id,
        status, human_takeover, consent_status, last_activity_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        contact_type = excluded.contact_type,
        user_id = excluded.user_id,
        employee_id = excluded.employee_id,
        customer_id = excluded.customer_id,
        contact_name = excluded.contact_name,
        channel = excluded.channel,
        last_outbound_message_sid = COALESCE(excluded.last_outbound_message_sid, rcs_sms_conversations.last_outbound_message_sid),
        last_outbound_template_key = COALESCE(excluded.last_outbound_template_key, rcs_sms_conversations.last_outbound_template_key),
        last_event_id = COALESCE(excluded.last_event_id, rcs_sms_conversations.last_event_id),
        consent_status = excluded.consent_status,
        last_activity_at = excluded.last_activity_at,
        updated_at = excluded.updated_at
    `).bind(
      conversationId,
      phone,
      identity.senderType,
      nullableString(identity.userId),
      nullableString(identity.employeeId),
      nullableString(identity.customerId),
      nullableString(identity.contactName),
      channel,
      nullableString(lastOutbound.messageSid),
      nullableString(lastOutbound.templateKey),
      nullableString(lastOutbound.eventId),
      cleanString(identity.consentStatus || "unknown"),
      now,
      now,
      now
    ).run();

    const result = await db.prepare(`
      INSERT OR IGNORE INTO rcs_sms_messages (
        id, conversation_id, direction, channel, twilio_message_sid,
        related_outbound_message_sid, body, media_json, status, sender_type,
        received_at, created_at, updated_at
      ) VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?)
    `).bind(
      messageId,
      conversationId,
      channel,
      twilioMessageSid,
      nullableString(lastOutbound.messageSid),
      body,
      safeJson(mediaFromPayload(payload), []),
      identity.senderType,
      now,
      now,
      now
    ).run();

    const inserted = Number(result?.meta?.changes ?? result?.changes ?? 1) > 0;
    if (!inserted) {
      const duplicate = await db
        .prepare("SELECT * FROM rcs_sms_messages WHERE twilio_message_sid = ? LIMIT 1")
        .bind(twilioMessageSid)
        .first();
      return {
        duplicate: true,
        message: messageRow(duplicate || {}),
        conversationId: cleanString(duplicate?.conversation_id || conversationId)
      };
    }

    await appendRcsSmsEvent(env, {
      conversationId,
      messageId,
      eventType: "inbound_stored",
      status: "received",
      detail: "Příchozí RCS/SMS odpověď byla idempotentně uložená.",
      metadata: {
        channel,
        senderType: identity.senderType,
        identityMatch: identity.matchReason,
        hasOriginalOutbound: Boolean(lastOutbound.messageSid),
        mediaCount: mediaFromPayload(payload).length
      }
    });

    return {
      duplicate: false,
      message: {
        id: messageId,
        conversationId,
        body,
        channel,
        twilioMessageSid,
        senderType: identity.senderType,
        media: mediaFromPayload(payload)
      },
      conversationId,
      context: {
        ...identity,
        phone,
        lastOutboundMessageSid: lastOutbound.messageSid,
        lastOutboundTemplateKey: lastOutbound.templateKey,
        lastEventId: lastOutbound.eventId,
        lastOutboundUserId: lastOutbound.userId,
        lastOutboundCustomerId: lastOutbound.customerId,
        relatedEntityType: lastOutbound.relatedEntityType,
        relatedEntityId: lastOutbound.relatedEntityId,
        lastOutboundBody: lastOutbound.body,
        lastOutboundAt: lastOutbound.sentAt,
        outboundVariables: lastOutbound.variables
      }
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function getRcsSmsMessageForProcessing(env, messageId) {
  const db = database(env, true);
  try {
    const row = await db.prepare(`
      SELECT
        m.*,
        c.phone,
        c.contact_type,
        c.user_id,
        c.employee_id,
        c.customer_id,
        c.contact_name,
        c.last_outbound_message_sid,
        c.last_outbound_template_key,
        c.last_event_id,
        c.human_takeover,
        c.consent_status
      FROM rcs_sms_messages m
      JOIN rcs_sms_conversations c ON c.id = m.conversation_id
      WHERE m.id = ?
      LIMIT 1
    `).bind(cleanString(messageId)).first();
    if (!row?.id) {
      throw new RcsSmsAutopilotStoreError(
        "Příchozí zpráva Autopilota nebyla nalezena.",
        404,
        "rcs_sms_message_not_found"
      );
    }
    const message = messageRow(row);
    const relatedOutboundMessageSid = cleanString(
      row.related_outbound_message_sid || row.last_outbound_message_sid
    );
    const outbound = await resolveOutboundBySid(db, relatedOutboundMessageSid);
    const actionGrant = relatedOutboundMessageSid
      ? await safeFirst(
        db,
        `SELECT id
         FROM rcs_sms_action_grants
         WHERE outbound_message_sid = ?
           AND phone = ?
           AND status = 'active'
           AND expires_at > ?
         LIMIT 1`,
        relatedOutboundMessageSid,
        cleanString(row.phone),
        nowIso()
      )
      : null;
    return {
      message,
      context: {
        senderType: cleanString(row.contact_type || message.senderType),
        phone: cleanString(row.phone),
        userId: cleanString(row.user_id),
        employeeId: cleanString(row.employee_id),
        customerId: cleanString(row.customer_id),
        contactName: cleanString(row.contact_name),
        lastOutboundMessageSid: relatedOutboundMessageSid,
        lastOutboundTemplateKey: cleanString(row.last_outbound_template_key),
        lastEventId: cleanString(row.last_event_id),
        lastOutboundUserId: cleanString(outbound?.userId),
        lastOutboundCustomerId: cleanString(outbound?.customerId),
        relatedEntityType: cleanString(outbound?.relatedEntityType),
        relatedEntityId: cleanString(outbound?.relatedEntityId),
        lastOutboundBody: cleanString(outbound?.body),
        lastOutboundAt: cleanString(outbound?.sentAt),
        outboundVariables: outbound?.variables && typeof outbound.variables === "object"
          ? outbound.variables
          : {},
        hasActionGrant: Boolean(actionGrant?.id),
        humanTakeover: Boolean(Number(row.human_takeover || 0)),
        consentStatus: cleanString(row.consent_status)
      }
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function insertRcsSmsOutboundMessage(env, input = {}) {
  const db = database(env, true);
  const id = cleanString(input.id) || randomId("rcs-sms-message");
  const now = cleanString(input.createdAt) || nowIso();
  try {
    const existing = cleanString(input.twilioMessageSid)
      ? await db
        .prepare("SELECT * FROM rcs_sms_messages WHERE twilio_message_sid = ? LIMIT 1")
        .bind(cleanString(input.twilioMessageSid))
        .first()
      : null;
    if (existing?.id) return { ...messageRow(existing), duplicate: true };
    await db.prepare(`
      INSERT INTO rcs_sms_messages (
        id, conversation_id, direction, channel, twilio_message_sid,
        body, status, sender_type, intent, response_mode,
        created_at, updated_at, processed_at
      ) VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      cleanString(input.conversationId),
      cleanString(input.channel || "sms"),
      nullableString(input.twilioMessageSid),
      cleanString(input.body),
      cleanString(input.status || "pending"),
      cleanString(input.senderType || "system"),
      nullableString(input.intent),
      cleanString(input.responseMode || "automatic"),
      now,
      now,
      now
    ).run();
    return {
      id,
      conversationId: cleanString(input.conversationId),
      direction: "outbound",
      channel: cleanString(input.channel || "sms"),
      twilioMessageSid: cleanString(input.twilioMessageSid),
      body: cleanString(input.body),
      status: cleanString(input.status || "pending"),
      responseMode: cleanString(input.responseMode || "automatic"),
      createdAt: now,
      duplicate: false
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function listRcsSmsMessageHistory(env, conversationId, limit = 10) {
  const db = database(env, true);
  try {
    const result = await db.prepare(`
      SELECT *
      FROM rcs_sms_messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(cleanString(conversationId), Math.max(1, Math.min(Number(limit || 10), 50))).all();
    return (result.results || []).map(messageRow).reverse();
  } catch (error) {
    throw dbError(error);
  }
}

export async function setRcsSmsMessageState(env, messageId, patch = {}) {
  const db = database(env, true);
  const now = nowIso();
  try {
    await db.prepare(`
      UPDATE rcs_sms_messages
      SET
        status = COALESCE(?, status),
        sender_type = COALESCE(?, sender_type),
        intent = COALESCE(?, intent),
        confidence = COALESCE(?, confidence),
        response_mode = COALESCE(?, response_mode),
        reply_text = COALESCE(?, reply_text),
        requested_tool = COALESCE(?, requested_tool),
        tool_arguments_json = CASE WHEN ? IS NULL THEN tool_arguments_json ELSE ? END,
        requires_human = COALESCE(?, requires_human),
        reason = COALESCE(?, reason),
        openai_response_id = COALESCE(?, openai_response_id),
        openai_model = COALESCE(?, openai_model),
        processing_attempts = processing_attempts + ?,
        next_retry_at = ?,
        error_code = ?,
        error_message = ?,
        processed_at = COALESCE(?, processed_at),
        updated_at = ?
      WHERE id = ?
    `).bind(
      nullableString(patch.status),
      nullableString(patch.senderType),
      nullableString(patch.intent),
      Number.isFinite(Number(patch.confidence)) ? Number(patch.confidence) : null,
      nullableString(patch.responseMode),
      patch.replyText === undefined ? null : cleanString(patch.replyText),
      nullableString(patch.requestedTool),
      patch.toolArguments === undefined ? null : "json",
      patch.toolArguments === undefined ? null : safeJson(patch.toolArguments, {}),
      patch.requiresHuman === undefined ? null : (patch.requiresHuman ? 1 : 0),
      patch.reason === undefined ? null : cleanString(patch.reason),
      nullableString(patch.openAiResponseId),
      nullableString(patch.openAiModel),
      patch.incrementAttempts ? 1 : 0,
      nullableString(patch.nextRetryAt),
      nullableString(patch.errorCode),
      nullableString(patch.errorMessage),
      patch.processed ? now : null,
      now,
      cleanString(messageId)
    ).run();
    return { id: cleanString(messageId), updatedAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function setRcsSmsConversationState(env, conversationId, patch = {}) {
  const db = database(env, true);
  const now = nowIso();
  try {
    await db.prepare(`
      UPDATE rcs_sms_conversations
      SET
        status = COALESCE(?, status),
        open_intent = COALESCE(?, open_intent),
        awaiting_field = CASE WHEN ? IS NULL THEN awaiting_field ELSE ? END,
        human_takeover = COALESCE(?, human_takeover),
        contact_type = COALESCE(?, contact_type),
        consent_status = COALESCE(?, consent_status),
        last_activity_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      nullableString(patch.status),
      nullableString(patch.openIntent),
      patch.awaitingField === undefined ? null : "field",
      patch.awaitingField === undefined ? null : cleanString(patch.awaitingField),
      patch.humanTakeover === undefined ? null : (patch.humanTakeover ? 1 : 0),
      nullableString(patch.contactType),
      nullableString(patch.consentStatus),
      now,
      now,
      cleanString(conversationId)
    ).run();
    return { id: cleanString(conversationId), updatedAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function refreshRcsSmsConversationIdentity(env, conversationId) {
  const db = database(env, true);
  const id = cleanString(conversationId);
  try {
    const conversation = await db
      .prepare("SELECT id, phone FROM rcs_sms_conversations WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    if (!conversation?.id) {
      throw new RcsSmsAutopilotStoreError(
        "RCS/SMS konverzace nebyla nalezena.",
        404,
        "rcs_sms_conversation_not_found"
      );
    }
    const identity = await resolveIdentity(identityDatabase(env), db, cleanString(conversation.phone));
    const now = nowIso();
    await db.prepare(`
      UPDATE rcs_sms_conversations
      SET
        contact_type = ?,
        user_id = ?,
        employee_id = ?,
        customer_id = ?,
        contact_name = ?,
        consent_status = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      cleanString(identity.senderType || "unknown"),
      nullableString(identity.userId),
      nullableString(identity.employeeId),
      nullableString(identity.customerId),
      nullableString(identity.contactName),
      cleanString(identity.consentStatus || "unknown"),
      now,
      id
    ).run();
    return {
      conversationId: id,
      contactType: cleanString(identity.senderType || "unknown"),
      contactName: cleanString(identity.contactName),
      matchReason: cleanString(identity.matchReason)
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function createRcsSmsRequest(env, input = {}) {
  const db = database(env, true);
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new RcsSmsAutopilotStoreError(
      "Požadavek Autopilota nemá idempotentní klíč.",
      400,
      "rcs_sms_request_idempotency_missing"
    );
  }
  try {
    const existing = await db
      .prepare("SELECT * FROM rcs_sms_requests WHERE idempotency_key = ? LIMIT 1")
      .bind(idempotencyKey)
      .first();
    if (existing?.id) return { ...requestRow(existing), duplicate: true };
    const id = randomId("rcs-sms-request");
    const now = nowIso();
    await db.prepare(`
      INSERT INTO rcs_sms_requests (
        id, conversation_id, message_id, request_type, status, contact_type,
        user_id, customer_id, related_entity_type, related_entity_id,
        summary, details_json, assigned_to_user_id, idempotency_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      cleanString(input.conversationId),
      cleanString(input.messageId),
      cleanString(input.requestType),
      cleanString(input.status || "open"),
      cleanString(input.contactType || "unknown"),
      nullableString(input.userId),
      nullableString(input.customerId),
      nullableString(input.relatedEntityType),
      nullableString(input.relatedEntityId),
      cleanString(input.summary),
      safeJson(input.details || {}),
      nullableString(input.assignedToUserId),
      idempotencyKey,
      now,
      now
    ).run();
    return {
      id,
      requestType: cleanString(input.requestType),
      status: cleanString(input.status || "open"),
      idempotencyKey,
      createdAt: now,
      duplicate: false
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function findRcsSmsRequestByIdempotency(env, idempotencyKey) {
  const db = database(env, true);
  try {
    const row = await db
      .prepare("SELECT * FROM rcs_sms_requests WHERE idempotency_key = ? LIMIT 1")
      .bind(cleanString(idempotencyKey))
      .first();
    return row ? requestRow(row) : null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function setRcsSmsRequestStatus(env, requestId, status) {
  const db = database(env, true);
  const now = nowIso();
  try {
    await db.prepare(`
      UPDATE rcs_sms_requests
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).bind(cleanString(status), now, cleanString(requestId)).run();
    return { id: cleanString(requestId), status: cleanString(status), updatedAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function recordRcsSmsToolRun(env, input = {}) {
  const db = database(env, true);
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new RcsSmsAutopilotStoreError(
      "Běh nástroje nemá idempotentní klíč.",
      400,
      "rcs_sms_tool_idempotency_missing"
    );
  }
  try {
    const existing = await db
      .prepare("SELECT * FROM rcs_sms_tool_runs WHERE idempotency_key = ? LIMIT 1")
      .bind(idempotencyKey)
      .first();
    if (existing?.id) return { ...toolRunRow(existing), duplicate: true };
    const id = randomId("rcs-sms-tool");
    const startedAt = nowIso();
    const finishedAt = cleanString(input.finishedAt) || (input.status === "pending" ? null : startedAt);
    await db.prepare(`
      INSERT INTO rcs_sms_tool_runs (
        id, conversation_id, message_id, tool_name, arguments_json,
        execution_mode, status, idempotency_key, result_json,
        error_code, error_message, actor_type, actor_id, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      cleanString(input.conversationId),
      cleanString(input.messageId),
      cleanString(input.toolName),
      safeJson(input.arguments || {}),
      cleanString(input.executionMode || "automatic"),
      cleanString(input.status || "completed"),
      idempotencyKey,
      safeJson(input.result || {}),
      nullableString(input.errorCode),
      nullableString(input.errorMessage),
      cleanString(input.actorType || "system"),
      nullableString(input.actorId),
      startedAt,
      finishedAt
    ).run();
    return {
      id,
      toolName: cleanString(input.toolName),
      status: cleanString(input.status || "completed"),
      result: input.result || {},
      duplicate: false
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function findRcsSmsToolRunByIdempotency(env, idempotencyKey) {
  const db = database(env, true);
  try {
    const row = await db
      .prepare("SELECT * FROM rcs_sms_tool_runs WHERE idempotency_key = ? LIMIT 1")
      .bind(cleanString(idempotencyKey))
      .first();
    return row ? toolRunRow(row) : null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function findRcsSmsActionGrant(env, input = {}) {
  const db = database(env, true);
  try {
    const row = await db.prepare(`
      SELECT *
      FROM rcs_sms_action_grants
      WHERE outbound_message_sid = ?
        AND phone = ?
        AND action_name = ?
        AND status = 'active'
        AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(
      cleanString(input.outboundMessageSid),
      cleanString(input.phone),
      cleanString(input.actionName),
      nowIso()
    ).first();
    return row ? {
      id: cleanString(row.id),
      outboundMessageSid: cleanString(row.outbound_message_sid),
      phone: cleanString(row.phone),
      actionName: cleanString(row.action_name),
      objectType: cleanString(row.object_type),
      objectId: cleanString(row.object_id),
      arguments: parseJson(row.arguments_json, {}),
      status: cleanString(row.status),
      expiresAt: cleanString(row.expires_at),
      idempotencyKey: cleanString(row.idempotency_key)
    } : null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function useRcsSmsActionGrant(env, grantId) {
  const db = database(env, true);
  const now = nowIso();
  try {
    const result = await db.prepare(`
      UPDATE rcs_sms_action_grants
      SET status = 'used', used_at = ?
      WHERE id = ? AND status = 'active' AND expires_at > ?
    `).bind(now, cleanString(grantId), now).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0) === 1;
  } catch (error) {
    throw dbError(error);
  }
}

export async function getRcsSmsReviewCandidate(env, conversationId) {
  const db = database(env, true);
  try {
    const conversation = await db
      .prepare("SELECT * FROM rcs_sms_conversations WHERE id = ? LIMIT 1")
      .bind(cleanString(conversationId))
      .first();
    if (!conversation?.id) {
      throw new RcsSmsAutopilotStoreError(
        "RCS/SMS konverzace nebyla nalezena.",
        404,
        "rcs_sms_conversation_not_found"
      );
    }
    const message = await db.prepare(`
      SELECT *
      FROM rcs_sms_messages
      WHERE conversation_id = ? AND direction = 'inbound'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).bind(cleanString(conversationId)).first();
    return {
      conversation: conversationRow(conversation),
      message: message?.id ? messageRow(message) : null
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function createRcsSmsReviewSendGrant(env, input = {}) {
  const db = database(env, true);
  const now = cleanString(input.createdAt) || nowIso();
  const id = cleanString(input.id) || randomId("rcs-sms-review-send");
  try {
    const claimed = await db.prepare(`
      SELECT id
      FROM rcs_sms_review_send_grants
      WHERE conversation_id = ? AND status = 'claimed'
      LIMIT 1
    `).bind(cleanString(input.conversationId)).first();
    if (claimed?.id) {
      throw new RcsSmsAutopilotStoreError(
        "Odeslání této konverzace už právě probíhá.",
        409,
        "rcs_sms_review_send_in_progress"
      );
    }
    await db.prepare(`
      UPDATE rcs_sms_review_send_grants
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE conversation_id = ?
        AND status = 'confirmation_pending'
    `).bind(
      now,
      now,
      cleanString(input.conversationId)
    ).run();
    await db.prepare(`
      INSERT INTO rcs_sms_review_send_grants (
        id, conversation_id, inbound_message_id, actor_user_id, actor_name,
        recipient_phone, recipient_phone_hash, channel, intent,
        reply_text, reply_text_hash, status, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmation_pending', ?, ?, ?)
    `).bind(
      id,
      cleanString(input.conversationId),
      cleanString(input.inboundMessageId),
      cleanString(input.actorUserId),
      nullableString(input.actorName),
      cleanString(input.recipientPhone),
      cleanString(input.recipientPhoneHash),
      cleanString(input.channel || "sms"),
      nullableString(input.intent),
      cleanString(input.replyText),
      cleanString(input.replyTextHash),
      cleanString(input.expiresAt),
      now,
      now
    ).run();
    return reviewSendGrantRow(await db
      .prepare("SELECT * FROM rcs_sms_review_send_grants WHERE id = ? LIMIT 1")
      .bind(id)
      .first());
  } catch (error) {
    if (/unique constraint failed.*rcs_sms_review_send_grants/i.test(cleanString(error?.message))) {
      throw new RcsSmsAutopilotStoreError(
        "Odeslání této konverzace už právě probíhá nebo čeká na potvrzení.",
        409,
        "rcs_sms_review_send_in_progress"
      );
    }
    throw dbError(error);
  }
}

export async function getRcsSmsReviewSendGrant(env, grantId) {
  const db = database(env, true);
  try {
    const row = await db
      .prepare("SELECT * FROM rcs_sms_review_send_grants WHERE id = ? LIMIT 1")
      .bind(cleanString(grantId))
      .first();
    return row?.id ? reviewSendGrantRow(row) : null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function cancelRcsSmsReviewSendGrant(env, input = {}) {
  const db = database(env, true);
  const now = nowIso();
  try {
    const result = await db.prepare(`
      UPDATE rcs_sms_review_send_grants
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ?
        AND actor_user_id = ?
        AND status = 'confirmation_pending'
    `).bind(
      now,
      now,
      cleanString(input.grantId),
      cleanString(input.actorUserId)
    ).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0) === 1;
  } catch (error) {
    throw dbError(error);
  }
}

export async function expireRcsSmsReviewSendGrant(env, grantId) {
  const db = database(env, true);
  const now = nowIso();
  try {
    const result = await db.prepare(`
      UPDATE rcs_sms_review_send_grants
      SET status = 'expired', updated_at = ?
      WHERE id = ? AND status = 'confirmation_pending'
    `).bind(now, cleanString(grantId)).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0) === 1;
  } catch (error) {
    throw dbError(error);
  }
}

export async function claimRcsSmsReviewSendGrant(env, input = {}) {
  const db = database(env, true);
  const now = nowIso();
  try {
    const result = await db.prepare(`
      UPDATE rcs_sms_review_send_grants
      SET status = 'claimed', claimed_at = ?, updated_at = ?
      WHERE id = ?
        AND actor_user_id = ?
        AND status = 'confirmation_pending'
        AND expires_at > ?
    `).bind(
      now,
      now,
      cleanString(input.grantId),
      cleanString(input.actorUserId),
      now
    ).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0) === 1;
  } catch (error) {
    throw dbError(error);
  }
}

export async function updateRcsSmsReviewSendGrant(env, grantId, patch = {}) {
  const db = database(env, true);
  const now = nowIso();
  try {
    await db.prepare(`
      UPDATE rcs_sms_review_send_grants
      SET
        status = COALESCE(?, status),
        provider_message_sid = COALESCE(?, provider_message_sid),
        provider_status = COALESCE(?, provider_status),
        error_message = CASE WHEN ? IS NULL THEN error_message ELSE ? END,
        updated_at = ?
      WHERE id = ?
    `).bind(
      nullableString(patch.status),
      nullableString(patch.providerMessageSid),
      nullableString(patch.providerStatus),
      patch.errorMessage === undefined ? null : "error",
      patch.errorMessage === undefined ? null : cleanString(patch.errorMessage),
      now,
      cleanString(grantId)
    ).run();
    return getRcsSmsReviewSendGrant(env, grantId);
  } catch (error) {
    throw dbError(error);
  }
}

function normalizeListParams(params) {
  const page = Math.max(1, Number.parseInt(params?.get("page") || "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(Number.parseInt(params?.get("pageSize") || "30", 10) || 30, MAX_PAGE_SIZE));
  return {
    page,
    pageSize,
    contactType: cleanString(params?.get("contactType")),
    status: cleanString(params?.get("status")),
    search: cleanString(params?.get("search"))
  };
}

export async function listRcsSmsConversations(env, params = new URLSearchParams()) {
  const db = database(env, true);
  const filters = normalizeListParams(params);
  const clauses = [];
  const binds = [];
  if (filters.contactType) {
    clauses.push("c.contact_type = ?");
    binds.push(filters.contactType);
  }
  if (filters.status) {
    clauses.push("c.status = ?");
    binds.push(filters.status);
  }
  if (filters.search) {
    clauses.push("(c.phone LIKE ? OR c.contact_name LIKE ? OR c.open_intent LIKE ? OR latest.body LIKE ?)");
    const pattern = `%${filters.search}%`;
    binds.push(pattern, pattern, pattern, pattern);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (filters.page - 1) * filters.pageSize;

  try {
    const count = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM rcs_sms_conversations c
      LEFT JOIN rcs_sms_messages latest
        ON latest.id = (
          SELECT id FROM rcs_sms_messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        )
      ${where}
    `).bind(...binds).first();
    const result = await db.prepare(`
      SELECT
        c.*,
        latest.id AS latest_message_id,
        latest.body AS latest_message_body,
        latest.direction AS latest_message_direction,
        latest.status AS latest_message_status,
        latest.intent AS latest_message_intent,
        latest.requires_human AS latest_requires_human,
        latest.created_at AS latest_message_at
      FROM rcs_sms_conversations c
      LEFT JOIN rcs_sms_messages latest
        ON latest.id = (
          SELECT id FROM rcs_sms_messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        )
      ${where}
      ORDER BY c.last_activity_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, filters.pageSize, offset).all();
    return {
      items: (result.results || []).map((row) => ({
        ...conversationRow(row),
        latestMessage: {
          id: cleanString(row.latest_message_id),
          body: cleanString(row.latest_message_body),
          direction: cleanString(row.latest_message_direction),
          status: cleanString(row.latest_message_status),
          intent: cleanString(row.latest_message_intent),
          requiresHuman: Boolean(Number(row.latest_requires_human || 0)),
          createdAt: cleanString(row.latest_message_at)
        }
      })),
      total: Number(count?.total || 0),
      page: filters.page,
      pageSize: filters.pageSize,
      filters
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function getRcsSmsConversationDetail(env, conversationId) {
  const db = database(env, true);
  try {
    const conversation = await db
      .prepare("SELECT * FROM rcs_sms_conversations WHERE id = ? LIMIT 1")
      .bind(cleanString(conversationId))
      .first();
    if (!conversation?.id) {
      throw new RcsSmsAutopilotStoreError(
        "RCS/SMS konverzace nebyla nalezena.",
        404,
        "rcs_sms_conversation_not_found"
      );
    }
    const messages = await db
      .prepare("SELECT * FROM rcs_sms_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200")
      .bind(conversationId)
      .all();
    const optionalPart = async (name, loader, fallback) => {
      try {
        return await loader();
      } catch (error) {
        console.error("rcs_sms_autopilot.optional_detail_failed", {
          part: name,
          message: cleanString(error?.message).slice(0, 300)
        });
        return fallback;
      }
    };
    const [requests, toolRuns, events, originalOutbound] = await Promise.all([
      optionalPart(
        "requests",
        () => db.prepare("SELECT * FROM rcs_sms_requests WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 100").bind(conversationId).all(),
        { results: [] }
      ),
      optionalPart(
        "tool_runs",
        () => db.prepare("SELECT * FROM rcs_sms_tool_runs WHERE conversation_id = ? ORDER BY started_at DESC LIMIT 100").bind(conversationId).all(),
        { results: [] }
      ),
      optionalPart(
        "events",
        () => db.prepare("SELECT * FROM rcs_sms_events WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 200").bind(conversationId).all(),
        { results: [] }
      ),
      optionalPart(
        "original_outbound",
        () => resolveOutboundBySid(db, conversation.last_outbound_message_sid),
        null
      )
    ]);
    return {
      conversation: conversationRow(conversation),
      originalOutbound: originalOutbound ? {
        twilioMessageSid: cleanString(originalOutbound.messageSid),
        templateKey: cleanString(originalOutbound.templateKey),
        channel: cleanString(originalOutbound.channel),
        body: cleanString(originalOutbound.body),
        status: cleanString(originalOutbound.status),
        relatedEntityType: cleanString(originalOutbound.relatedEntityType),
        relatedEntityId: cleanString(originalOutbound.relatedEntityId),
        eventId: cleanString(originalOutbound.eventId),
        variables: originalOutbound.variables && typeof originalOutbound.variables === "object"
          ? originalOutbound.variables
          : {},
        createdAt: cleanString(originalOutbound.sentAt)
      } : null,
      messages: (messages.results || []).map(messageRow),
      requests: (requests.results || []).map(requestRow),
      toolRuns: (toolRuns.results || []).map(toolRunRow),
      events: (events.results || []).map(eventRow)
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function getRcsSmsRuntimeConfig(env) {
  const db = database(env, true);
  try {
    const row = await db.prepare(`
      SELECT id, autopilot_enabled, outbound_enabled, updated_at
      FROM rcs_sms_runtime_config
      WHERE id = 'production'
      LIMIT 1
    `).first();
    return {
      id: cleanString(row?.id || "production"),
      autopilotEnabled: Boolean(Number(row?.autopilot_enabled || 0)),
      outboundEnabled: Boolean(Number(row?.outbound_enabled || 0)),
      updatedAt: cleanString(row?.updated_at)
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function rcsSmsAutopilotOperationalStatus(env) {
  const db = database(env, true);
  try {
    const [conversationCounts, messageCounts, requestCounts, lastEvent, runtimeConfig] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'human_takeover' THEN 1 ELSE 0 END) AS human_takeover,
          SUM(CASE WHEN contact_type = 'unknown' THEN 1 ELSE 0 END) AS unknown_contacts,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
        FROM rcs_sms_conversations
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('received', 'processing', 'processing_failed') THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied
        FROM rcs_sms_messages
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
        FROM rcs_sms_requests
      `).first(),
      db.prepare("SELECT * FROM rcs_sms_events ORDER BY created_at DESC LIMIT 1").first(),
      getRcsSmsRuntimeConfig(env)
    ]);
    return {
      database: {
        conversations: "DB_MESSAGES",
        identity: "DB_CORE",
        automationAudit: "DB_AUDIT",
        legacyWrites: "blocked"
      },
      runtimeConfig,
      counts: {
        conversations: Number(conversationCounts?.total || 0),
        humanTakeover: Number(conversationCounts?.human_takeover || 0),
        unknownContacts: Number(conversationCounts?.unknown_contacts || 0),
        errors: Number(conversationCounts?.errors || 0),
        messages: Number(messageCounts?.total || 0),
        pendingMessages: Number(messageCounts?.pending || 0),
        repliedMessages: Number(messageCounts?.replied || 0),
        requests: Number(requestCounts?.total || 0),
        openRequests: Number(requestCounts?.open || 0)
      },
      lastEvent: lastEvent ? eventRow(lastEvent) : null
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function listRcsSmsRetryCandidates(env, limit = 20) {
  const db = database(env, true);
  try {
    const result = await db.prepare(`
      SELECT id
      FROM rcs_sms_messages
      WHERE direction = 'inbound'
        AND status IN ('received', 'processing_failed')
        AND processing_attempts < 3
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `).bind(nowIso(), Math.max(1, Math.min(Number(limit || 20), 100))).all();
    return (result.results || []).map((row) => cleanString(row.id)).filter(Boolean);
  } catch (error) {
    throw dbError(error);
  }
}

export const __test = {
  channelFromPayload,
  conversationRow,
  mediaFromPayload,
  messageRow,
  normalizeListParams,
  phoneMatches,
  reviewSendGrantRow,
  replyToSidFromPayload,
  resolveIdentity,
  resolveLastOutbound,
  resolveOutboundBySid
};
