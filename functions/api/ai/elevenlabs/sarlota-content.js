import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  contentDocumentId,
  createSarlotaContentVersion,
  getSarlotaContentDocument,
  getSarlotaContentVersion,
  listSarlotaContentVersions,
  recordSarlotaContentAudit,
  saveSarlotaContentDraft
} from "../../../_lib/sarlota-content-store.js";
import {
  assistantConfigFromRequest,
  assistantPublicMetadata,
  resolveElevenLabsAssistantConfig
} from "../../../../src/elevenLabsAssistants.js";
import {
  driverReportPromptForbiddenPhrases,
  driverReportPromptSafetyAnalysis
} from "../../../../src/sarlota/sarlotaPromptSafety.js";
import {
  SARLOTA_LANGUAGE_KB_NAME,
  sarlotaLanguagePackageIntegrity
} from "../../../../src/sarlota/sarlotaLanguagePackage.js";

const API_BASE = "https://api.elevenlabs.io/v1";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 120000;
const CONTENT_KINDS = new Set(["prompt", "knowledge_base"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[{}:_`*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getPathValue(source, path) {
  return path.reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, source);
}

const PROMPT_PATHS = [
  ["conversation_config", "agent", "prompt", "prompt"],
  ["conversation_config", "agent", "prompt", "system_prompt"],
  ["conversation_config", "agent", "prompt", "systemPrompt"],
  ["conversation_config", "agent", "prompt", "text"],
  ["conversation_config", "agent", "prompt", "content"]
];

function promptPathFromAgent(agentConfig) {
  for (const path of PROMPT_PATHS) {
    const value = getPathValue(agentConfig, path);
    if (typeof value === "string") return { path, value };
  }
  return { path: PROMPT_PATHS[0], value: "" };
}

function nestedPatch(path, value) {
  return path.reduceRight((child, key) => ({ [key]: child }), value);
}

function knowledgeEntries(agentConfig) {
  const value = getPathValue(agentConfig, ["conversation_config", "agent", "prompt", "knowledge_base"]);
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function resourceId(value) {
  return clean(value?.id || value?.document_id || value?.documentId);
}

function resourceName(value) {
  return clean(value?.name || value?.document_name || value?.documentName);
}

function knowledgeDocuments(payload) {
  return [payload?.documents, payload?.knowledge_base_documents, payload?.items, payload?.data].find(Array.isArray) || [];
}

function knowledgeContent(payload) {
  if (typeof payload === "string") return payload;
  return [payload?.content, payload?.text, payload?.document?.content, payload?.document?.text]
    .find((value) => typeof value === "string") || "";
}

function selectKnowledgeDocument(agentConfig, knowledgePayload) {
  const available = knowledgeDocuments(knowledgePayload);
  const availableById = new Map(available.map((item) => [resourceId(item), item]).filter(([id]) => id));
  const attached = knowledgeEntries(agentConfig)
    .filter((item) => resourceId(item))
    .map((item) => availableById.get(resourceId(item)) || item);

  const managedAttached = attached.filter((item) => resourceName(item) === SARLOTA_LANGUAGE_KB_NAME);
  if (managedAttached.length === 1) return managedAttached[0];
  if (managedAttached.length > 1) {
    const error = new Error("duplicate_managed_knowledge_base");
    error.status = 409;
    throw error;
  }

  if (attached.length === 1) return attached[0];
  if (attached.length > 1) {
    const likelySarlotaKb = attached.filter((item) => {
      const name = normalize(resourceName(item));
      return name.includes("sarlota") && (name.includes("kb") || name.includes("knowledge"));
    });
    if (likelySarlotaKb.length === 1) return likelySarlotaKb[0];
    const error = new Error("ambiguous_attached_knowledge_base");
    error.status = 409;
    throw error;
  }

  const managedAvailable = available.filter((item) => resourceName(item) === SARLOTA_LANGUAGE_KB_NAME);
  if (managedAvailable.length === 1) return managedAvailable[0];
  if (managedAvailable.length > 1) {
    const error = new Error("duplicate_managed_knowledge_base");
    error.status = 409;
    throw error;
  }
  return null;
}

async function elevenLabsRequest(apiKey, path, { method = "GET", body = null } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : null,
      ...(controller ? { signal: controller.signal } : {})
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = text; }
  if (!response.ok) {
    const error = new Error("elevenlabs_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function readLiveContent(env, assistantConfig) {
  const apiKey = clean(env?.ELEVENLABS_API_KEY);
  const agentId = clean(assistantConfig?.agentId);
  if (!apiKey || !agentId) throw new Error("elevenlabs_configuration_missing");
  const [agentConfig, knowledgePayload] = await Promise.all([
    elevenLabsRequest(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`),
    elevenLabsRequest(apiKey, "/convai/knowledge-base?page_size=100")
  ]);
  const prompt = promptPathFromAgent(agentConfig);
  const knowledge = selectKnowledgeDocument(agentConfig, knowledgePayload);
  const kbContent = knowledge
    ? knowledgeContent(await elevenLabsRequest(apiKey, `/convai/knowledge-base/${encodeURIComponent(resourceId(knowledge))}/content`))
    : "";
  return {
    apiKey,
    agentId,
    agentConfig,
    promptPath: prompt.path,
    prompt: prompt.value,
    knowledge,
    knowledgeTitle: resourceName(knowledge) || SARLOTA_LANGUAGE_KB_NAME,
    knowledgeBase: kbContent
  };
}

