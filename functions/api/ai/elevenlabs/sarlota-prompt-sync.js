import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../../../../src/sarlota/sarlotaSystemPrompt.js";

const SARLOTA_AGENT_NAME = "Šarlota – Smart odpady";
const SARLOTA_AGENT_NAME_ALIASES = [
  SARLOTA_AGENT_NAME,
  "Chytré odpadky – Šarlota"
];
const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";
const PROMPT_RULE_MARKER = "HLÁŠENÍ ŘIDIČŮ / VOZIDLA";
const PROMPT_RULE_BLOCK = [
  "",
  PROMPT_RULE_MARKER,
  SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
  ""
].join("\n");
const PROMPT_PATHS = [
  ["conversation_config", "agent", "prompt", "prompt"],
  ["conversation_config", "agent", "prompt", "system_prompt"],
  ["conversation_config", "agent", "prompt", "systemPrompt"],
  ["conversation_config", "agent", "prompt", "text"],
  ["conversation_config", "agent", "prompt", "content"]
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function agentIdFor(env) {
  return ["ELEVENLABS_AGENT_ID_SARLOTA", "VITE_ELEVENLABS_AGENT_ID_SARLOTA"]
    .map((key) => cleanString(env?.[key]))
    .find(Boolean) || "";
}

function getPathValue(source, path) {
  return path.reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value[key];
  }, source);
}

function firstMessageFromAgent(agentConfig) {
  return cleanString(
    getPathValue(agentConfig, ["conversation_config", "agent", "first_message"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "firstMessage"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "first_message"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "firstMessage"])
  );
}

function promptPathFromAgent(agentConfig) {
  for (const path of PROMPT_PATHS) {
    const value = getPathValue(agentConfig, path);
    if (typeof value === "string" && cleanString(value)) {
      return {
        path,
        pathText: path.join("."),
        value
      };
    }
  }

  return null;
}

function promptHasRule(promptText) {
  return cleanString(promptText).includes(PROMPT_RULE_MARKER)
    || cleanString(promptText).includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE);
}

