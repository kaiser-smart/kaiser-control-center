import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  assistantConfigFromRequest,
  assistantPublicMetadata,
  elevenLabsAgentNameMatchesExpected,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";
import {
  SARLOTA_LANGUAGE_KB_CONTENT,
  SARLOTA_LANGUAGE_KB_NAME,
  SARLOTA_LANGUAGE_PACKAGE_VERSION,
  SARLOTA_PRONUNCIATION_DICTIONARY_NAME,
  SARLOTA_PRONUNCIATION_LISTENING_TESTS,
  SARLOTA_PRONUNCIATION_RULES
} from "../../../../src/sarlota/sarlotaLanguagePackage.js";

const FIRST_MESSAGE_TEMPLATE = "{{intro_announcement}}";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const ELEVENLABS_REQUEST_TIMEOUT_MS = 15000;

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function fingerprint(value) {
  const text = String(value ?? "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function getPathValue(source, path) {
  return path.reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
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

function promptTextFromAgent(agentConfig) {
  const prompt = getPathValue(agentConfig, ["conversation_config", "agent", "prompt"]);
  if (!prompt || typeof prompt !== "object") return "";

  for (const key of ["prompt", "system_prompt", "systemPrompt", "text", "content"]) {
    if (typeof prompt[key] === "string" && cleanString(prompt[key])) return prompt[key];
  }

  return "";
}

function modelFromAgent(agentConfig) {
  return cleanString(
    getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "llm"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "model"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "llm"])
    || getPathValue(agentConfig, ["conversation_config", "agent", "model"])
  );
}

function toolsValueFromAgent(agentConfig) {
  for (const path of [
    ["conversation_config", "agent", "prompt", "tool_ids"],
    ["conversation_config", "agent", "prompt", "tools"],
    ["conversation_config", "agent", "tools"],
    ["conversation_config", "tools"]
  ]) {
    const value = getPathValue(agentConfig, path);
    if (Array.isArray(value)) return value;
  }

  return [];
}

function agentInvariants(agentConfig) {
  const prompt = promptTextFromAgent(agentConfig);
  const firstMessage = firstMessageFromAgent(agentConfig);
  const model = modelFromAgent(agentConfig);
  const tools = toolsValueFromAgent(agentConfig);

  return {
    promptFingerprint: fingerprint(prompt),
    promptLength: prompt.length,
    firstMessageFingerprint: fingerprint(firstMessage),
    firstMessageMatches: firstMessage === FIRST_MESSAGE_TEMPLATE,
    model,
    toolsFingerprint: fingerprint(canonicalJson(tools)),
    toolsCount: tools.length
  };
}

