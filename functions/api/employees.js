import { getUsers, json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  listEmployeeCards,
  saveEmployeeCard
} from "../_lib/employees-store.js";

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.api_failed", { message: error.message });
  return json({ error: "Karty zaměstnanců se teď nepodařilo načíst." }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employees = await listEmployeeCards(env, users, user);
    return json({
      employees,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return employeeError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "edit");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const users = await getUsers(env);
    const employee = await saveEmployeeCard(env, users, user, payload.userId || payload.id, payload);
    return json({ employee }, 201);
  } catch (error) {
    return employeeError(error);
  }
}
