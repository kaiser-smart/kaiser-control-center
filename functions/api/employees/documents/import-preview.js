import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeDocumentImportError,
  createEmployeeDocumentImportPreview,
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

  console.error("employees.documents.import_preview_failed", { message: error.message });
  return json({ error: "Preview importu dokumentů se teď nepodařilo připravit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "edit");

  if (response) {
    return response;
  }

  try {
    const formData = await request.formData();
    const users = await getUsers(env);
    const preview = await createEmployeeDocumentImportPreview(env, users, user, uploadedFiles(formData));

    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return importError(error);
  }
}