function bodyForPromptPatch(path, nextPrompt) {
  const promptKey = path.at(-1);
  if (!promptKey) {
    return null;
  }

  return {
    conversation_config: {
      agent: {
        prompt: {
          [promptKey]: nextPrompt
        }
      }
    }
  };
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
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function readLiveContext(env) {
  const apiKey = cleanString(env?.ELEVENLABS_API_KEY);
  const agentId = agentIdFor(env);

  if (!apiKey || !agentId) {
    return {
      ok: false,
      status: "missing_configuration",
      apiKeyPresent: Boolean(apiKey),
      agentIdPresent: Boolean(agentId)
    };
  }

  const agentConfig = await elevenLabsRequest({
    apiKey,
    path: `/agents/${encodeURIComponent(agentId)}`
  });

  return {
    ok: true,
    apiKey,
    agentId,
    agentConfig
  };
}

function buildPlan(context) {
  if (!context.ok) {
    return {
      mode: "dry_run",
      ready: false,
      status: context.status,
      apiKeyPresent: context.apiKeyPresent,
      agentIdPresent: context.agentIdPresent,
      message: "Chybí serverová ElevenLabs konfigurace."
    };
  }

  const promptPath = promptPathFromAgent(context.agentConfig);
  const firstMessage = firstMessageFromAgent(context.agentConfig);
  const agentNameMatches = SARLOTA_AGENT_NAME_ALIASES.includes(cleanString(context.agentConfig?.name));
  const firstMessageMatches = firstMessage === FIRST_MESSAGE_TEMPLATE;
  const hasRule = promptPath ? promptHasRule(promptPath.value) : false;

  return {
    mode: "dry_run",
    ready: agentNameMatches && firstMessageMatches && Boolean(promptPath) && !hasRule,
    alreadyApplied: hasRule,
    generatedAt: new Date().toISOString(),
    agent: {
      expectedName: SARLOTA_AGENT_NAME,
      nameMatches: agentNameMatches,
      firstMessage: FIRST_MESSAGE_TEMPLATE,
      firstMessageMatches
    },
    prompt: {
      path: promptPath?.pathText || "",
      currentLength: promptPath?.value?.length || 0,
      willAppendDriverReportVehicleRule: !hasRule
    },
    safety: {
      returnsPromptText: false,
      requiresPostApplyTrue: true,
      willNotPatchFirstMessage: true,
      willNotPatchModel: true,
      willNotPatchTools: true
    }
  };
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

async function applyPayload(env) {
  const context = await readLiveContext(env);
  if (!context.ok) {
    return json({
      error: "ElevenLabs konfigurace není dostupná.",
      code: context.status,
      apiStatus: "waiting"
    }, 409);
  }

  const plan = buildPlan(context);
  if (plan.alreadyApplied) {
    return json({
      status: "ok",
      alreadyApplied: true,
      generatedAt: new Date().toISOString(),
      prompt: plan.prompt,
      agentPatch: {
        applied: false,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false,
        toolsChanged: false
      }
    });
  }

  if (!plan.ready) {
    return json({
      error: "ElevenLabs prompt nejde bezpečně upravit. Zkontrolujte agenta, first message a cestu promptu.",
      code: "sarlota_prompt_sync_safety_check_failed",
      plan,
      apiStatus: "waiting"
    }, 409);
  }

  const promptPath = promptPathFromAgent(context.agentConfig);
  const nextPrompt = `${promptPath.value.trimEnd()}${PROMPT_RULE_BLOCK}`;
  const patchBody = bodyForPromptPatch(promptPath.path, nextPrompt);

  try {
    await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/agents/${encodeURIComponent(context.agentId)}`,
      method: "PATCH",
      body: patchBody
    });
  } catch (error) {
    return json({
      error: `ElevenLabs prompt patch se nepodařilo bezpečně uložit. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "elevenlabs_prompt_patch_failed",
      agentPatch: {
        applied: false,
        path: promptPath.pathText,
        promptChanged: false,
        firstMessageChanged: false,
        modelChanged: false,
        toolsChanged: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  const verifiedAgentConfig = await elevenLabsRequest({
    apiKey: context.apiKey,
    path: `/agents/${encodeURIComponent(context.agentId)}`
  });
  const verifiedPrompt = promptPathFromAgent(verifiedAgentConfig);
  const verified = verifiedPrompt ? promptHasRule(verifiedPrompt.value) : false;

  return json({
    status: verified ? "ok" : "partial",
    generatedAt: new Date().toISOString(),
    prompt: {
      path: promptPath.pathText,
      rulePresent: verified,
      currentLength: verifiedPrompt?.value?.length || 0
    },
    agentPatch: {
      applied: true,
      path: promptPath.pathText,
      promptChanged: true,
      firstMessageChanged: false,
      modelChanged: false,
      toolsChanged: false
    }
  }, verified ? 200 : 207);
}

export async function onRequestGet({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    return json(buildPlan(await readLiveContext(env)));
  } catch (error) {
    console.error("elevenlabs.sarlota_prompt_sync_plan_failed", {
      message: safeErrorMessage(error),
      status: error.status || 0
    });
    return json({
      error: "Návrh synchronizace promptu Šarloty se teď nepodařilo připravit.",
      code: "sarlota_prompt_sync_plan_failed",
      apiStatus: "waiting"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");

    if (response) {
      return response;
    }

    const payload = await readJson(request);
    if (payload?.apply !== true) {
      return json({
        error: "Synchronizace promptu vyžaduje potvrzení apply: true.",
        code: "sarlota_prompt_sync_apply_required",
        apiStatus: "waiting"
      }, 409);
    }

    return await applyPayload(env);
  } catch (error) {
    console.error("elevenlabs.sarlota_prompt_sync_failed", {
      message: safeErrorMessage(error),
      status: error.status || 0
    });
    return json({
      error: "Synchronizace promptu Šarloty se teď nepodařila.",
      code: "sarlota_prompt_sync_failed",
      apiStatus: "waiting"
    }, 500);
  }
}
