import { getUsers, json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  rejectAbsenceRequestRecord
} from "../../../_lib/absence-requests-store.js";
import { sendAbsenceDecisionSms } from "../../../_lib/notification-service.js";

function requestId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("absence_request.reject_failed", { message: error.message });
  return json({ error: "Žádost se nepodařilo zamítnout.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "approve");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const payload = await readJson(request);
    const absenceRequest = await rejectAbsenceRequestRecord(env, users, user, requestId(request, params), payload);
    const notification = await sendAbsenceDecisionSms(env, absenceRequest, "rejected");
    return json({ request: absenceRequest, notification, apiStatus: "ready" });
  } catch (error) {
    return absenceRequestError(error);
  }
}
