import { ELEVENLABS_CLIENT_TOOL_SCHEMAS } from "../src/elevenLabsClientTools.js";
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../src/sarlota/sarlotaSystemPrompt.js";
import {
  assistantPublicMetadata,
  maskElevenLabsAgentId,
  resolveElevenLabsAssistantConfig
} from "../src/elevenLabsAssistants.js";

const ASSISTANT_KEY = "sarlota-smart-2";
const PRODUCTION_ASSISTANT_KEY = "sarlota";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";
const EXPECTED_MODEL = "Qwen3.5-397B-A17B";
const REQUIRED_DRIVER_REPORT_TOOLS = [
  "open_module",
  "get_driver_report_context",
  "show_driver_vehicle_picker",
  "get_driver_vehicle_picker_selection",
  "validate_driver_vehicle_spz",
  "create_driver_part_request",
  "get_driver_reports_summary"
];
const PROMPT_MARKER = "HLÁŠENÍ ŘIDIČŮ";
const PROMPT_REQUIRED_PHRASE = "Konkrétní vozidlo smíš v hlasu říct pouze tehdy";

function cleanString(value) {
  return String(value ?? "").trim();
}

function boolEnv(value) {
  return ["1", "true", "ano", "yes"].includes(cleanString(value).toLowerCase());
}

function normalizeStatusText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function safeShortText(value, max = 120) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function getPathValue(source, path) {
  return path.reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    return value[key];
  }, source);
}

function walkObject(value, visitor, path = []) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkObject(item, visitor, [...path, index]));
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    visitor(child, key, path);
    walkObject(child, visitor, [...path, key]);
  });
}

function firstStringByKeys(source, keys) {
  const wanted = new Set(keys.map(normalizeStatusText));
  const values = [];

  walkObject(source, (value, key) => {
    if (typeof value === "string" && wanted.has(normalizeStatusText(key))) {
      values.push(cleanString(value));
    }
  });

  return values.find(Boolean) || "";
}

function promptFromAgent(agentConfig) {
  const paths = [
    ["conversation_config", "agent", "prompt", "prompt"],
    ["conversation_config", "agent", "prompt", "system_prompt"],
    ["conversation_config", "agent", "prompt", "systemPrompt"],
    ["conversation_config", "agent", "prompt", "text"],
    ["conversation_config", "agent", "prompt", "content"]
  ];

  for (const path of paths) {
    const value = getPathValue(agentConfig, path);
    if (typeof value === "string" && cleanString(value)) {
      return value;
    }
  }

  return "";
}

function modelFromAgent(agentConfig) {
  const paths = [
    ["conversation_config", "agent", "prompt", "llm"],
    ["conversation_config", "agent", "prompt", "model"],
    ["conversation_config", "agent", "prompt", "model_id"],
    ["conversation_config", "agent", "llm"],
    ["conversation_config", "agent", "model"]
  ];

  for (const path of paths) {
    const value = cleanString(getPathValue(agentConfig, path));
    if (value) {
      return value;
    }
  }

  return firstStringByKeys(agentConfig, ["llm", "model", "model_id"]);
}

function voiceFromAgent(agentConfig) {
  const paths = [
    ["conversation_config", "tts", "voice_id"],
    ["conversation_config", "tts", "voiceId"],
    ["conversation_config", "agent", "voice_id"],
    ["conversation_config", "agent", "voiceId"],
    ["platform_settings", "voice_id"],
    ["voice_id"]
  ];

  for (const path of paths) {
    const value = cleanString(getPathValue(agentConfig, path));
    if (value) {
      return {
        present: true,
        idMasked: maskElevenLabsAgentId(value),
        sourcePath: path.join(".")
      };
    }
  }

  const fallback = firstStringByKeys(agentConfig, ["voice_id", "voiceId", "voice"]);
  return {
    present: Boolean(fallback),
    idMasked: fallback ? maskElevenLabsAgentId(fallback) : "",
    sourcePath: fallback ? "recursive_voice_key" : ""
  };
}

function toolName(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const config = value.tool_config || value.toolConfig || value;
  return cleanString(config.name || value.name || value.tool_name || value.toolName);
}

function toolId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const config = value.tool_config || value.toolConfig || value;
  return cleanString(config.id || config.tool_id || config.toolId || value.id || value.tool_id || value.toolId);
}

