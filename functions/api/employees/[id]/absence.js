import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  getEmployeeCard
} from "../../../_lib/employees-store.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.absence_failed", { message: error.message });
  return json({ error: "Absence zaměstnance se teď nepodařilo načíst." }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    return json({
      status: employee.currentAbsenceStatus,
      sickDaysCurrentYear: employee.sickDaysCurrentYear,
      lastAbsenceDate: employee.lastAbsenceDate,
      items: [],
      apiStatus: employeeApiStatus(env),
      note: "Detailní historie absencí čeká na samostatné cloudové API nepřítomností."
    });
  } catch (error) {
    return employeeError(error);
  }
}
