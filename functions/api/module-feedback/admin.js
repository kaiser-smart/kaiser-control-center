import { currentUser, json, readJson } from "../../_lib/auth.js";
import {
  ModuleFeedbackStoreError,
  canCreateCentralModuleFeedback,
  createCentralModuleFeedbackRecord
} from "../../_lib/module-feedback-store.js";

function moduleFeedbackAdminError(error) {
  if (error instanceof ModuleFeedbackStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("module_feedback.admin_create_failed", { message: error.message });
  return json({ error: "Připomínku se teď nepodařilo vytvořit.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return json({ error: "Nepřihlášeno." }, 401);
  }

  if (!canCreateCentralModuleFeedback(user)) {
    return json({ error: "Nemáte oprávnění." }, 403);
  }

  try {
    const payload = await readJson(request);
    const feedback = await createCentralModuleFeedbackRecord(env, user, payload);
    return json({ feedback, apiStatus: "ready" }, 201);
  } catch (error) {
    return moduleFeedbackAdminError(error);
  }
}
