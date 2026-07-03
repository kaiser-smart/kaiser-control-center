import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../../../../src/sarlota/sarlotaSystemPrompt.js";
import {
  assistantConfigFromRequest,
  elevenLabsAgentNameMatchesExpected,
  assistantPublicMetadata,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";

const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/convai";
const PROMPT_RULE_MARKER = "HLÁŠENÍ ŘIDIČŮ / SERVIS VOZIDEL";
const LEGACY_PROMPT_RULE_MARKERS = [
  "HLÁŠENÍ ŘIDIČŮ / VOZIDLA / OVĚŘENÁ VOZIDLA ONLY",
  "HLÁŠENÍ ŘIDIČŮ / VOZIDLA"
];
const PROMPT_RULE_REQUIRED_PHRASE = "Konkrétní vozidla smíš v hlasu říct pouze tehdy";
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
const DEFAULT_PROMPT_PATH = ["conversation_config", "agent", "prompt", "prompt"];

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
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

function writablePromptPathFromAgent(agentConfig) {
  return promptPathFromAgent(agentConfig) || {
    path: DEFAULT_PROMPT_PATH,
    pathText: DEFAULT_PROMPT_PATH.join("."),
    value: ""
  };
}

function promptHasCurrentRule(promptText) {
  return cleanString(promptText).includes(PROMPT_RULE_MARKER)
    && cleanString(promptText).includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE)
    && cleanString(promptText).includes(PROMPT_RULE_REQUIRED_PHRASE);
}

