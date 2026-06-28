import { getUsers, json, requireUserPermission } from "../../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  listAbsenceRequestsForReminder
} from "../../_lib/absence-requests-store.js";
import { sendAbsenceApprovalReminders } from "../../_lib/notification-service.js";

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("absence_request.reminders_failed", { message: error.message });
  return json({ error: "Připomínky se nepodařilo odeslat.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "manage");

  if (response) {
    return response;
  }

  try {
    await getUsers(env);
    const requests = await listAbsenceRequestsForReminder(env, {
      hours: Number(env.ABSENCE_APPROVAL_REMINDER_HOURS || 24)
    });
    const notifications = await sendAbsenceApprovalReminders(env, requests);
    return json({
      count: requests.length,
      notifications,
      apiStatus: "ready"
    });
  } catch (error) {
    return absenceRequestError(error);
  }
}
