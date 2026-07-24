const DB_BINDING = "SMART_ODPADY_DB";

export class CustomerMessageStoreError extends Error {
  constructor(message, status = 400, code = "customer_message_store_error") {
    super(message);
    this.name = "CustomerMessageStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new CustomerMessageStoreError(
      "Databáze zákaznických zpráv není nastavená. Chybí Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "customer_message_database_missing"
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

function safeStatusCallbackMetadata(payload = {}) {
  return {
    messageSid: cleanString(payload.MessageSid || payload.SmsSid || payload.messageSid),
    status: cleanString(payload.MessageStatus || payload.SmsStatus || payload.status),
    channel: cleanString(payload.ChannelPrefix || payload.channelPrefix || payload.Channel || payload.channel),
    errorCode: cleanString(payload.ErrorCode || payload.errorCode),
    errorMessage: cleanString(payload.ErrorMessage || payload.errorMessage).slice(0, 600)
  };
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
  const message = cleanString(error?.message);
  if (/no such table|customer_message_log|customer_message_opt_out|customer_message_inbound/i.test(message)) {
    return new CustomerMessageStoreError(
      "Tabulky zákaznických RCS/SMS zpráv nejsou v D1 připravené. Spusťte migraci 0032_create_customer_messaging.sql.",
      503,
      "customer_message_migration_missing"
    );
  }

  console.error("customer_message.store_failed", { message });
  return new CustomerMessageStoreError("Zákaznické zprávy se teď nepodařilo načíst nebo uložit.", 500, "customer_message_store_failed");
}

function normalizePage(value) {
  return Math.max(1, Number.parseInt(value || "1", 10) || 1);
}

function normalizePageSize(value) {
  return Math.max(1, Math.min(Number.parseInt(value || "50", 10) || 50, 100));
}

function isoStart(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? `${cleaned}T00:00:00.000Z` : "";
}

function isoEnd(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? `${cleaned}T23:59:59.999Z` : "";
}

function defaultDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function defaultDateTo() {
  return new Date().toISOString().slice(0, 10);
}

function logRow(row = {}) {
  return {
    id: cleanString(row.id),
    customerId: cleanString(row.customer_id),
    phone: cleanString(row.phone),
    requestedChannel: cleanString(row.requested_channel),
    usedChannel: cleanString(row.used_channel),
    templateKey: cleanString(row.template_key),
    messageBody: cleanString(row.message_body),
    twilioMessageSid: cleanString(row.twilio_message_sid),
    status: cleanString(row.status),
    errorMessage: cleanString(row.error_message),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    reason: cleanString(row.reason),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at || row.created_at)
  };
}

function optOutRow(row = {}) {
  return {
    id: cleanString(row.id),
    phone: cleanString(row.phone),
    source: cleanString(row.source),
    reason: cleanString(row.reason),
    createdAt: cleanString(row.created_at)
  };
}

export async function insertCustomerMessageLog(env, input = {}) {
  const db = database(env, true);
  const now = cleanString(input.createdAt) || nowIso();
  const id = cleanString(input.id) || randomId("customer-message");

  try {
    await db
      .prepare(`
        INSERT INTO customer_message_log (
          id,
          customer_id,
          phone,
          requested_channel,
          used_channel,
          template_key,
          message_body,
          twilio_message_sid,
          status,
          error_message,
          related_entity_type,
          related_entity_id,
          reason,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        nullableString(input.customerId),
        cleanString(input.phone),
        cleanString(input.requestedChannel || "rcs"),
        cleanString(input.usedChannel || "unknown"),
        cleanString(input.templateKey || "unknown"),
        cleanString(input.messageBody),
        nullableString(input.twilioMessageSid),
        cleanString(input.status || "pending"),
        nullableString(input.errorMessage),
        nullableString(input.relatedEntityType),
        nullableString(input.relatedEntityId),
        nullableString(input.reason),
        safeJson(input.metadata || {}),
        now,
        now
      )
      .run();

    return { id, createdAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function updateCustomerMessageLog(env, id, patch = {}) {
  const db = database(env, true);
  const now = nowIso();

  try {
    await db
      .prepare(`
        UPDATE customer_message_log
        SET
          used_channel = COALESCE(?, used_channel),
          twilio_message_sid = COALESCE(?, twilio_message_sid),
          status = COALESCE(?, status),
          error_message = COALESCE(?, error_message),
          metadata_json = CASE WHEN ? IS NULL THEN metadata_json ELSE ? END,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        nullableString(patch.usedChannel),
        nullableString(patch.twilioMessageSid),
        nullableString(patch.status),
        nullableString(patch.errorMessage),
        patch.metadata ? "metadata" : null,
        patch.metadata ? safeJson(patch.metadata) : null,
        now,
        id
      )
      .run();
    return null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function findRecentDuplicateMessage(env, { phone, messageBody, windowSeconds = 300 } = {}) {
  const db = database(env, true);
  const cutoff = new Date(Date.now() - (Number(windowSeconds || 300) * 1000)).toISOString();

  try {
    const row = await db
      .prepare(`
        SELECT *
        FROM customer_message_log
        WHERE phone = ?
          AND message_body = ?
          AND created_at >= ?
          AND status IN ('pending', 'sent', 'delivered', 'fallback')
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(cleanString(phone), cleanString(messageBody), cutoff)
      .first();
    return row ? logRow(row) : null;
  } catch (error) {
    throw dbError(error);
  }
}

export async function isCustomerMessageOptedOut(env, phone) {
  const db = database(env, true);
  try {
    const row = await db
      .prepare("SELECT id FROM customer_message_opt_out WHERE phone = ? LIMIT 1")
      .bind(cleanString(phone))
      .first();
    return Boolean(row?.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function addCustomerMessageOptOut(env, { phone, source = "manual", reason = "" } = {}) {
  const db = database(env, true);
  const normalizedPhone = cleanString(phone);
  if (!normalizedPhone) {
    throw new CustomerMessageStoreError("Chybí telefon pro opt-out.", 400, "customer_message_opt_out_phone_missing");
  }

  const id = randomId("customer-opt-out");
  const now = nowIso();
  try {
    await db
      .prepare(`
        INSERT INTO customer_message_opt_out (id, phone, source, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
          source = excluded.source,
          reason = excluded.reason
      `)
      .bind(id, normalizedPhone, cleanString(source || "manual"), cleanString(reason), now)
      .run();
    return { id, phone: normalizedPhone, source: cleanString(source || "manual"), reason: cleanString(reason), createdAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function removeCustomerMessageOptOut(env, phone) {
  const db = database(env, true);
  try {
    await db
      .prepare("DELETE FROM customer_message_opt_out WHERE phone = ?")
      .bind(cleanString(phone))
      .run();
    return { phone: cleanString(phone), removed: true };
  } catch (error) {
    throw dbError(error);
  }
}

export async function insertCustomerMessageInbound(env, input = {}) {
  const db = database(env, true);
  const id = cleanString(input.id) || randomId("customer-inbound");
  const now = cleanString(input.createdAt) || nowIso();

  try {
    await db
      .prepare(`
        INSERT INTO customer_message_inbound (
          id,
          phone,
          body,
          twilio_message_sid,
          raw_payload,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        cleanString(input.phone),
        cleanString(input.body),
        nullableString(input.twilioMessageSid),
        safeJson(input.rawPayload || {}),
        now
      )
      .run();
    return { id, createdAt: now };
  } catch (error) {
    throw dbError(error);
  }
}

export async function updateCustomerMessageStatusByTwilioSid(env, { twilioMessageSid, status, errorMessage = "", payload = {} } = {}) {
  const db = database(env, true);
  const sid = cleanString(twilioMessageSid);
  const normalizedStatus = cleanString(status || "callback_received");
  const now = nowIso();

  try {
    const row = sid
      ? await db
        .prepare("SELECT * FROM customer_message_log WHERE twilio_message_sid = ? ORDER BY created_at DESC LIMIT 1")
        .bind(sid)
        .first()
      : null;

    if (row?.id) {
      await db
        .prepare(`
          UPDATE customer_message_log
          SET
            status = ?,
            used_channel = COALESCE(?, used_channel),
            error_message = COALESCE(?, error_message),
            metadata_json = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          mapTwilioStatus(normalizedStatus),
          nullableString(channelFromTwilioPayload(payload)),
          nullableString(errorMessage),
          safeJson({ ...parseJson(row.metadata_json, {}), latestStatusCallback: safeStatusCallbackMetadata(payload) }),
          now,
          row.id
        )
        .run();
    }

    return { matched: Boolean(row?.id), message: row ? logRow(row) : null };
  } catch (error) {
    throw dbError(error);
  }
}

export function channelFromTwilioPayload(payload = {}) {
  const value = cleanString(payload.ChannelPrefix || payload.channelPrefix || payload.Channel || payload.channel || payload.From || payload.from);
  const normalized = value.toLowerCase();
  if (normalized.includes("rcs:") || normalized === "rcs") return "rcs";
  if (normalized.includes("sms") || normalized.startsWith("+")) return "sms";
  if (normalized.includes("mms")) return "sms";
  return "";
}

export function mapTwilioStatus(value) {
  const status = cleanString(value).toLowerCase();
  if (["delivered", "read"].includes(status)) return "delivered";
  if (["sent", "queued", "accepted", "scheduled", "sending"].includes(status)) return status === "accepted" || status === "queued" || status === "sending" ? "pending" : "sent";
  if (["failed", "undelivered", "canceled"].includes(status)) return "failed";
  return status || "pending";
}

function normalizeFilters(params) {
  const dateFrom = cleanString(params.get("dateFrom")) || defaultDateFrom();
  const dateTo = cleanString(params.get("dateTo")) || defaultDateTo();
  return {
    dateFrom,
    dateTo,
    phone: cleanString(params.get("phone")),
    status: cleanString(params.get("status")),
    templateKey: cleanString(params.get("templateKey")),
    search: cleanString(params.get("search")),
    page: normalizePage(params.get("page")),
    pageSize: normalizePageSize(params.get("pageSize"))
  };
}

export async function listCustomerMessages(env, params) {
  const db = database(env, true);
  const filters = normalizeFilters(params);
  const clauses = ["created_at >= ?", "created_at <= ?"];
  const binds = [isoStart(filters.dateFrom), isoEnd(filters.dateTo)];

  if (filters.phone) {
    clauses.push("phone LIKE ?");
    binds.push(`%${filters.phone}%`);
  }
  if (filters.status) {
    clauses.push("status = ?");
    binds.push(filters.status);
  }
  if (filters.templateKey) {
    clauses.push("template_key = ?");
    binds.push(filters.templateKey);
  }
  if (filters.search) {
    clauses.push("(phone LIKE ? OR template_key LIKE ? OR message_body LIKE ? OR error_message LIKE ?)");
    const pattern = `%${filters.search}%`;
    binds.push(pattern, pattern, pattern, pattern);
  }

  const where = clauses.join(" AND ");
  const offset = (filters.page - 1) * filters.pageSize;

  try {
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM customer_message_log WHERE ${where}`).bind(...binds).first();
    const result = await db
      .prepare(`
        SELECT *
        FROM customer_message_log
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...binds, filters.pageSize, offset)
      .all();

    return {
      items: (result.results || []).map(logRow),
      total: Number(count?.total || 0),
      page: filters.page,
      pageSize: filters.pageSize,
      filters
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function listCustomerMessageOptOuts(env, params) {
  const db = database(env, true);
  const search = cleanString(params.get("search") || params.get("phone"));
  const page = normalizePage(params.get("page"));
  const pageSize = normalizePageSize(params.get("pageSize"));
  const clauses = [];
  const binds = [];

  if (search) {
    clauses.push("(phone LIKE ? OR source LIKE ? OR reason LIKE ?)");
    const pattern = `%${search}%`;
    binds.push(pattern, pattern, pattern);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  try {
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM customer_message_opt_out ${where}`).bind(...binds).first();
    const result = await db
      .prepare(`
        SELECT *
        FROM customer_message_opt_out
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...binds, pageSize, offset)
      .all();

    return {
      items: (result.results || []).map(optOutRow),
      total: Number(count?.total || 0),
      page,
      pageSize
    };
  } catch (error) {
    throw dbError(error);
  }
}

export const __test = {
  mapTwilioStatus,
  channelFromTwilioPayload
};
