import { isFullAccessRole, normalizeRole } from "../../src/permissions.js";

const EMPLOYEE_DB_BINDING = "SMART_ODPADY_DB";
export const EMPLOYEE_DOCUMENTS_BUCKET_BINDING = "SMART_ODPADY_DOCUMENTS";

export class EmployeeStoreError extends Error {
  constructor(message, status = 400, code = "employee_store_error") {
    super(message);
    this.name = "EmployeeStoreError";
    this.status = status;
    this.code = code;
  }
}

function employeeDatabase(env, required = false) {
  const db = env?.[EMPLOYEE_DB_BINDING] || null;

  if (!db && required) {
    throw new EmployeeStoreError(
      "Databáze zaměstnanců není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "employees_database_missing"
    );
  }

  return db;
}

export function employeeDocumentsBucket(env, required = false) {
  const bucket = env?.[EMPLOYEE_DOCUMENTS_BUCKET_BINDING] || null;

  if (!bucket && required) {
    throw new EmployeeStoreError(
      "Úložiště dokumentů není nastavené. Přidejte Cloudflare R2 binding SMART_ODPADY_DOCUMENTS.",
      503,
      "employee_documents_bucket_missing"
    );
  }

  return bucket;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

function safeFilename(filename) {
  const fallback = "dokument";
  return cleanString(filename)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

export function employeeDocumentStorageKey(employeeId, documentId, filename) {
  return [
    "employees",
    safeFilename(employeeId),
    safeFilename(documentId),
    safeFilename(filename)
  ].join("/");
}

function splitName(name) {
  const parts = cleanString(name).split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: parts[0] || "",
      lastName: ""
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1)
  };
}

function fullName(employee) {
  return [employee?.firstName, employee?.lastName].map(cleanString).filter(Boolean).join(" ");
}

function activeStatus(user) {
  const status = cleanString(user?.status).toLowerCase();
  return user?.active === false || status === "disabled" || status === "vypnutý" ? "inactive" : "active";
}

function defaultVacationEntitlement(user) {
  return normalizeRole(user?.role) === "ridic" ? 20 : 25;
}

function rowToEmployee(row, user, users = []) {
  const fallbackName = splitName(user?.name);
  const entitlement = numberValue(row?.vacation_entitlement_days, defaultVacationEntitlement(user));
  const used = numberValue(row?.vacation_used_days, 0);
  const pending = numberValue(row?.vacation_pending_days, 0);
  const managerId = cleanString(row?.manager_id || user?.managerId);
  const manager = users.find((item) => sameId(item.id, managerId));

  return {
    id: cleanString(row?.id || user?.id),
    userId: cleanString(row?.user_id || user?.id),
    firstName: cleanString(row?.first_name) || fallbackName.firstName,
    lastName: cleanString(row?.last_name) || fallbackName.lastName,
    email: cleanString(row?.email || user?.email),
    phone: cleanString(row?.phone || user?.phone),
    role: normalizeRole(row?.role || user?.role),
    department: cleanString(row?.department || user?.department),
    position: cleanString(row?.position || user?.position),
    address: cleanString(row?.address || user?.address),
    workplace: cleanString(row?.workplace || user?.workplace),
    managerId,
    managerName: cleanString(row?.manager_name || manager?.name || user?.managerName),
    employmentStatus: cleanString(row?.employment_status) || activeStatus(user),
    startDate: dateValue(row?.start_date),
    employmentType: cleanString(row?.employment_type),
    workload: numberValue(row?.workload, 1),
    weeklyHours: numberValue(row?.weekly_hours, numberValue(row?.workload, 1) * 40),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: numberValue(row?.vacation_remaining_days, entitlement - used - pending),
    currentAbsenceStatus: cleanString(row?.current_absence_status) || "v práci",
    sickDaysCurrentYear: numberValue(row?.sick_days_current_year, 0),
    lastAbsenceDate: dateValue(row?.last_absence_date),
    internalNote: cleanString(row?.internal_note),
    createdAt: cleanString(row?.created_at || user?.createdAt),
    updatedAt: cleanString(row?.updated_at || user?.updatedAt || user?.createdAt)
  };
}

