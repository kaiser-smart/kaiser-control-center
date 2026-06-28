import { getUsers, json, requireUserPermission } from "../../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  cancelAbsenceRequestRecord,
  getAbsenceRequestRecord
} from "../../_lib/absence-requests-store.js";

function requestId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-1) || "")).trim();
}

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("absence_request.detail_failed", { message: error.message });
  return json({ error: "Žádost se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const absenceRequest = await getAbsenceRequestRecord(env, users, user, requestId(request, params));
    return json({ request: absenceRequest, apiStatus: "ready" });
  } catch (error) {
    return absenceRequestError(error);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const absenceRequest = await cancelAbsenceRequestRecord(env, users, user, requestId(request, params));
    return json({ request: absenceRequest, apiStatus: "ready" });
  } catch (error) {
    return absenceRequestError(error);
  }
}
