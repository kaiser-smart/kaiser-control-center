import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import { logEmployeeDocumentAction } from "../../../_lib/employee-document-audit-store.js";
import {
  EmployeeStoreError,
  getEmployeeCard
} from "../../../_lib/employees-store.js";
import {
  MedicalExamStoreError,
  getEmployeeMedicalExam
} from "../../../_lib/medical-exams-store.js";
import { renderMedicalExamRequestDocument } from "../../../_lib/medical-exam-request-template.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function safeFilename(value) {
  return String(value || "zadost-zdravotni-zpusobilost")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "zadost-zdravotni-zpusobilost";
}

function documentError(error) {
  if (error instanceof EmployeeStoreError || error instanceof MedicalExamStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.medical_exam_request_failed", { message: error.message });
  return json({ error: "Žádost o zdravotní způsobilost se teď nepodařilo připravit." }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "export");

  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "print" ? "print" : "download";
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const exam = await getEmployeeMedicalExam(env, employee, user);
    const html = renderMedicalExamRequestDocument({ employee, exam, mode });

    await logEmployeeDocumentAction(env, {
      employeeId: employee.id,
      documentType: "medical_exam_request",
      action: mode === "print" ? "print" : "export",
      performedByUserId: user.id,
      metadata: {
        category: exam.category || "",
        requestCategory: exam.requestCategory || "",
        requestExamType: exam.requestExamType || ""
      }
    });

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${safeFilename(`zadost-zdravotni-zpusobilost-${employee.id}`)}.html"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (error) {
    return documentError(error);
  }
}
