import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeStoreError,
  canEditEmployee,
  employeeDocumentStorageKey,
  employeeDocumentsBucket,
  employeeDocumentsUploadStatus,
  employeeApiStatus,
  getEmployeeCard,
  listEmployeeDocuments,
  saveEmployeeDocument
} from "../../../_lib/employees-store.js";

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

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

function cleanFormValue(value) {
  return String(value || "").trim();
}

function isUploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number";
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
      uploadStatus: employeeDocumentsUploadStatus(env),
      missingEndpoint: employeeDocumentsUploadStatus(env) === "ready" ? "" : "Cloudflare R2 binding SMART_ODPADY_DOCUMENTS"
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
    return json({ error: "Nemáte oprávnění nahrávat dokumenty." }, 403);
  }

  let storageKey = "";

  try {
    const bucket = employeeDocumentsBucket(env, true);
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadedFile(file) || file.size <= 0) {
      return json({ error: "Vyberte soubor dokumentu." }, 400);
    }

    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      return json({ error: "Soubor je příliš velký. Maximum je 10 MB." }, 400);
    }

    const originalName = cleanFormValue(file.name) || "dokument";
    const documentName = cleanFormValue(formData.get("name")) || originalName;
    const documentId = crypto.randomUUID();
    storageKey = employeeDocumentStorageKey(employee.id, documentId, originalName);
    const contentType = cleanFormValue(file.type) || "application/octet-stream";

    await bucket.put(storageKey, file.stream(), {
      httpMetadata: {
        contentType
      },
      customMetadata: {
        employeeId: employee.id,
        documentId,
        uploadedByUserId: user.id || ""
      }
    });

    const document = await saveEmployeeDocument(env, employee.id, {
      id: documentId,
      type: cleanFormValue(formData.get("type")) || "Ostatní",
      name: documentName,
      storageKey,
      contentType,
      sizeBytes: file.size,
      uploadedByUserId: user.id,
      expiresAt: cleanFormValue(formData.get("expiresAt")),
      note: cleanFormValue(formData.get("note"))
    });

    return json({
      document,
      apiStatus: employeeApiStatus(env),
      uploadStatus: "ready"
    }, 201);
  } catch (error) {
    if (storageKey) {
      await employeeDocumentsBucket(env)?.delete(storageKey).catch(() => {});
    }

    return employeeError(error);
  }
}
