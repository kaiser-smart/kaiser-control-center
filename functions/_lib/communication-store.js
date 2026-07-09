const DB_BINDING = "SMART_ODPADY_DB";
const OFFICIAL_FROM_EMAIL = "sarlota@kaiserservis.cz";
const OFFICIAL_FROM_NAME = "Šarlota Kaiser";
const DEFAULT_PROVIDER = "SendGrid";
const EVENT_LIMIT = 20;

export class CommunicationStoreError extends Error {
  constructor(message, status = 400, code = "communication_store_error") {
    super(message);
    this.name = "CommunicationStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new CommunicationStoreError(
      "Databáze komunikační infrastruktury není nastavená. Chybí Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "communication_database_missing"
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

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function truncate(value, length = 500) {
  const cleaned = cleanString(value).replace(/\s+/g, " ");
  return cleaned.length > length ? `${cleaned.slice(0, length - 3)}...` : cleaned;
}

function compactTokenPart(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizeEmail(value) {
  const email = lower(value).replace(/^.*<([^>]+)>.*$/, "$1").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function emailFromHeader(value) {
  const raw = cleanString(value);
  const match = raw.match(/<([^>]+)>/);
  return normalizeEmail(match ? match[1] : raw);
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (/no such table|communication_threads|communication_messages|communication_events|communication_unmatched_replies/i.test(message)) {
    return new CommunicationStoreError(
      "Tabulky komunikační infrastruktury nejsou v D1 připravené. Spusťte migraci 0031_create_communication_infrastructure.sql.",
      503,
      "communication_migration_missing"
    );
  }

  console.error("communication.store_failed", { message });
  return new CommunicationStoreError("Komunikační infrastruktura se teď nepodařila načíst nebo uložit.", 500, "communication_store_failed");
}

export function communicationEmailIdentity(env = {}, options = {}) {
  const configuredFrom = cleanString(env.KSO_EMAIL_FROM || env.EMAIL_FROM || env.ABSENCE_REPORT_EMAIL);
  const configuredReplyTo = cleanString(env.KSO_EMAIL_REPLY_TO || env.EMAIL_REPLY_TO);
  const requestedFromName = cleanString(options.fromName);

  return {
    fromName: cleanString(env.KSO_EMAIL_FROM_NAME) || OFFICIAL_FROM_NAME,
    fromEmail: OFFICIAL_FROM_EMAIL,
    replyTo: OFFICIAL_FROM_EMAIL,
    requestedFromName,
    configuredFrom,
    configuredReplyTo,
    replacedFrom: configuredFrom && lower(configuredFrom) !== OFFICIAL_FROM_EMAIL ? configuredFrom : "",
    replacedReplyTo: configuredReplyTo && lower(configuredReplyTo) !== OFFICIAL_FROM_EMAIL ? configuredReplyTo : ""
  };
}

export function communicationSmsConfig(env = {}) {
  const accountSid = cleanString(
    env.TWILIO_KAISER_ACCOUNT_SID ||
    env.KAISER_TWILIO_ACCOUNT_SID ||
    env.TWILIO_ACCOUNT_SID
  );
  const authToken = cleanString(
    env.TWILIO_KAISER_AUTH_TOKEN ||
    env.KAISER_TWILIO_AUTH_TOKEN ||
    env.TWILIO_AUTH_TOKEN
  );
  const messagingServiceSid = cleanString(
    env.TWILIO_KAISER_MESSAGING_SERVICE_SID ||
    env.KAISER_TWILIO_MESSAGING_SERVICE_SID ||
    env.TWILIO_MESSAGING_SERVICE_SID
  );
  const explicitKaiserConfig = Boolean(
    cleanString(env.TWILIO_KAISER_ACCOUNT_SID || env.KAISER_TWILIO_ACCOUNT_SID) ||
    cleanString(env.TWILIO_KAISER_MESSAGING_SERVICE_SID || env.KAISER_TWILIO_MESSAGING_SERVICE_SID)
  );
  const mode = lower(env.KSO_SMS_MODE || env.TWILIO_KAISER_MODE || env.KAISER_TWILIO_MODE || (accountSid && authToken && messagingServiceSid ? "live" : "off"));
  const normalizedMode = ["off", "test", "live"].includes(mode) ? mode : "off";

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    mode: normalizedMode,
    provider: "Twilio",
    projectName: "Kaiser",
    configSource: explicitKaiserConfig ? "kaiser" : (accountSid || messagingServiceSid ? "legacy" : "missing"),
    statusCallbackUrl: cleanString(env.TWILIO_KAISER_STATUS_CALLBACK_URL || env.KAISER_TWILIO_STATUS_CALLBACK_URL || env.KSO_TWILIO_STATUS_CALLBACK_URL),
    inboundWebhookTokenConfigured: Boolean(cleanString(env.TWILIO_KAISER_INBOUND_WEBHOOK_TOKEN || env.KAISER_TWILIO_INBOUND_WEBHOOK_TOKEN)),
    statusWebhookTokenConfigured: Boolean(cleanString(env.TWILIO_KAISER_STATUS_WEBHOOK_TOKEN || env.KAISER_TWILIO_STATUS_WEBHOOK_TOKEN))
  };
}

function normalizeOutbound(input = {}) {
  const moduleKey = cleanString(input.moduleKey || input.moduleId || "system");
  const entityType = cleanString(input.entityType || input.relatedEntityType || "communication");
  const entityId = cleanString(input.entityId || input.relatedEntityId);
  const auditId = cleanString(input.auditId) || randomId("comm-audit");
  const threadBase = [moduleKey, entityType, entityId || auditId].map(compactTokenPart).filter(Boolean).join(":");
  const threadId = cleanString(input.threadId) || `kso:${threadBase || auditId}`;
  const subjectToken = cleanString(input.subjectToken) || `KSO-${auditId.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase()}`;
  const messageId = cleanString(input.messageId) || `${auditId.replace(/[^a-zA-Z0-9-]/g, "")}@kso.kaiserservis.cz`;

  return {
    id: cleanString(input.id) || randomId("comm-message"),
    auditId,
    threadId,
    messageId,
    subjectToken,
    moduleKey,
    entityType,
    entityId,
    channel: cleanString(input.channel || "email"),
    direction: "outbound",
    provider: cleanString(input.provider || (input.channel === "sms" ? "Twilio" : DEFAULT_PROVIDER)),
    fromName: cleanString(input.fromName),
    fromAddress: cleanString(input.fromAddress),
    replyTo: cleanString(input.replyTo),
    toAddress: cleanString(input.toAddress || input.to),
    ccAddress: cleanString(input.ccAddress || input.cc),
    subject: cleanString(input.subject),
    bodyPreview: truncate(input.bodyPreview || input.messagePreview || input.subject),
    status: cleanString(input.status || "pending"),
    rawPayload: input.rawPayload || {},
    metadata: input.metadata || {}
  };
}

async function insertCommunicationEvent(db, event) {
  await db
    .prepare(`
      INSERT INTO communication_events (
        id,
        event_type,
        channel,
        module_key,
        entity_type,
        entity_id,
        thread_id,
        communication_message_id,
        status,
        detail,
        raw_payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      randomId("comm-event"),
      cleanString(event.eventType || "communication_event"),
      nullableString(event.channel),
      nullableString(event.moduleKey),
      nullableString(event.entityType),
      nullableString(event.entityId),
      nullableString(event.threadId),
      nullableString(event.communicationMessageId),
      cleanString(event.status || "recorded"),
      nullableString(event.detail),
      safeJson(event.rawPayload || {}),
      cleanString(event.createdAt) || nowIso()
    )
    .run();
}

export function communicationHeaders(audit = {}) {
  const headers = {};
  if (audit.messageId) headers["X-KSO-Message-Id"] = audit.messageId;
  if (audit.threadId) headers["X-KSO-Thread-Id"] = audit.threadId;
  if (audit.moduleKey) headers["X-KSO-Module-Key"] = audit.moduleKey;
  if (audit.entityType) headers["X-KSO-Entity-Type"] = audit.entityType;
  if (audit.entityId) headers["X-KSO-Entity-Id"] = audit.entityId;
  if (audit.auditId) headers["X-KSO-Audit-Id"] = audit.auditId;
  if (audit.subjectToken) headers["X-KSO-Subject-Token"] = audit.subjectToken;
  return headers;
}

export async function createOutgoingCommunicationAudit(env, input = {}) {
  const db = database(env, true);
  const item = normalizeOutbound(input);
  const now = nowIso();

  try {
    await db
      .prepare(`
        INSERT INTO communication_threads (
          id,
          thread_id,
          module_key,
          entity_type,
          entity_id,
          audit_id,
          subject_token,
          subject,
          status,
          last_outbound_at,
          last_event_at,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          module_key = excluded.module_key,
          entity_type = excluded.entity_type,
          entity_id = COALESCE(excluded.entity_id, communication_threads.entity_id),
          audit_id = excluded.audit_id,
          subject_token = excluded.subject_token,
          subject = COALESCE(excluded.subject, communication_threads.subject),
          status = excluded.status,
          last_outbound_at = excluded.last_outbound_at,
          last_event_at = excluded.last_event_at,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `)
      .bind(
        randomId("comm-thread"),
        item.threadId,
        item.moduleKey,
        item.entityType,
        nullableString(item.entityId),
        item.auditId,
        item.subjectToken,
        nullableString(item.subject),
        "outbound_pending",
        now,
        now,
        safeJson(item.metadata),
        now,
        now
      )
      .run();

    await db
      .prepare(`
        INSERT INTO communication_messages (
          id,
          thread_id,
          audit_id,
          channel,
          direction,
          module_key,
          entity_type,
          entity_id,
          message_id,
          provider,
          from_name,
          from_address,
          reply_to,
          to_address,
          cc_address,
          subject,
          body_preview,
          status,
          raw_payload,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        item.id,
        item.threadId,
        item.auditId,
        item.channel,
        item.direction,
        item.moduleKey,
        item.entityType,
        nullableString(item.entityId),
        item.messageId,
        item.provider,
        nullableString(item.fromName),
        nullableString(item.fromAddress),
        nullableString(item.replyTo),
        nullableString(item.toAddress),
        nullableString(item.ccAddress),
        nullableString(item.subject),
        nullableString(item.bodyPreview),
        item.status,
        safeJson(item.rawPayload),
        now,
        now
      )
      .run();

    await insertCommunicationEvent(db, {
      eventType: `${item.channel}_outbound_audit_created`,
      channel: item.channel,
      moduleKey: item.moduleKey,
      entityType: item.entityType,
      entityId: item.entityId,
      threadId: item.threadId,
      communicationMessageId: item.id,
      status: "pending",
      detail: "Audit vytvořen před odesláním.",
      rawPayload: {
        auditId: item.auditId,
        messageId: item.messageId,
        subjectToken: item.subjectToken
      }
    });

    return {
      ...item,
      headers: communicationHeaders(item),
      createdAt: now
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function updateOutgoingCommunicationAudit(env, audit = {}, patch = {}) {
  if (!audit?.id) {
    return null;
  }

  const db = database(env, false);
  if (!db) {
    return null;
  }

  const now = nowIso();
  const status = cleanString(patch.status || "failed");
  const providerStatus = cleanString(patch.providerStatus || status);

  try {
    await db
      .prepare(`
        UPDATE communication_messages
        SET
          status = ?,
          provider = COALESCE(?, provider),
          provider_message_id = COALESCE(?, provider_message_id),
          provider_status = ?,
          error_message = ?,
          sent_at = CASE WHEN ? = 'sent' THEN COALESCE(sent_at, ?) ELSE sent_at END,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        status,
        nullableString(patch.provider),
        nullableString(patch.providerMessageId),
        providerStatus,
        nullableString(patch.errorMessage),
        status,
        now,
        now,
        audit.id
      )
      .run();

    await db
      .prepare(`
        UPDATE communication_threads
        SET
          status = ?,
          last_outbound_at = CASE WHEN ? = 'sent' THEN COALESCE(last_outbound_at, ?) ELSE last_outbound_at END,
          last_event_at = ?,
          updated_at = ?
        WHERE thread_id = ?
      `)
      .bind(
        status === "sent" ? "outbound_sent" : status === "skipped" ? "outbound_skipped" : "outbound_failed",
        status,
        now,
        now,
        now,
        audit.threadId
      )
      .run();

    await insertCommunicationEvent(db, {
      eventType: `${audit.channel || "email"}_outbound_${status}`,
      channel: audit.channel,
      moduleKey: audit.moduleKey,
      entityType: audit.entityType,
      entityId: audit.entityId,
      threadId: audit.threadId,
      communicationMessageId: audit.id,
      status,
      detail: patch.errorMessage || (status === "sent" ? "Zpráva odeslána providerem." : "Zpráva nebyla odeslána."),
      rawPayload: {
        auditId: audit.auditId,
        providerMessageId: patch.providerMessageId || "",
        providerStatus
      }
    });
  } catch (error) {
    console.error("communication.audit_update_failed", { message: error?.message, auditId: audit.auditId });
  }

  return null;
}

function headersObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [lower(key), cleanString(item)]));
  }

  const headers = {};
  for (const line of cleanString(value).split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) {
      headers[lower(line.slice(0, index))] = cleanString(line.slice(index + 1));
    }
  }
  return headers;
}

function headerValue(payload, key) {
  const headers = headersObject(payload.headers || payload.Headers);
  const normalizedKey = lower(key);
  return cleanString(payload[key] || payload[normalizedKey] || headers[normalizedKey]);
}

function stripReplySubject(subject) {
  return cleanString(subject)
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function candidateMessageIds(payload = {}) {
  const candidates = [
    headerValue(payload, "In-Reply-To"),
    headerValue(payload, "References"),
    cleanString(payload.inReplyTo),
    cleanString(payload.references),
    cleanString(payload.originalMessageId),
    cleanString(payload.messageId)
  ].join(" ");

  return [...new Set((candidates.match(/<?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+>?/g) || [])
    .map((value) => value.replace(/[<>]/g, "").trim())
    .filter(Boolean))];
}

async function findMessageMatch(db, payload = {}) {
  const explicitThreadId = headerValue(payload, "X-KSO-Thread-Id") || cleanString(payload.threadId);
  if (explicitThreadId) {
    const thread = await db
      .prepare("SELECT * FROM communication_threads WHERE thread_id = ? LIMIT 1")
      .bind(explicitThreadId)
      .first();
    if (thread) {
      return { thread, confidence: 1, method: "thread_header" };
    }
  }

  const ids = candidateMessageIds(payload);
  for (const id of ids) {
    const message = await db
      .prepare(`
        SELECT m.*, t.subject_token, t.subject AS thread_subject
        FROM communication_messages m
        LEFT JOIN communication_threads t ON t.thread_id = m.thread_id
        WHERE m.message_id = ? OR m.provider_message_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `)
      .bind(id, id)
      .first();
    if (message?.thread_id) {
      return {
        thread: {
          thread_id: message.thread_id,
          module_key: message.module_key,
          entity_type: message.entity_type,
          entity_id: message.entity_id,
          subject_token: message.subject_token,
          subject: message.thread_subject || message.subject
        },
        confidence: 0.95,
        method: "message_id"
      };
    }
  }

  const subject = cleanString(payload.subject || payload.Subject);
  if (subject) {
    const tokenThread = await db
      .prepare(`
        SELECT *
        FROM communication_threads
        WHERE subject_token IS NOT NULL
          AND subject_token <> ''
          AND instr(?, subject_token) > 0
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .bind(subject)
      .first();
    if (tokenThread) {
      return { thread: tokenThread, confidence: 0.9, method: "subject_token" };
    }

    const normalizedSubject = stripReplySubject(subject);
    if (normalizedSubject) {
      const subjectThread = await db
        .prepare(`
          SELECT *
          FROM communication_threads
          WHERE lower(coalesce(subject, '')) = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `)
        .bind(normalizedSubject)
        .first();
      if (subjectThread) {
        return { thread: subjectThread, confidence: 0.45, method: "subject_only" };
      }
    }
  }

  return null;
}

async function applyModuleSideEffects(db, input = {}) {
  const { message, thread, payload } = input;
  const moduleKey = cleanString(thread?.module_key || message.moduleKey);
  const entityType = cleanString(thread?.entity_type || message.entityType);
  const entityId = cleanString(thread?.entity_id || message.entityId);

  if (!entityId) {
    return;
  }

  if (moduleKey === "driver-reports" || entityType === "driver_part_request" || entityType === "vehicle_issue") {
    await db
      .prepare(`
        INSERT INTO driver_part_request_events (
          id,
          request_id,
          action,
          actor_user_id,
          actor_name,
          created_at,
          before_json,
          after_json,
          note,
          notification_channel,
          notification_recipient,
          notification_status,
          notification_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        randomId("driver-part-event"),
        entityId,
        "email_reply_received",
        null,
        "Šarlota Autopilot",
        nowIso(),
        null,
        safeJson({ communicationMessageId: message.id, threadId: message.threadId }),
        `Příchozí odpověď byla přiřazena k hlášení. Autopilot nic neodeslal. Návrh dalšího kroku: ruční kontrola odpovědné osoby.`,
        "email",
        nullableString(message.fromAddress),
        "reply_received",
        null
      )
      .run();
    return;
  }

  if (moduleKey === "data-box" || moduleKey === "data-box-plus" || entityType === "data_box_message") {
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
          provider,
          provider_message_id,
          result_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dedupe_key) DO NOTHING
      `)
      .bind(
        randomId("data-box-action"),
        entityId,
        null,
        "review",
        "requires_confirmation",
        nullableString(message.fromAddress),
        nullableString(message.subject),
        nullableString(message.bodyPreview),
        `communication:reply:${message.id}`,
        "sarlota-autopilot",
        nowIso(),
        "KSO inbound email",
        nullableString(message.messageId),
        safeJson({ communicationMessageId: message.id, threadId: message.threadId }),
        nowIso(),
        nowIso()
      )
      .run();
    return;
  }

  if (moduleKey === "receivables" || entityType.startsWith("receivable_")) {
    let customerId = entityType === "receivable_customer" ? entityId : "";
    let caseId = entityId;

    if (!customerId && entityType === "receivable_invoice") {
      const row = await db
        .prepare("SELECT customer_id FROM receivable_invoices WHERE id = ? OR visto_invoice_id = ? OR invoice_number = ? LIMIT 1")
        .bind(entityId, entityId, entityId)
        .first();
      customerId = cleanString(row?.customer_id);
    }

    if (!customerId && entityType === "receivable_package") {
      const row = await db
        .prepare("SELECT customer_id FROM receivable_packages WHERE id = ? LIMIT 1")
        .bind(entityId)
        .first();
      customerId = cleanString(row?.customer_id);
    }

    if (customerId) {
      await db
        .prepare(`
          INSERT INTO receivable_inbox_messages (
            id,
            customer_id,
            case_id,
            message_id,
            from_address,
            to_address,
            subject,
            body_text,
            classification,
            requires_human_review,
            raw_payload,
            received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          randomId("receivable-inbox"),
          customerId,
          nullableString(caseId),
          nullableString(message.messageId),
          nullableString(message.fromAddress),
          nullableString(message.toAddress),
          nullableString(message.subject),
          nullableString(payload.text || payload.body || payload.html || message.bodyPreview),
          "reply_received",
          1,
          safeJson({ communicationMessageId: message.id, threadId: message.threadId }),
          cleanString(message.receivedAt) || nowIso()
        )
        .run();
    }
  }
}

function inboundEmailInput(payload = {}, match = null) {
  const thread = match?.thread || {};
  const headers = headersObject(payload.headers || payload.Headers);
  const receivedAt = cleanString(payload.receivedAt || payload.timestamp) || nowIso();
  const messageId = headerValue(payload, "Message-ID") || cleanString(payload.messageId || payload.MessageID || payload["Message-Id"]) || randomId("inbound-email");
  const subject = cleanString(payload.subject || payload.Subject);
  const text = cleanString(payload.text || payload.body || payload.Body || payload["body-plain"] || payload.html || payload.HtmlBody);

  return {
    id: randomId("comm-message"),
    threadId: cleanString(thread.thread_id),
    auditId: headerValue(payload, "X-KSO-Audit-Id") || cleanString(payload.auditId),
    channel: "email",
    direction: "inbound",
    moduleKey: cleanString(thread.module_key || headerValue(payload, "X-KSO-Module-Key")),
    entityType: cleanString(thread.entity_type || headerValue(payload, "X-KSO-Entity-Type")),
    entityId: cleanString(thread.entity_id || headerValue(payload, "X-KSO-Entity-Id")),
    messageId,
    provider: cleanString(payload.provider || "Inbound email"),
    providerMessageId: cleanString(payload.providerMessageId || payload.sg_message_id || payload["sg_message_id"]),
    fromAddress: emailFromHeader(payload.from || payload.From || headers.from),
    toAddress: cleanString(payload.to || payload.To || headers.to),
    subject,
    bodyPreview: truncate(text),
    status: match && match.confidence >= 0.7 ? "reply_received" : "unmatched_reply",
    matchedConfidence: Number(match?.confidence || 0),
    requiresHumanReview: 1,
    actionSuggestion: match && match.confidence >= 0.7
      ? "Zařadit do historie a předat odpovědné osobě. Autopilot nesmí odeslat odpověď bez potvrzení."
      : "Nespárovaná odpověď: přiřadit ručně, otevřít e-mail a předat odpovědné osobě.",
    rawPayload: payload,
    receivedAt
  };
}

export async function processInboundEmailReply(env, payload = {}) {
  const db = database(env, true);

  try {
    const match = await findMessageMatch(db, payload);
    const item = inboundEmailInput(payload, match);
    const now = nowIso();

    await db
      .prepare(`
        INSERT INTO communication_messages (
          id,
          thread_id,
          audit_id,
          channel,
          direction,
          module_key,
          entity_type,
          entity_id,
          message_id,
          provider,
          provider_message_id,
          from_address,
          to_address,
          subject,
          body_preview,
          status,
          matched_confidence,
          requires_human_review,
          action_suggestion,
          raw_payload,
          received_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        item.id,
        nullableString(item.threadId),
        nullableString(item.auditId),
        item.channel,
        item.direction,
        nullableString(item.moduleKey),
        nullableString(item.entityType),
        nullableString(item.entityId),
        item.messageId,
        item.provider,
        nullableString(item.providerMessageId),
        nullableString(item.fromAddress),
        nullableString(item.toAddress),
        nullableString(item.subject),
        nullableString(item.bodyPreview),
        item.status,
        item.matchedConfidence,
        item.requiresHumanReview,
        item.actionSuggestion,
        safeJson(item.rawPayload),
        item.receivedAt,
        now,
        now
      )
      .run();

    if (item.threadId && item.status === "reply_received") {
      await db
        .prepare(`
          UPDATE communication_threads
          SET
            status = 'reply_received',
            last_inbound_at = ?,
            last_event_at = ?,
            updated_at = ?
          WHERE thread_id = ?
        `)
        .bind(item.receivedAt, now, now, item.threadId)
        .run();

      try {
        await applyModuleSideEffects(db, { message: item, thread: match.thread, payload });
      } catch (error) {
        await insertCommunicationEvent(db, {
          eventType: "inbound_email_side_effect_failed",
          channel: "email",
          moduleKey: item.moduleKey,
          entityType: item.entityType,
          entityId: item.entityId,
          threadId: item.threadId,
          communicationMessageId: item.id,
          status: "warning",
          detail: error?.message || "Přiřazení do modulu se nepodařilo.",
          rawPayload: { code: error?.code || "" }
        });
      }
    } else {
      await db
        .prepare(`
          INSERT INTO communication_unmatched_replies (
            id,
            communication_message_id,
            channel,
            from_address,
            to_address,
            subject,
            body_preview,
            received_at,
            status,
            reason,
            raw_payload,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          randomId("comm-unmatched"),
          item.id,
          "email",
          nullableString(item.fromAddress),
          nullableString(item.toAddress),
          nullableString(item.subject),
          nullableString(item.bodyPreview),
          item.receivedAt,
          "manual_queue",
          match ? "Nízká jistota párování podle předmětu." : "Chybí interní hlavičky nebo známé Message-ID.",
          safeJson(item.rawPayload),
          now,
          now
        )
        .run();
    }

    await insertCommunicationEvent(db, {
      eventType: item.status === "reply_received" ? "inbound_email_reply_matched" : "inbound_email_reply_unmatched",
      channel: "email",
      moduleKey: item.moduleKey,
      entityType: item.entityType,
      entityId: item.entityId,
      threadId: item.threadId,
      communicationMessageId: item.id,
      status: item.status,
      detail: item.actionSuggestion,
      rawPayload: { confidence: item.matchedConfidence, from: item.fromAddress }
    });

    return {
      status: item.status === "reply_received" ? "Odpověď přijata" : "Nespárovaná odpověď",
      apiStatus: "ready",
      matched: item.status === "reply_received",
      threadId: item.threadId,
      moduleKey: item.moduleKey,
      entityType: item.entityType,
      entityId: item.entityId,
      confidence: item.matchedConfidence,
      actionSuggestion: item.actionSuggestion
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function recordTwilioStatusCallback(env, payload = {}) {
  const db = database(env, true);
  const messageSid = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid || payload.providerMessageId);
  const status = cleanString(payload.MessageStatus || payload.SmsStatus || payload.status || "callback_received");
  const now = nowIso();

  try {
    const message = messageSid
      ? await db
        .prepare("SELECT * FROM communication_messages WHERE provider = 'Twilio' AND provider_message_id = ? ORDER BY created_at DESC LIMIT 1")
        .bind(messageSid)
        .first()
      : null;

    if (message?.id) {
      await db
        .prepare(`
          UPDATE communication_messages
          SET provider_status = ?, status = ?, raw_payload = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(status, `delivery_${status}`, safeJson(payload), now, message.id)
        .run();
    }

    await insertCommunicationEvent(db, {
      eventType: "twilio_delivery_status",
      channel: "sms",
      moduleKey: cleanString(message?.module_key),
      entityType: cleanString(message?.entity_type),
      entityId: cleanString(message?.entity_id),
      threadId: cleanString(message?.thread_id),
      communicationMessageId: cleanString(message?.id),
      status,
      detail: messageSid ? `Twilio delivery status: ${status}` : "Twilio callback bez MessageSid.",
      rawPayload: payload
    });

    return { apiStatus: "ready", status, matched: Boolean(message?.id), messageSid };
  } catch (error) {
    throw dbError(error);
  }
}

export async function processInboundSmsReply(env, payload = {}) {
  const db = database(env, true);
  const from = cleanString(payload.From || payload.from);
  const to = cleanString(payload.To || payload.to);
  const body = cleanString(payload.Body || payload.body);
  const messageSid = cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid);
  const now = nowIso();

  try {
    const outbound = from
      ? await db
        .prepare(`
          SELECT *
          FROM communication_messages
          WHERE channel = 'sms'
            AND direction = 'outbound'
            AND to_address = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .bind(from)
        .first()
      : null;

    const matched = Boolean(outbound?.thread_id);
    const id = randomId("comm-message");
    await db
      .prepare(`
        INSERT INTO communication_messages (
          id,
          thread_id,
          channel,
          direction,
          module_key,
          entity_type,
          entity_id,
          message_id,
          provider,
          provider_message_id,
          from_address,
          to_address,
          body_preview,
          status,
          matched_confidence,
          requires_human_review,
          action_suggestion,
          raw_payload,
          received_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        nullableString(outbound?.thread_id),
        "sms",
        "inbound",
        nullableString(outbound?.module_key),
        nullableString(outbound?.entity_type),
        nullableString(outbound?.entity_id),
        messageSid || randomId("inbound-sms"),
        "Twilio",
        nullableString(messageSid),
        nullableString(from),
        nullableString(to),
        nullableString(truncate(body)),
        matched ? "reply_received" : "unmatched_reply",
        matched ? 0.8 : 0,
        1,
        matched
          ? "SMS odpověď zařadit do historie a předat odpovědné osobě."
          : "Nespárovaná SMS odpověď: ručně přiřadit nebo předat odpovědné osobě.",
        safeJson(payload),
        now,
        now,
        now
      )
      .run();

    if (!matched) {
      await db
        .prepare(`
          INSERT INTO communication_unmatched_replies (
            id,
            communication_message_id,
            channel,
            from_address,
            to_address,
            body_preview,
            received_at,
            status,
            reason,
            raw_payload,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          randomId("comm-unmatched"),
          id,
          "sms",
          nullableString(from),
          nullableString(to),
          nullableString(truncate(body)),
          now,
          "manual_queue",
          "Telefon se nepodařilo spárovat s poslední odchozí SMS.",
          safeJson(payload),
          now,
          now
        )
        .run();
    }

    await insertCommunicationEvent(db, {
      eventType: matched ? "inbound_sms_reply_matched" : "inbound_sms_reply_unmatched",
      channel: "sms",
      moduleKey: cleanString(outbound?.module_key),
      entityType: cleanString(outbound?.entity_type),
      entityId: cleanString(outbound?.entity_id),
      threadId: cleanString(outbound?.thread_id),
      communicationMessageId: id,
      status: matched ? "reply_received" : "unmatched_reply",
      detail: matched ? "SMS odpověď byla přiřazena k poslední odchozí SMS." : "SMS odpověď čeká v ruční frontě.",
      rawPayload: { from, to, messageSid }
    });

    return {
      apiStatus: "ready",
      status: matched ? "Odpověď přijata" : "Nespárovaná odpověď",
      matched,
      threadId: cleanString(outbound?.thread_id),
      messageSid
    };
  } catch (error) {
    throw dbError(error);
  }
}

async function tableExists(db, tableName) {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(tableName)
    .first();
  return Boolean(row?.name);
}

async function countScalar(db, sql, ...bindings) {
  const row = await db.prepare(sql).bind(...bindings).first();
  return Number(row?.count || 0);
}

function statusItem(status, label, detail = "", tone = "") {
  return { status, label, detail, tone };
}

export async function getCommunicationInfrastructureStatus(env = {}) {
  const db = database(env, false);
  const identity = communicationEmailIdentity(env);
  const sms = communicationSmsConfig(env);
  const provider = lower(env.EMAIL_PROVIDER || (env.SENDGRID_API_KEY || env.EMAIL_API_KEY ? "sendgrid" : ""));
  const apiKey = cleanString(env.SENDGRID_API_KEY || env.EMAIL_API_KEY);
  const emailConfigured = provider === "sendgrid" && Boolean(apiKey);
  const inboundConfigured = Boolean(cleanString(env.KSO_INBOUND_EMAIL_WEBHOOK_TOKEN || env.SENDGRID_INBOUND_PARSE_TOKEN));
  const dbConfigured = Boolean(db);

  const base = {
    apiStatus: dbConfigured ? "ready" : "waiting",
    generatedAt: nowIso(),
    sender: {
      fromName: identity.fromName,
      fromEmail: identity.fromEmail,
      replyTo: identity.replyTo,
      replacedFrom: identity.replacedFrom,
      replacedReplyTo: identity.replacedReplyTo
    },
    email: statusItem(
      emailConfigured && dbConfigured ? "čeká na ověření" : "vypnuto / čeká na nastavení",
      "E-mail odesílání",
      emailConfigured
        ? "Provider je serverově nastavený; ostrý stav musí potvrdit produkční odeslání a audit."
        : "Chybí serverové nastavení SendGrid nebo D1 audit.",
      emailConfigured && dbConfigured ? "warning" : "blocked"
    ),
    inboundEmail: statusItem(
      inboundConfigured && dbConfigured ? "čeká na ověření" : "vypnuto / čeká na nastavení",
      "Příchozí odpovědi",
      inboundConfigured
        ? "Webhook token je připravený. Autopilot odpovědi pouze přiřazuje a nic sám neodesílá."
        : "Chybí inbound webhook token pro sarlota@kaiserservis.cz.",
      inboundConfigured && dbConfigured ? "warning" : "blocked"
    ),
    twilio: statusItem(
      sms.accountSid && sms.authToken && sms.messagingServiceSid ? "připraveno / čeká na ověření" : "vypnuto / čeká na nastavení",
      "Twilio Kaiser",
      sms.configSource === "kaiser"
        ? "Používá oddělenou Kaiser Twilio konfiguraci."
        : sms.configSource === "legacy"
          ? "Používá starší Twilio proměnné; doporučeno převést na TWILIO_KAISER_*."
          : "Chybí Account SID, Auth Token nebo Messaging Service SID.",
      sms.configSource === "kaiser" ? "warning" : "blocked"
    ),
    sms: statusItem(
      sms.mode === "live" ? "ostré podle secrets" : sms.mode === "test" ? "test" : "vypnuto",
      "SMS",
      sms.mode === "live"
        ? "SMS se smí odeslat jen přes backendový audit a Twilio Messaging Service."
        : sms.mode === "test"
          ? "Test režim loguje záměr, bez ostrého odeslání."
          : "SMS odesílání je vypnuté.",
      sms.mode === "live" ? "warning" : "blocked"
    ),
    deliveryWebhook: statusItem(
      sms.statusCallbackUrl || sms.statusWebhookTokenConfigured ? "čeká na ověření" : "vypnuto / čeká na nastavení",
      "Webhook delivery status",
      sms.statusCallbackUrl
        ? `Callback URL je připravená: ${sms.statusCallbackUrl}`
        : "Doplňte Twilio status callback URL a webhook token.",
      sms.statusCallbackUrl || sms.statusWebhookTokenConfigured ? "warning" : "blocked"
    ),
    counts: {
      outboundEmail: 0,
      inboundEmail: 0,
      outboundSms: 0,
      inboundSms: 0,
      unmatchedReplies: 0,
      failed: 0
    },
    latestEvents: []
  };

  if (!db) {
    return base;
  }

  try {
    const hasSchema = await tableExists(db, "communication_messages");
    if (!hasSchema) {
      return {
        ...base,
        apiStatus: "waiting",
        email: { ...base.email, status: "čeká na DB migraci", detail: "Spusťte migraci 0031_create_communication_infrastructure.sql." },
        inboundEmail: { ...base.inboundEmail, status: "čeká na DB migraci", detail: "Bez tabulek se odpovědi nesmí tvářit jako zpracované." }
      };
    }

    const [outboundEmail, inboundEmailCount, outboundSms, inboundSms, unmatchedReplies, failed, events] = await Promise.all([
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_messages WHERE channel = 'email' AND direction = 'outbound'"),
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_messages WHERE channel = 'email' AND direction = 'inbound'"),
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_messages WHERE channel = 'sms' AND direction = 'outbound'"),
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_messages WHERE channel = 'sms' AND direction = 'inbound'"),
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_unmatched_replies WHERE status = 'manual_queue'"),
      countScalar(db, "SELECT COUNT(*) AS count FROM communication_messages WHERE status LIKE '%failed%' OR status = 'failed'"),
      db.prepare(`
        SELECT *
        FROM communication_events
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(EVENT_LIMIT).all()
    ]);

    return {
      ...base,
      counts: {
        outboundEmail,
        inboundEmail: inboundEmailCount,
        outboundSms,
        inboundSms,
        unmatchedReplies,
        failed
      },
      latestEvents: (events.results || []).map((row) => ({
        id: cleanString(row.id),
        eventType: cleanString(row.event_type),
        channel: cleanString(row.channel),
        moduleKey: cleanString(row.module_key),
        entityType: cleanString(row.entity_type),
        entityId: cleanString(row.entity_id),
        threadId: cleanString(row.thread_id),
        status: cleanString(row.status),
        detail: cleanString(row.detail),
        createdAt: cleanString(row.created_at),
        rawPayload: parseJson(row.raw_payload, {})
      }))
    };
  } catch (error) {
    const mapped = dbError(error);
    return {
      ...base,
      apiStatus: "waiting",
      error: mapped.message
    };
  }
}

function webhookTokenFromRequest(request) {
  const url = new URL(request.url);
  const auth = cleanString(request.headers.get("Authorization"));
  return cleanString(
    request.headers.get("X-KSO-Webhook-Token") ||
    request.headers.get("X-Twilio-Webhook-Token") ||
    url.searchParams.get("token") ||
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "")
  );
}

export function requireWebhookToken(env, request, ...envKeys) {
  const expected = envKeys.map((key) => cleanString(env?.[key])).find(Boolean);
  if (!expected) {
    return { ok: false, responseStatus: 503, error: "Webhook token není nastavený v serverových secrets." };
  }

  const provided = webhookTokenFromRequest(request);
  if (!provided || provided !== expected) {
    return { ok: false, responseStatus: 401, error: "Neplatný webhook token." };
  }

  return { ok: true };
}

export const __test = {
  communicationEmailIdentity,
  communicationSmsConfig,
  communicationHeaders,
  stripReplySubject,
  candidateMessageIds,
  inboundEmailInput
};