const PROMPT_REQUIREMENTS = [
  ["intro_announcement", "úvodní hlášení Šarloty"],
  ["KSO_INTRO_GENERATION_PENDING", "technický marker úvodu Svozových tras"],
  ["aktivního Promptu, připojené Knowledge Base a aktuálního JSON bloku ověřených dynamic variables", "generování úvodu aktivní Šarlotou"],
  ["Automatický úvod je přerušitelný", "přerušitelný automatický úvod"],
  ["potřebuješ něco upřesnit?", "závěrečná otázka automatického úvodu"],
  ["KSO po ní ve stejné holografické relaci počká pět sekund", "první reakce řidiče ve stejném hologramu"],
  ["Šarlotě skočí do řeči", "přerušení zruší zbytek zvuku i časovač"],
  ["Velký panel mikrofonu", "zákaz velkého mikrofonního panelu"],
  ["outro gong", "ukončení po pěti sekundách bez řeči"],
  ["stupňů Celsia", "výslovnost teploty"],
  ["Mirku, s čím mohu pomoct?", "bezpečný pozdrav po ručním zapnutí"],
  ["get_collection_routes_context", "bezpečný kontext Svozových tras"],
  ["prepare_collection_route_gps_capture", "příprava GPS stanoviště"],
  ["prepare_collection_route_test_incident", "příprava TEST hlášení stanoviště"],
  ["prepare_collection_route_driver_action", "příprava pracovního kroku řidiče"],
  ["test scope", "oddělení TEST scope"],
  ["Interní TEST e-mail nebo SMS dispečerce smíš pouze připravit přes chráněný backend KSO", "bezpečný interní TEST kontakt dispečinku"],
  ["vistos", "zákaz zápisu do Vistosu"]
];

