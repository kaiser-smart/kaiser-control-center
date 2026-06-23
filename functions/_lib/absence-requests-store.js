import { isFullAccessRole, normalizeRole } from "../../src/permissions.js";

const ABSENCE_DB_BINDING = "SMART_ODPADY_DB";
const REQUEST_TYPES = new Set(["vacation", "sick", "doctor", "care", "compensatory_leave"]);
const REQUEST_STATUSES = new Set(["pending", "recorded"]);

const TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno"
};

const STATUS_LABELS = {
  pending: "Čeká na schválení",
  recorded: "Evidováno"
};

export class AbsenceRequestStoreError extends Error {
  constructor(message, status = 400, code = "absence_request_store_error") {
    super(message);
    this.name = "AbsenceRequestStoreError";
    this.status = status;
    this.code = code;
  }
}

function absenceDatabase(env, required = false) {
  const db = env?.[ABSENCE_DB_BINDING] || null;

  if (!db && required) {
    throw new AbsenceRequestStoreError(
      "Databáze nepřítomností není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "absence_database_missing"
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

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function dateValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function countDays(dateFrom, dateTo, halfDay = false) {
  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return 0;
  }

  if (halfDay) {
    return 0.5;
  }

  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function randomId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `absence-request-${suffix}`;
}

function canViewAllAbsenceRequests(currentUser) {
  const role = normalizeRole(currentUser?.role);
  return isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly";
}

function canViewTeamAbsenceRequests(currentUser) {
  const role = normalizeRole(currentUser?.role);
  return role === "garazmistr" || role === "dispecer";
}

function visibleToUser(currentUser, item) {
  if (canViewAllAbsenceRequests(currentUser)) {
    return true;
  }

  if (sameId(currentUser?.id, item.employeeId)) {
    return true;
  }

  if (canViewTeamAbsenceRequests(currentUser)) {
    return (
      cleanString(currentUser?.department) &&
      cleanString(currentUser.department).toLowerCase() === cleanString(item.department).toLowerCase()
    );
  }

  return false;
}

function requestFromRow(row) {
  if (!row) {
    return null;
  }

  const type = cleanString(row.type);
  const status = cleanString(row.status);

  return {
    id: cleanString(row.id),
    employeeId: cleanString(row.employee_id),
    employeeName: cleanString(row.employee_name),
    type,
    typeLabel: TYPE_LABELS[type] || type,
    dateFrom: dateValue(row.date_from),
    dateTo: dateValue(row.date_to),
    halfDay: Boolean(row.half_day),
    note: cleanString(row.note),
    status,
    statusLabel: STATUS_LABELS[status] || status,
    daysCount: Number(row.days_count || 0),
    managerId: cleanString(row.manager_id),
    managerName: cleanString(row.manager_name),
    approverUserId: cleanString(row.approver_user_id),
    department: cleanString(row.department),
    team: cleanString(row.team),
    createdByUserId: cleanString(row.created_by_user_id),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function normalizeInput(input, users, currentUser) {
  const type = cleanString(input?.type);
  const dateFrom = dateValue(input?.dateFrom);
  const rawDateTo = dateValue(input?.dateTo);
  const halfDay = Boolean(input?.halfDay);
  const status = cleanString(input?.status);
  const employeeId = cleanString(input?.employeeId || currentUser?.id);

  if (!REQUEST_TYPES.has(type)) {
    throw new AbsenceRequestStoreError("Vyberte typ nepřítomnosti.", 400, "absence_type_invalid");
  }

  if (!REQUEST_STATUSES.has(status)) {
    throw new AbsenceRequestStoreError("Vyberte platný stav žádosti.", 400, "absence_status_invalid");
  }

  if (!dateFrom) {
    throw new AbsenceRequestStoreError("Vyberte datum začátku.", 400, "absence_date_from_required");
  }

  const dateTo = rawDateTo || dateFrom;
  const daysCount = countDays(dateFrom, dateTo, halfDay);
  if (daysCount <= 0) {
    throw new AbsenceRequestStoreError("Zkontrolujte datum.", 400, "absence_date_range_invalid");
  }

  if (!sameId(employeeId, currentUser?.id) && !canViewAllAbsenceRequests(currentUser)) {
    throw new AbsenceRequestStoreError("Můžete vytvořit jen vlastní žádost.", 403, "absence_create_forbidden");
  }

  const employee = users.find((user) => sameId(user.id, employeeId)) || currentUser;
  const manager = users.find((user) => sameId(user.id, employee?.managerId));
  const now = new Date().toISOString();

  return {
    id: randomId(),
    employeeId: cleanString(employee?.id || employeeId),
    employeeName: cleanString(employee?.name || currentUser?.name || "Uživatel"),
    type,
    dateFrom,
    dateTo,
    halfDay,
    note: cleanString(input?.note),
    status,
    daysCount,
    managerId: cleanString(employee?.managerId),
    managerName: cleanString(employee?.managerName || manager?.name),
    approverUserId: cleanString(employee?.managerId),
    department: cleanString(employee?.department || currentUser?.department),
    team: cleanString(employee?.team || employee?.department || currentUser?.department),
    createdByUserId: cleanString(currentUser?.id),
    createdAt: now,
    updatedAt: now
  };
}

export async function listAbsenceRequests(env, users, currentUser, options = {}) {
  const db = absenceDatabase(env, true);
  const mineOnly = options.mine === true;
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const query = mineOnly
    ? db
        .prepare("SELECT * FROM absence_requests WHERE lower(employee_id) = lower(?) ORDER BY created_at DESC LIMIT ?")
        .bind(currentUser?.id || "", limit)
    : db
        .prepare("SELECT * FROM absence_requests ORDER BY created_at DESC LIMIT ?")
        .bind(limit);
  const result = await query.all();
  const requests = (result.results || [])
    .map(requestFromRow)
    .filter(Boolean)
    .filter((request) => (
      mineOnly
        ? sameId(currentUser?.id, request.employeeId)
        : visibleToUser(currentUser, request)
    ));

  return requests;
}

export async function createAbsenceRequestRecord(env, users, currentUser, input) {
  const db = absenceDatabase(env, true);
  const request = normalizeInput(input, users, currentUser);

  await db
    .prepare(`
      INSERT INTO absence_requests (
        id,
        employee_id,
        employee_name,
        type,
        date_from,
        date_to,
        half_day,
        note,
        status,
        days_count,
        manager_id,
        manager_name,
        approver_user_id,
        department,
        team,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      request.id,
      request.employeeId,
      request.employeeName,
      request.type,
      request.dateFrom,
      request.dateTo || request.dateFrom,
      request.halfDay ? 1 : 0,
      nullableString(request.note),
      request.status,
      request.daysCount,
      nullableString(request.managerId),
      nullableString(request.managerName),
      nullableString(request.approverUserId),
      nullableString(request.department),
      nullableString(request.team),
      request.createdByUserId,
      request.createdAt,
      request.updatedAt
    )
    .run();

  return {
    ...request,
    typeLabel: TYPE_LABELS[request.type],
    statusLabel: STATUS_LABELS[request.status],
    dateTo: request.dateTo || addDays(request.dateFrom, 0)
  };
}