function normalizeEmployeeInput(input, existingEmployee, users, now = new Date().toISOString()) {
  const managerId = cleanString(input?.managerId ?? existingEmployee?.managerId);

  if (managerId && sameId(managerId, existingEmployee?.id)) {
    throw new EmployeeStoreError("Zaměstnanec nesmí být sám sobě nadřízený.", 400, "employee_manager_self");
  }

  const manager = managerId
    ? users.find((user) => (
        sameId(user.id, managerId) &&
        user.active !== false &&
        cleanString(user.status || "active").toLowerCase() !== "disabled"
      ))
    : null;

  if (managerId && !manager) {
    throw new EmployeeStoreError("Vybraný nadřízený není aktivní uživatel.", 400, "employee_manager_invalid");
  }

  const entitlement = numberValue(input?.vacationEntitlementDays ?? existingEmployee?.vacationEntitlementDays, 20);
  const used = numberValue(input?.vacationUsedDays ?? existingEmployee?.vacationUsedDays, 0);
  const pending = numberValue(input?.vacationPendingDays ?? existingEmployee?.vacationPendingDays, 0);
  const remaining = Object.prototype.hasOwnProperty.call(input || {}, "vacationRemainingDays")
    ? numberValue(input.vacationRemainingDays, entitlement - used - pending)
    : entitlement - used - pending;

  return {
    ...existingEmployee,
    firstName: cleanString(input?.firstName ?? existingEmployee?.firstName),
    lastName: cleanString(input?.lastName ?? existingEmployee?.lastName),
    email: cleanString(input?.email ?? existingEmployee?.email).toLowerCase(),
    phone: cleanString(input?.phone ?? existingEmployee?.phone),
    role: normalizeRole(input?.role ?? existingEmployee?.role),
    department: cleanString(input?.department ?? existingEmployee?.department),
    position: cleanString(input?.position ?? existingEmployee?.position),
    address: cleanString(input?.address ?? existingEmployee?.address),
    workplace: cleanString(input?.workplace ?? existingEmployee?.workplace),
    managerId,
    managerName: managerId ? cleanString(manager?.name) : "",
    employmentStatus: cleanString(input?.employmentStatus ?? existingEmployee?.employmentStatus) || "active",
    startDate: dateValue(input?.startDate ?? existingEmployee?.startDate),
    employmentType: cleanString(input?.employmentType ?? existingEmployee?.employmentType),
    workload: numberValue(input?.workload ?? existingEmployee?.workload, 1),
    weeklyHours: numberValue(input?.weeklyHours ?? existingEmployee?.weeklyHours, numberValue(input?.workload ?? existingEmployee?.workload, 1) * 40),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: remaining,
    currentAbsenceStatus: cleanString(input?.currentAbsenceStatus ?? existingEmployee?.currentAbsenceStatus) || "v práci",
    sickDaysCurrentYear: numberValue(input?.sickDaysCurrentYear ?? existingEmployee?.sickDaysCurrentYear, 0),
    lastAbsenceDate: dateValue(input?.lastAbsenceDate ?? existingEmployee?.lastAbsenceDate),
    internalNote: cleanString(input?.internalNote ?? existingEmployee?.internalNote),
    createdAt: existingEmployee?.createdAt || now,
    updatedAt: now
  };
}