function collectToolRefsFromAgent(agentConfig) {
  const names = new Set();
  const ids = new Set();

  walkObject(agentConfig, (value, key) => {
    const looksLikeTool = normalizeStatusText(key).includes("tool");

    if (typeof value === "string" && looksLikeTool && cleanString(value)) {
      ids.add(cleanString(value));
      return;
    }

    if (Array.isArray(value) && looksLikeTool) {
      for (const item of value) {
        if (typeof item === "string" && cleanString(item)) {
          ids.add(cleanString(item));
          continue;
        }

        const name = toolName(item);
        const id = toolId(item);
        if (name) names.add(name);
        if (id) ids.add(id);
      }
      return;
    }

    if (value && typeof value === "object" && looksLikeTool) {
      const name = toolName(value);
      const id = toolId(value);
      if (name) names.add(name);
      if (id) ids.add(id);
    }
  });

  return {
    names: [...names].sort((a, b) => a.localeCompare(b, "cs")),
    ids: [...ids].sort()
  };
}

function workspaceToolList(payload) {
  const candidates = [
    payload?.tools,
    payload?.items,
    payload?.data,
    payload
  ];

  return candidates.find(Array.isArray) || [];
}

function namesFromWorkspaceToolsById(workspaceTools, ids) {
  const byId = new Map();

  for (const tool of workspaceTools) {
    const id = toolId(tool);
    const name = toolName(tool);
    if (id && name && !byId.has(id)) {
      byId.set(id, name);
    }
  }

  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function compareRequiredTools(actualNames = []) {
  const actual = new Set(actualNames);
  return {
    toolsPresent: REQUIRED_DRIVER_REPORT_TOOLS.filter((name) => actual.has(name)),
    missingTools: REQUIRED_DRIVER_REPORT_TOOLS.filter((name) => !actual.has(name))
  };
}

function promptMarkerPresent(agentConfig) {
  const prompt = promptFromAgent(agentConfig);
  if (!prompt) {
    return false;
  }

  return prompt.includes(PROMPT_MARKER) &&
    prompt.includes(PROMPT_REQUIRED_PHRASE) &&
    prompt.includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE);
}