function knowledgeBaseEntriesFromAgent(agentConfig) {
  const value = getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "knowledge_base"]);
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function pronunciationLocatorsFromAgent(agentConfig) {
  const value = getPathValue(agentConfig, ["conversation_config", "tts", "pronunciation_dictionary_locators"]);
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function knowledgeBaseDocuments(payload) {
  const candidates = [
    payload?.documents,
    payload?.knowledge_base_documents,
    payload?.items,
    payload?.data
  ];
  return candidates.find(Array.isArray) || [];
}

function pronunciationDictionaries(payload) {
  const candidates = [
    payload?.pronunciation_dictionaries,
    payload?.dictionaries,
    payload?.items,
    payload?.data
  ];
  return candidates.find(Array.isArray) || [];
}

function resourceId(value) {
  return cleanString(value?.id || value?.document_id || value?.documentId || value?.pronunciation_dictionary_id);
}

function resourceName(value) {
  return cleanString(value?.name || value?.document_name || value?.documentName);
}

function resourceVersionId(value) {
  return cleanString(value?.version_id || value?.versionId || value?.latest_version_id || value?.latestVersionId);
}

function maskId(value) {
  const id = cleanString(value);
  if (!id) return "";
  if (id.length <= 8) return `${id.slice(0, 2)}…${id.slice(-2)}`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function knowledgeBaseContent(payload) {
  if (typeof payload === "string") return payload;
  for (const value of [payload?.content, payload?.text, payload?.document?.content, payload?.document?.text]) {
    if (typeof value === "string") return value;
  }
  return "";
}

function normalizeRule(rule) {
  const normalized = {
    string_to_replace: cleanString(rule?.string_to_replace || rule?.stringToReplace),
    type: cleanString(rule?.type || "alias").toLowerCase(),
    case_sensitive: rule?.case_sensitive !== false,
    word_boundaries: rule?.word_boundaries !== false
  };

  if (normalized.type === "phoneme") {
    normalized.phoneme = cleanString(rule?.phoneme);
    normalized.alphabet = cleanString(rule?.alphabet || "ipa").toLowerCase();
  } else {
    normalized.alias = cleanString(rule?.alias);
  }

  return normalized;
}

function canonicalRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map(normalizeRule)
    .filter((rule) => rule.string_to_replace && (rule.alias || rule.phoneme))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

function pronunciationRulesFromPayload(payload) {
  for (const value of [payload?.rules, payload?.pronunciation_rules, payload?.dictionary?.rules]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function matchingByExactName(items, expectedName) {
  return (Array.isArray(items) ? items : []).filter((item) => resourceName(item) === expectedName);
}

function knowledgeBaseEntryId(entry) {
  return cleanString(entry?.id || entry?.document_id || entry?.documentId);
}

function locatorDictionaryId(locator) {
  return cleanString(locator?.pronunciation_dictionary_id || locator?.pronunciationDictionaryId || locator?.id);
}

function managedKnowledgeBaseAttachment(document) {
  return {
    type: "text",
    name: SARLOTA_LANGUAGE_KB_NAME,
    id: resourceId(document),
    usage_mode: "auto"
  };
}

function managedPronunciationLocator(dictionary, versionId = "") {
  return {
    pronunciation_dictionary_id: resourceId(dictionary),
    version_id: cleanString(versionId || resourceVersionId(dictionary))
  };
}

function languageAgentPatch(agentConfig, document, dictionary, versionId = "") {
  const documentId = resourceId(document);
  const dictionaryId = resourceId(dictionary);
  const resolvedVersionId = cleanString(versionId || resourceVersionId(dictionary));
  if (!documentId || !dictionaryId || !resolvedVersionId) return null;

  const knowledgeBase = knowledgeBaseEntriesFromAgent(agentConfig)
    .filter((entry) => knowledgeBaseEntryId(entry) !== documentId && resourceName(entry) !== SARLOTA_LANGUAGE_KB_NAME);
  const locators = pronunciationLocatorsFromAgent(agentConfig)
    .filter((locator) => locatorDictionaryId(locator) !== dictionaryId);

  knowledgeBase.push(managedKnowledgeBaseAttachment(document));
  locators.push(managedPronunciationLocator(dictionary, resolvedVersionId));

  return {
    conversation_config: {
      agent: {
        prompt: { knowledge_base: knowledgeBase }
      },
      tts: { pronunciation_dictionary_locators: locators }
    }
  };
}

async function elevenLabsRequest({ apiKey, path, method = "GET", body = null }) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), ELEVENLABS_REQUEST_TIMEOUT_MS) : null;
  let response;

  try {
    response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
      method,
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : null,
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("elevenlabs_request_timeout");
      timeoutError.code = "ELEVENLABS_REQUEST_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function upstreamErrorSummary(error) {
  if (error?.code === "ELEVENLABS_REQUEST_TIMEOUT") return "ElevenLabs API neodpovědělo včas.";
  const detail = error?.payload?.detail;
  if (Array.isArray(detail)) {
    return detail.slice(0, 3).map((item) => cleanString(item?.msg || item?.message || item?.type)).filter(Boolean).join("; ");
  }
  return cleanString(error?.payload?.message || error?.payload?.error || error?.message || "upstream_error");
}

async function readLiveContext(env, assistantConfig) {
  const apiKey = cleanString(env?.ELEVENLABS_API_KEY);
  const agentId = cleanString(assistantConfig?.agentId);
  if (!apiKey || !agentId) {
    return {
      ok: false,
      status: "missing_configuration",
      apiKeyPresent: Boolean(apiKey),
      agentIdPresent: Boolean(agentId),
      assistant: assistantConfig ? assistantPublicMetadata(assistantConfig) : null
    };
  }

  const [agentConfig, knowledgePayload, dictionaryPayload] = await Promise.all([
    elevenLabsRequest({ apiKey, path: `/convai/agents/${encodeURIComponent(agentId)}` }),
    elevenLabsRequest({ apiKey, path: "/convai/knowledge-base?page_size=100" }),
    elevenLabsRequest({ apiKey, path: "/pronunciation-dictionaries?page_size=100" })
  ]);
  const matchingKnowledge = matchingByExactName(knowledgeBaseDocuments(knowledgePayload), SARLOTA_LANGUAGE_KB_NAME);
  const matchingDictionaries = matchingByExactName(pronunciationDictionaries(dictionaryPayload), SARLOTA_PRONUNCIATION_DICTIONARY_NAME);
  const knowledgeContent = matchingKnowledge.length === 1
    ? knowledgeBaseContent(await elevenLabsRequest({
      apiKey,
      path: `/convai/knowledge-base/${encodeURIComponent(resourceId(matchingKnowledge[0]))}/content`
    }))
    : "";
  const dictionaryDetail = matchingDictionaries.length === 1
    ? await elevenLabsRequest({
      apiKey,
      path: `/pronunciation-dictionaries/${encodeURIComponent(resourceId(matchingDictionaries[0]))}`
    })
    : {};

  return {
    ok: true,
    apiKey,
    agentId,
    assistantConfig,
    agentConfig,
    matchingKnowledge,
    matchingDictionaries,
    knowledgeContent,
    dictionaryDetail
  };
}

function buildPlan(context) {
  if (!context.ok) {
    return {
      mode: "dry_run",
      ready: false,
      status: context.status,
      assistant: context.assistant || null,
      message: "Chybí serverová ElevenLabs konfigurace."
    };
  }

  const invariants = agentInvariants(context.agentConfig);
  const agentNameMatches = elevenLabsAgentNameMatchesExpected(context.agentConfig?.name, context.assistantConfig);
  const exactKnowledgeCount = context.matchingKnowledge.length;
  const exactDictionaryCount = context.matchingDictionaries.length;
  const knowledge = context.matchingKnowledge[0] || null;
  const dictionary = context.matchingDictionaries[0] || null;
  const currentRules = canonicalRules(pronunciationRulesFromPayload(context.dictionaryDetail));
  const targetRules = canonicalRules(SARLOTA_PRONUNCIATION_RULES);
  const targetKnowledgeFingerprint = fingerprint(SARLOTA_LANGUAGE_KB_CONTENT);
  const currentKnowledgeFingerprint = fingerprint(context.knowledgeContent);
  const targetRulesFingerprint = fingerprint(canonicalJson(targetRules));
  const currentRulesFingerprint = fingerprint(canonicalJson(currentRules));
  const attachedKnowledge = knowledge
    ? knowledgeBaseEntriesFromAgent(context.agentConfig).some((entry) => knowledgeBaseEntryId(entry) === resourceId(knowledge))
    : false;
  const attachedDictionary = dictionary
    ? pronunciationLocatorsFromAgent(context.agentConfig).some((locator) => locatorDictionaryId(locator) === resourceId(dictionary))
    : false;
  const duplicateResources = exactKnowledgeCount > 1 || exactDictionaryCount > 1;
  const knowledgeCurrent = exactKnowledgeCount === 1 && currentKnowledgeFingerprint === targetKnowledgeFingerprint;
  const dictionaryCurrent = exactDictionaryCount === 1 && currentRulesFingerprint === targetRulesFingerprint;
  const alreadyApplied = knowledgeCurrent && dictionaryCurrent && attachedKnowledge && attachedDictionary;
  const currentFingerprint = fingerprint(canonicalJson({
    invariants,
    matchingKnowledge: context.matchingKnowledge.map((item) => ({ id: resourceId(item), name: resourceName(item) })),
    matchingDictionaries: context.matchingDictionaries.map((item) => ({ id: resourceId(item), name: resourceName(item), versionId: resourceVersionId(item) })),
    currentKnowledgeFingerprint,
    currentRulesFingerprint,
    attachedKnowledge,
    attachedDictionary
  }));

  return {
    mode: "dry_run",
    ready: agentNameMatches && invariants.firstMessageMatches && !duplicateResources && !alreadyApplied,
    alreadyApplied,
    generatedAt: new Date().toISOString(),
    assistant: assistantPublicMetadata(context.assistantConfig),
    packageVersion: SARLOTA_LANGUAGE_PACKAGE_VERSION,
    currentFingerprint,
    agent: {
      nameMatches: agentNameMatches,
      firstMessageMatches: invariants.firstMessageMatches,
      promptLength: invariants.promptLength,
      promptFingerprint: invariants.promptFingerprint,
      model: invariants.model,
      toolsCount: invariants.toolsCount,
      toolsFingerprint: invariants.toolsFingerprint
    },
    knowledgeBase: {
      name: SARLOTA_LANGUAGE_KB_NAME,
      exactMatchCount: exactKnowledgeCount,
      exists: exactKnowledgeCount === 1,
      idMasked: maskId(resourceId(knowledge)),
      attached: attachedKnowledge,
      current: knowledgeCurrent,
      currentLength: context.knowledgeContent.length,
      targetLength: SARLOTA_LANGUAGE_KB_CONTENT.length,
      currentFingerprint: currentKnowledgeFingerprint,
      targetFingerprint: targetKnowledgeFingerprint,
      action: exactKnowledgeCount === 0 ? "create" : knowledgeCurrent ? (attachedKnowledge ? "none" : "attach") : "update"
    },
    pronunciationDictionary: {
      name: SARLOTA_PRONUNCIATION_DICTIONARY_NAME,
      exactMatchCount: exactDictionaryCount,
      exists: exactDictionaryCount === 1,
      idMasked: maskId(resourceId(dictionary)),
      attached: attachedDictionary,
      current: dictionaryCurrent,
      currentRuleCount: currentRules.length,
      targetRuleCount: targetRules.length,
      currentFingerprint: currentRulesFingerprint,
      targetFingerprint: targetRulesFingerprint,
      action: exactDictionaryCount === 0 ? "create" : dictionaryCurrent ? (attachedDictionary ? "none" : "attach") : "replace_rules",
      listeningTests: SARLOTA_PRONUNCIATION_LISTENING_TESTS
    },
    safety: {
      duplicateResources,
      returnsKnowledgeContent: false,
      returnsApiKey: false,
      requiresPostApplyTrue: true,
      requiresCurrentFingerprint: true,
      preservesPrompt: true,
      preservesFirstMessage: true,
      preservesModel: true,
      preservesTools: true,
      preservesUnrelatedKnowledgeBaseEntries: true,
      preservesUnrelatedPronunciationDictionaries: true
    }
  };
}

async function upsertKnowledgeBase(context, plan) {
  if (plan.knowledgeBase.exists) {
    const document = context.matchingKnowledge[0];
    if (!plan.knowledgeBase.current) {
      await elevenLabsRequest({
        apiKey: context.apiKey,
        path: `/convai/knowledge-base/${encodeURIComponent(resourceId(document))}`,
        method: "PATCH",
        body: { name: SARLOTA_LANGUAGE_KB_NAME, content: SARLOTA_LANGUAGE_KB_CONTENT }
      });
    }
    return { resource: document, action: plan.knowledgeBase.current ? "none" : "updated" };
  }

  const created = await elevenLabsRequest({
    apiKey: context.apiKey,
    path: "/convai/knowledge-base/text",
    method: "POST",
    body: { name: SARLOTA_LANGUAGE_KB_NAME, text: SARLOTA_LANGUAGE_KB_CONTENT }
  });
  return { resource: { ...created, name: SARLOTA_LANGUAGE_KB_NAME }, action: "created" };
}

async function upsertPronunciationDictionary(context, plan) {
  if (plan.pronunciationDictionary.exists) {
    const dictionary = context.matchingDictionaries[0];
    if (!plan.pronunciationDictionary.current) {
      const updated = await elevenLabsRequest({
        apiKey: context.apiKey,
        path: `/pronunciation-dictionaries/${encodeURIComponent(resourceId(dictionary))}/set-rules`,
        method: "POST",
        body: { rules: SARLOTA_PRONUNCIATION_RULES }
      });
      return {
        resource: { ...dictionary, ...updated },
        versionId: resourceVersionId(updated) || resourceVersionId(dictionary),
        action: "rules_replaced"
      };
    }
    return { resource: dictionary, versionId: resourceVersionId(dictionary) || resourceVersionId(context.dictionaryDetail), action: "none" };
  }

  const created = await elevenLabsRequest({
    apiKey: context.apiKey,
    path: "/pronunciation-dictionaries/add-from-rules",
    method: "POST",
    body: { name: SARLOTA_PRONUNCIATION_DICTIONARY_NAME, rules: SARLOTA_PRONUNCIATION_RULES }
  });
  return { resource: created, versionId: resourceVersionId(created), action: "created" };
}

async function applyPayload(env, assistantConfig, user, expectedCurrentFingerprint) {
  if (assistantConfig?.assistantKey !== "sarlota" || !assistantConfig?.isProduction) {
    return json({
      error: "Jazykový balík je povolený jen pro ostrou Šarlotu.",
      code: "SARLOTA_LANGUAGE_SYNC_NOT_ALLOWED",
      apiStatus: "waiting"
    }, 409);
  }

  const context = await readLiveContext(env, assistantConfig);
  const plan = buildPlan(context);
  if (plan.alreadyApplied) {
    return json({ status: "ok", alreadyApplied: true, plan });
  }
  if (!plan.ready) {
    return json({
      error: plan.safety?.duplicateResources
        ? "V ElevenLabs je více stejně pojmenovaných jazykových zdrojů. Automatický zápis zastavuji."
        : "Jazykový balík nejde bezpečně synchronizovat.",
      code: "sarlota_language_sync_safety_check_failed",
      plan,
      apiStatus: "waiting"
    }, 409);
  }
  if (!cleanString(expectedCurrentFingerprint) || expectedCurrentFingerprint !== plan.currentFingerprint) {
    return json({
      error: "Živá jazyková konfigurace se od náhledu změnila. Načti nový read-only náhled.",
      code: "sarlota_language_sync_fingerprint_mismatch",
      plan,
      apiStatus: "waiting"
    }, 409);
  }

  console.info("elevenlabs.sarlota_language_sync", {
    assistantKey: assistantConfig.assistantKey,
    agentIdMasked: assistantPublicMetadata(assistantConfig).assistantAgentIdMasked,
    userId: cleanString(user?.id),
    timestamp: new Date().toISOString(),
    packageVersion: SARLOTA_LANGUAGE_PACKAGE_VERSION,
    apply: true
  });

  const before = agentInvariants(context.agentConfig);
  let knowledgeResult;
  let dictionaryResult;
  try {
    knowledgeResult = await upsertKnowledgeBase(context, plan);
    dictionaryResult = await upsertPronunciationDictionary(context, plan);
  } catch (error) {
    return json({
      error: `Jazykové zdroje se nepodařilo bezpečně připravit. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "sarlota_language_resources_upsert_failed",
      partial: {
        knowledgeBaseAction: knowledgeResult?.action || "not_completed",
        pronunciationDictionaryAction: dictionaryResult?.action || "not_completed",
        agentPatched: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  const patchBody = languageAgentPatch(
    context.agentConfig,
    knowledgeResult.resource,
    dictionaryResult.resource,
    dictionaryResult.versionId
  );
  if (!patchBody) {
    return json({
      error: "Jazykové zdroje vznikly, ale chybí jejich bezpečný identifikátor nebo verze. Agent se nezměnil.",
      code: "sarlota_language_attachment_identifiers_missing",
      partial: {
        knowledgeBaseAction: knowledgeResult.action,
        pronunciationDictionaryAction: dictionaryResult.action,
        agentPatched: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  try {
    await elevenLabsRequest({
      apiKey: context.apiKey,
      path: `/convai/agents/${encodeURIComponent(context.agentId)}`,
      method: "PATCH",
      body: patchBody
    });
  } catch (error) {
    return json({
      error: `Jazykové zdroje jsou připravené, ale připojení k agentovi selhalo. ${error.status ? `HTTP ${error.status}. ` : ""}${upstreamErrorSummary(error)}`,
      code: "sarlota_language_agent_patch_failed",
      partial: {
        knowledgeBaseAction: knowledgeResult.action,
        pronunciationDictionaryAction: dictionaryResult.action,
        agentPatched: false
      },
      apiStatus: "waiting"
    }, 409);
  }

  const verifiedContext = await readLiveContext(env, assistantConfig);
  const verifiedPlan = buildPlan(verifiedContext);
  const after = agentInvariants(verifiedContext.agentConfig);
  const invariantsPreserved = before.promptFingerprint === after.promptFingerprint
    && before.firstMessageFingerprint === after.firstMessageFingerprint
    && before.model === after.model
    && before.toolsFingerprint === after.toolsFingerprint;
  const verified = verifiedPlan.alreadyApplied && invariantsPreserved;

  return json({
    status: verified ? "ok" : "partial",
    generatedAt: new Date().toISOString(),
    packageVersion: SARLOTA_LANGUAGE_PACKAGE_VERSION,
    resources: {
      knowledgeBase: { name: SARLOTA_LANGUAGE_KB_NAME, action: knowledgeResult.action, attached: verifiedPlan.knowledgeBase?.attached === true },
      pronunciationDictionary: {
        name: SARLOTA_PRONUNCIATION_DICTIONARY_NAME,
        action: dictionaryResult.action,
        ruleCount: SARLOTA_PRONUNCIATION_RULES.length,
        attached: verifiedPlan.pronunciationDictionary?.attached === true
      }
    },
    verification: {
      knowledgeBaseCurrent: verifiedPlan.knowledgeBase?.current === true,
      pronunciationDictionaryCurrent: verifiedPlan.pronunciationDictionary?.current === true,
      promptChanged: before.promptFingerprint !== after.promptFingerprint,
      firstMessageChanged: before.firstMessageFingerprint !== after.firstMessageFingerprint,
      modelChanged: before.model !== after.model,
      toolsChanged: before.toolsFingerprint !== after.toolsFingerprint,
      listeningTestRequired: true,
      listeningTests: SARLOTA_PRONUNCIATION_LISTENING_TESTS
    }
  }, verified ? 200 : 207);
}

export async function onRequestGet({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");
    if (response) return response;

    const assistantConfig = assistantConfigFromRequest(request, env);
    if (!assistantConfig) {
      return json({ error: "Neznámý ElevenLabs assistant key.", code: "INVALID_ASSISTANT_KEY", apiStatus: "waiting" }, 400);
    }
    if (assistantConfig.assistantKey !== "sarlota" || !assistantConfig.isProduction) {
      return json({
        mode: "dry_run",
        ready: false,
        status: "language_sync_not_allowed",
        assistant: assistantPublicMetadata(assistantConfig),
        message: "Jazykový balík je povolený jen pro ostrou Šarlotu."
      });
    }

    return json(buildPlan(await readLiveContext(env, assistantConfig)));
  } catch (error) {
    console.error("elevenlabs.sarlota_language_sync_plan_failed", { message: safeErrorMessage(error), status: error.status || 0 });
    return json({
      error: "Náhled jazykového balíku Šarloty se teď nepodařilo připravit.",
      code: "sarlota_language_sync_plan_failed",
      apiStatus: "waiting"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");
    if (response) return response;

    const payload = await readJson(request);
    const assistantConfig = resolveElevenLabsAssistantConfig(payload?.assistant || "sarlota", env);
    if (!assistantConfig) {
      return json({ error: "Neznámý ElevenLabs assistant key.", code: "INVALID_ASSISTANT_KEY", apiStatus: "waiting" }, 400);
    }
    if (payload?.apply !== true) {
      return json({
        error: "Synchronizace jazykového balíku vyžaduje potvrzení apply: true.",
        code: "sarlota_language_sync_apply_required",
        apiStatus: "waiting"
      }, 409);
    }

    return await applyPayload(env, assistantConfig, user, payload?.expectedCurrentFingerprint);
  } catch (error) {
    console.error("elevenlabs.sarlota_language_sync_failed", { message: safeErrorMessage(error), status: error.status || 0 });
    return json({
      error: "Synchronizace jazykového balíku Šarloty se teď nepodařila.",
      code: "sarlota_language_sync_failed",
      apiStatus: "waiting"
    }, 500);
  }
}

export const __test = {
  agentInvariants,
  buildPlan,
  canonicalJson,
  canonicalRules,
  fingerprint,
  knowledgeBaseDocuments,
  knowledgeBaseEntriesFromAgent,
  languageAgentPatch,
  pronunciationDictionaries,
  pronunciationLocatorsFromAgent,
  pronunciationRulesFromPayload
};
