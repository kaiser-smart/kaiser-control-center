import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  prepareFeedbackCodexJob,
  submitFeedbackCodexJob
} from "../../../_lib/feedback-case-store.js";
import { SelfRepairStoreError } from "../../../_lib/self-repair-store.js";

function apiError(error) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("feedback_case.codex_failed", { message: error?.message });
  return json({ error: "Akci pro Codex se teď nepodařilo dokončit." }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "self-repair", "manage");
  if (response) return response;
  try {
    const input = await readJson(request);
    if (input.action === "prepare") {
      return json(await prepareFeedbackCodexJob(env, user, params?.id || ""), 201);
    }
    if (input.action === "submit") {
      return json(await submitFeedbackCodexJob(
        env,
        user,
        params?.id || "",
        input.jobId,
        input.confirmation
      ));
    }
    throw new SelfRepairStoreError("Vyberte platnou akci pro Codex.", 400, "feedback_codex_action_invalid");
  } catch (error) {
    return apiError(error);
  }
}
