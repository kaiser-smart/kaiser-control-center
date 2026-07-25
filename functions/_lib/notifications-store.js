import { isFullAccessRole, normalizeRole } from "../../src/permissions.js";
import { getCoreDatabase, getMessagesDatabase } from "./databases.js";

const CHANNELS = new Set(["email", "sms", "rcs_sms_auto_fallback"]);
const STATUSES = new Set(["sent", "not_sent", "pending", "failed"]);
const TYPES = new Set([
  "absence_approval_request",
  "absence_approval_reminder",
  "absence_approved_rcs",
  "absence_approved_sms",
  "absence_rejected_sms",
  "absence_sickness_recorded_email",
  "module_feedback_resolved_email",
  "version_news_email",
  "employee_medical_exam_reminder",
  "data_box_forward_email",
  "driver_part_order_email",
  "driver_part_urgent_email",
  "driver_part_service_tech_sms",
  "driver_part_ready_driver_sms",
  "collection_route_incident_dispatcher_live_email",
  "collection_route_incident_dispatcher_live_sms",
  "communication_inbound_reply",
  "twilio_delivery_status",
  "sms_inbound_reply"
]);
const MAX_ABSENCE_FILTER_IDS = 80;

export class NotificationsStoreError extends Error {
  constructor(message, status = 400, code = "notifications_store_error") {
    super(message);
    this.name = "NotificationsStoreError";
    this.status = status;
    this.code = code;
  }
}

function notificationsDatabase(env, required = false) {
  try {
    return getMessagesDatabase(env, { required });
  } catch {
    throw new NotificationsStoreError(
      "Databáze notifikací není nastavená. Přidejte Cloudflare D1 binding DB_MESSAGES.",
      503,
      "notifications_database_missing"
    );
  }
}

async function notificationLogColumns(db) {
  try {
    const result = await db.prepare("PRAGMA table_info(notification_logs)").all();
    return new Set((result.results || []).map((row) => cleanString(row.name)));
  } catch (error) {
    console.error("notifications.schema_read_failed", { message: error.message });
    return new Set();
  }
}

function selectNotificationColumn(columns, columnName, fallbackSql) {
  return columns.has(columnName)
    ? `n.${columnName}`
    : `${fallbackSql} AS ${columnName}`;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(value) {
  const cleaned = cleanString(value).toLowerCase();
  if (cleaned === "skipped") {
    return "not_sent";
  }

  return STATUSES.has(cleaned) ? cleaned : "not_sent";
}

function storedStatus(value) {
  const status = normalizeStatus(value);
  return status === "not_sent" ? "skipped" : status;
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

export function canViewCentralNotifications(user) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function normalizeFilters(params) {
  const dateFrom = cleanString(params.get("dateFrom")) || defaultDateFrom();
  const dateTo = cleanString(params.get("dateTo")) || defaultDateTo();
  const channel = cleanString(params.get("channel")).toLowerCase();
  const status = cleanString(params.get("status")).toLowerCase();
  const type = cleanString(params.get("type"));

  return {
    dateFrom,
    dateTo,
    channel: CHANNELS.has(channel) ? channel : "",
    status: STATUSES.has(status) ? status : "",
    type: TYPES.has(type) ? type : "",
    employeeId: cleanString(params.get("employeeId")),
    managerId: cleanString(params.get("managerId")),
    search: cleanString(params.get("search")),
    page: normalizePage(params.get("page")),
    pageSize: normalizePageSize(params.get("pageSize"))
  };
}

function whereForFilters(filters, columns = new Set(), absenceIds = {}) {
  const clauses = ["n.created_at >= ?", "n.created_at <= ?"];
  const binds = [isoStart(filters.dateFrom), isoEnd(filters.dateTo)];
  const scopeIds = absenceIds.scope || [];
  const searchIds = absenceIds.search || [];

  if (filters.channel) {
    clauses.push("n.channel = ?");
    binds.push(filters.channel);
  }

  if (filters.status) {
    clauses.push("n.status = ?");
    binds.push(storedStatus(filters.status));
  }

  if (filters.type) {
    clauses.push("n.type = ?");
    binds.push(filters.type);
  }

  if (filters.employeeId || filters.managerId) {
    if (!scopeIds.length) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`(
        n.related_entity_type = 'absence_request'
        AND n.related_entity_id IN (${scopeIds.map(() => "?").join(", ")})
      )`);
      binds.push(...scopeIds);
    }
  }

  if (filters.search) {
    const searchColumns = [
      "lower(coalesce(n.recipient, '')) LIKE lower(?)",
      "lower(coalesce(n.error_message, '')) LIKE lower(?)",
      ...(columns.has("subject") ? ["lower(coalesce(n.subject, '')) LIKE lower(?)"] : []),
      ...(columns.has("message_preview") ? ["lower(coalesce(n.message_preview, '')) LIKE lower(?)"] : []),
      "lower(coalesce(n.type, '')) LIKE lower(?)"
    ];
    const absenceSearch = searchIds.length
      ? ` OR (
          n.related_entity_type = 'absence_request'
          AND n.related_entity_id IN (${searchIds.map(() => "?").join(", ")})
        )`
      : "";
    clauses.push(`(
      ${searchColumns.join("\n      OR ")}
      ${absenceSearch}
    )`);
    const pattern = `%${filters.search}%`;
    binds.push(...searchColumns.map(() => pattern));
    if (searchIds.length) binds.push(...searchIds);
  }

  return {
    where: clauses.join(" AND "),
    binds
  };
}

