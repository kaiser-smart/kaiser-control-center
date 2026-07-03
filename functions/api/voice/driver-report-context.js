import { json, readJson } from "../../_lib/auth.js";
import { driverReportContextForUser } from "../../_lib/driver-report-context.js";
import { resolveVoiceUser } from "../../_lib/voice-webhook-auth.js";
import { hasPermission } from "../../../src/permissions.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

export async function onRequestPost({ request, env }) {
  const payload = await readJson(request);
  const { user, response } = await resolveVoiceUser(env, request, payload);

  if (response) {
    return response;
  }

  if (!hasPermission(user, "dashboard", "view")) {
    return json({ error: "Nemáš oprávnění používat Šarlotu." }, 403);
  }

  const parameters = payload.parameters || payload.params || {};
  const dynamicVariables = payload.dynamicVariables || payload.dynamic_variables || {};
  const conversationData = payload.conversation_initiation_client_data || {};
  const conversationVariables = conversationData.dynamic_variables || {};
  const { status, payload: contextPayload } = await driverReportContextForUser(env, user, {
    transcriptIntent: cleanString(
      payload.transcriptIntent ||
      payload.intent ||
      parameters.transcriptIntent ||
      parameters.intent ||
      payload.message ||
      payload.text
    ),
    sessionId: cleanString(
      payload.sessionId ||
      payload.session_id ||
      payload.conversationId ||
      payload.conversation_id ||
      parameters.sessionId ||
      parameters.session_id ||
      parameters.conversationId ||
      parameters.conversation_id
    ),
    currentModule: cleanString(
      payload.currentModule ||
      payload.current_module ||
      parameters.currentModule ||
      parameters.current_module ||
      dynamicVariables.current_module ||
      conversationVariables.current_module
    )
  });

  return json({
    ...contextPayload,
    source: "kso_voice_webhook",
    toolName: "get_driver_report_context"
  }, status);
}
