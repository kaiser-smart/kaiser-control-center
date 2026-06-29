import { json, requireUserPermission } from "../../../_lib/auth.js";
import { sarlotaIntroAnnouncementForAi } from "../../../_lib/ai-session-announcements.js";
import { normalizeAiSearch, userDynamicVariablesForAi } from "../../../_lib/ai-people-summary.js";
import { ELEVENLABS_CLIENT_TOOL_SCHEMAS } from "../../../../src/elevenLabsClientTools.js";

const SARLOTA_AGENT_NAME = "Chytré odpadky – Šarlota";
const OPENAI_MODEL_EXPECTED_IN_ELEVENLABS = "GPT-5.1";
const OPENAI_MODEL_EXPECTED_NORMALIZED = "gpt51";
const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const SARLOTA_ASSISTANT = {
  id: "sarlota",
  name: "Šarlota",
  agentEnvKeys: ["ELEVENLABS_AGENT_ID_SARLOTA", "VITE_ELEVENLABS_AGENT_ID_SARLOTA"]
};
const REQUIRED_DYNAMIC_VARIABLES = [
  "user_name",
  "user_first_name",
  "user_first_name_vocative",
  "user_role",
  "available_modules",
  "user_permissions",
  "user_department",
  "user_position",
  "time_of_day_greeting",
  "user_greeting",
  "intro_announcement",
  "intro_announcement_enabled"
];
const EXPECTED_CLIENT_TOOL_NAMES = [
  "navigate_to",
  "open_module",
  "show_confirmation",
  "show_toast",
  "highlight_element",
  "search_employee",
  "get_employee_detail",
  "open_employee_card",
  "get_employee_manager",
  "get_employee_absence_summary",
  "search_user",
  "get_user_access_summary"
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeStatusText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function agentIdFor(env) {
  return SARLOTA_ASSISTANT.agentEnvKeys
    .map((key) => cleanString(env?.[key]))
    .find(Boolean) || "";
}

function missingRequiredVariables(dynamicVariables) {
  return REQUIRED_DYNAMIC_VARIABLES.filter((key) => !cleanString(dynamicVariables?.[key]));
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

function stringValuesByKey(source, keys) {
  const normalizedKeys = new Set(keys.map(normalizeStatusText));
  const values = [];

  walkObject(source, (value, key) => {
    if (typeof value === "string" && normalizedKeys.has(normalizeStatusText(key))) {
      values.push(cleanString(value));
    }
  });

  return values.filter(Boolean);
}

function firstMessageFromAgent(agentConfig) {
  const priorityPaths = [
    ["conversation_config", "agent", "first_message"],
    ["conversation_config", "agent", "firstMessage"],
    ["conversation_config", "agent", "prompt", "first_message"],
    ["conversation_config", "agent", "prompt", "firstMessage"]
  ];

  for (const path of priorityPaths) {
    const value = cleanString(getPathValue(agentConfig, path));
    if (value) {
      return value;
    }
  }

  return stringValuesByKey(agentConfig, ["first_message", "firstMessage"])[0] || "";
}

function modelFromAgent(agentConfig) {
  const priorityPaths = [
    ["conversation_config", "agent", "prompt", "llm"],
    ["conversation_config", "agent", "prompt", "model"],
    ["conversation_config", "agent", "prompt", "model_id"],
    ["conversation_config", "agent", "llm"],
    ["conversation_config", "agent", "model"]
  ];

  for (const path of priorityPaths) {
    const value = cleanString(getPathValue(agentConfig, path));
    if (value) {
      return value;
    }
  }

  return stringValuesByKey(agentConfig, ["llm", "model", "model_id"])
    .find((value) => normalizeStatusText(value).includes("gpt")) || "";
}

function collectToolName(tool, names) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
    return;
  }

  const name = cleanString(tool.name || tool.tool_name || tool.toolName);
  if (name) {
    names.add(name);
  }
}

function toolNamesFromAgent(agentConfig) {
  const names = new Set();

  walkObject(agentConfig, (value, key) => {
    if (Array.isArray(value) && normalizeStatusText(key).includes("tool")) {
      value.forEach((item) => collectToolName(item, names));
    }

    if (value && typeof value === "object" && normalizeStatusText(key).includes("tool")) {
      collectToolName(value, names);
    }
  });

  return [...names].sort((a, b) => a.localeCompare(b, "cs"));
}

