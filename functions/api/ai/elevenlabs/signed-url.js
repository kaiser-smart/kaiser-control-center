import { json, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import {
  recordSarlotaIntroAnnouncement,
  sarlotaIntroAnnouncementForAi
} from "../../../_lib/ai-session-announcements.js";
import { userDynamicVariablesForAi } from "../../../_lib/ai-people-summary.js";

const ASSISTANTS = {
  sarlota: {
    id: "sarlota",
    name: "Šarlota",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_SARLOTA", "VITE_ELEVENLABS_AGENT_ID_SARLOTA"]
  },
  marek: {
    id: "marek",
    name: "Marek",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_MAREK", "VITE_ELEVENLABS_AGENT_ID_MAREK"]
  }
};

function cleanString(value) {
  return String(value ?? "").trim();
}

function isDebugRequest(request) {
  const url = new URL(request.url);
  return cleanString(url.searchParams.get("debug")) === "codex";
}

function maskAgentId(agentId) {
  const value = cleanString(agentId);
  if (!value) {
    return null;
  }

  if (value.length <= 12) {
    return `${value.slice(0, 4)}…${value.slice(-2)}`;
  }

  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function safeExcerpt(value, { apiKey = "", agentId = "" } = {}) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  const agentIdMasked = maskAgentId(agentId);
  const cleanApiKey = cleanString(apiKey);
  let excerpt = raw
    .replace(/("signed_url"\s*:\s*")[^"]+(")/gi, "$1[redacted-signed-url]$2")
    .replace(/(conversation_signature=)[^&"'\s]+/gi, "$1[redacted-signature]")
    .replace(/(xi-api-key["'\s:=]+)["']?[^"',}\s]+/gi, "$1[redacted-api-key]");

  if (cleanApiKey) {
    excerpt = excerpt.replaceAll(cleanApiKey, "[redacted-api-key]");
  }

  if (agentId && agentIdMasked) {
    excerpt = excerpt.replaceAll(agentId, agentIdMasked);
  }

  return excerpt.slice(0, 500);
}

function diagnosticPayload({
  responseFromElevenLabs = null,
  responseBody = "",
  assistant,
  apiKey,
  agentId
}) {
  return {
    upstreamStatus: responseFromElevenLabs?.status ?? null,
    upstreamStatusText: responseFromElevenLabs?.statusText || "",
    upstreamBodyExcerpt: safeExcerpt(responseBody, { apiKey, agentId }),
    assistantId: assistant.id,
    apiKeyPresent: Boolean(apiKey),
    agentIdPresent: Boolean(agentId),
    agentIdMasked: maskAgentId(agentId),
    endpoint: "get-signed-url"
  };
}

function assistantFor(request) {
  const url = new URL(request.url);
  const assistantId = cleanString(url.searchParams.get("assistant") || "sarlota").toLowerCase();
  return ASSISTANTS[assistantId] || ASSISTANTS.sarlota;
}

function agentIdFor(env, assistant) {
  return assistant.agentEnvKeys
    .map((key) => cleanString(env?.[key]))
    .find(Boolean) || "";
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "dashboard", "view");

  if (response) {
    return response;
  }

  const assistant = assistantFor(request);
  const debug = isDebugRequest(request);
  const apiKey = cleanString(env.ELEVENLABS_API_KEY);
  const agentId = agentIdFor(env, assistant);
  const introAnnouncement = await sarlotaIntroAnnouncementForAi(env, user, assistant);
  const dynamicVariables = {
    ...userDynamicVariablesForAi(user),
    ...introAnnouncement.variables
  };

  if (!apiKey || !agentId) {
    return json({
      error: "ElevenLabs není nastavený. Doplňte ELEVENLABS_API_KEY a Agent ID pro vybraného asistenta.",
      assistantId: assistant.id,
      assistantName: assistant.name,
      configured: false,
      apiStatus: "waiting"
    }, 503);
  }

  const signedUrl = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  signedUrl.searchParams.set("agent_id", agentId);
  signedUrl.searchParams.set("include_conversation_id", "true");

  try {
    const responseFromElevenLabs = await fetch(signedUrl.toString(), {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json"
      }
    });
    const responseBody = await responseFromElevenLabs.text();
    let payload = {};
    try {
      payload = JSON.parse(responseBody || "{}");
    } catch {
      payload = {};
    }

    if (!responseFromElevenLabs.ok || !payload.signed_url) {
      const debugPayload = diagnosticPayload({
        responseFromElevenLabs,
        responseBody: responseBody || { error: "missing_signed_url" },
        assistant,
        apiKey,
        agentId
      });

      console.error("elevenlabs.signed_url_failed", debugPayload);

      if (debug) {
        return json({
          ok: false,
          message: "ElevenLabs session se nepodařilo připravit.",
          debug: debugPayload
        }, 502);
      }

      return json({
        error: "ElevenLabs session se nepodařilo připravit.",
        assistantId: assistant.id,
        assistantName: assistant.name,
        configured: true,
        apiStatus: "waiting"
      }, 502);
    }

    await recordAiAction(env, user, {
      assistantId: assistant.id,
      assistantName: assistant.name,
      actionType: "session",
      toolName: "elevenlabs_signed_url",
      input: { assistantId: assistant.id },
      result: {
        configured: true,
        userRole: dynamicVariables.user_role,
        availableModulesLength: dynamicVariables.available_modules.length
      },
      status: "ok"
    });
    await recordSarlotaIntroAnnouncement(env, user, assistant, introAnnouncement);

    return json({
      signedUrl: payload.signed_url,
      conversationId: payload.conversation_id || "",
      assistantId: assistant.id,
      assistantName: assistant.name,
      dynamicVariables,
      configured: true,
      apiStatus: "ready"
    });
  } catch (error) {
    const debugPayload = diagnosticPayload({
      responseBody: { error: error.message || "fetch_failed" },
      assistant,
      apiKey,
      agentId
    });

    console.error("elevenlabs.signed_url_error", debugPayload);

    if (debug) {
      return json({
        ok: false,
        message: "ElevenLabs teď neodpověděl.",
        debug: debugPayload
      }, 502);
    }

    return json({
      error: "ElevenLabs teď neodpověděl.",
      assistantId: assistant.id,
      assistantName: assistant.name,
      configured: true,
      apiStatus: "waiting"
    }, 502);
  }
}
