import { recordAiAction } from "./ai-action-log-store.js";

const MEMORY_DB_BINDING = "SMART_ODPADY_DB";
const DEFAULT_ORGANIZATION_ID = "kaiser";
const MAX_TOPICS = 8;

const TOPIC_RULES = [
  { id: "trasa", pattern: /(tras|stanoviště|zastávk|adres|pořadí)/i },
  { id: "navigace", pattern: /(navigace|navigovat|odboč|kilometr|here)/i },
  { id: "počasí", pattern: /(počas|prš|deš|déš|bouř|teplot|sníh|vítr)/i },
  { id: "vozidlo", pattern: /(vozidlo|auto|vůz|spz|florian|míra|kouba)/i },
  { id: "hlášení stanoviště", pattern: /(hlášení|přeplněn|poškozen|nádob|fotk|fotograf)/i },
  { id: "výsyp", pattern: /(výsyp|vysypat|skládka|sako)/i },
  { id: "přestávka", pattern: /(přestávk|pauza|odpočinek)/i },
  { id: "pracovní kontakt", pattern: /(telefon|mobil|e-mail|email|kontakt|kolega|pracovník)/i },
  { id: "dovolená", pattern: /(dovolen|nepřítomn|volno)/i },
  { id: "nadřízený", pattern: /(nadřízen|vedoucí|šéf|manager|manažer)/i },
  { id: "zprávy", pattern: /(zpráv|novinky|událost)/i }
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  try {
    const parsed = JSON.parse(cleanString(value) || "[]");
    return Array.isArray(parsed) ? parsed.map(cleanString).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function database(env, required = false) {
  const db = env?.[MEMORY_DB_BINDING] || null;
  if (!db && required) {
    const error = new Error("Cloudová paměť Šarloty není nastavená.");
    error.status = 503;
    error.code = "sarlota_memory_database_missing";
    throw error;
  }
  return db;
}

function organizationId(env = {}) {
  return cleanString(env.SARLOTA_ORGANIZATION_ID) || DEFAULT_ORGANIZATION_ID;
}

function memoryId(env, userId) {
  return `sarlota-memory:${organizationId(env)}:${cleanString(userId).toLowerCase()}`;
}

function emptyMemory(env = {}) {
  return {
    available: Boolean(database(env)),
    consent: false,
    consentStatus: "pending",
    previouslySpoken: false,
    conversationCount: 0,
    topics: [],
    summary: "",
    lastConversationAt: "",
    apiStatus: database(env) ? "ready" : "waiting"
  };
}

function memoryFromRow(env, row) {
  if (!row) return emptyMemory(env);
  const topics = safeArray(row.topics_json).slice(-MAX_TOPICS);
  const conversationCount = Math.max(0, Number(row.conversation_count || 0));
  const consentStatus = cleanString(row.consent_status) || "pending";
  return {
    available: true,
    consent: consentStatus === "granted",
    consentStatus,
    previouslySpoken: consentStatus === "granted" && conversationCount > 0,
    conversationCount,
    topics,
    summary: cleanString(row.summary),
    lastConversationAt: cleanString(row.last_conversation_at),
    apiStatus: "ready"
  };
}

async function memoryRow(env, userId) {
  const db = database(env);
  if (!db || !cleanString(userId)) return null;
  return db.prepare(`
    SELECT *
    FROM sarlota_user_memory
    WHERE organization_id = ? AND lower(user_id) = lower(?)
    LIMIT 1
  `).bind(organizationId(env), cleanString(userId)).first();
}

export function classifySarlotaMemoryTopics(transcript = "") {
  const text = cleanString(transcript).slice(0, 1200);
  if (!text) return [];
  const topics = TOPIC_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
  return topics.length ? topics : ["pracovní rozhovor"];
}

export async function getSarlotaUserMemory(env, currentUser) {
  const userId = cleanString(currentUser?.id);
  if (!userId) return emptyMemory(env);
  try {
    return memoryFromRow(env, await memoryRow(env, userId));
  } catch (error) {
    console.error("sarlota_memory.read_failed", { message: error.message });
    return { ...emptyMemory(env), available: false, apiStatus: "waiting", reason: "migration_pending" };
  }
}

export async function setSarlotaMemoryConsent(env, currentUser, granted) {
  const db = database(env, true);
  const userId = cleanString(currentUser?.id);
  if (!userId) {
    const error = new Error("Chybí přihlášený uživatel paměti.");
    error.status = 401;
    error.code = "sarlota_memory_user_missing";
    throw error;
  }
  const now = new Date().toISOString();
  const consentStatus = granted === true ? "granted" : "revoked";
  await db.prepare(`
    INSERT INTO sarlota_user_memory (
      id, organization_id, user_id, consent_status, topics_json, summary,
      conversation_count, last_conversation_id, last_exchange_key,
      first_conversation_at, last_conversation_at, consented_at, revoked_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, '[]', '', 0, '', '', NULL, NULL, ?, ?, ?, ?)
    ON CONFLICT(organization_id, user_id) DO UPDATE SET
      consent_status = excluded.consent_status,
      topics_json = CASE WHEN excluded.consent_status = 'revoked' THEN '[]' ELSE sarlota_user_memory.topics_json END,
      summary = CASE WHEN excluded.consent_status = 'revoked' THEN '' ELSE sarlota_user_memory.summary END,
      conversation_count = CASE WHEN excluded.consent_status = 'revoked' THEN 0 ELSE sarlota_user_memory.conversation_count END,
      last_conversation_id = CASE WHEN excluded.consent_status = 'revoked' THEN '' ELSE sarlota_user_memory.last_conversation_id END,
      last_exchange_key = CASE WHEN excluded.consent_status = 'revoked' THEN '' ELSE sarlota_user_memory.last_exchange_key END,
      first_conversation_at = CASE WHEN excluded.consent_status = 'revoked' THEN NULL ELSE sarlota_user_memory.first_conversation_at END,
      last_conversation_at = CASE WHEN excluded.consent_status = 'revoked' THEN NULL ELSE sarlota_user_memory.last_conversation_at END,
      consented_at = CASE WHEN excluded.consent_status = 'granted' THEN excluded.consented_at ELSE sarlota_user_memory.consented_at END,
      revoked_at = excluded.revoked_at,
      updated_at = excluded.updated_at
  `).bind(
    memoryId(env, userId),
    organizationId(env),
    userId,
    consentStatus,
    granted === true ? now : null,
    granted === true ? null : now,
    now,
    now
  ).run();
  await recordAiAction(env, currentUser, {
    assistantId: "sarlota",
    assistantName: "Šarlota",
    actionType: "memory_consent",
    toolName: granted === true ? "grant" : "revoke_and_delete",
    input: { consent: granted === true },
    result: { storedTranscript: false, storedAudio: false },
    status: "ok"
  });
  return getSarlotaUserMemory(env, currentUser);
}

export async function rememberSarlotaExchange(env, currentUser, input = {}) {
  const db = database(env, true);
  const userId = cleanString(currentUser?.id);
  const conversationId = cleanString(input.conversationId).slice(0, 160);
  const topics = classifySarlotaMemoryTopics(input.userTranscript);
  const row = await memoryRow(env, userId);
  if (!row || cleanString(row.consent_status) !== "granted") {
    return { ...(await getSarlotaUserMemory(env, currentUser)), remembered: false, reason: "consent_required" };
  }
  const exchangeKey = `${conversationId || "bez-id"}:${topics.join("|")}`.slice(0, 500);
  if (cleanString(row.last_exchange_key) === exchangeKey) {
    return { ...memoryFromRow(env, row), remembered: false, reused: true };
  }
  const mergedTopics = [...safeArray(row.topics_json), ...topics]
    .filter((topic, index, values) => values.lastIndexOf(topic) === index)
    .slice(-MAX_TOPICS);
  const now = new Date().toISOString();
  const isNewConversation = !conversationId || conversationId !== cleanString(row.last_conversation_id);
  const conversationCount = Math.max(0, Number(row.conversation_count || 0)) + (isNewConversation ? 1 : 0);
  const summary = `Předchozí pracovní témata: ${mergedTopics.join(", ")}.`;
  await db.prepare(`
    UPDATE sarlota_user_memory
    SET topics_json = ?, summary = ?, conversation_count = ?,
        last_conversation_id = ?, last_exchange_key = ?,
        first_conversation_at = COALESCE(first_conversation_at, ?),
        last_conversation_at = ?, updated_at = ?
    WHERE organization_id = ? AND lower(user_id) = lower(?) AND consent_status = 'granted'
  `).bind(
    JSON.stringify(mergedTopics),
    summary,
    conversationCount,
    conversationId,
    exchangeKey,
    now,
    now,
    now,
    organizationId(env),
    userId
  ).run();
  await recordAiAction(env, currentUser, {
    assistantId: "sarlota",
    assistantName: "Šarlota",
    actionType: "memory_update",
    toolName: "structured_topics",
    input: { conversationIdPresent: Boolean(conversationId), transcriptStored: false, audioStored: false },
    result: { topics, conversationCount },
    status: "ok"
  });
  return { ...(await getSarlotaUserMemory(env, currentUser)), remembered: true };
}
