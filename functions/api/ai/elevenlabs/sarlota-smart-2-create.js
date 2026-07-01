import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  assistantPublicMetadata,
  maskElevenLabsAgentId,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";
const SMART_2_NAME = "Šarlota Smart 2 – test";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

async function elevenLabsRequest({ apiKey, path, method = "GET", body = null }) {
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 400) };
  }

  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || {};
}

async function verifyAgent(apiKey, agentId) {
  if (!apiKey || !agentId) {
    return null;
  }

  return elevenLabsRequest({
    apiKey,
    path: `/agents/${encodeURIComponent(agentId)}`
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const payload = await readJson(request);
    if (payload?.apply !== true) {
      return json({
        error: "Vytvoření Smart 2 vyžaduje potvrzení apply: true.",
        code: "APPLY_REQUIRED",
        apiStatus: "waiting"
      }, 409);
    }

    const apiKey = cleanString(env?.ELEVENLABS_API_KEY);
    const sourceAssistant = resolveElevenLabsAssistantConfig("sarlota", env);
    const smart2Assistant = resolveElevenLabsAssistantConfig("sarlota-smart-2", env);

    if (!apiKey || !sourceAssistant?.agentId) {
      return json({
        error: "Chybí ELEVENLABS_API_KEY nebo ELEVENLABS_AGENT_ID_SARLOTA.",
        code: "ELEVENLABS_SOURCE_CONFIGURATION_MISSING",
        apiStatus: "waiting"
      }, 409);
    }

    if (smart2Assistant?.agentId) {
      const existingAgent = await verifyAgent(apiKey, smart2Assistant.agentId);
      return json({
        status: "already_configured",
        message: "Smart 2 už má nastavené Agent ID.",
        agentId: smart2Assistant.agentId,
        agentIdMasked: maskElevenLabsAgentId(smart2Assistant.agentId),
        agentName: cleanString(existingAgent?.name),
        assistant: assistantPublicMetadata(smart2Assistant),
        apiStatus: "ready"
      });
    }

    const sourceAgent = await verifyAgent(apiKey, sourceAssistant.agentId);
    const sourceName = cleanString(sourceAgent?.name);
    if (!sourceName || !(sourceAssistant.expectedAgentNames || []).includes(sourceName)) {
      return json({
        error: "Zdrojový ElevenLabs agent nevypadá jako bezpečná produkční Šarlota.",
        code: "SOURCE_AGENT_NAME_MISMATCH",
        sourceAgentName: sourceName || "neověřeno",
        sourceAgentIdMasked: maskElevenLabsAgentId(sourceAssistant.agentId),
        apiStatus: "waiting"
      }, 409);
    }

    const duplicate = await elevenLabsRequest({
      apiKey,
      method: "POST",
      path: `/agents/${encodeURIComponent(sourceAssistant.agentId)}/duplicate`,
      body: {
        name: SMART_2_NAME
      }
    });
    const agentId = cleanString(duplicate?.agent_id || duplicate?.agentId);

    if (!agentId) {
      return json({
        error: "ElevenLabs nevrátil Agent ID nového agenta.",
        code: "ELEVENLABS_AGENT_ID_NOT_RETURNED",
        apiStatus: "waiting"
      }, 502);
    }

    const createdAgent = await verifyAgent(apiKey, agentId);
    const createdName = cleanString(createdAgent?.name);

    console.info("elevenlabs.sarlota_smart_2_created", {
      sourceAgentIdMasked: maskElevenLabsAgentId(sourceAssistant.agentId),
      smart2AgentIdMasked: maskElevenLabsAgentId(agentId),
      userId: cleanString(user?.id),
      timestamp: new Date().toISOString()
    });

    return json({
      status: "created",
      message: "ElevenLabs agent Šarlota Smart 2 – test byl vytvořen.",
      agentId,
      agentIdMasked: maskElevenLabsAgentId(agentId),
      agentName: createdName,
      sourceAgentIdMasked: maskElevenLabsAgentId(sourceAssistant.agentId),
      expectedName: SMART_2_NAME,
      nameMatches: createdName === SMART_2_NAME,
      nextEnvKeys: [
        "ELEVENLABS_AGENT_ID_SARLOTA_SMART_2",
        "VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2"
      ],
      apiStatus: "ready"
    });
  } catch (error) {
    console.error("elevenlabs.sarlota_smart_2_create_failed", {
      message: safeErrorMessage(error),
      status: error?.status || 500
    });

    return json({
      error: "Vytvoření ElevenLabs agenta Smart 2 se nepodařilo.",
      code: "ELEVENLABS_SMART_2_CREATE_FAILED",
      upstreamStatus: error?.status || null,
      apiStatus: "waiting"
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 500);
  }
}
