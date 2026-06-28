import { hasPermission, isFullAccessRole, normalizeRole } from "../../src/permissions.js";

const ABSENCE_DB_BINDING = "SMART_ODPADY_DB";

const REQUEST_TYPES = new Set(["vacation", "sick", "doctor", "care", "compensatory_leave"]);
const APPROVAL_TYPES = new Set(["vacation", "doctor", "care", "compensatory_leave"]);
const REQUEST_STATUSES = new Set(["draft", "pending_approval", "approved", "rejected", "cancelled", "recorded"]);

const TYPE_LABELS = {
  vacation: "Dovolená",
  sick: "Nemoc",
  doctor: "Lékař",
  care: "OČR",
  compensatory_leave: "Náhradní volno"
};

const TYPE_ALIASES = {
  "dovolená": "vacation",
  dovolena: "vacation",
  nemoc: "sick",
  "lékař": "doctor",
  lekar: "doctor",
  "očr": "care",
  ocr: "care",
  "náhradní volno": "compensatory_leave",
  "nahradni volno": "compensatory_leave"
};

const STATUS_LABELS = {
  draft: "Rozpracováno",
  pending_approval: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  cancelled: "Zrušeno",
  recorded: "Evidováno"
};

const STATUS_ALIASES = {
  pending: "pending_approval",
  "nová žádost": "draft",
  "nova zadost": "draft",
  "čeká na schválení": "pending_approval",
  "ceka na schvaleni": "pending_approval",
  schváleno: "approved",
  schvaleno: "approved",
  zamítnuto: "rejected",
  zamitnuto: "rejected",
  zrušeno: "cancelled",
  zruseno: "cancelled",
  evidováno: "recorded",
  evidovano: "recorded"
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

function normalizeLookup(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function dateValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function timeValue(value) {
  const cleaned = cleanString(value);
  if (!/^\d{2}:\d{2}$/.test(cleaned)) {
    return "";
  }

  const [hours, minutes] = cleaned.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }

  return cleaned;
}

function timeMinutes(value) {
  const time = timeValue(value);
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isoNow() {
  return new Date().toISOString();
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

function countHours(startTime, endTime) {
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return 0;
  }

  return (end - start) / 60;
}

function isHalfHourStep(value) {
  const minutes = timeMinutes(value);
  return minutes !== null && minutes % 30 === 0;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

async function absenceRequestColumns(db) {
  try {
    const result = await db.prepare("PRAGMA table_info(absence_requests)").all();
    return new Set((result.results || []).map((row) => cleanString(row.name)));
  } catch (error) {
    console.error("absence_requests.schema_read_failed", { message: error.message });
    return new Set();
  }
}

function hasDoctorHoursColumns(columns) {
  return ["unit", "start_time", "end_time", "hours"].every((columnName) => columns.has(columnName));
}

function normalizeType(value) {
  const direct = cleanString(value);
  const type = TYPE_ALIASES[normalizeLookup(direct)] || direct;

  if (!REQUEST_TYPES.has(type)) {
    throw new AbsenceRequestStoreError("Vyberte typ nepřítomnosti.", 400, "absence_type_invalid");
  }

  return type;
}

function normalizeStatus(value) {
  const direct = cleanString(value);
  const status = STATUS_ALIASES[normalizeLookup(direct)] || direct;

  return REQUEST_STATUSES.has(status) ? status : "";
}

function initialStatusForType(type) {
  return APPROVAL_TYPES.has(type) ? "pending_approval" : "recorded";
}

function canViewAllAbsenceRequests(currentUser) {
  const role = normalizeRole(currentUser?.role);
  return isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly";
}

function canViewTeamAbsenceRequests(currentUser) {
  const role = normalizeRole(currentUser?.role);
  return role === "garazmistr" || role === "dispecer";
}

function canCreateForOtherEmployee(currentUser) {
  return (
    isFullAccessRole(currentUser) ||
    hasPermission(currentUser, "absence", "edit") ||
    hasPermission(currentUser, "absence", "manage")
  );
}

function isTeamMatch(currentUser, item) {
  const department = cleanString(currentUser?.department).toLowerCase();
  return Boolean(department && (
    department === cleanString(item.department).toLowerCase() ||
    department === cleanString(item.team).toLowerCase()
  ));
}

function visibleToUser(currentUser, item) {
  if (canViewAllAbsenceRequests(currentUser)) {
    return true;
  }

  if (sameId(currentUser?.id, item.employeeId)) {
    return true;
  }

  if (sameId(currentUser?.id, item.managerId)) {
    return true;
  }

  return canViewTeamAbsenceRequests(currentUser) && isTeamMatch(currentUser, item);
}

function canApproveRequest(currentUser, request) {
  if (!request || sameId(currentUser?.id, request.employeeId)) {
    return false;
  }

  const status = normalizeStatus(request.status);
  if (status !== "pending_approval") {
    return false;
  }

  if (isFullAccessRole(currentUser)) {
    return true;
  }

  if (sameId(currentUser?.id, request.managerId)) {
    return true;
  }

  if (!hasPermission(currentUser, "absence", "approve")) {
    return false;
  }

  const role = normalizeRole(currentUser?.role);
  if (role === "kancelar") {
    return true;
  }

  if (role === "garazmistr" || role === "dispecer") {
    return isTeamMatch(currentUser, request);
  }

  return false;
}

function historyFromRow(row) {
  return {
    id: cleanString(row.id),
    absenceRequestId: cleanString(row.absence_request_id),
    fromStatus: normalizeStatus(row.from_status) || cleanString(row.from_status),
    fromStatusLabel: STATUS_LABELS[normalizeStatus(row.from_status)] || cleanString(row.from_status),
    toStatus: normalizeStatus(row.to_status) || cleanString(row.to_status),
    toStatusLabel: STATUS_LABELS[normalizeStatus(row.to_status)] || cleanString(row.to_status),
    changedByUserId: cleanString(row.changed_by_user_id),
    changedByName: cleanString(row.changed_by_name),
    changedAt: cleanString(row.changed_at),
    note: cleanString(row.note)
  };
}

function requestFromRow(row, history = []) {
  if (!row) {
    return null;
  }

  const type = cleanString(row.type);
  const typeCode = TYPE_ALIASES[normalizeLookup(type)] || type;
  const status = normalizeStatus(row.status) || cleanString(row.status);
  const managerId = cleanString(row.manager_id);
  const managerName = cleanString(row.manager_name);
  const approverId = cleanString(row.approver_id || row.approver_user_id);

  return {
    id: cleanString(row.id),
    employeeId: cleanString(row.employee_id),
    employeeName: cleanString(row.employee_name),
    employeeEmail: cleanString(row.employee_email),
    employeePhone: cleanString(row.employee_phone),
    type: typeCode,
    typeLabel: TYPE_LABELS[typeCode] || typeCode,
    dateFrom: dateValue(row.date_from),
    dateTo: dateValue(row.date_to),
    halfDay: Boolean(row.half_day),
    halfDayFrom: Boolean(row.half_day),
    halfDayTo: false,
    unit: cleanString(row.unit) || "days",
    startTime: timeValue(row.start_time),
    endTime: timeValue(row.end_time),
    hours: Number(row.hours || 0),
    note: cleanString(row.note),
    status,
    statusLabel: STATUS_LABELS[status] || status,
    daysCount: Number(row.days_count || 0),
    managerId,
    managerName,
    managerEmail: cleanString(row.manager_email),
    managerPhone: cleanString(row.manager_phone),
    approverId,
    approverName: cleanString(row.approver_name),
    approverUserId: approverId || managerId,
    submittedAt: cleanString(row.submitted_at || row.created_at),
    approvedAt: cleanString(row.approved_at),
    rejectedAt: cleanString(row.rejected_at),
    rejectionReason: cleanString(row.rejection_reason),
    reminderSentAt: cleanString(row.reminder_sent_at),
    department: cleanString(row.department),
    team: cleanString(row.team),
    createdByUserId: cleanString(row.created_by_user_id),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    history
  };
}

function normalizeInput(input, users, currentUser) {
  const type = normalizeType(input?.type);
  const dateFrom = dateValue(input?.dateFrom);
  const rawDateTo = dateValue(input?.dateTo);
  const isDoctorHours = type === "doctor";
  const halfDay = isDoctorHours ? false : Boolean(input?.halfDay || input?.halfDayFrom || input?.halfDayTo);
  const employeeId = cleanString(input?.employeeId || currentUser?.id);

  if (!dateFrom) {
    throw new AbsenceRequestStoreError("Vyberte datum začátku.", 400, "absence_date_from_required");
  }

  const startTime = isDoctorHours ? timeValue(input?.startTime) : "";
  const endTime = isDoctorHours ? timeValue(input?.endTime) : "";
  const dateTo = isDoctorHours ? dateFrom : (rawDateTo || dateFrom);
  let daysCount = 0;
  let hours = 0;

  if (isDoctorHours) {
    if (!startTime || !endTime) {
      throw new AbsenceRequestStoreError("U lékaře zadejte čas od a čas do.", 400, "absence_doctor_time_required");
    }

    if (!isHalfHourStep(startTime) || !isHalfHourStep(endTime)) {
      throw new AbsenceRequestStoreError("Čas lékaře zadávejte po 30 minutách.", 400, "absence_doctor_time_step_invalid");
    }

    hours = countHours(startTime, endTime);
    if (hours <= 0) {
      throw new AbsenceRequestStoreError("Čas do musí být po času od.", 400, "absence_doctor_time_range_invalid");
    }
  } else {
    daysCount = countDays(dateFrom, dateTo, halfDay);
    if (daysCount <= 0) {
      throw new AbsenceRequestStoreError("Zkontrolujte datum.", 400, "absence_date_range_invalid");
    }
  }

  if (!sameId(employeeId, currentUser?.id) && !canCreateForOtherEmployee(currentUser)) {
    throw new AbsenceRequestStoreError("Můžete vytvořit jen vlastní žádost.", 403, "absence_create_forbidden");
  }

  const employee = users.find((user) => sameId(user.id, employeeId)) || currentUser;
  const manager = users.find((user) => sameId(user.id, employee?.managerId));
  const now = isoNow();
  const status = initialStatusForType(type);

  return {
    id: randomId("absence-request"),
    employeeId: cleanString(employee?.id || employeeId),
    employeeName: cleanString(employee?.name || currentUser?.name || "Uživatel"),
    employeeEmail: cleanString(employee?.email),
    employeePhone: cleanString(employee?.phone),
    type,
    dateFrom,
    dateTo,
    halfDay,
    unit: isDoctorHours ? "hours" : "days",
    startTime,
    endTime,
    hours,
    note: cleanString(input?.note),
    status,
    daysCount,
    managerId: cleanString(employee?.managerId),
    managerName: cleanString(employee?.managerName || manager?.name),
    managerEmail: cleanString(manager?.email),
    managerPhone: cleanString(manager?.phone),
    approverId: "",
    approverName: "",
    submittedAt: now,
    approvedAt: "",
    rejectedAt: "",
    rejectionReason: "",
    reminderSentAt: "",
    department: cleanString(employee?.department || currentUser?.department),
    team: cleanString(employee?.team || employee?.department || currentUser?.department),
    createdByUserId: cleanString(currentUser?.id),
    createdAt: now,
    updatedAt: now
  };
}

async function appendHistory(db, requestId, fromStatus, toStatus, currentUser, note = "") {
  await db
    .prepare(`
      INSERT INTO absence_approval_history (
        id,
        absence_request_id,
        from_status,
        to_status,
        changed_by_user_id,
        changed_by_name,
        changed_at,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      randomId("absence-history"),
      requestId,
      nullableString(fromStatus),
      toStatus,
      nullableString(currentUser?.id),
      nullableString(currentUser?.name || currentUser?.email),
      isoNow(),
      nullableString(note)
    )
    .run();
}

async function historyForRequest(db, requestId) {
  const result = await db
    .prepare("SELECT * FROM absence_approval_history WHERE absence_request_id = ? ORDER BY changed_at DESC")
    .bind(requestId)
    .all();

  return (result.results || []).map(historyFromRow);
}

async function requestById(db, requestId, includeHistory = false) {
  const row = await db
    .prepare("SELECT * FROM absence_requests WHERE id = ? LIMIT 1")
    .bind(requestId)
    .first();

  if (!row) {
    return null;
  }

  const history = includeHistory ? await historyForRequest(db, requestId) : [];
  return requestFromRow(row, history);
}

export function absenceRequestApiStatus(env) {
  return absenceDatabase(env) ? "ready" : "waiting";
}

export async function listAbsenceRequests(env, users, currentUser, options = {}) {
  const db = absenceDatabase(env, true);
  const mineOnly = options.mine === true;
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 200));
  const query = mineOnly
    ? db
        .prepare("SELECT * FROM absence_requests WHERE lower(employee_id) = lower(?) ORDER BY created_at DESC LIMIT ?")
        .bind(currentUser?.id || "", limit)
    : db
        .prepare("SELECT * FROM absence_requests ORDER BY created_at DESC LIMIT ?")
        .bind(limit);
  const result = await query.all();
  const requests = (result.results || [])
    .map((row) => requestFromRow(row))
    .filter(Boolean)
    .filter((request) => (
      mineOnly
        ? sameId(currentUser?.id, request.employeeId)
        : visibleToUser(currentUser, request)
    ));

  return requests;
}

export async function listPendingAbsenceRequests(env, users, currentUser, options = {}) {
  const db = absenceDatabase(env, true);
  const managerId = cleanString(options.managerId);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 200));
  const result = await db
    .prepare(`
      SELECT *
      FROM absence_requests
      WHERE status IN ('pending', 'pending_approval')
      ORDER BY submitted_at ASC, created_at ASC
      LIMIT ?
    `)
    .bind(limit)
    .all();
  const requests = (result.results || [])
    .map((row) => requestFromRow(row))
    .filter(Boolean)
    .filter((request) => !managerId || sameId(request.managerId, managerId))
    .filter((request) => visibleToUser(currentUser, request))
    .filter((request) => canApproveRequest(currentUser, request));

  return requests;
}

export async function getAbsenceRequestRecord(env, users, currentUser, requestId) {
  const db = absenceDatabase(env, true);
  const request = await requestById(db, requestId, true);

  if (!request) {
    throw new AbsenceRequestStoreError("Žádost nebyla nalezena.", 404, "absence_request_not_found");
  }

  if (!visibleToUser(currentUser, request)) {
    throw new AbsenceRequestStoreError("Nemáte oprávnění zobrazit tuto žádost.", 403, "absence_request_forbidden");
  }

  return request;
}

export async function createAbsenceRequestRecord(env, users, currentUser, input) {
  const db = absenceDatabase(env, true);
  const request = normalizeInput(input, users, currentUser);
  const columns = await absenceRequestColumns(db);
  const canWriteDoctorHours = hasDoctorHoursColumns(columns);

  if (request.unit === "hours" && !canWriteDoctorHours) {
    throw new AbsenceRequestStoreError("Úložiště hodin lékaře není připravené.", 503, "absence_doctor_hours_schema_missing");
  }

  const optionalDoctorColumns = canWriteDoctorHours
    ? `
        unit,
        start_time,
        end_time,
        hours,
      `
    : "";
  const optionalDoctorPlaceholders = canWriteDoctorHours ? "?, ?, ?, ?," : "";
  const optionalDoctorValues = canWriteDoctorHours
    ? [
        request.unit,
        nullableString(request.startTime),
        nullableString(request.endTime),
        request.hours || null
      ]
    : [];

  await db
    .prepare(`
      INSERT INTO absence_requests (
        id,
        employee_id,
        employee_name,
        employee_email,
        employee_phone,
        type,
        date_from,
        date_to,
        half_day,
        ${optionalDoctorColumns}
        note,
        status,
        days_count,
        manager_id,
        manager_name,
        manager_email,
        manager_phone,
        approver_user_id,
        approver_id,
        approver_name,
        submitted_at,
        approved_at,
        rejected_at,
        rejection_reason,
        reminder_sent_at,
        department,
        team,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${optionalDoctorPlaceholders} ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      request.id,
      request.employeeId,
      request.employeeName,
      nullableString(request.employeeEmail),
      nullableString(request.employeePhone),
      request.type,
      request.dateFrom,
      request.dateTo || request.dateFrom,
      request.halfDay ? 1 : 0,
      ...optionalDoctorValues,
      nullableString(request.note),
      request.status,
      request.daysCount,
      nullableString(request.managerId),
      nullableString(request.managerName),
      nullableString(request.managerEmail),
      nullableString(request.managerPhone),
      nullableString(request.managerId),
      null,
      null,
      request.submittedAt,
      null,
      null,
      null,
      null,
      nullableString(request.department),
      nullableString(request.team),
      request.createdByUserId,
      request.createdAt,
      request.updatedAt
    )
    .run();

  await appendHistory(db, request.id, "draft", request.status, currentUser, request.note);

  return {
    ...request,
    typeLabel: TYPE_LABELS[request.type],
    statusLabel: STATUS_LABELS[request.status],
    dateTo: request.dateTo || addDays(request.dateFrom, 0),
    history: await historyForRequest(db, request.id)
  };
}

export async function approveAbsenceRequestRecord(env, users, currentUser, requestId, input = {}) {
  const db = absenceDatabase(env, true);
  const request = await requestById(db, requestId, true);

  if (!request) {
    throw new AbsenceRequestStoreError("Žádost nebyla nalezena.", 404, "absence_request_not_found");
  }

  if (!canApproveRequest(currentUser, request)) {
    throw new AbsenceRequestStoreError("Nemáte oprávnění schválit tuto žádost.", 403, "absence_approve_forbidden");
  }

  const now = isoNow();
  await db
    .prepare(`
      UPDATE absence_requests
      SET status = 'approved',
          approver_id = ?,
          approver_user_id = ?,
          approver_name = ?,
          approved_at = ?,
          rejected_at = NULL,
          rejection_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      currentUser?.id || cleanString(input?.approvedByUserId),
      currentUser?.id || cleanString(input?.approvedByUserId),
      currentUser?.name || currentUser?.email || "",
      now,
      now,
      request.id
    )
    .run();

  await appendHistory(db, request.id, request.status, "approved", currentUser, cleanString(input?.note) || "Schváleno.");
  return getAbsenceRequestRecord(env, users, currentUser, request.id);
}

export async function rejectAbsenceRequestRecord(env, users, currentUser, requestId, input = {}) {
  const db = absenceDatabase(env, true);
  const request = await requestById(db, requestId, true);

  if (!request) {
    throw new AbsenceRequestStoreError("Žádost nebyla nalezena.", 404, "absence_request_not_found");
  }

  if (!canApproveRequest(currentUser, request)) {
    throw new AbsenceRequestStoreError("Nemáte oprávnění zamítnout tuto žádost.", 403, "absence_reject_forbidden");
  }

  const reason = cleanString(input?.reason);
  const now = isoNow();
  await db
    .prepare(`
      UPDATE absence_requests
      SET status = 'rejected',
          approver_id = ?,
          approver_user_id = ?,
          approver_name = ?,
          approved_at = NULL,
          rejected_at = ?,
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      currentUser?.id || cleanString(input?.rejectedByUserId),
      currentUser?.id || cleanString(input?.rejectedByUserId),
      currentUser?.name || currentUser?.email || "",
      now,
      nullableString(reason),
      now,
      request.id
    )
    .run();

  await appendHistory(db, request.id, request.status, "rejected", currentUser, reason || "Zamítnuto.");
  return getAbsenceRequestRecord(env, users, currentUser, request.id);
}

export async function cancelAbsenceRequestRecord(env, users, currentUser, requestId) {
  const db = absenceDatabase(env, true);
  const request = await requestById(db, requestId, true);

  if (!request) {
    throw new AbsenceRequestStoreError("Žádost nebyla nalezena.", 404, "absence_request_not_found");
  }

  const ownRequest = sameId(currentUser?.id, request.employeeId);
  if (!ownRequest && !canViewAllAbsenceRequests(currentUser)) {
    throw new AbsenceRequestStoreError("Nemáte oprávnění zrušit tuto žádost.", 403, "absence_cancel_forbidden");
  }

  if (request.status !== "pending_approval" && request.status !== "draft") {
    throw new AbsenceRequestStoreError("Tuto žádost už nejde zrušit.", 400, "absence_cancel_invalid_status");
  }

  const now = isoNow();
  await db
    .prepare("UPDATE absence_requests SET status = 'cancelled', updated_at = ? WHERE id = ?")
    .bind(now, request.id)
    .run();
  await appendHistory(db, request.id, request.status, "cancelled", currentUser, "Zrušeno uživatelem.");
  return getAbsenceRequestRecord(env, users, currentUser, request.id);
}

export async function markAbsenceReminderSent(env, requestId) {
  const db = absenceDatabase(env, true);
  const now = isoNow();
  await db
    .prepare("UPDATE absence_requests SET reminder_sent_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, requestId)
    .run();
  return requestById(db, requestId, true);
}

export async function listAbsenceRequestsForReminder(env, options = {}) {
  const db = absenceDatabase(env, true);
  const hours = Math.max(1, Number(options.hours || 24));
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare(`
      SELECT *
      FROM absence_requests
      WHERE status IN ('pending', 'pending_approval')
        AND submitted_at <= ?
        AND (reminder_sent_at IS NULL OR reminder_sent_at <= ?)
      ORDER BY submitted_at ASC
      LIMIT 100
    `)
    .bind(cutoff, cutoff)
    .all();

  return (result.results || []).map((row) => requestFromRow(row)).filter(Boolean);
}

export async function employeeAbsenceDetail(env, users, currentUser, employeeId) {
  const db = absenceDatabase(env, true);
  const result = await db
    .prepare("SELECT * FROM absence_requests WHERE lower(employee_id) = lower(?) ORDER BY created_at DESC LIMIT 50")
    .bind(employeeId)
    .all();
  const items = (result.results || [])
    .map((row) => requestFromRow(row))
    .filter(Boolean)
    .filter((request) => visibleToUser(currentUser, request));

  const histories = [];
  for (const item of items.slice(0, 20)) {
    histories.push(...(await historyForRequest(db, item.id)));
  }

  const year = new Date().getFullYear();
  const sickDaysCurrentYear = items
    .filter((item) => item.type === "sick" && item.dateFrom.startsWith(`${year}-`))
    .reduce((sum, item) => sum + Number(item.daysCount || 0), 0);
  const active = items.find((item) => ["pending_approval", "approved", "recorded"].includes(item.status));

  return {
    status: active?.statusLabel || "v práci",
    sickDaysCurrentYear,
    lastAbsenceDate: items[0]?.dateFrom || "",
    items,
    history: histories.sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt))),
    note: items.length ? "Historie nepřítomností je načtená z cloud API." : "Zatím tu nejsou žádné žádosti."
  };
}
