import { getUsers, json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  getEmployeeCard,
  saveEmployeeCard
} from "../../_lib/employees-store.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-1) || "")).trim();
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.detail_failed", { message: error.message });
  return json({ error: "Kartu zaměstnance se teď nepodařilo načíst." }, 500);
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
      employee,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return employeeError(error);
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await saveEmployeeCard(env, users, user, employeeId(request, params), await readJson(request));
    return json({ employee });
  } catch (error) {
    return employeeError(error);
  }
}
