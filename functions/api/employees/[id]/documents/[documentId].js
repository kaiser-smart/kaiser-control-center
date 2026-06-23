import { getUsers, json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeDocumentsBucket,
  getEmployeeCard,
  getEmployeeDocument
} from "../../../../_lib/employees-store.js";

function requestEmployeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-3) || "")).trim();
}

function requestDocumentId(request, params) {
  return decodeURIComponent(String(params?.documentId || new URL(request.url).pathname.split("/").at(-1) || "")).trim();
}

function contentDispositionFilename(name) {
  const fallback = "dokument";
  const cleanName = String(name || fallback).replace(/[\r\n"]/g, "").trim() || fallback;
  return `attachment; filename*=UTF-8''${encodeURIComponent(cleanName)}`;
}

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.document_download_failed", { message: error.message });
  return json({ error: "Dokument se teď nepodařilo stáhnout." }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, requestEmployeeId(request, params));
    const document = await getEmployeeDocument(env, employee.id, requestDocumentId(request, params));
    const object = await employeeDocumentsBucket(env, true).get(document.storageKey);

    if (!object) {
      return json({ error: "Soubor dokumentu nebyl nalezen v cloudovém úložišti." }, 404);
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": document.contentType || object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": contentDispositionFilename(document.name),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return employeeError(error);
  }
}
