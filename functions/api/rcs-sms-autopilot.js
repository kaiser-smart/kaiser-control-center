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

export async function loadRcsSmsInboxData(env, searchParams, dependencies = {}) {
  const loadConversations = dependencies.loadConversations || listRcsSmsConversations;
  const loadStatus = dependencies.loadStatus || rcsSmsAutopilotStatus;
  const conversations = await loadConversations(env, searchParams);
  let status = null;
  let statusApiStatus = "ready";

  try {
    status = await loadStatus(env);
  } catch (error) {
    statusApiStatus = "waiting";
    console.error("rcs_sms_autopilot.status_failed", {
      message: String(error?.message || "").slice(0, 300)
    });
  }

  return {
    ...conversations,
    status,
    statusApiStatus,
    apiStatus: "ready"
  };
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "rcs-sms-autopilot", "view");
  if (response) return response;
  try {
    return json(await loadRcsSmsInboxData(env, new URL(request.url).searchParams));
  } catch (error) {
    return errorResponse(error);
  }
}
