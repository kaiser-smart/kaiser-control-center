import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  RcsSmsReviewSendError,
  confirmRcsSmsReviewSend
} from "../../../_lib/rcs-sms-review-send-service.js";

function conversationId(request, params) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return String(params?.id || segments.at(-2) || "").trim();
}

function errorResponse(error) {
  if (error instanceof RcsSmsReviewSendError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("rcs_sms_review_send_failed", {
    message: String(error?.message || "").slice(0, 300)
  });
  return json({
    error: "Jednorázové odeslání se teď nepodařilo zpracovat.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(
    env,
    request,
    "rcs-sms-autopilot",
    "manage"
  );
  if (response) return response;
  try {
    const result = await confirmRcsSmsReviewSend(
      env,
      conversationId(request, params),
      await readJson(request),
      user
    );
    return json({ ...result, apiStatus: "ready" }, result.sent ? 202 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
