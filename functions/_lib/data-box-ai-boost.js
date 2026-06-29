import { listDataBoxMessages } from "./data-box-store.js";
import { prepareDataBoxAction } from "./data-box-actions-store.js";
import { listModuleRules } from "./module-rules-store.js";

const MODULE_KEY = "data-box";

export class DataBoxAiBoostError extends Error {
  constructor(message, status = 400, code = "data_box_ai_boost_error") {
    super(message);
    this.name = "DataBoxAiBoostError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function truncate(value, max = 700) {
  const text = cleanString(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseJson(value, fallback = {}) {
  if (typeof value === "object" && value !== null) return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function normalizeActionType(value) {
  const type = cleanString(value).toLowerCase();
  if (["archive", "email", "reply", "review"].includes(type)) {
    return type;
  }
  return "review";
}

function messagePreview(message) {
  return truncate(
    message.preview
      || message.bodyPreview
      || message.textPreview
      || message.annotation
      || message.subject
      || "",
    420
  );
}

function publicMessage(message) {
  return {
    id: cleanString(message.id),
    dataBoxId: cleanString(message.dataBoxId),
    dataBoxLabel: cleanString(message.dataBoxLabel),
    mailboxId: cleanString(message.dataBoxId),
    mailboxLabel: cleanString(message.dataBoxLabel),
    direction: cleanString(message.direction),
    senderName: cleanString(message.senderName),
    senderBoxId: cleanString(message.senderBoxId),
    subject: truncate(message.subject || message.title || "", 260),
    deliveredAt: cleanString(message.deliveredAt || message.acceptedAt || message.storedAt),
    status: cleanString(message.status || message.workflowStatus || message.processingStatus),
    attachmentsCount: Array.isArray(message.attachments) ? message.attachments.length : Number(message.attachmentsCount || 0),
    preview: messagePreview(message)
  };
}

function publicRule(rule) {
  return {
    id: cleanString(rule.id),
    title: cleanString(rule.title),
    status: cleanString(rule.status),
    conditions: parseJson(rule.conditions, {}),
    actions: parseJson(rule.actions, {})
  };
}

function openAiConfig(env) {
  const apiKey = cleanString(env.OPENAI_API_KEY || env.AI_BOOST_OPENAI_API_KEY || env.DATA_BOX_AI_OPENAI_API_KEY);
  const model = cleanString(env.AI_BOOST_MODEL || env.OPENAI_MODEL || env.DATA_BOX_AI_MODEL || "gpt-4o-mini");

  if (!apiKey) {
    throw new DataBoxAiBoostError(
      "AI Boost není napojený: chybí server-side OpenAI API key.",
      503,
      "data_box_ai_boost_missing_openai_key"
    );
  }

  return { apiKey, model };
}

function extractJsonObject(text) {
  const raw = cleanString(text);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new DataBoxAiBoostError("AI Boost vrátil neplatný JSON.", 502, "data_box_ai_boost_invalid_json");
  }
}

async function requestAiRecommendations(env, messages, rules) {
  const { apiKey, model } = openAiConfig(env);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Jsi bezpečný AI Boost pro modul Datová schránka v Kaiser Smart.",
            "Nevytváříš ostré akce. Jen doporučuješ koncepty čekající na potvrzení uživatele.",
            "Doporuč jen akce archive, email, reply nebo review.",
            "E-mail doporuč pouze tehdy, když příjemce jasně vyplývá z pravidel.",
            "Nikdy netvrď, že se něco odeslalo, archivovalo nebo smazalo.",
            "Vrať výhradně JSON ve tvaru {\"recommendations\":[...]}."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Vyber maximálně 12 bezpečných AI Boost konceptů pro zprávy.",
            rules,
            messages,
            outputShape: {
              recommendations: [
                {
                  messageId: "id zprávy",
                  actionType: "archive|email|reply|review",
                  recipient: "jen pro email, pokud je jasný",
                  subject: "krátký předmět konceptu",
                  reason: "stručný důvod",
                  confidence: 0.0
                }
              ]
            }
          })
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new DataBoxAiBoostError(
      cleanString(payload.error?.message || payload.error || `OpenAI API vrátilo chybu ${response.status}.`),
      502,
      "data_box_ai_boost_openai_failed"
    );
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  return Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
}

function fallbackRecommendationForMessage(message, rules) {
  const normalized = [
    message.senderName,
    message.senderBoxId,
    message.subject,
    message.preview
  ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  for (const rule of rules) {
    const action = parseJson(rule.actions, {});
    const conditions = parseJson(rule.conditions, {});
    const needles = [
      ...(Array.isArray(conditions.anySender) ? conditions.anySender : []),
      ...(Array.isArray(conditions.senderContains) ? conditions.senderContains : []),
      ...(Array.isArray(conditions.anyText) ? conditions.anyText : []),
      ...(Array.isArray(conditions.textContains) ? conditions.textContains : []),
      ...(Array.isArray(conditions.subjectContains) ? conditions.subjectContains : [])
    ].map((item) => cleanString(item).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).filter(Boolean);
    const hits = needles.filter((needle) => normalized.includes(needle));

    if (hits.length >= 2) {
      const actionType = cleanString(action.type).toUpperCase() === "SEND_EMAIL" ? "email" : "archive";
      const recipients = Array.isArray(action.recipients) ? action.recipients : [action.recipient].filter(Boolean);
      return {
        messageId: message.id,
        actionType,
        recipient: actionType === "email" ? cleanString(recipients[0]) : "",
        subject: message.subject || rule.title,
        reason: `Podobné pravidlu: ${rule.title}. Shoda: ${hits.slice(0, 3).join(", ")}.`,
        confidence: Math.min(0.92, 0.55 + hits.length * 0.1),
        source: "rule_similarity"
      };
    }
  }

  return null;
}

export async function runDataBoxAiBoost(env, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 30), 1), 60);
  const messages = (await listDataBoxMessages(env, { limit }))
    .filter((message) => cleanString(message.direction || "received") === "received")
    .slice(0, limit)
    .map(publicMessage)
    .filter((message) => message.id);
  const rules = (await listModuleRules(env, MODULE_KEY))
    .filter((rule) => rule.status === "active")
    .map(publicRule);

  if (!messages.length) {
    return {
      apiStatus: "ready",
      status: "skipped",
      created: 0,
      actions: [],
      message: "AI Boost nemá žádné přijaté zprávy k vyhodnocení."
    };
  }

  let recommendations = [];
  let provider = "OpenAI";

  try {
    recommendations = await requestAiRecommendations(env, messages.slice(0, 20), rules);
  } catch (error) {
    if (error instanceof DataBoxAiBoostError && error.code === "data_box_ai_boost_missing_openai_key") {
      throw error;
    }
    if (cleanString(env.DATA_BOX_AI_RULE_FALLBACK).toLowerCase() !== "true") {
      throw error;
    }
    provider = "rule-similarity-fallback";
    recommendations = messages
      .map((message) => fallbackRecommendationForMessage(message, rules))
      .filter(Boolean);
  }

  const byId = new Map(messages.map((message) => [message.id, message]));
  const createdActions = [];

  for (const recommendation of recommendations.slice(0, 12)) {
    const message = byId.get(cleanString(recommendation.messageId));
    if (!message) continue;

    const actionType = normalizeActionType(recommendation.actionType);
    const recipient = cleanString(recommendation.recipient);
    const subject = truncate(recommendation.subject || message.subject || "AI Boost koncept", 180);
    const reason = truncate(recommendation.reason || "AI Boost doporučuje ruční kontrolu.", 460);
    const confidence = Number(recommendation.confidence || 0);
    const storedActionType = actionType === "review" ? "ai_boost" : actionType;

    if (storedActionType === "email" && !recipient) continue;

    const action = await prepareDataBoxAction(env, message, storedActionType, {
      recipient,
      subject,
      bodyPreview: reason,
      dedupeKey: `data-box:ai-boost:${message.id}:${storedActionType}:${recipient || "none"}`,
      reason,
      result: {
        source: "ai_boost",
        provider,
        recommendedAction: actionType,
        reason,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        requiresConfirmation: true,
        generatedAt: new Date().toISOString()
      }
    }, options.currentUser || {});
    createdActions.push(action);
  }

  return {
    apiStatus: "ready",
    status: "prepared",
    provider,
    created: createdActions.length,
    actions: createdActions,
    message: createdActions.length
      ? `AI Boost připravil ${createdActions.length} konceptů k ručnímu potvrzení.`
      : "AI Boost nenašel dostatečně jistý koncept k potvrzení."
  };
}

export function dataBoxAiBoostErrorResponse(error) {
  if (error instanceof DataBoxAiBoostError) {
    return {
      payload: { error: error.message, code: error.code, apiStatus: "ready" },
      status: error.status
    };
  }

  return {
    payload: {
      error: cleanString(error?.message) || "AI Boost se nepodařilo spustit.",
      code: cleanString(error?.code || "data_box_ai_boost_failed"),
      apiStatus: "ready"
    },
    status: error?.status || 500
  };
}
