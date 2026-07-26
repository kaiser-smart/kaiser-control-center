import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  RcsSmsReviewSendError,
  cancelRcsSmsReviewSend,
  prepareRcsSmsReviewSendGrant
} from "../../../_lib/rcs-sms-review-send-service.js";

function conversationId(request, params) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return String(params?.id || segments.at(-2) || "").trim();
}

function errorResponse(error) {
  if (error instanceof RcsSmsReviewSendError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("rcs_sms_review_grant_failed", {
    message: String(error?.message || "").slice(0, 300)
  });
  return json({
    error: "Jednorázové oprávnění se teď nepodařilo zpracovat.",
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
    return json({
      ...(await prepareRcsSmsReviewSendGrant(
        env,
        conversationId(request, params),
        await readJson(request),
        user
      )),
      apiStatus: "ready"
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const { user, response } = await requireUserPermission(
    env,
    request,
    "rcs-sms-autopilot",
    "manage"
  );
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json({
      ...(await cancelRcsSmsReviewSend(
        env,
        conversationId(request, params),
        { grantId: url.searchParams.get("grantId") },
        user
      )),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
