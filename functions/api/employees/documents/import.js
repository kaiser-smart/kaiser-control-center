import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeDocumentImportError,
  applyEmployeeDocumentImport,
  isEmployeeDocumentImportFile
} from "../../../_lib/employee-document-import.js";
import { EmployeeStoreError } from "../../../_lib/employees-store.js";

function uploadedFiles(formData) {
  return [...formData.values()].filter(isEmployeeDocumentImportFile);
}

function importError(error) {
  if (error instanceof EmployeeDocumentImportError || error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "ready" }, error.status);
  }

  console.error("employees.documents.import_failed", { message: error.message });
  return json({ error: "Import dokumentů se teď nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "edit");

  if (response) {
    return response;
  }

  try {
    const formData = await request.formData();
    const users = await getUsers(env);
    const result = await applyEmployeeDocumentImport(env, users, user, uploadedFiles(formData));

    return json({ result, apiStatus: "ready" }, 201);
  } catch (error) {
    return importError(error);
  }
}
