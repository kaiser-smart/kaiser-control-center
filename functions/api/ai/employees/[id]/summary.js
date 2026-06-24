import { getUsers, json, requireUserPermission } from "../../../../_lib/auth.js";
import { recordAiAction } from "../../../../_lib/ai-action-log-store.js";
import {
  AbsenceRequestStoreError,
  employeeAbsenceDetail
} from "../../../../_lib/absence-requests-store.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  getEmployeeCard
} from "../../../../_lib/employees-store.js";
import {
  cleanAiString,
  sanitizeEmployeeForAi
} from "../../../../_lib/ai-people-summary.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function employeeSummaryError(error) {
  if (error instanceof EmployeeStoreError || error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("ai.employees.summary_failed", { message: error.message });
  return json({ error: "Souhrn zaměstnance se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

async function safeAbsenceSummary(env, users, user, employee) {
  try {
    const absence = await employeeAbsenceDetail(env, users, user, employee.id);
    const items = Array.isArray(absence.items) ? absence.items : [];

    return {
      status: cleanAiString(absence.status || employee.currentAbsenceStatus),
      sickDaysCurrentYear: Number(absence.sickDaysCurrentYear || employee.sickDaysCurrentYear || 0),
      lastAbsenceDate: cleanAiString(absence.lastAbsenceDate || employee.lastAbsenceDate),
      pendingCount: items.filter((item) => ["pending", "pending_approval"].includes(item.status)).length,
      approvedCount: items.filter((item) => item.status === "approved").length,
      recentCount: items.length,
      note: cleanAiString(absence.note)
    };
  } catch (error) {
    if (error instanceof AbsenceRequestStoreError && error.status === 503) {
      return {
        status: cleanAiString(employee.currentAbsenceStatus),
        sickDaysCurrentYear: Number(employee.sickDaysCurrentYear || 0),
        lastAbsenceDate: cleanAiString(employee.lastAbsenceDate),
        pendingCount: 0,
        approvedCount: 0,
        recentCount: 0,
        note: "Detail nepřítomností není teď dostupný."
      };
    }

    throw error;
  }
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const id = employeeId(request, params);

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, id);
    const summary = sanitizeEmployeeForAi(employee);
    const absence = await safeAbsenceSummary(env, users, user, employee);

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_employee_summary",
      input: { employeeId: employee.id },
      result: { found: true },
      status: "ok"
    });

    return json({
      employee: {
        ...summary,
        absence
      },
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_employee_summary",
      input: { employeeId: id },
      result: { error: error.message },
      status: "error"
    });
    return employeeSummaryError(error);
  }
}
