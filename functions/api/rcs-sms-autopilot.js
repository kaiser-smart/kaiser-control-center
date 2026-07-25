import { json, requireUserPermission } from "../_lib/auth.js";
import {
  RcsSmsAutopilotStoreError,
  listRcsSmsConversations
} from "../_lib/rcs-sms-autopilot-store.js";
import { rcsSmsAutopilotStatus } from "../_lib/rcs-sms-autopilot-service.js";

function errorResponse(error) {
  if (error instanceof RcsSmsAutopilotStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }
  console.error("rcs_sms_autopilot.api_failed", { message: String(error?.message || "").slice(0, 300) });
  return json({
    error: "RCS/SMS konverzace se teď nepodařilo načíst.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "rcs-sms-autopilot", "view");
  if (response) return response;
  try {
    const [conversations, status] = await Promise.all([
      listRcsSmsConversations(env, new URL(request.url).searchParams),
      rcsSmsAutopilotStatus(env)
    ]);
    return json({
      ...conversations,
      status,
      apiStatus: "ready"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
