import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { ELEVENLABS_CLIENT_TOOL_SCHEMAS } from "../../../../src/elevenLabsClientTools.js";
import { elevenLabsWebhookToolConfigs } from "../../../../src/elevenLabsWebhookTools.js";
import {
  assistantConfigFromRequest,
  assistantPublicMetadata,
  elevenLabsAgentNameMatchesExpected,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";

const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const DIAGNOSTIC_IDENTITY_ONLY_MODE = "diagnostic_identity_only";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";
const WEBHOOK_TOOL_NAMES = new Set(["get_driver_report_context"]);
const SAFE_UPSTREAM_DETAIL_LIMIT = 900;
const SAFE_UPSTREAM_SUMMARY_LIMIT = 360;
const SENSITIVE_DIAGNOSTIC_KEY_PATTERN = /(api[-_]?key|authorization|bearer|password|secret|signed[-_]?url|signedurl|token|xi[-_]?api[-_]?key)/i;
const SAFE_AGENT_TOOL_PATHS = [
  ["conversation_config", "agent", "prompt", "tool_ids"],
  ["conversation_config", "agent", "prompt", "tools"],
  ["conversation_config", "agent", "tools"],
  ["conversation_config", "tools"]
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function truncateDiagnosticText(value, limit = SAFE_UPSTREAM_DETAIL_LIMIT) {
  const text = cleanString(value).replace(/\s+/g, " ");
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function redactDiagnosticText(value) {
  return cleanString(value)
    .replace(/("(?:api[-_]?key|authorization|bearer|password|secret|signed[-_]?url|signedurl|token|xi[-_]?api[-_]?key)"\s*:\s*")[^"]*(")/gi, "$1[redacted]$2")
    .replace(/\b(?:authorization|x-voice-assistant-token|xi-api-key|api[-_]?key|secret|token|signed[-_]?url)\s*[:=]\s*[^\s,;]+/gi, (match) => {
      const separatorIndex = Math.max(match.indexOf(":"), match.indexOf("="));
      return separatorIndex >= 0 ? `${match.slice(0, separatorIndex + 1)} [redacted]` : "[redacted]";
    })
    .replace(/\bsk_[A-Za-z0-9_-]{12,}\b/g, "[redacted-api-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/gi, "Bearer [redacted]")
    .replace(/\bwss:\/\/[^\s"']+/gi, "[redacted-signed-url]")
    .replace(/\bhttps:\/\/api\.elevenlabs\.io\/[^\s"']+/gi, "[redacted-elevenlabs-url]");
}

function redactDiagnosticPayload(value, key = "", depth = 0) {
  if (depth > 6) {
    return "[redacted-depth-limit]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return SENSITIVE_DIAGNOSTIC_KEY_PATTERN.test(key)
      ? "[redacted]"
      : redactDiagnosticText(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redactDiagnosticPayload(item, key, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, 30).map(([childKey, child]) => [
      childKey,
      SENSITIVE_DIAGNOSTIC_KEY_PATTERN.test(childKey)
        ? "[redacted]"
        : redactDiagnosticPayload(child, childKey, depth + 1)
    ])
  );
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "";
  }
}

function parseJsonPayload(text) {
  const cleanText = cleanString(text);
  if (!cleanText) {
    return {};
  }

  try {
    return JSON.parse(cleanText);
  } catch (_) {
    return {};
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPathValue(source, path) {
  return path.reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    return value[key];
  }, source);
}

function setPathValue(source, path, value) {
  const parentPath = path.slice(0, -1);
  const key = path.at(-1);
  const parent = getPathValue(source, parentPath);

  if (!parent || typeof parent !== "object" || !key) {
    return false;
  }

  parent[key] = value;
  return true;
}

function normalizeToolType(type) {
  const normalized = cleanString(type).toLowerCase();
  if (["number", "boolean", "array", "object"].includes(normalized)) {
    return normalized;
  }

  return "string";
}

function expectedClientToolConfig(tool) {
  const properties = {};
  const required = [];

  for (const parameter of tool.parameters || []) {
    const name = cleanString(parameter.name);
    if (!name) {
      continue;
    }

    properties[name] = {
      type: normalizeToolType(parameter.type),
      description: cleanString(parameter.description) || name
    };

    if (parameter.required) {
      required.push(name);
    }
  }

  return {
    type: "client",
    name: cleanString(tool.name),
    description: cleanString(tool.description),
    parameters: {
      type: "object",
      properties,
      required
    }
  };
}

export function expectedTools(env = {}) {
  const clientTools = ELEVENLABS_CLIENT_TOOL_SCHEMAS
    .filter((tool) => !WEBHOOK_TOOL_NAMES.has(cleanString(tool.name)))
    .map(expectedClientToolConfig)
    .filter((tool) => tool.name);

  return [
    ...clientTools,
    ...elevenLabsWebhookToolConfigs(env).filter((tool) => tool.name)
  ];
}

function toolName(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return cleanString(value.name || value.tool_name || value.toolName || value.tool_config?.name || value.toolConfig?.name);
}

function toolType(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return cleanString(value.type || value.tool_config?.type || value.toolConfig?.type);
}

function toolId(value) {
  if (!value || typeof value !== "object") {
    return cleanString(value);
  }

  return cleanString(value.id || value.tool_id || value.toolId);
}

function toolConfigFromWorkspaceTool(tool) {
  return tool?.tool_config || tool?.toolConfig || tool || {};
}

function toolConfigChanged(currentTool, expectedTool) {
  const current = toolConfigFromWorkspaceTool(currentTool);
  const normalizedCurrent = {
    type: current.type,
    name: current.name,
    description: current.description,
    parameters: current.parameters || undefined,
    api_schema: current.api_schema || undefined,
    response_timeout_secs: current.response_timeout_secs || undefined
  };
  const normalizedExpected = {
    type: expectedTool.type,
    name: expectedTool.name,
    description: expectedTool.description,
    parameters: expectedTool.parameters || undefined,
    api_schema: expectedTool.api_schema || undefined,
    response_timeout_secs: expectedTool.response_timeout_secs || undefined
  };

  return JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedExpected);
}

function upstreamErrorSummary(error) {
  const detail = error?.payload?.detail;
  if (Array.isArray(detail)) {
    const summary = detail
      .slice(0, 3)
      .map((item) => {
        const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
        const message = cleanString(item?.msg || item?.message || item?.type || "validation_error");
        return loc ? `${loc}: ${message}` : message;
      })
      .filter(Boolean)
      .join("; ");

    return truncateDiagnosticText(redactDiagnosticText(summary), SAFE_UPSTREAM_SUMMARY_LIMIT);
  }

  if (typeof detail === "string") {
    return truncateDiagnosticText(redactDiagnosticText(detail), SAFE_UPSTREAM_SUMMARY_LIMIT);
  }

  return truncateDiagnosticText(
    redactDiagnosticText(error?.payload?.message || error?.payload?.error || error?.message || "upstream_error"),
    SAFE_UPSTREAM_SUMMARY_LIMIT
  );
}

function classifyElevenLabsError(text) {
  const normalized = cleanString(text).toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (/(env_var|environment variable|auth|authorization|secret|api key|permission|unauthorized|forbidden)/i.test(normalized)) {
    return "secret";
  }

  if (/(validation|schema|loc|field required|required|invalid|unexpected|extra fields|value_error|type_error)/i.test(normalized)) {
    return "payload";
  }

  return "unknown";
}

export function safeElevenLabsErrorDetail(error) {
  const redactedPayload = redactDiagnosticPayload(error?.payload || {});
  const payloadPreview = safeJsonStringify(redactedPayload);
  const rawPreview = error?.rawBody ? redactDiagnosticText(error.rawBody) : "";
  const responsePreview = truncateDiagnosticText(rawPreview || payloadPreview || "", SAFE_UPSTREAM_DETAIL_LIMIT);
  const summary = upstreamErrorSummary(error);
  const classificationSource = `${summary} ${responsePreview}`;

  return {
    summary,
    detail: responsePreview,
    category: classifyElevenLabsError(classificationSource)
  };
}

function toolNamesFromAgent(agentConfig) {
  const names = new Set();

  function walk(value, key = "") {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      if (cleanString(key).toLowerCase().includes("tool")) {
        value.forEach((item) => {
          const name = toolName(item);
          if (name) {
            names.add(name);
          }
        });
      }

      value.forEach((item) => walk(item));
      return;
    }

    const name = toolName(value);
    if (name && cleanString(key).toLowerCase().includes("tool")) {
      names.add(name);
    }

    Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
  }

  walk(agentConfig);
  return [...names].sort((a, b) => a.localeCompare(b, "cs"));
}

function firstMessageFromAgent(agentConfig) {
  return cleanString(
    getPathValue(agentConfig, ["conversation_config", "agent", "first_message"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "firstMessage"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "first_message"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "firstMessage"])
  );
}

function summarizeTool(tool) {
  if (!tool || typeof tool !== "object") {
    return {
      idPresent: false,
      name: "",
      type: typeof tool,
      keys: []
    };
  }

  return {
    idPresent: Boolean(toolId(tool)),
    name: toolName(tool),
    type: toolType(tool),
    keys: Object.keys(tool).sort()
  };
}

function findAgentToolArray(agentConfig) {
  for (const path of SAFE_AGENT_TOOL_PATHS) {
    const value = getPathValue(agentConfig, path);
    if (Array.isArray(value)) {
      return {
        path,
        pathText: path.join("."),
        value,
        kind: path.at(-1) === "tool_ids" ? "tool_ids" : "tools"
      };
    }
  }

  return null;
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

async function elevenLabsRequest({ apiKey, path, method = "GET", body = null }) {
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  const rawBody = await response.text().catch(() => "");
  const payload = parseJsonPayload(rawBody);

  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    error.rawBody = rawBody;
    throw error;
  }

  return payload;
}

async function readLiveContext(env, assistantConfig) {
  const apiKey = cleanString(env?.ELEVENLABS_API_KEY);
  const agentId = assistantConfig?.agentId || "";

  if (!apiKey || !agentId) {
    return {
      ok: false,
      status: "missing_configuration",
      apiKeyPresent: Boolean(apiKey),
      agentIdPresent: Boolean(agentId),
      assistant: assistantConfig ? assistantPublicMetadata(assistantConfig) : null
    };
  }

  const [agentConfig, toolsPayload] = await Promise.all([
    elevenLabsRequest({ apiKey, path: `/agents/${encodeURIComponent(agentId)}` }),
    elevenLabsRequest({ apiKey, path: "/tools" }).catch((error) => ({
      __toolsReadError: true,
      status: error.status || 0
    }))
  ]);

  return {
    ok: true,
    apiKey,
    agentId,
    assistantConfig,
    agentConfig,
    workspaceTools: toolsPayload.__toolsReadError ? [] : workspaceToolList(toolsPayload),
    workspaceToolsReadStatus: toolsPayload.__toolsReadError ? "error" : "ok",
    workspaceToolsUpstreamStatus: toolsPayload.__toolsReadError ? toolsPayload.status : null
  };
}

export function buildSyncPlan(agentConfig, workspaceTools, assistantConfig, env = {}) {
  const expected = expectedTools(env);
  const expectedNames = expected.map((tool) => tool.name);
  const workspaceByName = new Map();

  for (const tool of workspaceTools) {
    const name = toolName(tool);
    if (name && !workspaceByName.has(name)) {
      workspaceByName.set(name, tool);
    }
  }

  const missingWorkspaceTools = [];
  const changedWorkspaceTools = [];
  const workspaceOperations = [];

  for (const tool of expected) {
    const existing = workspaceByName.get(tool.name);
    if (!existing) {
      missingWorkspaceTools.push(tool.name);
      workspaceOperations.push({ action: "create", tool });
      continue;
    }

    if (toolConfigChanged(existing, tool)) {
      changedWorkspaceTools.push(tool.name);
      const id = toolId(existing);
      if (id) {
        workspaceOperations.push({ action: "update", id, tool });
      }
    }
  }

  const skippedWorkspaceToolUpdates = changedWorkspaceTools.filter((name) => {
    const existing = workspaceByName.get(name);
    return !toolId(existing);
  });

  const agentToolArray = findAgentToolArray(agentConfig);
  const configuredAgentToolNames = toolNamesFromAgent(agentConfig);
  const configuredAgentToolNameSet = new Set(configuredAgentToolNames);
  const missingAgentTools = expectedNames.filter((name) => !configuredAgentToolNameSet.has(name));
  const agentNameMatches = elevenLabsAgentNameMatchesExpected(agentConfig?.name, assistantConfig);
  const firstMessage = firstMessageFromAgent(agentConfig);
  const firstMessageMatches = firstMessage === FIRST_MESSAGE_TEMPLATE;

  return {
    expectedNames,
    agentNameMatches,
    firstMessageMatches,
    configuredAgentToolNames,
    missingAgentTools,
    missingWorkspaceTools,
    changedWorkspaceTools,
    workspaceOperations,
    existingWorkspaceToolUpdatesSkipped: skippedWorkspaceToolUpdates.length,
    skippedWorkspaceToolUpdates,
    agentToolPath: agentToolArray?.pathText || "",
    agentToolPathKind: agentToolArray?.kind || "",
    agentToolPathWritable: Boolean(agentToolArray),
    agentToolSamples: (agentToolArray?.value || []).slice(0, 4).map(summarizeTool)
  };
}

async function applyWorkspaceOperations(apiKey, operations) {
  const results = [];

  for (const operation of operations) {
    if (operation.action === "create") {
      try {
        const result = await elevenLabsRequest({
          apiKey,
          path: "/tools",
          method: "POST",
          body: { tool_config: operation.tool }
        });
        results.push({
          action: "create",
          name: operation.tool.name,
          ok: true,
          idPresent: Boolean(toolId(result) || toolId(result?.tool))
        });
      } catch (error) {
        const diagnostic = safeElevenLabsErrorDetail(error);
        results.push({
          action: "create",
          name: operation.tool.name,
          ok: false,
          upstreamStatus: error.status || 0,
          reason: diagnostic.summary,
          diagnosticCategory: diagnostic.category,
          diagnosticDetail: diagnostic.detail
        });
      }
      continue;
    }

    if (operation.action === "update" && operation.id) {
      try {
        await elevenLabsRequest({
          apiKey,
          path: `/tools/${encodeURIComponent(operation.id)}`,
          method: "PATCH",
          body: { tool_config: operation.tool }
        });
        results.push({
          action: "update",
          name: operation.tool.name,
          ok: true,
          idPresent: true
        });
      } catch (error) {
        const diagnostic = safeElevenLabsErrorDetail(error);
        results.push({
          action: "update",
          name: operation.tool.name,
          ok: false,
          upstreamStatus: error.status || 0,
          reason: diagnostic.summary,
          diagnosticCategory: diagnostic.category,
          diagnosticDetail: diagnostic.detail
        });
      }
      continue;
    }

    results.push({
      action: operation.action,
      name: operation.tool.name,
      ok: false,
      reason: "missing_workspace_tool_id"
    });
  }

  return results;
}

export function buildAgentPatch(agentConfig, workspaceTools, expectedNames, env = {}) {
  const toolArray = findAgentToolArray(agentConfig);
  if (!toolArray) {
    return {
      ok: false,
      reason: "agent_tool_attachment_path_not_found"
    };
  }

  const workspaceIdsByName = new Map();
  workspaceTools.forEach((tool) => {
    const name = toolName(tool);
    const id = toolId(tool);
    if (name && id) {
      workspaceIdsByName.set(name, id);
    }
  });

  const nextConfig = deepClone(agentConfig);
  const expectedToolConfigs = expectedTools(env);
  const expectedByName = new Map(expectedToolConfigs.map((tool) => [tool.name, tool]));

  if (toolArray.kind === "tool_ids") {
    const expectedIds = expectedNames
      .map((name) => workspaceIdsByName.get(name))
      .filter(Boolean);
    const expectedIdSet = new Set(expectedIds);
    const existingIds = toolArray.value
      .map((value) => toolId(value))
      .filter(Boolean);
    const prunedToolIdsCount = existingIds.filter((id) => !expectedIdSet.has(id)).length;

    if (expectedIds.length !== expectedNames.length) {
      return {
        ok: false,
        reason: "workspace_tool_ids_missing"
      };
    }

    return {
      ok: true,
      path: toolArray.pathText,
      prunedToolIdsCount,
      requestBody: {
        conversation_config: {
          agent: {
            prompt: {
              tool_ids: expectedIds
            }
          }
        }
      }
    };
  }

  const existingTools = Array.isArray(toolArray.value) ? toolArray.value : [];
  const retainedTools = existingTools.filter((tool) => {
    const name = toolName(tool);
    return !name || !expectedByName.has(name);
  });
  const mergedTools = [...retainedTools, ...expectedToolConfigs];
  setPathValue(nextConfig, toolArray.path, mergedTools);

  return {
    ok: true,
    path: toolArray.pathText,
    requestBody: { conversation_config: nextConfig.conversation_config }
  };
}

function buildDiagnosticIdentityOnlyPatch(agentConfig) {
  const nextConfig = deepClone(agentConfig);
  const clearedPaths = [];

  for (const path of SAFE_AGENT_TOOL_PATHS) {
    const value = getPathValue(nextConfig, path);
    if (Array.isArray(value) && setPathValue(nextConfig, path, [])) {
      clearedPaths.push(path.join("."));
    }
  }

  if (!clearedPaths.length) {
    return {
      ok: false,
      reason: "agent_tool_attachment_path_not_found"
    };
  }

  return {
    ok: true,
    path: clearedPaths.join(", "),
    clearedPaths,
    requestBody: { conversation_config: nextConfig.conversation_config }
  };
}

async function diagnosticIdentityOnlyPlanPayload(env, assistantConfig) {
  if (assistantConfig?.assistantKey !== "sarlota") {
    return {
      mode: DIAGNOSTIC_IDENTITY_ONLY_MODE,
      ready: false,
      status: "diagnostic_not_allowed",
      assistant: assistantPublicMetadata(assistantConfig),
      message: "Diagnostické odpojení tools je povolené jen pro ostrou Šarlotu."
    };
  }

  const context = await readLiveContext(env, assistantConfig);
  if (!context.ok) {
    return {
      mode: DIAGNOSTIC_IDENTITY_ONLY_MODE,
      ready: false,
      status: context.status,
      apiKeyPresent: context.apiKeyPresent,
      agentIdPresent: context.agentIdPresent,
      assistant: context.assistant || null,
      message: "Chybí serverová ElevenLabs konfigurace."
    };
  }

  const plan = buildSyncPlan(context.agentConfig, context.workspaceTools, assistantConfig, env);
  const patch = buildDiagnosticIdentityOnlyPatch(context.agentConfig);

  return {
    mode: DIAGNOSTIC_IDENTITY_ONLY_MODE,
    ready: plan.agentNameMatches && plan.firstMessageMatches && patch.ok,
    generatedAt: new Date().toISOString(),
    assistant: assistantPublicMetadata(assistantConfig),
    agent: {
      expectedName: assistantConfig.displayName,
      nameMatches: plan.agentNameMatches,
      firstMessage: FIRST_MESSAGE_TEMPLATE,
      firstMessageMatches: plan.firstMessageMatches
    },
    agentTools: {
      path: plan.agentToolPath,
      kind: plan.agentToolPathKind,
      writablePathFound: plan.agentToolPathWritable,
      configured: plan.configuredAgentToolNames,
      configuredCount: plan.configuredAgentToolNames.length,
      willDetachCount: plan.configuredAgentToolNames.length
    },
    backup: {
      source: "live_elevenlabs_agent_tool_list",
      configuredAgentToolNames: plan.configuredAgentToolNames,
      configuredCount: plan.configuredAgentToolNames.length,
      restoreEndpoint: "/api/ai/elevenlabs/sarlota-tools-sync",
      restorePayload: { apply: true },
      restoreNote: "Normální synchronizace znovu připne repo-side client tools. Workspace tools se při diagnostice nemažou."
    },
    safety: {
      diagnosticOnly: true,
      identityDynamicVariablesRemain: true,
      willDetachAgentTools: true,
      willDeleteWorkspaceTools: false,
      willNotPatchPrompt: true,
      willNotPatchFirstMessage: true,
      willNotPatchModel: true,
      requiresPostApplyTrue: true
    }
  };
}

async function planPayload(env, assistantConfig, mode = "") {
  if (mode === DIAGNOSTIC_IDENTITY_ONLY_MODE) {
    return diagnosticIdentityOnlyPlanPayload(env, assistantConfig);
  }

  const context = await readLiveContext(env, assistantConfig);
  if (!context.ok) {
    return {
      mode: "dry_run",
      ready: false,
      status: context.status,
      apiKeyPresent: context.apiKeyPresent,
      agentIdPresent: context.agentIdPresent,
      assistant: context.assistant || null,
      message: "Chybí serverová ElevenLabs konfigurace."
    };
  }

  const plan = buildSyncPlan(context.agentConfig, context.workspaceTools, assistantConfig, env);

  return {
    mode: "dry_run",
    ready: plan.agentNameMatches && plan.firstMessageMatches && context.workspaceToolsReadStatus === "ok",
    generatedAt: new Date().toISOString(),
    assistant: assistantPublicMetadata(assistantConfig),
    agent: {
      expectedName: assistantConfig.displayName,
      nameMatches: plan.agentNameMatches,
      firstMessage: FIRST_MESSAGE_TEMPLATE,
      firstMessageMatches: plan.firstMessageMatches
    },
    workspaceTools: {
      readStatus: context.workspaceToolsReadStatus,
      upstreamStatus: context.workspaceToolsUpstreamStatus,
      missing: plan.missingWorkspaceTools,
      changed: plan.changedWorkspaceTools,
      operationsCount: plan.workspaceOperations.length,
      existingUpdatesSkipped: plan.existingWorkspaceToolUpdatesSkipped
    },
    agentTools: {
      path: plan.agentToolPath,
      kind: plan.agentToolPathKind,
      writablePathFound: plan.agentToolPathWritable,
      expected: plan.expectedNames,
      configured: plan.configuredAgentToolNames,
      missing: plan.missingAgentTools,
      samples: plan.agentToolSamples
    },
    safety: {
      willNotPatchPrompt: true,
      willNotPatchFirstMessage: true,
      willNotPatchModel: true,
      requiresPostApplyTrue: true
    }
  };
}

async function applyDiagnosticIdentityOnlyPayload(env, assistantConfig, user = null) {
  if (assistantConfig?.assistantKey !== "sarlota") {
    return json({
      error: "Diagnostické odpojení tools je povolené jen pro ostrou Šarlotu.",
      code: "DIAGNOSTIC_NOT_ALLOWED",
      ...assistantPublicMetadata(assistantConfig),
      apiStatus: "waiting"
    }, 409);
  }

  const context = await readLiveContext(env, assistantConfig);
  if (!context.ok) {
    return json({
      error: "ElevenLabs konfigurace není dostupná.",
      code: context.status,
      assistant: assistantPublicMetadata(assistantConfig),
      apiStatus: "waiting"
    }, 409);
  }

  const plan = buildSyncPlan(context.agentConfig, context.workspaceTools, assistantConfig, env);
  if (!plan.agentNameMatches || !plan.firstMessageMatches) {
    return json({
      error: "ElevenLabs agent nevypadá jako bezpečná Šarlota konfigurace.",
      code: "sarlota_agent_safety_check_failed",
      agentNameMatches: plan.agentNameMatches,
      firstMessageMatches: plan.firstMessageMatches,
      apiStatus: "waiting"
    }, 409);
  }

  const agentPatch = buildDiagnosticIdentityOnlyPatch(context.agentConfig);
  if (!agentPatch.ok) {
    return json({
      error: "Strukturu tools u ElevenLabs agenta nejde bezpečně upravit naslepo.",
      code: agentPatch.reason,
      apiStatus: "waiting"
    }, 409);
  }

  const backup = {
    source: "live_elevenlabs_agent_tool_list",
    configuredAgentToolNames: plan.configuredAgentToolNames,
    configuredCount: plan.configuredAgentToolNames.length,
    restoreEndpoint: "/api/ai/elevenlabs/sarlota-tools-sync",
    restorePayload: { apply: true },
    restoreNote: "Normální synchronizace znovu připne repo-side client tools. Workspace tools se při diagnostice nemažou."
  };

  try {
    await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/agents/${encodeURIComponent(context.agentId)}`,
      method: "PATCH",
      body: agentPatch.requestBody
    });
  } catch (error) {
    return json({
      error: `Diagnostické odpojení ElevenLabs tools se nepodařilo bezpečně uložit. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "elevenlabs_agent_diagnostic_patch_failed",
      backup,
      agentPatch: {
        applied: false,
        path: agentPatch.path,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  let verifiedAgentConfig = null;
  try {
    verifiedAgentConfig = await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/agents/${encodeURIComponent(context.agentId)}`
    });
  } catch (error) {
    return json({
      error: `Diagnostické odpojení bylo uložené, ale následné ověření selhalo. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "elevenlabs_agent_diagnostic_verify_failed",
      backup,
      agentPatch: {
        applied: true,
        path: agentPatch.path,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  const verifiedNames = toolNamesFromAgent(verifiedAgentConfig);

  return json({
    status: verifiedNames.length ? "partial" : "ok",
    mode: DIAGNOSTIC_IDENTITY_ONLY_MODE,
    generatedAt: new Date().toISOString(),
    backup,
    agentPatch: {
      applied: true,
      path: agentPatch.path,
      promptChanged: false,
      firstMessageChanged: false,
      modelChanged: false
    },
    verification: {
      configuredAgentToolNames: verifiedNames,
      detachedToolCount: Math.max(0, backup.configuredCount - verifiedNames.length),
      identityDynamicVariablesRemain: true,
      workspaceToolsDeleted: false
    },
    restore: {
      endpoint: "/api/ai/elevenlabs/sarlota-tools-sync",
      payload: { apply: true },
      button: "Synchronizovat tools"
    }
  }, verifiedNames.length ? 207 : 200);
}

async function applyPayload(env, assistantConfig, mode = "", user = null) {
  if (!assistantConfig?.toolsSyncAllowed) {
    return json({
      error: "Tools sync pro tohoto asistenta není povolený.",
      code: "TOOLS_SYNC_NOT_ALLOWED",
      ...assistantPublicMetadata(assistantConfig),
      apiStatus: "waiting"
    }, 409);
  }

  if (mode === DIAGNOSTIC_IDENTITY_ONLY_MODE) {
    return applyDiagnosticIdentityOnlyPayload(env, assistantConfig, user);
  }

  const context = await readLiveContext(env, assistantConfig);
  if (!context.ok) {
    return json({
      error: "ElevenLabs konfigurace není dostupná.",
      code: context.status,
      assistant: assistantPublicMetadata(assistantConfig),
      apiStatus: "waiting"
    }, 409);
  }
  console.info("elevenlabs.sarlota_tools_sync", {
    assistantKey: assistantConfig.assistantKey,
    agentIdMasked: assistantPublicMetadata(assistantConfig).assistantAgentIdMasked,
    userId: cleanString(user?.id),
    timestamp: new Date().toISOString(),
    action: mode === DIAGNOSTIC_IDENTITY_ONLY_MODE ? "tools-diagnostic" : "tools-sync",
    apply: true
  });

  let plan = buildSyncPlan(context.agentConfig, context.workspaceTools, assistantConfig, env);
  if (context.workspaceToolsReadStatus !== "ok") {
    return json({
      error: "ElevenLabs workspace tools nejde bezpečně přečíst, takže synchronizaci nespouštím.",
      code: "elevenlabs_workspace_tools_read_failed",
      upstreamStatus: context.workspaceToolsUpstreamStatus,
      apiStatus: "waiting"
    }, 409);
  }

  if (!plan.agentNameMatches || !plan.firstMessageMatches) {
    return json({
      error: "ElevenLabs agent nevypadá jako bezpečná Šarlota konfigurace.",
      code: "sarlota_agent_safety_check_failed",
      agentNameMatches: plan.agentNameMatches,
      firstMessageMatches: plan.firstMessageMatches,
      apiStatus: "waiting"
    }, 409);
  }

  const workspaceResults = await applyWorkspaceOperations(context.apiKey, plan.workspaceOperations);
  const failedWorkspaceResults = workspaceResults.filter((result) => !result.ok);
  if (failedWorkspaceResults.length) {
    const firstFailure = failedWorkspaceResults[0];
    const firstFailureText = [
      firstFailure.action,
      firstFailure.name,
      firstFailure.upstreamStatus ? `HTTP ${firstFailure.upstreamStatus}` : "",
      firstFailure.reason || "",
      firstFailure.diagnosticDetail ? `Detail: ${firstFailure.diagnosticDetail}` : ""
    ].filter(Boolean).join(" ");

    return json({
      error: `Některé ElevenLabs workspace tools nejde bezpečně vytvořit nebo upravit. První chyba: ${firstFailureText}`,
      code: "elevenlabs_workspace_tools_sync_failed",
      workspaceResults,
      apiStatus: "waiting"
    }, 409);
  }

  const refreshedToolsPayload = await elevenLabsRequest({ apiKey: context.apiKey, path: "/tools" });
  const refreshedWorkspaceTools = workspaceToolList(refreshedToolsPayload);
  plan = buildSyncPlan(context.agentConfig, refreshedWorkspaceTools, assistantConfig, env);

  const agentPatch = buildAgentPatch(context.agentConfig, refreshedWorkspaceTools, plan.expectedNames, env);
  if (!agentPatch.ok) {
    return json({
      error: "Nástroje ve workspace jsou připravené, ale strukturu agenta nejde bezpečně upravit naslepo.",
      code: agentPatch.reason,
      workspaceResults,
      agentTools: {
        path: plan.agentToolPath,
        kind: plan.agentToolPathKind,
        writablePathFound: plan.agentToolPathWritable,
        missing: plan.missingAgentTools
      },
      apiStatus: "waiting"
    }, 409);
  }

  try {
    await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/agents/${encodeURIComponent(context.agentId)}`,
      method: "PATCH",
      body: agentPatch.requestBody
    });
  } catch (error) {
    return json({
      error: `ElevenLabs agent patch se nepodařilo bezpečně uložit. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "elevenlabs_agent_patch_failed",
      agentPatch: {
        applied: false,
        path: agentPatch.path,
        prunedToolIdsCount: agentPatch.prunedToolIdsCount || 0,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  let verifiedAgentConfig = null;
  try {
    verifiedAgentConfig = await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/agents/${encodeURIComponent(context.agentId)}`
    });
  } catch (error) {
    return json({
      error: `ElevenLabs agent byl upraven, ale následné ověření selhalo. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "elevenlabs_agent_verify_failed",
      agentPatch: {
        applied: true,
        path: agentPatch.path,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false
      },
      apiStatus: "waiting"
    }, 409);
  }
  const verifiedNames = toolNamesFromAgent(verifiedAgentConfig);
  const missingAfter = plan.expectedNames.filter((name) => !new Set(verifiedNames).has(name));

  return json({
    status: missingAfter.length ? "partial" : "ok",
    generatedAt: new Date().toISOString(),
    workspaceResults,
    agentPatch: {
      applied: true,
      path: agentPatch.path,
      prunedToolIdsCount: agentPatch.prunedToolIdsCount || 0,
      promptChanged: false,
      firstMessageChanged: false,
      modelChanged: false
    },
    verification: {
      configuredAgentToolNames: verifiedNames,
      missingTools: missingAfter
    }
  }, missingAfter.length ? 207 : 200);
}

export async function onRequestGet({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");

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

    const mode = cleanString(new URL(request.url).searchParams.get("mode"));
    return json(await planPayload(env, assistantConfig, mode));
  } catch (error) {
    console.error("elevenlabs.sarlota_tools_sync_plan_failed", {
      message: safeErrorMessage(error),
      status: error.status || 0
    });
    return json({
      error: "Návrh synchronizace Šarloty se teď nepodařilo připravit.",
      code: "sarlota_tools_sync_plan_failed",
      apiStatus: "waiting"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const payload = await readJson(request);
    const assistantConfig = resolveElevenLabsAssistantConfig(payload?.assistant || "sarlota", env);
    if (!assistantConfig) {
      return json({
        error: "Neznámý ElevenLabs assistant key.",
        code: "INVALID_ASSISTANT_KEY",
        apiStatus: "waiting"
      }, 400);
    }

    if (payload?.apply !== true) {
      return json({
        error: "Synchronizace vyžaduje potvrzení apply: true.",
        code: "sarlota_tools_sync_apply_required",
        apiStatus: "waiting"
      }, 409);
    }

    const mode = cleanString(payload?.mode);
    return await applyPayload(env, assistantConfig, mode, user);
  } catch (error) {
    console.error("elevenlabs.sarlota_tools_sync_apply_failed", {
      message: safeErrorMessage(error),
      status: error.status || 0
    });
    return json({
      error: "Synchronizace Šarloty se nepodařila. Zkus to prosím znovu po kontrole konfigurace.",
      code: "sarlota_tools_sync_apply_failed",
      apiStatus: "waiting"
    }, 500);
  }
}
