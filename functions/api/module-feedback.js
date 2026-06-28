import { json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  ModuleFeedbackStoreError,
  createModuleFeedbackRecord,
  listModuleFeedback
} from "../_lib/module-feedback-store.js";

function moduleFeedbackError(error, missingEndpoint = "GET /api/module-feedback") {
  if (error instanceof ModuleFeedbackStoreError) {
    return json({ error: error.message, apiStatus: "waiting", missingEndpoint }, error.status);
  }

  console.error("module_feedback.failed", { message: error.message });
  return json({ error: "Připomínky se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");

  if (response) {
    return response;
  }

  try {
    const feedback = await listModuleFeedback(env, user);
    return json({ feedback, apiStatus: "ready" });
  } catch (error) {
    return moduleFeedbackError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "create");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const feedback = await createModuleFeedbackRecord(env, user, payload);
    return json({ feedback, apiStatus: "ready" }, 201);
  } catch (error) {
    return moduleFeedbackError(error, "POST /api/module-feedback");
  }
}
