import { isFullAccessRole } from "../../src/permissions.js";
import {
  MEDICAL_EXAM_RULES,
  calculateMedicalExamState,
  medicalExamDateValue,
  normalizeMedicalExamCategory
} from "../../src/data/medicalExamRules.js";

const MEDICAL_EXAM_DB_BINDING = "SMART_ODPADY_DB";
const REMINDER_STATUSES = new Set(["due_soon", "overdue", "missing_data"]);

export class MedicalExamStoreError extends Error {
  constructor(message, status = 400, code = "medical_exam_store_error") {
    super(message);
    this.name = "MedicalExamStoreError";
    this.status = status;
    this.code = code;
  }
}

function medicalExamDatabase(env, required = false) {
  const db = env?.[MEDICAL_EXAM_DB_BINDING] || null;

  if (!db && required) {
    throw new MedicalExamStoreError(
      "Databáze lékařských prohlídek není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "medical_exam_database_missing"
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

function booleanValue(value, fallback = false) {
  if (value === true || value === "true" || value === "1" || value === 1 || value === "on") {
    return true;
  }

  if (value === false || value === "false" || value === "0" || value === 0 || value === "off") {
    return false;
  }

  return fallback;
}

function examTypeValue(value) {
  const cleaned = cleanString(value);
  return ["entry", "periodic", "extraordinary"].includes(cleaned) ? cleaned : "entry";
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].map(cleanString).filter(Boolean).join(" ") ||
    cleanString(employee?.name) ||
    "Zaměstnanec";
}

export function canViewMedicalExam(currentUser) {
  return isFullAccessRole(currentUser);
}

export function canEditMedicalExam(currentUser) {
  return isFullAccessRole(currentUser);
}

function baseMedicalExam(employee, row = null) {
  const category = normalizeMedicalExamCategory(row?.category);
  const dateOfBirth = medicalExamDateValue(row?.date_of_birth);
  const lastExamDate = medicalExamDateValue(row?.last_exam_date);
  const calculated = calculateMedicalExamState({
    category,
    dateOfBirth,
    lastExamDate
  });

  return {
    id: cleanString(row?.id),
    employeeId: cleanString(employee?.id || employee?.userId || row?.employee_id),
    employeeName: employeeName(employee),
    employeeEmail: cleanString(employee?.email),
    category,
    dateOfBirth,
    lastExamDate,
    requestExamType: examTypeValue(row?.request_exam_type),
    requestCategory: normalizeMedicalExamCategory(row?.request_category || category),
    medicalFacilityName: cleanString(row?.medical_facility_name),
    medicalDoctorName: cleanString(row?.medical_doctor_name),
    medicalFacilityAddress: cleanString(row?.medical_facility_address),
    medicalFacilityCompanyId: cleanString(row?.medical_facility_company_id),
    note: cleanString(row?.note),
    notificationEnabled: row ? booleanValue(row.notification_enabled, true) : true,
    lastNotificationKey: cleanString(row?.last_notification_key),
    lastNotificationSentAt: cleanString(row?.last_notification_sent_at),
    updatedByUserId: cleanString(row?.updated_by_user_id),
    createdAt: cleanString(row?.created_at),
    updatedAt: cleanString(row?.updated_at),
    ...calculated
  };
}

function reminderKey(exam) {
  return [
    "medical-exam",
    cleanString(exam.employeeId),
    cleanString(exam.status),
    cleanString(exam.nextExamDate || "missing-next"),
    cleanString(exam.lastExamDate || "missing-last"),
    cleanString(exam.category || "missing-category")
  ].join(":");
}

function shouldSendReminder(exam) {
  if (!exam?.notificationEnabled || !REMINDER_STATUSES.has(exam.status)) {
    return false;
  }

  if (exam.status === "missing_data") {
    const rule = MEDICAL_EXAM_RULES[exam.category];
    return Boolean(rule && !rule.noExam && !exam.lastExamDate);
  }

  return true;
}

function employeeFromReminderRow(row, users = []) {
  const employeeId = cleanString(row?.employee_id);
  const user = users.find((item) => cleanString(item.id).toLowerCase() === employeeId.toLowerCase()) || {};

  return {
    id: employeeId,
    userId: employeeId,
    firstName: cleanString(row?.first_name) || cleanString(user.name).split(/\s+/).slice(0, -1).join(" "),
    lastName: cleanString(row?.last_name) || cleanString(user.name).split(/\s+/).at(-1),
    name: cleanString(user.name),
    email: cleanString(row?.email || user.email),
    role: cleanString(row?.role || user.role),
    department: cleanString(row?.department || user.department),
    position: cleanString(row?.position || user.position)
  };
}

export function medicalExamApiStatus(env) {
  return medicalExamDatabase(env) ? "ready" : "waiting";
}

export async function getEmployeeMedicalExam(env, employee, currentUser) {
  if (!canViewMedicalExam(currentUser)) {
    throw new MedicalExamStoreError("Nemáte oprávnění zobrazit lékařské prohlídky.", 403, "medical_exam_forbidden");
  }

  const db = medicalExamDatabase(env);
  if (!db) {
    return baseMedicalExam(employee);
  }

  const row = await db
    .prepare("SELECT * FROM employee_medical_exams WHERE employee_id = ? LIMIT 1")
    .bind(employee.id)
    .first();

  return baseMedicalExam(employee, row);
}

export async function saveEmployeeMedicalExam(env, employee, currentUser, input) {
  if (!canEditMedicalExam(currentUser)) {
    throw new MedicalExamStoreError("Nemáte oprávnění upravit lékařské prohlídky.", 403, "medical_exam_edit_forbidden");
  }

  const db = medicalExamDatabase(env, true);
  const existing = await db
    .prepare("SELECT * FROM employee_medical_exams WHERE employee_id = ? LIMIT 1")
    .bind(employee.id)
    .first();
  const now = new Date().toISOString();
  const category = normalizeMedicalExamCategory(input?.category ?? existing?.category);
  const dateOfBirth = medicalExamDateValue(input?.dateOfBirth ?? existing?.date_of_birth);
  const lastExamDate = medicalExamDateValue(input?.lastExamDate ?? existing?.last_exam_date);
  const calculated = calculateMedicalExamState({ category, dateOfBirth, lastExamDate });
  const item = {
    id: cleanString(existing?.id) || randomId("medical-exam"),
    employeeId: employee.id,
    category,
    dateOfBirth,
    lastExamDate,
    requestExamType: examTypeValue(input?.requestExamType ?? existing?.request_exam_type),
    requestCategory: normalizeMedicalExamCategory(input?.requestCategory ?? existing?.request_category ?? category),
    medicalFacilityName: cleanString(input?.medicalFacilityName ?? existing?.medical_facility_name),
    medicalDoctorName: cleanString(input?.medicalDoctorName ?? existing?.medical_doctor_name),
    medicalFacilityAddress: cleanString(input?.medicalFacilityAddress ?? existing?.medical_facility_address),
    medicalFacilityCompanyId: cleanString(input?.medicalFacilityCompanyId ?? existing?.medical_facility_company_id),
    nextExamDate: calculated.nextExamDate,
    intervalMonths: calculated.intervalMonths,
    status: calculated.status,
    note: cleanString(input?.note ?? existing?.note),
    optional: calculated.optional,
    notificationEnabled: booleanValue(input?.notificationEnabled ?? existing?.notification_enabled, true),
    updatedByUserId: cleanString(currentUser?.id),
    createdAt: cleanString(existing?.created_at) || now,
    updatedAt: now
  };

  await db
    .prepare(`
      INSERT INTO employee_medical_exams (
        id,
        employee_id,
        category,
        date_of_birth,
        last_exam_date,
        request_exam_type,
        request_category,
        medical_facility_name,
        medical_doctor_name,
        medical_facility_address,
        medical_facility_company_id,
        next_exam_date,
        interval_months,
        status,
        note,
        optional,
        notification_enabled,
        last_notification_key,
        last_notification_sent_at,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id) DO UPDATE SET
        category = excluded.category,
        date_of_birth = excluded.date_of_birth,
        last_exam_date = excluded.last_exam_date,
        request_exam_type = excluded.request_exam_type,
        request_category = excluded.request_category,
        medical_facility_name = excluded.medical_facility_name,
        medical_doctor_name = excluded.medical_doctor_name,
        medical_facility_address = excluded.medical_facility_address,
        medical_facility_company_id = excluded.medical_facility_company_id,
        next_exam_date = excluded.next_exam_date,
        interval_months = excluded.interval_months,
        status = excluded.status,
        note = excluded.note,
        optional = excluded.optional,
        notification_enabled = excluded.notification_enabled,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at
    `)
    .bind(
      item.id,
      item.employeeId,
      nullableString(item.category),
      nullableString(item.dateOfBirth),
      nullableString(item.lastExamDate),
      nullableString(item.requestExamType),
      nullableString(item.requestCategory),
      nullableString(item.medicalFacilityName),
      nullableString(item.medicalDoctorName),
      nullableString(item.medicalFacilityAddress),
      nullableString(item.medicalFacilityCompanyId),
      nullableString(item.nextExamDate),
      item.intervalMonths,
      item.status,
      nullableString(item.note),
      item.optional ? 1 : 0,
      item.notificationEnabled ? 1 : 0,
      cleanString(existing?.last_notification_key) || null,
      cleanString(existing?.last_notification_sent_at) || null,
      nullableString(item.updatedByUserId),
      item.createdAt,
      item.updatedAt
    )
    .run();

  return baseMedicalExam(employee, {
    ...existing,
    id: item.id,
    employee_id: item.employeeId,
    category: item.category,
    date_of_birth: item.dateOfBirth,
    last_exam_date: item.lastExamDate,
    request_exam_type: item.requestExamType,
    request_category: item.requestCategory,
    medical_facility_name: item.medicalFacilityName,
    medical_doctor_name: item.medicalDoctorName,
    medical_facility_address: item.medicalFacilityAddress,
    medical_facility_company_id: item.medicalFacilityCompanyId,
    note: item.note,
    notification_enabled: item.notificationEnabled ? 1 : 0,
    last_notification_key: cleanString(existing?.last_notification_key),
    last_notification_sent_at: cleanString(existing?.last_notification_sent_at),
    updated_by_user_id: item.updatedByUserId,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  });
}

export async function listMedicalExamReminderCandidates(env, users = []) {
  const db = medicalExamDatabase(env);
  if (!db) {
    return [];
  }

  const result = await db
    .prepare(`
      SELECT
        m.*,
        e.first_name,
        e.last_name,
        e.email,
        e.role,
        e.department,
        e.position
      FROM employee_medical_exams m
      LEFT JOIN employee_cards e ON e.user_id = m.employee_id OR e.id = m.employee_id
      WHERE m.notification_enabled = 1
    `)
    .all();

  return (result.results || [])
    .map((row) => {
      const exam = baseMedicalExam(employeeFromReminderRow(row, users), row);
      const notificationKey = reminderKey(exam);

      return {
        ...exam,
        notificationKey
      };
    })
    .filter((exam) => shouldSendReminder(exam) && exam.notificationKey !== exam.lastNotificationKey);
}

export async function markMedicalExamReminderSent(env, examId, notificationKey) {
  const db = medicalExamDatabase(env);

  if (!db || !cleanString(examId) || !cleanString(notificationKey)) {
    return;
  }

  await db
    .prepare(`
      UPDATE employee_medical_exams
      SET last_notification_key = ?, last_notification_sent_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(notificationKey, new Date().toISOString(), new Date().toISOString(), examId)
    .run();
}