export function validateManagedContent(kind, content) {
  const value = String(content ?? "");
  const text = normalize(value);
  const errors = [];
  if (!clean(value)) errors.push("Obsah je prázdný.");
  if (value.length > MAX_CONTENT_LENGTH) errors.push(`Obsah překračuje limit ${MAX_CONTENT_LENGTH} znaků.`);

  if (kind === "prompt") {
    const safety = driverReportPromptSafetyAnalysis(value);
    safety.missingRequirements.forEach((item) => errors.push(`Chybí: ${item.label}.`));
    driverReportPromptForbiddenPhrases(value).forEach(() => errors.push("Prompt obsahuje zakázanou zastaralou formulaci."));
    PROMPT_REQUIREMENTS.forEach(([marker, label]) => {
      if (!text.includes(normalize(marker))) errors.push(`Chybí: ${label}.`);
    });
  } else if (kind === "knowledge_base") {
    const integrity = sarlotaLanguagePackageIntegrity(value);
    if (integrity.length < integrity.minimumLength) {
      errors.push(`Jazyková KB je neúplná: má ${integrity.length} znaků, minimum je ${integrity.minimumLength}.`);
    }
    integrity.missingMarkers.forEach((marker) => errors.push(`Chybí povinná část jazykové KB: ${marker}.`));
  } else {
    errors.push("Neznámý typ obsahu.");
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function titleForKind(kind, live = null) {
  return kind === "prompt" ? "Hlavní prompt Šarloty" : (live?.knowledgeTitle || SARLOTA_LANGUAGE_KB_NAME);
}

function liveContentForKind(live, kind) {
  return kind === "prompt" ? live.prompt : live.knowledgeBase;
}

async function publishContent(live, kind, content) {
  if (kind === "prompt") {
    await elevenLabsRequest(live.apiKey, `/convai/agents/${encodeURIComponent(live.agentId)}`, {
      method: "PATCH",
      body: nestedPatch(live.promptPath, content)
    });
    return;
  }

  if (live.knowledge) {
    await elevenLabsRequest(live.apiKey, `/convai/knowledge-base/${encodeURIComponent(resourceId(live.knowledge))}`, {
      method: "PATCH",
      body: { name: resourceName(live.knowledge) || SARLOTA_LANGUAGE_KB_NAME, content }
    });
    return;
  }

  const created = await elevenLabsRequest(live.apiKey, "/convai/knowledge-base/text", {
    method: "POST",
    body: { name: SARLOTA_LANGUAGE_KB_NAME, text: content }
  });
  const createdId = resourceId(created);
  if (!createdId) throw new Error("knowledge_base_id_missing");
  const entries = knowledgeEntries(live.agentConfig).filter((item) => resourceName(item) !== SARLOTA_LANGUAGE_KB_NAME);
  entries.push({ type: "text", name: SARLOTA_LANGUAGE_KB_NAME, id: createdId, usage_mode: "auto" });
  await elevenLabsRequest(live.apiKey, `/convai/agents/${encodeURIComponent(live.agentId)}`, {
    method: "PATCH",
    body: { conversation_config: { agent: { prompt: { knowledge_base: entries } } } }
  });
}

async function documentPayload(db, assistantKey, kind, liveContent, live = null) {
  const document = await getSarlotaContentDocument(db, assistantKey, kind);
  const documentId = document?.id || contentDocumentId(assistantKey, kind);
  const liveFingerprint = fingerprint(liveContent);
  const draftContent = document ? String(document.draft_content || "") : liveContent;
  const draftBase = document?.draft_base_live_fingerprint || liveFingerprint;
  return {
    kind,
    title: titleForKind(kind, live),
    liveContent,
    liveFingerprint,
    liveLength: liveContent.length,
    liveAvailable: Boolean(clean(liveContent)),
    draftContent,
    draftFingerprint: fingerprint(draftContent),
    draftBaseLiveFingerprint: draftBase,
    draftStatus: document?.draft_status || "live",
    hasSavedDraft: Boolean(document),
    conflict: Boolean(document && draftBase && draftBase !== liveFingerprint),
    validation: validateManagedContent(kind, draftContent),
    versions: document ? await listSarlotaContentVersions(db, documentId) : []
  };
}

async function editorPayload(env, assistantConfig) {
  const db = env?.SMART_ODPADY_DB;
  if (!db) throw new Error("sarlota_content_db_missing");
  const live = await readLiveContent(env, assistantConfig);
  return {
    generatedAt: new Date().toISOString(),
    assistant: assistantPublicMetadata(assistantConfig),
    readOnlyLoad: true,
    documents: {
      prompt: await documentPayload(db, assistantConfig.assistantKey, "prompt", live.prompt, live),
      knowledge_base: await documentPayload(db, assistantConfig.assistantKey, "knowledge_base", live.knowledgeBase, live)
    }
  };
}

async function saveDraft(env, assistantConfig, user, payload) {
  const kind = clean(payload?.kind);
  if (!CONTENT_KINDS.has(kind)) return json({ error: "Neznámý typ obsahu." }, 400);
  const content = String(payload?.content ?? "");
  if (!clean(content) || content.length > MAX_CONTENT_LENGTH) return json({ error: "Koncept je prázdný nebo příliš dlouhý." }, 400);
  const baseLiveFingerprint = clean(payload?.baseLiveFingerprint);
  if (!baseLiveFingerprint) return json({ error: "Chybí otisk živé verze. Načti editor znovu." }, 409);
  const document = await saveSarlotaContentDraft(env.SMART_ODPADY_DB, {
    assistantKey: assistantConfig.assistantKey,
    kind,
    title: titleForKind(kind),
    content,
    fingerprint: fingerprint(content),
    baseLiveFingerprint,
    actorId: user?.id || user?.email || "unknown",
    status: "draft"
  });
  await recordSarlotaContentAudit(env.SMART_ODPADY_DB, {
    documentId: document.id,
    assistantKey: assistantConfig.assistantKey,
    kind,
    action: "draft_saved",
    actorId: user?.id || "",
    actorEmail: user?.email || "",
    afterFingerprint: fingerprint(content)
  });
  return json({ status: "ok", message: "Koncept je uložený pouze v KSO.", validation: validateManagedContent(kind, content) });
}

async function applyStoredContent(env, assistantConfig, user, payload, mode) {
  const kind = clean(payload?.kind);
  if (!CONTENT_KINDS.has(kind)) return json({ error: "Neznámý typ obsahu." }, 400);
  const db = env.SMART_ODPADY_DB;
  const document = await getSarlotaContentDocument(db, assistantConfig.assistantKey, kind);
  if (!document) return json({ error: "Nejdřív ulož koncept v KSO." }, 409);
  const expectedLiveFingerprint = clean(payload?.expectedLiveFingerprint);
  const expectedDraftFingerprint = clean(payload?.expectedDraftFingerprint);
  const confirmText = clean(payload?.confirm);
  const requiredConfirm = mode === "rollback" ? "VRATIT VERZI" : "PUBLIKOVAT";
  if (confirmText !== requiredConfirm) return json({ error: `Potvrzení musí být přesně ${requiredConfirm}.` }, 409);
  if (mode === "publish" && (!expectedDraftFingerprint || expectedDraftFingerprint !== clean(document.draft_fingerprint))) {
    return json({
      error: "Uložený koncept se od otevřeného editoru změnil. Načti editor znovu.",
      code: "SARLOTA_DRAFT_CHANGED"
    }, 409);
  }

  let targetContent = String(document.draft_content || "");
  let source = "published_draft";
  let note = "Publikováno z konceptu KSO";
  if (mode === "rollback") {
    const version = await getSarlotaContentVersion(db, document.id, payload?.versionId);
    if (!version) return json({ error: "Vybraná historická verze neexistuje." }, 404);
    targetContent = String(version.content || "");
    source = "rollback";
    note = `Návrat k verzi ${version.version_number}`;
  }

  const validation = validateManagedContent(kind, targetContent);
  if (!validation.valid) return json({ error: "Obsah neprošel bezpečnostní kontrolou.", validation }, 409);

  const liveBefore = await readLiveContent(env, assistantConfig);
  const beforeContent = liveContentForKind(liveBefore, kind);
  const beforeFingerprint = fingerprint(beforeContent);
  if (!expectedLiveFingerprint || expectedLiveFingerprint !== beforeFingerprint) {
    return json({
      error: "Obsah v ElevenLabs se od posledního načtení změnil. Editor obnov a změny porovnej.",
      code: "SARLOTA_CONTENT_CONFLICT",
      liveFingerprint: beforeFingerprint
    }, 409);
  }
  if (mode === "publish" && clean(document.draft_base_live_fingerprint) !== beforeFingerprint) {
    return json({
      error: "Koncept vychází ze starší živé verze. Nejdřív načti současný obsah z ElevenLabs a změny bezpečně spoj.",
      code: "SARLOTA_DRAFT_BASE_CONFLICT"
    }, 409);
  }

  await createSarlotaContentVersion(db, {
    documentId: document.id,
    assistantKey: assistantConfig.assistantKey,
    kind,
    content: beforeContent,
    fingerprint: beforeFingerprint,
    source: "live_snapshot",
    note: "Automatická záloha před změnou",
    actorId: user?.id || user?.email || "unknown"
  });

  await publishContent(liveBefore, kind, targetContent);
  const liveAfter = await readLiveContent(env, assistantConfig);
  const afterContent = liveContentForKind(liveAfter, kind);
  const afterFingerprint = fingerprint(afterContent);
  const targetFingerprint = fingerprint(targetContent);
  if (afterFingerprint !== targetFingerprint) {
    await recordSarlotaContentAudit(db, {
      documentId: document.id,
      assistantKey: assistantConfig.assistantKey,
      kind,
      action: `${mode}_verification_failed`,
      actorId: user?.id || "",
      actorEmail: user?.email || "",
      beforeFingerprint,
      afterFingerprint
    });
    return json({ error: "ElevenLabs změnu nepotvrdilo shodným obsahem. Stav je nutné znovu ověřit.", status: "partial" }, 409);
  }

  const version = await createSarlotaContentVersion(db, {
    documentId: document.id,
    assistantKey: assistantConfig.assistantKey,
    kind,
    content: targetContent,
    fingerprint: targetFingerprint,
    source,
    note,
    actorId: user?.id || user?.email || "unknown"
  });
  await saveSarlotaContentDraft(db, {
    assistantKey: assistantConfig.assistantKey,
    kind,
    title: titleForKind(kind),
    content: targetContent,
    fingerprint: targetFingerprint,
    baseLiveFingerprint: targetFingerprint,
    actorId: user?.id || user?.email || "unknown",
    status: "published"
  });
  await recordSarlotaContentAudit(db, {
    documentId: document.id,
    assistantKey: assistantConfig.assistantKey,
    kind,
    action: mode === "rollback" ? "version_rolled_back" : "draft_published",
    actorId: user?.id || "",
    actorEmail: user?.email || "",
    beforeFingerprint,
    afterFingerprint,
    metadata: { versionId: version.id, versionNumber: version.versionNumber }
  });
  return json({ status: "ok", message: mode === "rollback" ? "Historická verze je znovu publikovaná." : "Koncept je publikovaný v ElevenLabs.", version });
}

export async function onRequestGet({ request, env }) {
  try {
    const { response } = await requireUserPermission(env, request, "settings", "manage");
    if (response) return response;
    const assistantConfig = assistantConfigFromRequest(request, env);
    if (!assistantConfig || assistantConfig.assistantKey !== "sarlota" || !assistantConfig.isProduction) {
      return json({ error: "Editor je dostupný pouze pro produkční Šarlotu." }, 409);
    }
    return json(await editorPayload(env, assistantConfig));
  } catch (error) {
    console.error("elevenlabs.sarlota_content_load_failed", { message: clean(error?.message), status: error?.status || 0 });
    return json({ error: "Obsah Promptu a Knowledge Base se nepodařilo bezpečně načíst.", code: clean(error?.message) }, error?.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "settings", "manage");
    if (response) return response;
    if (!env?.SMART_ODPADY_DB) return json({ error: "Chybí cloudové úložiště verzí." }, 503);
    const payload = await readJson(request);
    const assistantConfig = resolveElevenLabsAssistantConfig(payload?.assistant || "sarlota", env);
    if (!assistantConfig || assistantConfig.assistantKey !== "sarlota" || !assistantConfig.isProduction) {
      return json({ error: "Editor je dostupný pouze pro produkční Šarlotu." }, 409);
    }
    const action = clean(payload?.action);
    if (action === "save_draft") return await saveDraft(env, assistantConfig, user, payload);
    if (action === "publish") return await applyStoredContent(env, assistantConfig, user, payload, "publish");
    if (action === "rollback") return await applyStoredContent(env, assistantConfig, user, payload, "rollback");
    return json({ error: "Neznámá akce editoru." }, 400);
  } catch (error) {
    console.error("elevenlabs.sarlota_content_write_failed", { message: clean(error?.message), status: error?.status || 0 });
    return json({ error: "Operaci editoru se nepodařilo bezpečně dokončit.", code: clean(error?.message) }, error?.status || 500);
  }
}

export const __test = {
  fingerprint,
  nestedPatch,
  selectKnowledgeDocument,
  validateManagedContent
};
