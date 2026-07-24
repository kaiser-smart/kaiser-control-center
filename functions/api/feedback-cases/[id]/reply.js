import { json, requireUserPermission } from "../../../_lib/auth.js";
import { replyToFeedbackCase } from "../../../_lib/feedback-case-store.js";
import { SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES, SelfRepairStoreError } from "../../../_lib/self-repair-store.js";

function apiError(error) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("feedback_case.reply_failed", { message: error?.message });
  return json({ error: "Doplnění se teď nepodařilo uložit." }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES + (128 * 1024)) {
      throw new SelfRepairStoreError("Příloha může mít nejvýše 10 MB.", 413, "feedback_case_attachment_too_large");
    }
    const form = await request.formData();
    const attachment = form.get("attachment");
    const detail = await replyToFeedbackCase(
      env,
      user,
      params?.id || "",
      { body: form.get("body") },
      {
        attachment: attachment && typeof attachment.arrayBuffer === "function" && (attachment.name || attachment.size)
          ? attachment
          : null
      }
    );
    return json(detail);
  } catch (error) {
    return apiError(error);
  }
}