async function absenceIdsForCriteria(env, criteria) {
  if (!criteria.employeeId && !criteria.managerId && !criteria.search) return [];
  const db = getCoreDatabase(env);
  const clauses = [];
  const binds = [];

  if (criteria.employeeId) {
    clauses.push("lower(employee_id) = lower(?)");
    binds.push(criteria.employeeId);
  }
  if (criteria.managerId) {
    clauses.push("lower(manager_id) = lower(?)");
    binds.push(criteria.managerId);
  }
  if (criteria.search) {
    clauses.push(`(
      lower(coalesce(employee_name, '')) LIKE lower(?)
      OR lower(coalesce(manager_name, '')) LIKE lower(?)
      OR lower(coalesce(note, '')) LIKE lower(?)
    )`);
    const pattern = `%${criteria.search}%`;
    binds.push(pattern, pattern, pattern);
  }

  const result = await db.prepare(`
    SELECT id, employee_id, employee_name, manager_id, manager_name, note
    FROM absence_requests
    WHERE ${clauses.join(" AND ")}
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(...binds, MAX_ABSENCE_FILTER_IDS).all();
  return (result.results || []).map((row) => cleanString(row.id)).filter(Boolean);
}

async function absenceRowsByIds(env, ids) {
  const uniqueIds = [...new Set(ids.map(cleanString).filter(Boolean))].slice(0, 100);
  if (!uniqueIds.length) return [];
  const db = getCoreDatabase(env, { required: false });
  if (!db) return [];
  try {
    const result = await db.prepare(`
      SELECT id, employee_id, employee_name, manager_id, manager_name, note
      FROM absence_requests
      WHERE id IN (${uniqueIds.map(() => "?").join(", ")})
    `).bind(...uniqueIds).all();
    return result.results || [];
  } catch (error) {
    console.error("notifications.absence_enrichment_failed", { message: error?.message });
    return [];
  }
}

function rowToNotification(row) {
  const status = normalizeStatus(row.status);
  const sentAt = cleanString(row.sent_at);
  const createdAt = cleanString(row.created_at);
  const errorMessage = cleanString(row.error_message);

  return {
    id: cleanString(row.id),
    moduleId: cleanString(row.module_id || "dovolena-nemoc"),
    relatedEntityType: cleanString(row.related_entity_type),
    relatedEntityId: cleanString(row.related_entity_id),
    absenceRequestId: cleanString(row.related_entity_id),
    channel: cleanString(row.channel),
    type: cleanString(row.type),
    status,
    recipient: cleanString(row.recipient),
    recipientName: cleanString(row.manager_name || row.employee_name || row.recipient),
    employeeId: cleanString(row.employee_id),
    employeeName: cleanString(row.employee_name),
    managerId: cleanString(row.manager_id),
    managerName: cleanString(row.manager_name),
    subject: cleanString(row.subject),
    messagePreview: errorMessage || cleanString(row.message_preview),
    provider: cleanString(row.provider || (["sms", "rcs_sms_auto_fallback"].includes(row.channel) ? "Twilio" : row.channel === "email" ? "SendGrid" : "")),
    providerMessageId: cleanString(row.provider_message_id),
    providerStatus: cleanString(row.provider_status),
    messageId: cleanString(row.message_id),
    threadId: cleanString(row.thread_id),
    auditId: cleanString(row.audit_id),
    fromName: cleanString(row.from_name),
    fromAddress: cleanString(row.from_address),
    replyTo: cleanString(row.reply_to),
    subjectToken: cleanString(row.subject_token),
    attempts: Number(row.attempts || 1),
    lastError: errorMessage,
    sentAt,
    failedAt: status === "failed" ? createdAt : "",
    createdAt,
    updatedAt: cleanString(row.updated_at || createdAt)
  };
}

export async function listNotifications(env, params) {
  const db = notificationsDatabase(env, true);
  const filters = normalizeFilters(params);
  const columns = await notificationLogColumns(db);
  const [scopeIds, searchIds] = await Promise.all([
    absenceIdsForCriteria(env, {
      employeeId: filters.employeeId,
      managerId: filters.managerId
    }),
    absenceIdsForCriteria(env, { search: filters.search })
  ]);
  const { where, binds } = whereForFilters(filters, columns, { scope: scopeIds, search: searchIds });
  const offset = (filters.page - 1) * filters.pageSize;

  const countResult = await db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM notification_logs n
      WHERE ${where}
    `)
    .bind(...binds)
    .first();

  const result = await db
    .prepare(`
      SELECT
        n.id,
        n.type,
        n.channel,
        n.recipient,
        n.related_entity_type,
        n.related_entity_id,
        n.status,
        n.error_message,
        ${selectNotificationColumn(columns, "module_id", "'dovolena-nemoc'")},
        ${selectNotificationColumn(columns, "subject", "NULL")},
        ${selectNotificationColumn(columns, "message_preview", "NULL")},
        ${selectNotificationColumn(columns, "provider", "NULL")},
        ${selectNotificationColumn(columns, "provider_message_id", "NULL")},
        ${selectNotificationColumn(columns, "provider_status", "NULL")},
        ${selectNotificationColumn(columns, "message_id", "NULL")},
        ${selectNotificationColumn(columns, "thread_id", "NULL")},
        ${selectNotificationColumn(columns, "audit_id", "NULL")},
        ${selectNotificationColumn(columns, "from_name", "NULL")},
        ${selectNotificationColumn(columns, "from_address", "NULL")},
        ${selectNotificationColumn(columns, "reply_to", "NULL")},
        ${selectNotificationColumn(columns, "subject_token", "NULL")},
        ${selectNotificationColumn(columns, "attempts", "1")},
        n.sent_at,
        n.created_at,
        ${selectNotificationColumn(columns, "updated_at", "n.created_at")}
      FROM notification_logs n
      WHERE ${where}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(...binds, filters.pageSize, offset)
    .all();
  const rows = result.results || [];
  const absenceRows = await absenceRowsByIds(
    env,
    rows
      .filter((row) => cleanString(row.related_entity_type) === "absence_request")
      .map((row) => row.related_entity_id)
  );
  const absenceById = new Map(absenceRows.map((row) => [cleanString(row.id), row]));
  const enrichedRows = rows.map((row) => ({
    ...row,
    ...(absenceById.get(cleanString(row.related_entity_id)) || {})
  }));

  return {
    items: enrichedRows.map(rowToNotification),
    total: Number(countResult?.total || 0),
    page: filters.page,
    pageSize: filters.pageSize,
    filters
  };
}

export async function notificationSummary(env, params) {
  const db = notificationsDatabase(env, true);
  const filters = normalizeFilters(params);
  const { where, binds } = whereForFilters({
    ...filters,
    channel: "",
    status: "",
    type: "",
    employeeId: "",
    managerId: "",
    search: ""
  });

  const result = await db
    .prepare(`
      SELECT n.channel, n.status, COUNT(*) AS count
      FROM notification_logs n
      WHERE ${where}
      GROUP BY n.channel, n.status
    `)
    .bind(...binds)
    .all();

  const summary = {
    emailSent: 0,
    emailNotSent: 0,
    smsSent: 0,
    smsNotSent: 0,
    rcsSent: 0,
    rcsNotSent: 0,
    pending: 0,
    failed: 0
  };

  for (const row of result.results || []) {
    const channel = cleanString(row.channel);
    const status = normalizeStatus(row.status);
    const count = Number(row.count || 0);

    if (channel === "email" && status === "sent") {
      summary.emailSent += count;
    }

    if (channel === "email" && status !== "sent") {
      summary.emailNotSent += count;
    }

    if (channel === "sms" && status === "sent") {
      summary.smsSent += count;
    }

    if (channel === "sms" && status !== "sent") {
      summary.smsNotSent += count;
    }

    if (channel === "rcs_sms_auto_fallback" && status === "sent") {
      summary.rcsSent += count;
    }

    if (channel === "rcs_sms_auto_fallback" && status !== "sent") {
      summary.rcsNotSent += count;
    }

    if (status === "pending") {
      summary.pending += count;
    }

    if (status === "failed") {
      summary.failed += count;
    }
  }

  return { ...summary, dateFrom: filters.dateFrom, dateTo: filters.dateTo };
}
