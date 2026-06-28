import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  ModuleFeedbackStoreError,
  createModuleFeedbackRecord
} from "../../_lib/module-feedback-store.js";
import { recordAiAction } from "../../_lib/ai-action-log-store.js";

function requireAiConfirmation(payload) {
  return payload?.confirmed === true && payload?.confirmationSource === "ai_ui";
}

function moduleFeedbackError(error) {
  if (error instanceof ModuleFeedbackStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("ai.feedback.failed", { message: error.message });
  return json({ error: "Připomínku se teď nepodařilo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "create");

  if (response) {
    return response;
  }

  const payload = await readJson(request);

  if (!requireAiConfirmation(payload)) {
    return json({ error: "AI akce vyžaduje potvrzení uživatele.", code: "ai_confirmation_required" }, 409);
  }

  try {
    const feedback = await createModuleFeedbackRecord(env, user, payload);

    await recordAiAction(env, user, {
      assistantId: payload.assistantId || "",
      assistantName: payload.assistantName || "",
      actionType: "write",
      toolName: "ai_feedback_create",
      input: { moduleId: payload.moduleId, moduleName: payload.moduleName },
      result: { feedbackId: feedback.id },
      status: "ok"
    });

    return json({ feedback, apiStatus: "ready" }, 201);
  } catch (error) {
    await recordAiAction(env, user, {
      assistantId: payload.assistantId || "",
      assistantName: payload.assistantName || "",
      actionType: "write",
      toolName: "ai_feedback_create",
      input: { moduleId: payload.moduleId, moduleName: payload.moduleName },
      result: { error: error.message },
      status: "error"
    });
    return moduleFeedbackError(error);
  }
}

