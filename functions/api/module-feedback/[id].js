import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  ModuleFeedbackStoreError,
  updateModuleFeedbackRecord
} from "../../_lib/module-feedback-store.js";

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

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "edit");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const feedback = await updateModuleFeedbackRecord(env, user, routeFeedbackId(request, params), payload);
    return json({ feedback, apiStatus: "ready" });
  } catch (error) {
    return moduleFeedbackPatchError(error);
  }
}
