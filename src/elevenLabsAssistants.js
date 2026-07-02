export const ELEVENLABS_ASSISTANT_KEYS = ["sarlota", "sarlota-smart-2", "marek"];

export const ELEVENLABS_ASSISTANT_CONFIGS = {
  sarlota: {
    assistantKey: "sarlota",
    displayName: "Šarlota – Smart odpady",
    shortName: "Šarlota",
    envVariableName: "ELEVENLABS_AGENT_ID_SARLOTA",
    frontendEnvVariableName: "VITE_ELEVENLABS_AGENT_ID_SARLOTA",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_SARLOTA", "VITE_ELEVENLABS_AGENT_ID_SARLOTA"],
    expectedAgentNames: ["Šarlota – Smart odpady", "Chytré odpadky – Šarlota"],
    isProduction: true,
    isTest: false,
    promptSyncAllowed: true,
    toolsSyncAllowed: true,
    assistantType: "sarlota"
  },
  "sarlota-smart-2": {
    assistantKey: "sarlota-smart-2",
    displayName: "Šarlota Smart 2 – test",
    shortName: "Šarlota Smart 2",
    envVariableName: "ELEVENLABS_AGENT_ID_SARLOTA_SMART_2",
    frontendEnvVariableName: "VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_SARLOTA_SMART_2", "VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2"],
    expectedAgentNames: ["Šarlota Smart 2 – test"],
    isProduction: false,
    isTest: true,
    promptSyncAllowed: true,
    toolsSyncAllowed: true,
    assistantType: "sarlota"
  },
  marek: {
    assistantKey: "marek",
    displayName: "Marek",
    shortName: "Marek",
    envVariableName: "ELEVENLABS_AGENT_ID_MAREK",
    frontendEnvVariableName: "VITE_ELEVENLABS_AGENT_ID_MAREK",
    agentEnvKeys: ["ELEVENLABS_AGENT_ID_MAREK", "VITE_ELEVENLABS_AGENT_ID_MAREK"],
    expectedAgentNames: ["Marek"],
    isProduction: false,
    isTest: false,
    promptSyncAllowed: false,
    toolsSyncAllowed: true,
    assistantType: "marek"
  }
};

export function cleanAssistantKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidElevenLabsAssistantKey(value) {
  return Object.prototype.hasOwnProperty.call(ELEVENLABS_ASSISTANT_CONFIGS, cleanAssistantKey(value));
}

export function normalizeElevenLabsAgentName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—―−]/g, "-")
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function elevenLabsAgentNameMatchesExpected(agentName, assistantConfig = {}) {
  const normalizedAgentName = normalizeElevenLabsAgentName(agentName);
  return Boolean(normalizedAgentName) && (assistantConfig.expectedAgentNames || [])
    .map((name) => normalizeElevenLabsAgentName(name))
    .includes(normalizedAgentName);
}

export function resolveElevenLabsAssistantConfig(assistantKey = "sarlota", env = {}) {
  const normalizedKey = cleanAssistantKey(assistantKey || "sarlota") || "sarlota";
  const baseConfig = ELEVENLABS_ASSISTANT_CONFIGS[normalizedKey];

  if (!baseConfig) {
    return null;
  }

  const agentId = baseConfig.agentEnvKeys
    .map((key) => String(env?.[key] ?? "").trim())
    .find(Boolean) || "";

  return {
    ...baseConfig,
    id: baseConfig.assistantKey,
    name: baseConfig.shortName,
    agentId,
    agentIdPresent: Boolean(agentId)
  };
}

export function assistantConfigFromRequest(request, env = {}) {
  const url = new URL(request.url);
  const assistantKey = cleanAssistantKey(url.searchParams.get("assistant") || "sarlota") || "sarlota";
  return resolveElevenLabsAssistantConfig(assistantKey, env);
}

export function maskElevenLabsAgentId(agentId) {
  const value = String(agentId ?? "").trim();
  if (!value) {
    return "";
  }

  if (value.length <= 12) {
    return `${value.slice(0, 4)}…${value.slice(-2)}`;
  }

  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

export function assistantPublicMetadata(config = {}) {
  return {
    assistantKey: config.assistantKey || config.id || "",
    assistantId: config.assistantKey || config.id || "",
    assistantName: config.shortName || config.name || config.displayName || "",
    assistantDisplayName: config.displayName || config.name || "",
    assistantEnvVariableName: config.envVariableName || "",
    assistantAgentIdMasked: maskElevenLabsAgentId(config.agentId),
    assistantAgentIdPresent: Boolean(config.agentId),
    assistantIsProduction: config.isProduction === true,
    assistantIsTest: config.isTest === true
  };
}