function workHistoryFromRow(row) {
  return {
    id: cleanString(row.id),
    employeeId: cleanString(row.employee_id),
    dateFrom: dateValue(row.date_from),
    dateTo: dateValue(row.date_to),
    position: cleanString(row.position),
    department: cleanString(row.department),
    note: cleanString(row.note),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function documentFromRow(row) {
  return {
    id: cleanString(row.id),
    employeeId: cleanString(row.employee_id),
    type: cleanString(row.type),
    name: cleanString(row.name),
    fileUrl: cleanString(row.file_url),
    storageKey: cleanString(row.storage_key),
    contentType: cleanString(row.content_type),
    sizeBytes: numberValue(row.size_bytes, 0),
    uploadedAt: cleanString(row.uploaded_at),
    uploadedByUserId: cleanString(row.uploaded_by_user_id),
    expiresAt: dateValue(row.expires_at),
    note: cleanString(row.note)
  };
}

function employeeVisibilityScope(currentUser) {
  const role = normalizeRole(currentUser?.role);

  if (isFullAccessRole(currentUser) || role === "kancelar" || role === "readonly") {
    return "all";
  }

  if (role === "garazmistr" || role === "dispecer") {
    return "team";
  }

  return "own";
}

export function canViewEmployee(currentUser, employee) {
  const scope = employeeVisibilityScope(currentUser);

  if (scope === "all") {
    return true;
  }

  if (sameId(currentUser?.id, employee?.userId || employee?.id)) {
    return true;
  }

  if (scope === "team") {
    return (
      cleanString(currentUser?.department) &&
      cleanString(currentUser.department).toLowerCase() === cleanString(employee?.department).toLowerCase()
    );
  }

  return false;
}

export function canEditEmployee(currentUser) {
  const role = normalizeRole(currentUser?.role);
  return isFullAccessRole(currentUser) || role === "kancelar";
}

export function canEditEmployeeManager(currentUser) {
  return canEditEmployee(currentUser);
}

export async function listEmployeeCards(env, users, currentUser) {
  const db = employeeDatabase(env);
  let rows = [];

  if (db) {
    try {
      const result = await db.prepare("SELECT * FROM employee_cards ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC").all();
      rows = result.results || [];
    } catch (error) {
      console.error("employees.d1_list_failed", { message: error.message });
      rows = [];
    }
  }

  const rowsByUserId = new Map(rows.map((row) => [cleanString(row.user_id || row.id).toLowerCase(), row]));
  return users
    .map((user) => rowToEmployee(rowsByUserId.get(cleanString(user.id).toLowerCase()), user, users))
    .filter((employee) => canViewEmployee(currentUser, employee))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "cs"));
}

export async function getEmployeeCard(env, users, currentUser, employeeId) {
  const targetUser = users.find((user) => sameId(user.id, employeeId));

  if (!targetUser) {
    throw new EmployeeStoreError("Zaměstnanec nebyl nalezen.", 404, "employee_not_found");
  }

  const db = employeeDatabase(env);
  let row = null;

  if (db) {
    try {
      row = await db
        .prepare("SELECT * FROM employee_cards WHERE user_id = ? OR id = ? LIMIT 1")
        .bind(targetUser.id, employeeId)
        .first();
    } catch (error) {
      console.error("employees.d1_get_failed", { message: error.message });
    }
  }

  const employee = rowToEmployee(row, targetUser, users);

  if (!canViewEmployee(currentUser, employee)) {
    throw new EmployeeStoreError("Nemáte oprávnění zobrazit kartu zaměstnance.", 403, "employee_forbidden");
  }

  return employee;
}

