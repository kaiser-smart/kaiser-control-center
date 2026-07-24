import { json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  listFeedbackNotifications,
  markFeedbackNotificationRead
} from "../_lib/feedback-case-store.js";
import { SelfRepairStoreError } from "../_lib/self-repair-store.js";

function apiError(error) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("feedback_case.notifications_failed", { message: error?.message });
  return json({ error: "Notifikace se teď nepodařilo načíst." }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    return json(await listFeedbackNotifications(env, user));
  } catch (error) {
    return apiError(error);
  }
}

export async function onRequestPatch({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    const input = await readJson(request);
    return json(await markFeedbackNotificationRead(env, user, input.id));
  } catch (error) {
    return apiError(error);
  }
}