async function elevenLabsGet(apiKey, path) {
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      Accept: "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("elevenlabs_read_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function readLiveAgent({ apiKey, agentId }) {
  const agentConfig = await elevenLabsGet(apiKey, `/agents/${encodeURIComponent(agentId)}`);
  let workspaceTools = [];
  let workspaceToolsStatus = "NEOVERENO";

  try {
    workspaceTools = workspaceToolList(await elevenLabsGet(apiKey, "/tools"));
    workspaceToolsStatus = "VERIFIED";
  } catch {
    workspaceToolsStatus = "FAILED";
  }

  return {
    agentConfig,
    workspaceTools,
    workspaceToolsStatus
  };
}

function expectedRepoTools() {
  return ELEVENLABS_CLIENT_TOOL_SCHEMAS
    .map((tool) => cleanString(tool.name))
    .filter(Boolean);
}

async function main() {
  const env = process.env;
  const liveEnabled = boolEnv(env.SARLOTA_LIVE_DIAGNOSTICS);
  const assistant = resolveElevenLabsAssistantConfig(ASSISTANT_KEY, env);
  const productionAssistant = resolveElevenLabsAssistantConfig(PRODUCTION_ASSISTANT_KEY, env);
  const publicMetadata = assistantPublicMetadata(assistant || {});
  const agentId = cleanString(assistant?.agentId);
  const productionAgentId = cleanString(productionAssistant?.agentId);
  const matchesProductionAgent = Boolean(agentId && productionAgentId && agentId === productionAgentId);
  const apiKeyPresent = Boolean(cleanString(env.ELEVENLABS_API_KEY));
  const base = {
    generatedAt: new Date().toISOString(),
    agentConfigured: Boolean(agentId),
    expectedAgentKey: ASSISTANT_KEY,
    expectedAgentName: "Kaiser | Šarlota Smart 2 – test",
    assistantDisplayName: assistant?.displayName || "",
    assistantEnvVariableName: assistant?.envVariableName || "",
    maskedAgentId: publicMetadata.assistantAgentIdMasked || "",
    isTestAgent: assistant?.isTest === true && !matchesProductionAgent,
    isProductionAgent: assistant?.isProduction === true || matchesProductionAgent,
    productionAgentConfigured: Boolean(productionAgentId),
    matchesProductionAgent,
    repoToolSchemaCount: expectedRepoTools().length,
    requiredDriverReportTools: REQUIRED_DRIVER_REPORT_TOOLS,
    toolsPresent: [],
    missingTools: [],
    promptMarkerPresent: null,
    modelVerified: null,
    voiceVerified: null,
    liveVerificationStatus: "NEOVERENO",
    liveVerificationEnabled: liveEnabled,
    apiKeyPresent,
    signedUrlReturned: false,
    secretsReturned: false,
    promptTextReturned: false,
    productionWriteActionsCalled: false,
    deployPerformed: false,
    notes: []
  };

  if (!assistant) {
    console.log(JSON.stringify({
      ...base,
      liveVerificationStatus: "FAILED",
      notes: ["Repo nezná assistant key sarlota-smart-2."]
    }, null, 2));
    return;
  }

  if (!liveEnabled) {
    console.log(JSON.stringify({
      ...base,
      notes: [
        "Live ElevenLabs API nebylo voláno. Pro live read-only GET nastav SARLOTA_LIVE_DIAGNOSTICS=1.",
        agentId ? "Smart 2 agent id je dostupné jen lokálně/env, live Tools tab NEOVERENO." : "Chybí ELEVENLABS_AGENT_ID_SARLOTA_SMART_2 nebo VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2."
      ]
    }, null, 2));
    return;
  }

  if (!apiKeyPresent || !agentId) {
    console.log(JSON.stringify({
      ...base,
      liveVerificationStatus: "NEOVERENO",
      notes: [
        !apiKeyPresent ? "Chybí ELEVENLABS_API_KEY pro read-only live kontrolu." : "",
        !agentId ? "Chybí Smart 2 agent id pro read-only live kontrolu." : ""
      ].filter(Boolean)
    }, null, 2));
    return;
  }

  try {
    const { agentConfig, workspaceTools, workspaceToolsStatus } = await readLiveAgent({
      apiKey: cleanString(env.ELEVENLABS_API_KEY),
      agentId
    });
    const refs = collectToolRefsFromAgent(agentConfig);
    const resolvedNames = [...new Set([
      ...refs.names,
      ...namesFromWorkspaceToolsById(workspaceTools, refs.ids)
    ])].sort((a, b) => a.localeCompare(b, "cs"));
    const toolComparison = compareRequiredTools(resolvedNames);
    const model = modelFromAgent(agentConfig);
    const voice = voiceFromAgent(agentConfig);
    const markerPresent = promptMarkerPresent(agentConfig);
    const modelVerified = normalizeStatusText(model) === normalizeStatusText(EXPECTED_MODEL);
    const voiceVerified = voice.present === true;
    const agentName = cleanString(agentConfig?.name);
    const agentNameMatchesExpected = (assistant.expectedAgentNames || []).includes(agentName);

    console.log(JSON.stringify({
      ...base,
      agentConfigured: true,
      toolsPresent: toolComparison.toolsPresent,
      missingTools: toolComparison.missingTools,
      promptMarkerPresent: markerPresent,
      modelVerified,
      voiceVerified,
      liveVerificationStatus: "VERIFIED",
      workspaceToolsStatus,
      agentNameMatchesExpected,
      observedAgentName: safeShortText(agentName, 80),
      observedModel: safeShortText(model, 80),
      observedVoiceIdMasked: voice.idMasked,
      observedVoiceSourcePath: voice.sourcePath,
      toolNamesResolvedCount: resolvedNames.length,
      toolIdsOnlyCount: refs.ids.length,
      dangerousWriteWithoutConfirmationVerified: markerPresent && toolComparison.missingTools.length === 0,
      notes: [
        "Live kontrola použila jen ElevenLabs GET.",
        "Prompt text, API key ani signed URL nejsou vypsané.",
        workspaceToolsStatus === "FAILED" ? "Workspace tools endpoint se nepodařilo přečíst; agent tools byly čtené jen z agent konfigurace." : ""
      ].filter(Boolean)
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ...base,
      liveVerificationStatus: "FAILED",
      upstreamStatus: error.status || null,
      notes: [
        "Read-only live ElevenLabs GET selhal.",
        "API key, prompt ani signed URL nejsou vypsané."
      ]
    }, null, 2));
  }
}

await main();
