import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { verifyFeedbackCase } from "../../../_lib/feedback-case-store.js";
import { SelfRepairStoreError } from "../../../_lib/self-repair-store.js";

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    const input = await readJson(request);
    const detail = await verifyFeedbackCase(env, user, params?.id || "", input.result, input.note);
    return json(detail);
  } catch (error) {
    if (error instanceof SelfRepairStoreError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("feedback_case.verify_failed", { message: error?.message });
    return json({ error: "Výsledek ověření se teď nepodařilo uložit." }, 500);
  }
}
