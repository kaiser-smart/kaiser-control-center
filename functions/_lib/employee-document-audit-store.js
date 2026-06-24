const AUDIT_DB_BINDING = "SMART_ODPADY_DB";

function cleanString(value) {
  return String(value ?? "").trim();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

export async function logEmployeeDocumentAction(env, input = {}) {
  const db = env?.[AUDIT_DB_BINDING] || null;
  if (!db) {
    return null;
  }

  const now = new Date().toISOString();

  try {
    await db
      .prepare(`
        INSERT INTO employee_document_audit_logs (
          id,
          employee_id,
          document_type,
          action,
          performed_by_user_id,
          performed_at,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        randomId("employee-document-audit"),
        cleanString(input.employeeId),
        cleanString(input.documentType) || "medical_exam_request",
        cleanString(input.action) || "export",
        cleanString(input.performedByUserId),
        now,
        JSON.stringify(input.metadata || {})
      )
      .run();
  } catch (error) {
    console.error("employee_document_audit_failed", { message: error.message });
  }

  return null;
}
