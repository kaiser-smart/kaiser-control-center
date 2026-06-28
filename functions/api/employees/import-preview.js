import { getUsers, json, requireUserPermission } from "../../_lib/auth.js";
import {
  EMPLOYEE_EXCEL_IMPORT_MAX_FILE_SIZE_BYTES,
  EmployeeExcelImportError,
  createEmployeeExcelImportPreview
} from "../../_lib/employee-excel-import.js";
import { EmployeeStoreError } from "../../_lib/employees-store.js";

function isUploadFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

function employeeImportError(error) {
  if (error instanceof EmployeeExcelImportError || error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "ready" }, error.status);
  }

  console.error("employees.import_preview_failed", { message: error.message });
  return json({ error: "Import preview zaměstnanců se teď nepodařilo připravit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "edit");

  if (response) {
    return response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadFile(file)) {
      return json({ error: "Nahrajte Excel export zaměstnanců.", apiStatus: "ready" }, 400);
    }

    if (file.size > EMPLOYEE_EXCEL_IMPORT_MAX_FILE_SIZE_BYTES) {
      return json({ error: "Soubor je příliš velký. Maximum je 2 MB.", apiStatus: "ready" }, 400);
    }

    const users = await getUsers(env);
    const preview = await createEmployeeExcelImportPreview(env, users, user, {
      buffer: await file.arrayBuffer(),
      filename: file.name,
      contentType: file.type
    });

    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return employeeImportError(error);
  }
}
