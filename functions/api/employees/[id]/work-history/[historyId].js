import { getUsers, json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  EmployeeStoreError,
  canEditEmployee,
  getEmployeeCard,
  patchEmployeeWorkHistory
} from "../../../../_lib/employees-store.js";

function routeParam(request, params, indexFromEnd) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(params || parts.at(indexFromEnd) || "")).trim();
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.work_history_patch_failed", { message: error.message });
  return json({ error: "Pracovní historii se teď nepodařilo uložit." }, 500);
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  if (!canEditEmployee(user)) {
    return json({ error: "Nemáte oprávnění upravit pracovní historii." }, 403);
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, routeParam(request, params?.id, -3));
    const item = await patchEmployeeWorkHistory(env, employee.id, routeParam(request, params?.historyId, -1), await readJson(request));
    return json({ item });
  } catch (error) {
    return employeeError(error);
  }
}
