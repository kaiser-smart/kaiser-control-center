import { getUsers, json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  createAbsenceRequestRecord,
  listAbsenceRequests
} from "../_lib/absence-requests-store.js";
import { sendAbsenceApprovalRequestNotification } from "../_lib/notification-service.js";

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting", missingEndpoint: "POST /api/absence-requests" }, error.status);
  }

  console.error("absence_requests.failed", { message: error.message });
  return json({ error: "Nepodařilo se odeslat. Zkuste to znovu.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "1";
    const limit = Number(url.searchParams.get("limit") || 20);
    const requests = await listAbsenceRequests(env, users, user, { mine, limit });
    return json({ requests, apiStatus: "ready" });
  } catch (error) {
    return absenceRequestError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "create");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const payload = await readJson(request);
    const absenceRequest = await createAbsenceRequestRecord(env, users, user, payload);
    const notification = await sendAbsenceApprovalRequestNotification(env, absenceRequest);
    return json({ request: absenceRequest, notification, apiStatus: "ready" }, 201);
  } catch (error) {
    return absenceRequestError(error);
  }
}
