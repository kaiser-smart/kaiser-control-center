import { json, requireUserPermission } from "../../../_lib/auth.js";
import { sarlotaIntroAnnouncementForAi } from "../../../_lib/ai-session-announcements.js";
import { normalizeAiSearch, userDynamicVariablesForAi } from "../../../_lib/ai-people-summary.js";
import { sarlotaHumanTouchContext } from "../../../_lib/sarlota-human-touch.js";
import { ELEVENLABS_CLIENT_TOOL_SCHEMAS } from "../../../../src/elevenLabsClientTools.js";
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../../../../src/sarlota/sarlotaSystemPrompt.js";
import {
  assistantConfigFromRequest,
  elevenLabsAgentNameMatchesExpected,
  assistantPublicMetadata,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";

const LLM_MODEL_EXPECTED_IN_ELEVENLABS = "Qwen3.5-397B-A17B";
const LLM_MODEL_EXPECTED_NORMALIZED = "qwen35397ba17b";
const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const DRIVER_REPORT_PROMPT_MARKER = "HLÁŠENÍ ŘIDIČŮ / VOZIDLA";
const DRIVER_REPORT_PROMPT_REQUIRED_PHRASE = "Vozidla smíš v hlasu vyjmenovat pouze tehdy";
const FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES = [
  "Moment, načtu si " + "vozidla",
  "V hlasovém flow nikdy neříkej " + "konkrétní vozidlo",
  "Mám u tebe ověřené " + "tyto vozy",
  "Vyjmenuj " + "možnosti",
  "SPZ chtěj až jako " + "poslední možnost",
  "typ, značku nebo " + "interní název",
  "auto " + "3 brzdí divně",
  "Ford " + "Transit",
  "Škoda " + "Octavia",
  "Fiat " + "Ducato",
  "Tatra",
  "1A2 " + "3456",
  "1AB " + "2345",
  "3A4 " + "5678",
  "Zapíšu bezpečnostní závadu k vozidlu " + "3",
  "Hotovo, závada je " + "zapsaná"
];
const REQUIRED_DYNAMIC_VARIABLES = [
  "user_name",
  "user_first_name",
  "user_first_name_vocative",
  "user_first_name_friendly_vocative",
  "user_first_name_addressing_style",
  "user_role",
  "available_modules",
  "user_permissions",
  "user_department",
  "user_position",
  "time_of_day_greeting",
  "user_greeting",
  "intro_announcement",
  "intro_announcement_enabled",
  "human_touch_enabled"
];
const OPTIONAL_DYNAMIC_VARIABLES = [
  "human_touch_suggestion",
  "human_touch_type",
  "human_touch_source",
  "driver_report_vehicle_status",
  "driver_report_vehicle_id",
  "driver_report_vehicle_name",
  "driver_report_vehicle_license_plate",
  "driver_report_vehicle_vin",
  "driver_report_vehicle_type",
  "driver_report_vehicle_options_count",
  "driver_report_vehicle_options",
  "driver_report_vehicle_selection_question",
  "driver_report_vehicle_context"
];
const EXPECTED_DYNAMIC_VARIABLES = [
  ...REQUIRED_DYNAMIC_VARIABLES,
  ...OPTIONAL_DYNAMIC_VARIABLES
];
const EXPECTED_CLIENT_TOOL_NAMES = ELEVENLABS_CLIENT_TOOL_SCHEMAS
  .map((tool) => String(tool?.name ?? "").trim())
  .filter(Boolean);

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function normalizePathPart(value) {
  return String(value ?? "").trim();
}

function pathText(path) {
  return path
    .map((part) => normalizePathPart(part))
    .filter(Boolean)
    .join(".");
}

function maskOpaqueId(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  if (text.length <= 10) {
    return `${text.slice(0, 3)}...${text.slice(-2)}`;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function safeShortText(value, limit = 120) {
  const text = cleanString(value)
    .replace(/\s+/g, " ");

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1)}...`;
}

function normalizeStatusText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
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

function promptFromAgent(agentConfig) {
  const priorityPaths = [
    ["conversation_config", "agent", "prompt", "prompt"],
    ["conversation_config", "agent", "prompt", "system_prompt"],
    ["conversation_config", "agent", "prompt", "systemPrompt"],
    ["conversation_config", "agent", "prompt", "text"],
    ["conversation_config", "agent", "prompt", "content"]
  ];

  for (const path of priorityPaths) {
    const value = getPathValue(agentConfig, path);
    if (typeof value === "string" && cleanString(value)) {
      return value;
    }
  }

  return "";
}

function driverReportPromptRuleMatches(agentConfig) {
  const prompt = promptFromAgent(agentConfig);
  return Boolean(
    prompt &&
    prompt.includes(DRIVER_REPORT_PROMPT_MARKER) &&
    prompt.includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE) &&
    prompt.includes(DRIVER_REPORT_PROMPT_REQUIRED_PHRASE)
  );
}

function driverReportPromptForbiddenPhrases(agentConfig) {
  const prompt = promptFromAgent(agentConfig).toLowerCase();
  return FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES.filter((phrase) => prompt.includes(phrase.toLowerCase()));
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

function toolIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      name: "",
      type: "",
      id: ""
    };
  }

  const config = value.tool_config || value.toolConfig || value;

  return {
    name: cleanString(config.name || value.name || value.tool_name || value.toolName),
    type: cleanString(config.type || value.type || value.tool_type || value.toolType),
    id: cleanString(config.id || value.id || value.tool_id || value.toolId)
  };
}

function collectToolEntriesFromAgent(agentConfig) {
  const entries = [];
  const seen = new Set();

  walkObject(agentConfig, (value, key, parentPath) => {
    const currentPath = [...parentPath, key];
    const keyLooksLikeTool = normalizeStatusText(key).includes("tool");

    if (Array.isArray(value) && keyLooksLikeTool) {
      value.forEach((item, index) => {
        const itemPath = [...currentPath, index];
        if (typeof item === "string" && cleanString(item)) {
          entries.push({
            label: maskOpaqueId(item),
            name: "",
            type: "tool_id",
            idMasked: maskOpaqueId(item),
            idPresent: true,
            path: pathText(itemPath),
            keys: []
          });
          return;
        }

        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return;
        }

        const identity = toolIdentity(item);
        if (!identity.name && !identity.type && !identity.id) {
          return;
        }

        entries.push({
          label: identity.name || maskOpaqueId(identity.id) || identity.type || "tool",
          name: identity.name,
          type: identity.type || "unknown",
          idMasked: maskOpaqueId(identity.id),
          idPresent: Boolean(identity.id),
          path: pathText(itemPath),
          keys: Object.keys(item).sort().slice(0, 12)
        });
      });
    }

    if (value && typeof value === "object" && !Array.isArray(value) && keyLooksLikeTool) {
      const identity = toolIdentity(value);
      if (!identity.name && !identity.type && !identity.id) {
        return;
      }

      entries.push({
        label: identity.name || maskOpaqueId(identity.id) || identity.type || "tool",
        name: identity.name,
        type: identity.type || "unknown",
        idMasked: maskOpaqueId(identity.id),
        idPresent: Boolean(identity.id),
        path: pathText(currentPath),
        keys: Object.keys(value).sort().slice(0, 12)
      });
    }
  });

  return entries
    .filter((entry) => {
      const key = `${entry.path}|${entry.label}|${entry.type}|${entry.idMasked}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function collectKnowledgeEntriesFromAgent(agentConfig) {
  const entries = [];
  const seen = new Set();

  walkObject(agentConfig, (value, key, parentPath) => {
    const normalizedKey = normalizeStatusText(key);
    if (!normalizedKey.includes("knowledge")) {
      return;
    }

    const currentPath = [...parentPath, key];

    if (Array.isArray(value)) {
      value.slice(0, 20).forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          if (cleanString(item)) {
            entries.push({
              label: safeShortText(item, 80),
              type: typeof item,
              idMasked: "",
              path: pathText([...currentPath, index]),
              keys: []
            });
          }
          return;
        }

        const label = safeShortText(item.name || item.title || item.label || item.id || item.document_id || item.documentId || "knowledge", 80);
        entries.push({
          label,
          type: cleanString(item.type || item.kind || "knowledge"),
          idMasked: maskOpaqueId(item.id || item.document_id || item.documentId),
          path: pathText([...currentPath, index]),
          keys: Object.keys(item).sort().slice(0, 12)
        });
      });
      return;
    }

    if (value && typeof value === "object") {
      const label = safeShortText(value.name || value.title || value.label || value.id || value.document_id || value.documentId || "knowledge", 80);
      entries.push({
        label,
        type: cleanString(value.type || value.kind || "knowledge"),
        idMasked: maskOpaqueId(value.id || value.document_id || value.documentId),
        path: pathText(currentPath),
        keys: Object.keys(value).sort().slice(0, 12)
      });
      return;
    }

    if (cleanString(value)) {
      entries.push({
        label: safeShortText(value, 80),
        type: typeof value,
        idMasked: "",
        path: pathText(currentPath),
        keys: []
      });
    }
  });

  return entries
    .filter((entry) => {
      const key = `${entry.path}|${entry.label}|${entry.type}|${entry.idMasked}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function safeAgentNameMatches(agentConfig, assistantConfig) {
  const agentName = cleanString(agentConfig?.name);
  return elevenLabsAgentNameMatchesExpected(agentName, assistantConfig);
}

async function readElevenLabsAgentConfig({ apiKey, agentId, assistantConfig }) {
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
    const modelMatches = normalizeStatusText(observedModel) === LLM_MODEL_EXPECTED_NORMALIZED;
    const firstMessage = firstMessageFromAgent(agentConfig);
    const firstMessageMatches = cleanString(firstMessage) === FIRST_MESSAGE_TEMPLATE;
    const driverReportPromptRulePresent = assistantConfig?.promptSyncAllowed === true
      ? driverReportPromptRuleMatches(agentConfig)
      : false;
    const driverReportPromptForbidden = driverReportPromptForbiddenPhrases(agentConfig);
    const configuredToolNames = toolNamesFromAgent(agentConfig);
    const configuredToolEntries = collectToolEntriesFromAgent(agentConfig);
    const knowledgeEntries = collectKnowledgeEntriesFromAgent(agentConfig);
    const toolComparison = compareToolNames(configuredToolNames);

    return {
      verified: true,
      status: "ok",
      agentNameMatches: safeAgentNameMatches(agentConfig, assistantConfig),
      observedModel,
      modelMatches,
      firstMessageMatches,
      driverReportPromptRulePresent,
      driverReportPromptForbidden,
      configuredToolNames,
      configuredToolEntries,
      knowledgeEntries,
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

function femaleDiminutiveVocativeFixtureOk() {
  const fixtures = [
    ["Alena Čuříková", "Alenko"],
    ["Marcela Opluštilová", "Marcelko"],
    ["Jarmila Olšaníková", "Jaruško"],
    ["Bc. Lucie Ježková, DiS.", "Lucko"]
  ];

  return fixtures.every(([name, expected]) => {
    const variables = userDynamicVariablesForAi({
      id: `fixture-${normalizeAiSearch(name)}`,
      name,
      role: "readonly",
      status: "active"
    });

    return cleanString(variables.user_first_name_friendly_vocative) === expected
      && cleanString(variables.user_first_name_addressing_style) === "female_diminutive";
  });
}

function humanTouchDynamicVariables(humanTouch) {
  const suggestion = Array.isArray(humanTouch?.suggestions) ? humanTouch.suggestions[0] : null;

  return {
    human_touch_enabled: humanTouch?.enabled && suggestion?.text ? "ano" : "ne",
    human_touch_suggestion: suggestion?.text || "",
    human_touch_type: suggestion?.type || "",
    human_touch_source: suggestion?.source || ""
  };
}

function fallbackDriverReportVehicleVariables() {
  return {
    driver_report_vehicle_status: "nenalezeno",
    driver_report_vehicle_id: "",
    driver_report_vehicle_name: "",
    driver_report_vehicle_license_plate: "",
    driver_report_vehicle_vin: "",
    driver_report_vehicle_type: "",
    driver_report_vehicle_options_count: "0",
    driver_report_vehicle_options: "",
    driver_report_vehicle_selection_question: "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
    driver_report_vehicle_context: "V Hlášení řidičů použij ověřený backend seznam, bezpečný výběr v aplikaci, nebo nouzově značku, typ či SPZ."
  };
}

function driverReportVehicleStatusSummary(variables) {
  if (variables?.omittedByDefault === true) {
    return {
      status: "vynecháno",
      source: "signed_url_default_omitted",
      optionsCount: 0,
      optionsPreview: "Běžná signed-url cesta neposílá driver_report_vehicle_*.",
      singleVehiclePreview: "",
      hasSelectionQuestion: false,
      hasContext: false,
      fullVinReturned: false,
      signedUrlReturned: false,
      secretsReturned: false,
      omittedByDefault: true
    };
  }

  const status = cleanString(variables?.driver_report_vehicle_status) || "neověřeno";
  const optionsCount = Number.parseInt(cleanString(variables?.driver_report_vehicle_options_count), 10);
  const options = safeShortText(variables?.driver_report_vehicle_options, 240);
  const singleVehicle = safeShortText(variables?.driver_report_vehicle_name, 160);

  return {
    status,
    source: "signed_url_dynamic_variables",
    optionsCount: Number.isFinite(optionsCount) ? optionsCount : 0,
    optionsPreview: options,
    singleVehiclePreview: singleVehicle,
    hasSelectionQuestion: Boolean(cleanString(variables?.driver_report_vehicle_selection_question)),
    hasContext: Boolean(cleanString(variables?.driver_report_vehicle_context)),
    fullVinReturned: false,
    signedUrlReturned: false,
    secretsReturned: false
  };
}

async function optionalStatusContext(name, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error("elevenlabs.status_optional_context_failed", {
      context: name,
      message: safeErrorMessage(error)
    });
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

export async function sarlotaStatusPayload(env, user, assistantConfig = resolveElevenLabsAssistantConfig("sarlota", env)) {
  if (!assistantConfig) {
    return {
      generatedAt: new Date().toISOString(),
      error: "Neznámý ElevenLabs assistant key.",
      code: "INVALID_ASSISTANT_KEY",
      apiStatus: "waiting"
    };
  }

  const apiKeyPresent = Boolean(cleanString(env?.ELEVENLABS_API_KEY));
  const agentId = assistantConfig.agentId;
  const agentIdPresent = Boolean(agentId);
  const configured = apiKeyPresent && agentIdPresent;
  const elevenLabsAgentConfig = await readElevenLabsAgentConfig({
    apiKey: cleanString(env?.ELEVENLABS_API_KEY),
    agentId,
    assistantConfig
  });
  const introAnnouncement = await sarlotaIntroAnnouncementForAi(env, user, assistantConfig);
  const userVariables = userDynamicVariablesForAi(user);
  const humanTouch = await optionalStatusContext(
    "human_touch",
    () => sarlotaHumanTouchContext(env, user, {
      dynamic_variables: userVariables
    }),
    { enabled: false, suggestions: [], sourceStatus: { status: "unavailable" } }
  );
  const driverReportVehicleVariables = { omittedByDefault: true };
  const dynamicVariables = {
    ...userVariables,
    ...introAnnouncement.variables,
    ...humanTouchDynamicVariables(humanTouch),
    ...driverReportVehicleVariables
  };
  const missingVariables = missingRequiredVariables(dynamicVariables);
  const clientToolNames = ELEVENLABS_CLIENT_TOOL_SCHEMAS
    .map((tool) => cleanString(tool.name))
    .filter(Boolean);
  const toolComparison = compareToolNames(clientToolNames);
  const userFirstName = cleanString(user?.name).split(/\s+/).filter(Boolean)[0] || "";
  const currentUserIsRadim = normalizeAiSearch(userFirstName) === "radim";
  const currentVocativePresent = Boolean(cleanString(dynamicVariables.user_first_name_vocative));
  const currentFriendlyVocativePresent = Boolean(cleanString(dynamicVariables.user_first_name_friendly_vocative));
  const radimFixtureOk = radimVocativeFixtureOk();
  const femaleDiminutiveFixtureOk = femaleDiminutiveVocativeFixtureOk();
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
  const driverReportPromptStatus = liveAgentVerified
    ? (assistantConfig.promptSyncAllowed === true
      ? (elevenLabsAgentConfig.driverReportPromptRulePresent && !elevenLabsAgentConfig.driverReportPromptForbidden?.length ? "ok" : "error")
      : "unverified")
    : (liveAgentError ? "error" : "unverified");

  return {
    generatedAt: new Date().toISOString(),
    panel: {
      title: assistantConfig.shortName,
      readOnly: true
    },
    agent: {
      ...assistantPublicMetadata(assistantConfig),
      name: assistantConfig.displayName,
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
      dynamicVariablesOptional: OPTIONAL_DYNAMIC_VARIABLES,
      dynamicVariablesExpected: EXPECTED_DYNAMIC_VARIABLES,
      dynamicVariablesPresent: EXPECTED_DYNAMIC_VARIABLES.filter((key) => Object.prototype.hasOwnProperty.call(dynamicVariables, key)),
      missingVariables,
      valuesReturnedToPanel: false
    },
    vocative: {
      status: currentVocativePresent && currentFriendlyVocativePresent && radimFixtureOk && femaleDiminutiveFixtureOk ? "ok" : "error",
      currentUserVocativePresent: currentVocativePresent,
      currentUserFriendlyVocativePresent: currentFriendlyVocativePresent,
      currentUserIsRadim,
      radimFixtureOk,
      femaleDiminutiveFixtureOk
    },
    openAiModelInElevenLabs: {
      status: modelStatus,
      expectedModel: LLM_MODEL_EXPECTED_IN_ELEVENLABS,
      observedModel: liveAgentVerified ? cleanString(elevenLabsAgentConfig.observedModel) : "",
      verifiedInElevenLabs: liveAgentVerified
    },
    driverReportPrompt: {
      status: driverReportPromptStatus,
      rulePresent: liveAgentVerified ? elevenLabsAgentConfig.driverReportPromptRulePresent : null,
      forbiddenPhrasesPresent: liveAgentVerified ? (elevenLabsAgentConfig.driverReportPromptForbidden || []) : [],
      promptTextReturned: false,
      syncAllowed: assistantConfig.promptSyncAllowed === true,
      syncEndpoint: `/api/ai/elevenlabs/sarlota-prompt-sync?assistant=${encodeURIComponent(assistantConfig.assistantKey)}`
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
      configuredToolEntries: liveAgentVerified ? elevenLabsAgentConfig.configuredToolEntries : [],
      localClientToolNames: clientToolNames,
      missingTools: liveAgentVerified ? elevenLabsAgentConfig.missingTools : toolComparison.missingTools,
      extraTools: liveAgentVerified ? elevenLabsAgentConfig.extraTools : toolComparison.extraTools
    },
    knowledgeBase: {
      status: liveAgentVerified ? "ok" : (liveAgentError ? "error" : "unverified"),
      verifiedInElevenLabs: liveAgentVerified,
      entries: liveAgentVerified ? elevenLabsAgentConfig.knowledgeEntries : [],
      entriesCount: liveAgentVerified ? elevenLabsAgentConfig.knowledgeEntries.length : 0,
      contentReturned: false
    },
    driverReportVehicleContext: driverReportVehicleStatusSummary(driverReportVehicleVariables),
    signedUrlEndpoint: {
      status: configured ? "ok" : "error",
      exists: true,
      method: "GET",
      path: "/api/ai/elevenlabs/signed-url?assistant=sarlota",
      assistantKey: assistantConfig.assistantKey,
      pathForAssistant: `/api/ai/elevenlabs/signed-url?assistant=${encodeURIComponent(assistantConfig.assistantKey)}`,
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
  const assistantConfig = resolveElevenLabsAssistantConfig("sarlota", env);
  const status = await sarlotaStatusPayload(env, user, assistantConfig);
  const openAiServerConfigured = Boolean(cleanString(env?.OPENAI_API_KEY));
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
            ? "OK, server-side klíč existuje a LLM model je ověřen v ElevenLabs"
            : `OK, server-side klíč existuje; LLM model v ElevenLabs ${LLM_MODEL_EXPECTED_IN_ELEVENLABS} / NEOVĚŘENO`,
          error: "chybí server-side OPENAI_API_KEY",
          unverified: "NEOVĚŘENO"
        })
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
          ok: "OK, Radime i ženské zdrobnělé oslovení ověřené",
          error: "vocativ není ověřený"
        })
      }
    },
    checks: {
      signedUrlEndpoint: `/api/ai/elevenlabs/signed-url?assistant=${encodeURIComponent(assistantConfig.assistantKey)}`,
      voiceEndpoint: "/api/voice/sarlota",
      signedUrlOmitted: true,
      secretsOmitted: true,
      dynamicVariableValuesOmitted: true,
      noLiveToolsExecuted: true
    }
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const assistantConfig = assistantConfigFromRequest(request, env);
    if (!assistantConfig) {
      return json({
        error: "Neznámý ElevenLabs assistant key.",
        code: "INVALID_ASSISTANT_KEY",
        apiStatus: "waiting"
      }, 400);
    }

    return json(await sarlotaStatusPayload(env, user, assistantConfig));
  } catch (error) {
    console.error("elevenlabs.sarlota_status_failed", {
      message: safeErrorMessage(error)
    });
    return json({
      error: "Stav Šarloty se teď nepodařilo ověřit.",
      code: "sarlota_status_failed",
      apiStatus: "waiting"
    }, 500);
  }
}
