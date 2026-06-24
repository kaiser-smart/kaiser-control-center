import { getUsers, json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  ModuleFeedbackStoreError,
  updateModuleFeedbackRecord
} from "../../_lib/module-feedback-store.js";
import { sendModuleFeedbackResolvedNotification } from "../../_lib/notification-service.js";

function routeFeedbackId(request, params) {
  const id = params?.id || new URL(request.url).pathname.split("/").at(-1);
  return decodeURIComponent(String(id || "")).trim();
}

function moduleFeedbackPatchError(error) {
  if (error instanceof ModuleFeedbackStoreError) {
    return json({ error: error.message, apiStatus: "waiting", missingEndpoint: "PATCH /api/module-feedback/:id" }, error.status);
  }

  console.error("module_feedback.patch_failed", { message: error.message });
  return json({ error: "Změny se nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function authorForFeedback(users, feedback) {
  return users.find((item) => sameId(item.id, feedback.userId)) || null;
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "edit");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const updatedFeedback = await updateModuleFeedbackRecord(env, user, routeFeedbackId(request, params), payload);
    const { previousStatus, ...feedback } = updatedFeedback;
    let notification = null;

    if (feedback.status === "Hotovo" && previousStatus !== "Hotovo") {
      const users = await getUsers(env);
      const author = authorForFeedback(users, feedback);
      notification = await sendModuleFeedbackResolvedNotification(env, feedback, {
        recipientEmail: author?.email || "",
        recipientName: author?.name || feedback.userName,
        resolutionMessage: payload.resolutionMessage || ""
      });
    }

    return json({ feedback, notification, apiStatus: "ready" });
  } catch (error) {
    return moduleFeedbackPatchError(error);
  }
}