export async function saveEmployeeCard(env, users, currentUser, employeeId, input) {
  if (!canEditEmployee(currentUser)) {
    throw new EmployeeStoreError("Nemáte oprávnění upravit kartu zaměstnance.", 403, "employee_edit_forbidden");
  }

  const db = employeeDatabase(env, true);
  const existingEmployee = await getEmployeeCard(env, users, currentUser, employeeId);
  const employee = normalizeEmployeeInput(input, existingEmployee, users);

  await db
    .prepare(`
      INSERT INTO employee_cards (
        id,
        user_id,
        first_name,
        last_name,
        email,
        phone,
        role,
        department,
        position,
        address,
        workplace,
        manager_id,
        manager_name,
        employment_status,
        start_date,
        employment_type,
        workload,
        weekly_hours,
        vacation_entitlement_days,
        vacation_used_days,
        vacation_pending_days,
        vacation_remaining_days,
        current_absence_status,
        sick_days_current_year,
        last_absence_date,
        internal_note,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        department = excluded.department,
        position = excluded.position,
        address = excluded.address,
        workplace = excluded.workplace,
        manager_id = excluded.manager_id,
        manager_name = excluded.manager_name,
        employment_status = excluded.employment_status,
        start_date = excluded.start_date,
        employment_type = excluded.employment_type,
        workload = excluded.workload,
        weekly_hours = excluded.weekly_hours,
        vacation_entitlement_days = excluded.vacation_entitlement_days,
        vacation_used_days = excluded.vacation_used_days,
        vacation_pending_days = excluded.vacation_pending_days,
        vacation_remaining_days = excluded.vacation_remaining_days,
        current_absence_status = excluded.current_absence_status,
        sick_days_current_year = excluded.sick_days_current_year,
        last_absence_date = excluded.last_absence_date,
        internal_note = excluded.internal_note,
        updated_at = excluded.updated_at
    `)
    .bind(
      employee.id,
      employee.userId,
      nullableString(employee.firstName),
      nullableString(employee.lastName),
      nullableString(employee.email),
      nullableString(employee.phone),
      employee.role,
      nullableString(employee.department),
      nullableString(employee.position),
      nullableString(employee.address),
      nullableString(employee.workplace),
      nullableString(employee.managerId),
      nullableString(employee.managerName),
      employee.employmentStatus,
      nullableString(employee.startDate),
      nullableString(employee.employmentType),
      employee.workload,
      employee.weeklyHours,
      employee.vacationEntitlementDays,
      employee.vacationUsedDays,
      employee.vacationPendingDays,
      employee.vacationRemainingDays,
      employee.currentAbsenceStatus,
      employee.sickDaysCurrentYear,
      nullableString(employee.lastAbsenceDate),
      nullableString(employee.internalNote),
      employee.createdAt,
      employee.updatedAt
    )
    .run();

  return employee;
}

export async function listEmployeeWorkHistory(env, employeeId) {
  const db = employeeDatabase(env);

  if (!db) {
    return [];
  }

  const result = await db
    .prepare("SELECT * FROM employee_work_history WHERE employee_id = ? ORDER BY date_from DESC, created_at DESC")
    .bind(employeeId)
    .all();

  return (result.results || []).map(workHistoryFromRow);
}

export async function saveEmployeeWorkHistory(env, employeeId, input) {
  const db = employeeDatabase(env, true);
  const now = new Date().toISOString();
  const item = {
    id: cleanString(input?.id) || randomId("work-history"),
    employeeId,
    dateFrom: dateValue(input?.dateFrom),
    dateTo: dateValue(input?.dateTo),
    position: cleanString(input?.position),
    department: cleanString(input?.department),
    note: cleanString(input?.note),
    createdAt: cleanString(input?.createdAt) || now,
    updatedAt: now
  };

  await db
    .prepare(`
      INSERT INTO employee_work_history (
        id,
        employee_id,
        date_from,
        date_to,
        position,
        department,
        note,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date_from = excluded.date_from,
        date_to = excluded.date_to,
        position = excluded.position,
        department = excluded.department,
        note = excluded.note,
        updated_at = excluded.updated_at
    `)
    .bind(
      item.id,
      item.employeeId,
      nullableString(item.dateFrom),
      nullableString(item.dateTo),
      nullableString(item.position),
      nullableString(item.department),
      nullableString(item.note),
      item.createdAt,
      item.updatedAt
    )
    .run();

  return item;
}

export async function patchEmployeeWorkHistory(env, employeeId, historyId, input) {
  const currentItems = await listEmployeeWorkHistory(env, employeeId);
  const existing = currentItems.find((item) => sameId(item.id, historyId));

  if (!existing) {
    throw new EmployeeStoreError("Záznam pracovní historie nebyl nalezen.", 404, "work_history_not_found");
  }

  return saveEmployeeWorkHistory(env, employeeId, {
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt
  });
}