function safeAgentNameMatches(agentConfig) {
  return cleanString(agentConfig?.name) === SARLOTA_AGENT_NAME;
}

async function readElevenLabsAgentConfig({ apiKey, agentId }) {
  if (!apiKey || !agentId) {
    return {
      verified: false,
      status: "unverified",
      reason: "missing_configuration"
    };
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return {
        verified: false,
        status: "error",
        upstreamStatus: response.status,
        reason: "agent_read_failed"
      };
    }

    const agentConfig = await response.json();
    const observedModel = modelFromAgent(agentConfig);
    const modelMatches = normalizeStatusText(observedModel) === OPENAI_MODEL_EXPECTED_NORMALIZED;
    const firstMessage = firstMessageFromAgent(agentConfig);
    const firstMessageMatches = cleanString(firstMessage) === FIRST_MESSAGE_TEMPLATE;
    const configuredToolNames = toolNamesFromAgent(agentConfig);
    const toolComparison = compareToolNames(configuredToolNames);

    return {
      verified: true,
      status: "ok",
      agentNameMatches: safeAgentNameMatches(agentConfig),
      observedModel,
      modelMatches,
      firstMessageMatches,
      configuredToolNames,
      missingTools: toolComparison.missingTools,
      extraTools: toolComparison.extraTools,
      toolsMatch: toolComparison.missingTools.length === 0
    };
  } catch {
    return {
      verified: false,
      status: "error",
      reason: "agent_read_failed"
    };
  }
}

function compareToolNames(actualNames) {
  const actualSet = new Set(actualNames);
  const expectedSet = new Set(EXPECTED_CLIENT_TOOL_NAMES);
  const missingTools = EXPECTED_CLIENT_TOOL_NAMES.filter((name) => !actualSet.has(name));
  const extraTools = actualNames.filter((name) => !expectedSet.has(name));

  return {
    missingTools,
    extraTools,
    matchesDocumentation: missingTools.length === 0 && extraTools.length === 0
  };
}

function radimVocativeFixtureOk() {
  const variables = userDynamicVariablesForAi({
    id: "fixture-radim",
    name: "Radim",
    role: "readonly",
    status: "active"
  });

  return cleanString(variables.user_first_name_vocative) === "Radime";
}

