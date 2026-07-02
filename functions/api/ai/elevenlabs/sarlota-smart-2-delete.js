import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  assistantPublicMetadata,
  maskElevenLabsAgentId,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

async function elevenLabsRequest({ apiKey, path, method = "GET" }) {
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      Accept: "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function upstreamErrorSummary(error) {
  const detail = error?.payload?.detail;
  if (Array.isArray(detail)) {
    return detail
      .slice(0, 3)
      .map((item) => cleanString(item?.msg || item?.message || item?.type || "validation_error"))
      .filter(Boolean)
      .join("; ");
  }

  return cleanString(error?.payload?.message || error?.payload?.error || error?.message || "upstream_error");
}

export async function onRequestPost({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const payload = await readJson(request);
    if (payload?.apply !== true || payload?.confirm !== "VYMAZAT") {
      return json({
        error: "Smazání Smart 2 vyžaduje potvrzení apply: true a confirm: VYMAZAT.",
        code: "DELETE_CONFIRMATION_REQUIRED",
        apiStatus: "waiting"
      }, 409);
    }

    const apiKey = cleanString(env?.ELEVENLABS_API_KEY);
    const assistantConfig = resolveElevenLabsAssistantConfig("sarlota-smart-2", env);

    if (!apiKey || !assistantConfig?.agentId) {
      return json({
        error: "Chybí ELEVENLABS_API_KEY nebo ELEVENLABS_AGENT_ID_SARLOTA_SMART_2.",
        code: "SMART_2_CONFIGURATION_MISSING",
        apiStatus: "waiting"
      }, 409);
    }

    const agentConfig = await elevenLabsRequest({
      apiKey,
      path: `/agents/${encodeURIComponent(assistantConfig.agentId)}`
    });
    const agentName = cleanString(agentConfig?.name);
    const nameMatches = (assistantConfig.expectedAgentNames || []).includes(agentName);

    if (!nameMatches) {
      return json({
        error: "Smart 2 agent nemá očekávaný název, mazání nespouštím.",
        code: "SMART_2_AGENT_NAME_MISMATCH",
        agentName,
        expectedNames: assistantConfig.expectedAgentNames || [],
        agentIdMasked: maskElevenLabsAgentId(assistantConfig.agentId),
        apiStatus: "waiting"
      }, 409);
    }

    await elevenLabsRequest({
      apiKey,
      path: `/agents/${encodeURIComponent(assistantConfig.agentId)}`,
      method: "DELETE"
    });

    console.info("elevenlabs.sarlota_smart_2_deleted", {
      agentIdMasked: maskElevenLabsAgentId(assistantConfig.agentId),
      agentName,
      userId: cleanString(user?.id),
      timestamp: new Date().toISOString()
    });

    return json({
      status: "deleted",
      message: "ElevenLabs agent Šarlota Smart 2 – test byl smazán.",
      assistant: assistantPublicMetadata(assistantConfig),
      deletedAgent: {
        name: agentName,
        agentIdMasked: maskElevenLabsAgentId(assistantConfig.agentId)
      },
      nextStep: "Odstraň nebo přepiš ELEVENLABS_AGENT_ID_SARLOTA_SMART_2 a VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2.",
      apiStatus: "waiting"
    });
  } catch (error) {
    console.error("elevenlabs.sarlota_smart_2_delete_failed", {
      message: safeErrorMessage(error),
      status: error?.status || 500
    });

    return json({
      error: `Smazání ElevenLabs agenta Smart 2 se nepodařilo. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "ELEVENLABS_SMART_2_DELETE_FAILED",
      upstreamStatus: error?.status || null,
      apiStatus: "waiting"
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 500);
  }
}