export async function listEmployeeDocuments(env, employeeId) {
  const db = employeeDatabase(env);

  if (!db) {
    return [];
  }

  const result = await db
    .prepare(`
      SELECT d.*, f.storage_key, f.content_type, f.size_bytes
      FROM employee_documents d
      LEFT JOIN employee_document_files f ON f.document_id = d.id
      WHERE d.employee_id = ?
      ORDER BY d.expires_at ASC, d.uploaded_at DESC
    `)
    .bind(employeeId)
    .all();

  return (result.results || []).map(documentFromRow);
}

export async function getEmployeeDocument(env, employeeId, documentId) {
  const db = employeeDatabase(env, true);
  const result = await db
    .prepare(`
      SELECT d.*, f.storage_key, f.content_type, f.size_bytes
      FROM employee_documents d
      LEFT JOIN employee_document_files f ON f.document_id = d.id
      WHERE d.employee_id = ? AND d.id = ?
      LIMIT 1
    `)
    .bind(employeeId, documentId)
    .first();

  if (!result) {
    throw new EmployeeStoreError("Dokument zaměstnance nebyl nalezen.", 404, "employee_document_not_found");
  }

  const document = documentFromRow(result);

  if (!document.storageKey) {
    throw new EmployeeStoreError("Soubor dokumentu není uložený v cloudovém úložišti.", 404, "employee_document_file_missing");
  }

  return document;
}

export async function saveEmployeeDocument(env, employeeId, input) {
  const db = employeeDatabase(env, true);
  const now = new Date().toISOString();
  const id = cleanString(input?.id) || randomId("employee-document");
  const name = cleanString(input?.name);

  if (!name) {
    throw new EmployeeStoreError("Zadejte název dokumentu.", 400, "employee_document_name_missing");
  }

  const storageKey = cleanString(input?.storageKey);
  if (!storageKey) {
    throw new EmployeeStoreError("Chybí cesta souboru v cloudovém úložišti.", 400, "employee_document_storage_missing");
  }

  const fileUrl = cleanString(input?.fileUrl) || `/api/employees/${encodeURIComponent(employeeId)}/documents/${encodeURIComponent(id)}`;
  const item = {
    id,
    employeeId,
    type: cleanString(input?.type) || "Ostatní",
    name,
    fileUrl,
    storageKey,
    contentType: cleanString(input?.contentType) || "application/octet-stream",
    sizeBytes: numberValue(input?.sizeBytes, 0),
    uploadedAt: now,
    uploadedByUserId: cleanString(input?.uploadedByUserId),
    expiresAt: dateValue(input?.expiresAt),
    note: cleanString(input?.note),
    createdAt: now,
    updatedAt: now
  };

  const documentStatement = db
    .prepare(`
      INSERT INTO employee_documents (
        id,
        employee_id,
        type,
        name,
        file_url,
        uploaded_at,
        uploaded_by_user_id,
        expires_at,
        note,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      item.id,
      item.employeeId,
      nullableString(item.type),
      item.name,
      nullableString(item.fileUrl),
      item.uploadedAt,
      nullableString(item.uploadedByUserId),
      nullableString(item.expiresAt),
      nullableString(item.note),
      item.createdAt,
      item.updatedAt
    );

  const fileStatement = db
    .prepare(`
      INSERT INTO employee_document_files (
        document_id,
        employee_id,
        storage_key,
        content_type,
        size_bytes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        employee_id = excluded.employee_id,
        storage_key = excluded.storage_key,
        content_type = excluded.content_type,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at
    `)
    .bind(
      item.id,
      item.employeeId,
      item.storageKey,
      item.contentType,
      item.sizeBytes,
      item.createdAt,
      item.updatedAt
    );

  if (typeof db.batch === "function") {
    await db.batch([documentStatement, fileStatement]);
  } else {
    await documentStatement.run();
    await fileStatement.run();
  }

  return item;
}

export function employeeApiStatus(env) {
  return employeeDatabase(env) ? "ready" : "waiting";
}

export function employeeDocumentsUploadStatus(env) {
  return employeeDatabase(env) && employeeDocumentsBucket(env) ? "ready" : "waiting";
}