export async function sarlotaStatusPayload(env, user) {
  const apiKeyPresent = Boolean(cleanString(env?.ELEVENLABS_API_KEY));
  const agentId = agentIdFor(env);
  const agentIdPresent = Boolean(agentId);
  const configured = apiKeyPresent && agentIdPresent;
  const elevenLabsAgentConfig = await readElevenLabsAgentConfig({
    apiKey: cleanString(env?.ELEVENLABS_API_KEY),
    agentId
  });
  const introAnnouncement = await sarlotaIntroAnnouncementForAi(env, user, SARLOTA_ASSISTANT);
  const dynamicVariables = {
    ...userDynamicVariablesForAi(user),
    ...introAnnouncement.variables
  };
  const missingVariables = missingRequiredVariables(dynamicVariables);
  const clientToolNames = ELEVENLABS_CLIENT_TOOL_SCHEMAS
    .map((tool) => cleanString(tool.name))
    .filter(Boolean);
  const toolComparison = compareToolNames(clientToolNames);
  const userFirstName = cleanString(user?.name).split(/\s+/).filter(Boolean)[0] || "";
  const currentUserIsRadim = normalizeAiSearch(userFirstName) === "radim";
  const currentVocativePresent = Boolean(cleanString(dynamicVariables.user_first_name_vocative));
  const radimFixtureOk = radimVocativeFixtureOk();
  const liveAgentVerified = Boolean(elevenLabsAgentConfig.verified);
  const liveAgentError = elevenLabsAgentConfig.status === "error";
  const liveAgentNameStatus = liveAgentVerified
    ? (elevenLabsAgentConfig.agentNameMatches ? "ok" : "error")
    : "ok";
  const firstMessageStatus = cleanString(dynamicVariables.intro_announcement)
    ? (liveAgentVerified ? (elevenLabsAgentConfig.firstMessageMatches ? "ok" : "error") : "ok")
    : "error";
  const toolsStatus = liveAgentVerified
    ? (elevenLabsAgentConfig.toolsMatch && toolComparison.matchesDocumentation ? "ok" : "error")
    : (toolComparison.matchesDocumentation ? "unverified" : "error");
  const modelStatus = liveAgentVerified
    ? (elevenLabsAgentConfig.modelMatches ? "ok" : "error")
    : (liveAgentError ? "error" : "unverified");

  return {
    generatedAt: new Date().toISOString(),
    panel: {
      title: "Šarlota",
      readOnly: true
    },
    agent: {
      assistantId: "sarlota",
      name: SARLOTA_AGENT_NAME,
      status: liveAgentNameStatus,
      verifiedInElevenLabs: liveAgentVerified
    },
    elevenLabs: {
      status: configured ? (liveAgentError ? "error" : "configured") : "error",
      configured,
      apiKeyPresent,
      agentIdPresent,
      upstreamVerified: liveAgentVerified,
      readOnlyAgentCheckStatus: elevenLabsAgentConfig.status,
      upstreamStatus: elevenLabsAgentConfig.upstreamStatus || null
    },
    firstMessage: {
      status: firstMessageStatus,
      variable: "intro_announcement",
      template: FIRST_MESSAGE_TEMPLATE,
      source: "dynamic_variables",
      verifiedInElevenLabs: liveAgentVerified,
      matchesElevenLabsAgent: liveAgentVerified ? elevenLabsAgentConfig.firstMessageMatches : null
    },
    personalization: {
      status: missingVariables.length ? "error" : "ok",
      source: "authenticated_user_profile",
      dynamicVariablesRequired: REQUIRED_DYNAMIC_VARIABLES,
      dynamicVariablesPresent: REQUIRED_DYNAMIC_VARIABLES.filter((key) => !missingVariables.includes(key)),
      missingVariables,
      valuesReturnedToPanel: false
    },
    vocative: {
      status: currentVocativePresent && radimFixtureOk ? "ok" : "error",
      currentUserVocativePresent: currentVocativePresent,
      currentUserIsRadim,
      radimFixtureOk
    },
    openAiModelInElevenLabs: {
      status: modelStatus,
      expectedModel: OPENAI_MODEL_EXPECTED_IN_ELEVENLABS,
      observedModel: liveAgentVerified ? cleanString(elevenLabsAgentConfig.observedModel) : "",
      verifiedInElevenLabs: liveAgentVerified
    },
    tools: {
      status: toolsStatus,
      localSchemaStatus: toolComparison.matchesDocumentation ? "ok" : "error",
      verifiedInElevenLabs: liveAgentVerified,
      verificationMethod: liveAgentVerified
        ? "elevenlabs_read_only_agent_api_and_local_client_schema"
        : "local_client_schema_vs_documentation",
      expectedToolNames: EXPECTED_CLIENT_TOOL_NAMES,
      configuredClientToolNames: liveAgentVerified ? elevenLabsAgentConfig.configuredToolNames : clientToolNames,
      localClientToolNames: clientToolNames,
      missingTools: liveAgentVerified ? elevenLabsAgentConfig.missingTools : toolComparison.missingTools,
      extraTools: liveAgentVerified ? elevenLabsAgentConfig.extraTools : toolComparison.extraTools
    },
    signedUrlEndpoint: {
      status: configured ? "ok" : "error",
      exists: true,
      method: "GET",
      path: "/api/ai/elevenlabs/signed-url?assistant=sarlota",
      configured,
      returnsConfiguredBoolean: true,
      dynamicVariablesChecked: true,
      signedUrlOmittedFromStatus: true
    }
  };
}

function panelStatusValue(status, { configured = false, upstreamVerified = false } = {}) {
  if (status === "error") {
    return "error";
  }

  if (status === "ok") {
    return "ok";
  }

  if (status === "configured") {
    return upstreamVerified || configured ? "ok" : "unverified";
  }

  return "unverified";
}

function panelStatusDetail(status, { ok = "OK", error = "chyba", unverified = "NEOVĚŘENO" } = {}) {
  if (status === "ok") {
    return ok;
  }

  if (status === "error") {
    return error;
  }

  return unverified;
}

