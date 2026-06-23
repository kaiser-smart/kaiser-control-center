import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  getEmployeeCard,
  listEmployeeDocuments
} from "../../../_lib/employees-store.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.documents_failed", { message: error.message });
  return json({ error: "Dokumenty zaměstnance se teď nepodařilo načíst." }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const documents = await listEmployeeDocuments(env, employee.id);
    return json({
      documents,
      apiStatus: employeeApiStatus(env),
      uploadStatus: "waiting",
      missingEndpoint: "POST /api/employees/:id/documents"
    });
  } catch (error) {
    return employeeError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  return json(
    {
      error: "Upload dokumentů čeká na cloudové úložiště / API.",
      status: "Čeká na API",
      missingEndpoint: "POST /api/employees/:id/documents"
    },
    501
  );
}