function forbiddenPromptPhrases(promptText) {
  const text = cleanString(promptText).toLowerCase();
  return FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

function promptHasLegacyUnsafeDriverReportExample(promptText) {
  return forbiddenPromptPhrases(promptText).some((phrase) => [
    "auto " + "3 brzdí divně",
    "Zapíšu bezpečnostní závadu k vozidlu " + "3",
    "Hotovo, závada je " + "zapsaná"
  ].includes(phrase));
}

function promptHasLegacyRule(promptText) {
  const text = cleanString(promptText);
  return LEGACY_PROMPT_RULE_MARKERS.some((marker) => text.includes(marker)) &&
    forbiddenPromptPhrases(text).length > 0;
}

function lineHasForbiddenPromptPhrase(line) {
  const text = cleanString(line).toLowerCase();
  return FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES.some((phrase) => text.includes(phrase.toLowerCase()));
}

function stripLegacyDriverReportExamples(promptText) {
  const pattern = new RegExp([
    String.raw`(?:\n\s*)?Uživatel:\s*[„"]Zapiš závadu,\s*auto\s*3\s*brzdí divně\.[“”"]`,
    String.raw`\s*Odpověď:\s*[„"]Rozumím\.\s*Zapíšu bezpečnostní závadu k vozidlu\s*3\.\s*Chceš doplnit ještě krátkou poznámku\?[“”"]`,
    String.raw`\s*Uživatel:\s*[„"]Ne\.[“”"]`,
    String.raw`\s*Odpověď:\s*[„"]Hotovo,\s*závada je zapsaná\.[“”"]`
  ].join(""), "giu");

  return String(promptText ?? "").replace(pattern, "\n").trimEnd();
}

function stripDriverReportPromptBlocks(promptText) {
  const lines = String(promptText ?? "").split(/\r?\n/);
  const output = [];
  let skipLegacyRuleLine = false;

  for (const line of lines) {
    const trimmed = cleanString(line);
    if (LEGACY_PROMPT_RULE_MARKERS.includes(trimmed)) {
      skipLegacyRuleLine = true;
      continue;
    }

    if (skipLegacyRuleLine) {
      skipLegacyRuleLine = false;
      continue;
    }

    if (lineHasForbiddenPromptPhrase(line)) {
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
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

  const agentConfig = await elevenLabsRequest({
    apiKey,
    path: `/agents/${encodeURIComponent(agentId)}`
  });

  return {
    ok: true,
    apiKey,
    agentId,
    agentConfig,
    assistantConfig
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
      assistant: context.assistant || null,
      message: "Chybí serverová ElevenLabs konfigurace."
    };
  }

  const promptPath = writablePromptPathFromAgent(context.agentConfig);
  const firstMessage = firstMessageFromAgent(context.agentConfig);
  const agentNameMatches = elevenLabsAgentNameMatchesExpected(context.agentConfig?.name, context.assistantConfig);
  const firstMessageMatches = firstMessage === FIRST_MESSAGE_TEMPLATE;
  const hasCurrentRule = promptHasCurrentRule(promptPath.value);
  const hasLegacyRule = promptHasLegacyRule(promptPath.value);
  const hasLegacyUnsafeExample = promptHasLegacyUnsafeDriverReportExample(promptPath.value);
  const forbiddenPhrases = forbiddenPromptPhrases(promptPath.value);
  const hasForbiddenPhrases = forbiddenPhrases.length > 0;
  const promptNeedsPatch = !hasCurrentRule || hasLegacyRule || hasLegacyUnsafeExample || hasForbiddenPhrases;

  return {
    mode: "dry_run",
    ready: agentNameMatches && firstMessageMatches && promptNeedsPatch,
    alreadyApplied: hasCurrentRule && !hasLegacyRule && !hasLegacyUnsafeExample && !hasForbiddenPhrases,
    generatedAt: new Date().toISOString(),
    assistant: assistantPublicMetadata(context.assistantConfig),
    agent: {
      expectedName: context.assistantConfig?.displayName || "",
      nameMatches: agentNameMatches,
      firstMessage: FIRST_MESSAGE_TEMPLATE,
      firstMessageMatches
    },
    prompt: {
      path: promptPath.pathText,
      currentLength: promptPath.value.length,
      currentRulePresent: hasCurrentRule,
      legacyRulePresent: hasLegacyRule,
      forbiddenPhrasesPresent: forbiddenPhrases,
      willAppendDriverReportVehicleRule: promptNeedsPatch,
      willRemoveLegacyDriverReportVehicleRule: hasLegacyRule,
      willRemoveLegacyUnsafeExample: hasLegacyUnsafeExample,
      willRemoveForbiddenDriverReportPhrases: hasForbiddenPhrases
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

async function applyPayload(env, assistantConfig, user = null) {
  if (!assistantConfig?.promptSyncAllowed) {
    return json({
      error: "Prompt Šarloty pro tohoto asistenta není povolený.",
      code: "PROMPT_SYNC_NOT_ALLOWED",
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
  console.info("elevenlabs.sarlota_prompt_sync", {
    assistantKey: assistantConfig.assistantKey,
    agentIdMasked: assistantPublicMetadata(assistantConfig).assistantAgentIdMasked,
    userId: cleanString(user?.id),
    timestamp: new Date().toISOString(),
    action: "prompt-sync",
    apply: true
  });

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

  const promptPath = writablePromptPathFromAgent(context.agentConfig);
  const cleanedPrompt = stripLegacyDriverReportExamples(stripDriverReportPromptBlocks(promptPath.value));
  const nextPrompt = `${cleanedPrompt}${PROMPT_RULE_BLOCK}`;
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
  const verified = verifiedPrompt
    ? promptHasCurrentRule(verifiedPrompt.value) && forbiddenPromptPhrases(verifiedPrompt.value).length === 0
    : false;

  return json({
    status: verified ? "ok" : "partial",
    generatedAt: new Date().toISOString(),
    prompt: {
      path: promptPath.pathText,
      rulePresent: verified,
      forbiddenPhrasesPresent: verifiedPrompt ? forbiddenPromptPhrases(verifiedPrompt.value) : [],
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

    const assistantConfig = assistantConfigFromRequest(request, env);
    if (!assistantConfig) {
      return json({
        error: "Neznámý ElevenLabs assistant key.",
        code: "INVALID_ASSISTANT_KEY",
        apiStatus: "waiting"
      }, 400);
    }

    if (!assistantConfig.promptSyncAllowed) {
      return json({
        mode: "dry_run",
        ready: false,
        status: "prompt_sync_not_allowed",
        assistant: assistantPublicMetadata(assistantConfig),
        message: "Prompt Šarloty pro tohoto asistenta není povolený."
      });
    }

    return json(buildPlan(await readLiveContext(env, assistantConfig)));
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
        error: "Synchronizace promptu vyžaduje potvrzení apply: true.",
        code: "sarlota_prompt_sync_apply_required",
        apiStatus: "waiting"
      }, 409);
    }

    return await applyPayload(env, assistantConfig, user);
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

export const __test = {
  PROMPT_RULE_MARKER,
  LEGACY_PROMPT_RULE_MARKERS,
  PROMPT_RULE_REQUIRED_PHRASE,
  forbiddenPromptPhrases,
  lineHasForbiddenPromptPhrase,
  buildPlan,
  promptHasCurrentRule,
  promptHasLegacyRule,
  stripDriverReportPromptBlocks
};