export async function sarlotaPanelStatusPayload(env, user) {
  const status = await sarlotaStatusPayload(env, user);
  const openAiServerConfigured = Boolean(cleanString(env?.OPENAI_API_KEY));
  const openAiRealtimeModel = cleanString(
    env?.SARLOTA_OPENAI_REALTIME_MODEL ||
    env?.OPENAI_REALTIME_MODEL ||
    env?.VOICE_ASSISTANT_OPENAI_REALTIME_MODEL ||
    "gpt-realtime-2"
  );
  const openAiRealtimeVoice = cleanString(
    env?.SARLOTA_OPENAI_REALTIME_VOICE ||
    env?.OPENAI_REALTIME_VOICE ||
    "marin"
  );
  const elevenLabsStatus = panelStatusValue(status.elevenLabs?.status, {
    configured: status.elevenLabs?.configured,
    upstreamVerified: status.elevenLabs?.upstreamVerified
  });
  const openAiModelStatus = panelStatusValue(status.openAiModelInElevenLabs?.status);
  const openAiStatus = openAiServerConfigured ? "ok" : "error";
  const signedUrlStatus = panelStatusValue(status.signedUrlEndpoint?.status, {
    configured: status.signedUrlEndpoint?.configured
  });
  const personalizationStatus = panelStatusValue(status.personalization?.status);
  const introStatus = panelStatusValue(status.firstMessage?.status);
  const vocativeStatus = panelStatusValue(status.vocative?.status);

  return {
    generatedAt: status.generatedAt,
    panel: {
      title: "Šarlota",
      readOnly: true,
      openedByDeepLink: true
    },
    statuses: {
      elevenLabs: {
        label: "ElevenLabs",
        status: elevenLabsStatus,
        detail: panelStatusDetail(elevenLabsStatus, {
          ok: status.elevenLabs?.upstreamVerified ? "OK, agent ověřen read-only" : "OK, server má konfiguraci",
          error: "chybí konfigurace nebo agent není dostupný"
        })
      },
      openAi: {
        label: "OpenAI",
        status: openAiStatus,
        detail: panelStatusDetail(openAiStatus, {
          ok: openAiModelStatus === "ok"
            ? "OK, server-side klíč existuje a model je ověřen v ElevenLabs"
            : `OK, server-side klíč existuje; model v ElevenLabs ${OPENAI_MODEL_EXPECTED_IN_ELEVENLABS} / NEOVĚŘENO`,
          error: "chybí server-side OPENAI_API_KEY",
          unverified: "NEOVĚŘENO"
        })
      },
      openAiRealtime: {
        label: "OpenAI hlas",
        status: openAiServerConfigured ? "ok" : "error",
        detail: openAiServerConfigured
          ? `OK, Realtime připravené server-side (${openAiRealtimeModel}, hlas ${openAiRealtimeVoice})`
          : "chybí server-side OPENAI_API_KEY"
      },
      ksoBackend: {
        label: "KSO backend",
        status: "ok",
        detail: "OK, přihlášený uživatel má přístup"
      },
      signedUrl: {
        label: "Signed-url endpoint",
        status: signedUrlStatus,
        detail: panelStatusDetail(signedUrlStatus, {
          ok: "OK, endpoint existuje a je nakonfigurovaný",
          error: "endpoint existuje, ale chybí konfigurace",
          unverified: "NEOVĚŘENO"
        })
      },
      personalization: {
        label: "Personalizace",
        status: personalizationStatus,
        detail: panelStatusDetail(personalizationStatus, {
          ok: "OK, proměnné vznikají z přihlášeného profilu",
          error: "chybí povinné dynamické proměnné"
        })
      },
      introAnnouncement: {
        label: "intro_announcement",
        status: introStatus,
        detail: panelStatusDetail(introStatus, {
          ok: "OK, připraveno pro first message",
          error: "first message nebo intro_announcement nesedí"
        })
      },
      vocative: {
        label: "Vocativ",
        status: vocativeStatus,
        detail: panelStatusDetail(vocativeStatus, {
          ok: "OK",
          error: "vocativ není ověřený"
        })
      }
    },
    checks: {
      signedUrlEndpoint: "/api/ai/elevenlabs/signed-url?assistant=sarlota",
      voiceEndpoint: "/api/voice/sarlota",
      openAiRealtimeEndpoint: "/api/sarlota/realtime-session",
      signedUrlOmitted: true,
      secretsOmitted: true,
      dynamicVariableValuesOmitted: true,
      noLiveToolsExecuted: true
    }
  };
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");

  if (response) {
    return response;
  }

  return json(await sarlotaStatusPayload(env, user));
}
