import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  RcsSmsAutopilotStoreError,
  appendRcsSmsEvent,
  getRcsSmsConversationDetail,
  setRcsSmsConversationState
} from "../../_lib/rcs-sms-autopilot-store.js";

function conversationId(request, params) {
  return String(
    params?.id ||
    new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ||
    ""
  ).trim();
}

function errorResponse(error) {
  if (error instanceof RcsSmsAutopilotStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("rcs_sms_autopilot.detail_failed", { message: String(error?.message || "").slice(0, 300) });
  return json({
    error: "Detail RCS/SMS konverzace se teď nepodařilo zpracovat.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "rcs-sms-autopilot", "view");
  if (response) return response;
  try {
    return json({
      ...(await getRcsSmsConversationDetail(env, conversationId(request, params))),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "rcs-sms-autopilot", "manage");
  if (response) return response;
  const id = conversationId(request, params);
  try {
    const body = await readJson(request);
    const action = String(body.action || "").trim();
    const patches = {
      take_over: { status: "human_takeover", humanTakeover: true, awaitingField: "" },
      release: { status: "open", humanTakeover: false, awaitingField: "" },
      close: { status: "closed", humanTakeover: false, awaitingField: "" }
    };
    const patch = patches[action];
    if (!patch) {
      return json({
        error: "Povolené akce jsou take_over, release nebo close.",
        apiStatus: "ready"
      }, 400);
    }
    await getRcsSmsConversationDetail(env, id);
    await setRcsSmsConversationState(env, id, patch);
    await appendRcsSmsEvent(env, {
      conversationId: id,
      eventType: `human_${action}`,
      status: patch.status,
      detail: action === "take_over"
        ? "Konverzaci převzal oprávněný uživatel KSO."
        : action === "release"
          ? "Oprávněný uživatel vrátil konverzaci do otevřeného stavu."
          : "Oprávněný uživatel konverzaci uzavřel.",
      metadata: {
        actorUserId: String(user?.id || ""),
        actorName: String(user?.name || "")
      }
    });
    return json({
      ...(await getRcsSmsConversationDetail(env, id)),
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
