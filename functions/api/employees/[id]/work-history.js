import { getUsers, json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeStoreError,
  canEditEmployee,
  employeeApiStatus,
  getEmployeeCard,
  listEmployeeWorkHistory,
  saveEmployeeWorkHistory
} from "../../../_lib/employees-store.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.work_history_failed", { message: error.message });
  return json({ error: "Pracovní historii se teď nepodařilo načíst." }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const items = await listEmployeeWorkHistory(env, employee.id);
    return json({
      items,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return employeeError(error);
  }
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  if (!canEditEmployee(user)) {
    return json({ error: "Nemáte oprávnění upravit pracovní historii." }, 403);
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const item = await saveEmployeeWorkHistory(env, employee.id, await readJson(request));
    return json({ item }, 201);
  } catch (error) {
    return employeeError(error);
  }
}
