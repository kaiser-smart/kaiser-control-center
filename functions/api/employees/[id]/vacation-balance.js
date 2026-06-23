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

  console.error("employees.vacation_balance_failed", { message: error.message });
  return json({ error: "Zůstatek dovolené se teď nepodařilo načíst." }, 500);
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
      employeeId: employee.id,
      year: new Date().getFullYear(),
      vacationEntitlementDays: employee.vacationEntitlementDays,
      vacationUsedDays: employee.vacationUsedDays,
      vacationPendingDays: employee.vacationPendingDays,
      vacationRemainingDays: employee.vacationRemainingDays,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return employeeError(error);
  }
}
