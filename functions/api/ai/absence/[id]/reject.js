import { getUsers, json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  rejectAbsenceRequestRecord
} from "../../../../_lib/absence-requests-store.js";
import { recordAiAction } from "../../../../_lib/ai-action-log-store.js";
import { sendAbsenceDecisionSms } from "../../../../_lib/notification-service.js";

function requestId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function requireAiConfirmation(payload) {
  return payload?.confirmed === true && payload?.confirmationSource === "ai_ui";
}

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("ai.absence.reject_failed", { message: error.message });
  return json({ error: "Žádost se nepodařilo zamítnout.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "approve");

  if (response) {
    return response;
  }

  const payload = await readJson(request);

  if (!requireAiConfirmation(payload)) {
    return json({ error: "AI akce vyžaduje potvrzení uživatele.", code: "ai_confirmation_required" }, 409);
  }

  try {
    const users = await getUsers(env);
    const absenceRequest = await rejectAbsenceRequestRecord(env, users, user, requestId(request, params), payload);
    const notification = await sendAbsenceDecisionSms(env, absenceRequest, "rejected");

    await recordAiAction(env, user, {
      assistantId: payload.assistantId || "",
      assistantName: payload.assistantName || "",
      actionType: "write",
      toolName: "ai_absence_reject",
      input: { requestId: absenceRequest.id },
      result: { status: absenceRequest.status, notificationStatus: notification?.status || "" },
      status: "ok"
    });

    return json({ request: absenceRequest, notification, apiStatus: "ready" });
  } catch (error) {
    await recordAiAction(env, user, {
      assistantId: payload.assistantId || "",
      assistantName: payload.assistantName || "",
      actionType: "write",
      toolName: "ai_absence_reject",
      input: { requestId: requestId(request, params) },
      result: { error: error.message },
      status: "error"
    });
    return absenceRequestError(error);
  }
}

