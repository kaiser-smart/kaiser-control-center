import { recordAiAction } from "./ai-action-log-store.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const ASSISTANT_ID = "sarlota";
const ASSISTANT_NAME = "Šarlota";
const MAX_TEXT_LENGTH = 1800;
const INTENTS = new Set([
  "order_status",
  "tracking",
  "sms_link",
  "handoff_jarka",
  "product_advice",
  "complaint_return",
  "call_log",
  "business_hours",
  "general",
  "unsupported"
]);

export class VoiceSarlotaError extends Error {
  constructor(message, status = 400, code = "voice_sarlota_error") {
    super(message);
    this.name = "VoiceSarlotaError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function truncate(value, max = MAX_TEXT_LENGTH) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function boolValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeKey(value);
  return ["true", "1", "yes", "ano", "souhlas", "souhlasim", "confirmed"].includes(normalized);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmpty(...values) {
  return values.map(cleanString).find(Boolean) || "";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entryValue]) => {
      if (Array.isArray(entryValue)) {
        return entryValue.length > 0;
      }

      return entryValue !== undefined && entryValue !== null && entryValue !== "";
    })
  );
}

function openAiConfig(env) {
  const apiKey = cleanString(env.OPENAI_API_KEY);
  const model = cleanString(env.VOICE_ASSISTANT_OPENAI_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL);

  if (!apiKey) {
    throw new VoiceSarlotaError(
      "Šarlota není napojená na OpenAI: chybí server-side OPENAI_API_KEY.",
      503,
      "voice_sarlota_missing_openai_key"
    );
  }

  return { apiKey, model };
}

function extractNestedValue(payload, keys) {
  const queue = [payload];
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const seen = new Set();

  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) {
      continue;
    }
    seen.add(item);

    for (const [key, value] of Object.entries(item)) {
      if (normalizedKeys.has(normalizeKey(key)) && cleanString(value)) {
        return cleanString(value);
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

function speechTextFromPayload(payload) {
  return truncate(firstNonEmpty(
    payload.text,
    payload.message,
    payload.transcript,
    payload.query,
    payload.input,
    payload.userMessage,
    payload.user_message,
    payload.parameters?.text,
    payload.parameters?.message,
    payload.parameters?.query,
    payload.request?.text,
    payload.request?.message
  ));
}

function intentHintFromPayload(payload) {
  const raw = firstNonEmpty(
    payload.intent,
    payload.action,
    payload.tool,
    payload.toolName,
    payload.tool_name,
    payload.parameters?.intent,
    payload.parameters?.action,
    payload.parameters?.tool,
    payload.parameters?.toolName
  );
  const normalized = normalizeIntent(raw);
  return normalized === "general" && !raw ? "" : normalized;
}

function normalizeIntent(value) {
  const normalized = normalizeKey(value).replaceAll("-", "_").replace(/\s+/g, "_");
  const aliases = {
    order: "order_status",
    objednavka: "order_status",
    stav_objednavky: "order_status",
    order_status: "order_status",
    shipment: "tracking",
    zasilka: "tracking",
    zasilky: "tracking",
    tracking: "tracking",
    sms: "sms_link",
    send_sms: "sms_link",
    sms_link: "sms_link",
    jarka: "handoff_jarka",
    handoff: "handoff_jarka",
    predani: "handoff_jarka",
    product: "product_advice",
    produkt: "product_advice",
    produktove_poradenstvi: "product_advice",
    product_advice: "product_advice",
    complaint: "complaint_return",
    reklamace: "complaint_return",
    return: "complaint_return",
    vraceni: "complaint_return",
    complaint_return: "complaint_return",
    log: "call_log",
    call_log: "call_log",
    hovor: "call_log",
    pracovni_doba: "business_hours",
    business_hours: "business_hours"
  };
  const intent = aliases[normalized] || normalized;
  return INTENTS.has(intent) ? intent : "general";
}

function publicUserContext(user) {
  return compactObject({
    id: cleanString(user?.id),
    name: truncate(user?.name, 120),
    role: cleanString(user?.role),
    department: truncate(user?.department, 120),
    position: truncate(user?.position, 120)
  });
}

function contextFromPayload(payload) {
  const parameters = payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
  const context = payload.context && typeof payload.context === "object" ? payload.context : {};
  const dynamicVariables = payload.dynamic_variables
    || payload.dynamicVariables
    || payload.conversation_initiation_client_data?.dynamic_variables
    || {};

  return compactObject({
    conversationId: firstNonEmpty(
      payload.conversationId,
      payload.conversation_id,
      payload.conversation?.id,
      payload.metadata?.conversation_id
    ),
    requestedIntent: intentHintFromPayload(payload),
    orderNumber: truncate(firstNonEmpty(
      parameters.orderNumber,
      parameters.order_number,
      context.orderNumber,
      payload.orderNumber,
      extractNestedValue(payload, ["orderNumber", "order_number", "orderId", "order_id"])
    ), 120),
    trackingNumber: truncate(firstNonEmpty(
      parameters.trackingNumber,
      parameters.tracking_number,
      context.trackingNumber,
      payload.trackingNumber,
      extractNestedValue(payload, ["trackingNumber", "tracking_number", "shipmentNumber", "shipment_number"])
    ), 120),
    phone: truncate(firstNonEmpty(parameters.phone, context.phone, payload.phone), 80),
    link: truncate(firstNonEmpty(parameters.link, context.link, payload.link, payload.url), 400),
    customerName: truncate(firstNonEmpty(parameters.customerName, context.customerName, payload.customerName), 160),
    product: truncate(firstNonEmpty(parameters.product, context.product, payload.product), 220),
    issue: truncate(firstNonEmpty(parameters.issue, context.issue, payload.issue), 420),
    smsConsent: boolValue(firstNonEmpty(
      parameters.smsConsent,
      parameters.sms_consent,
      context.smsConsent,
      payload.smsConsent,
      payload.sms_consent,
      payload.confirmed,
      payload.consent?.sms
    )),
    dynamicUserName: truncate(dynamicVariables.user_name, 120),
    dynamicUserRole: truncate(dynamicVariables.user_role, 120)
  });
}

function pragueDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    weekday: weekdayMap[part("weekday")] || 0,
    hour: numberValue(part("hour"), 0) % 24,
    minute: numberValue(part("minute"), 0)
  };
}

function minutesFromTime(value) {
  const match = cleanString(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = numberValue(match[1], 0);
  const minutes = numberValue(match[2], 0);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return (hours * 60) + minutes;
}

function defaultBusinessHours() {
  return {
    timezone: "Europe/Prague",
    source: "default",
    days: [
      { day: 1, from: "08:00", to: "16:00" },
      { day: 2, from: "08:00", to: "16:00" },
      { day: 3, from: "08:00", to: "16:00" },
      { day: 4, from: "08:00", to: "16:00" },
      { day: 5, from: "08:00", to: "16:00" }
    ]
  };
}

function businessHoursConfig(env) {
  const configured = parseJson(env.SARLOTA_BUSINESS_HOURS_JSON, null);
  if (!configured || !Array.isArray(configured.days)) {
    return defaultBusinessHours();
  }

  return {
    timezone: "Europe/Prague",
    source: "configured",
    days: configured.days
      .map((day) => ({
        day: numberValue(day.day, 0),
        from: cleanString(day.from),
        to: cleanString(day.to)
      }))
      .filter((day) => day.day >= 1 && day.day <= 7 && minutesFromTime(day.from) !== null && minutesFromTime(day.to) !== null)
  };
}

function businessHoursStatus(env, date = new Date()) {
  const config = businessHoursConfig(env);
  const parts = pragueDateParts(date);
  const nowMinutes = (parts.hour * 60) + parts.minute;
  const todayRanges = config.days.filter((day) => day.day === parts.weekday);
  const activeRange = todayRanges.find((range) => {
    const from = minutesFromTime(range.from);
    const to = minutesFromTime(range.to);
    return from !== null && to !== null && nowMinutes >= from && nowMinutes < to;
  });

  return {
    isBusinessHours: Boolean(activeRange),
    timezone: config.timezone,
    source: config.source,
    currentDay: parts.weekday,
    currentTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    todayRanges: todayRanges.map((range) => `${range.from}-${range.to}`),
    message: activeRange
      ? "Jsme v pracovní době."
      : config.source === "configured"
        ? "Teď jsme mimo nastavenou pracovní dobu."
        : "Teď jsme mimo výchozí pracovní dobu."
  };
}

function extractJsonObject(text) {
  const raw = cleanString(text);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new VoiceSarlotaError("OpenAI vrátilo neplatný JSON.", 502, "voice_sarlota_invalid_openai_json");
  }
}

function systemPrompt() {
  return [
    "Jsi Šarlota, ženská hlasová asistentka pro interní projekt Kaiser Smart Odpady.",
    "ElevenLabs je jen hlasová vrstva. Ty rozhoduješ a backend Kaiser Smart Odpady provádí ověřené kroky.",
    "Mluv česky, tykej, používej ženský rod, odpovídej stručně a bez omáčky.",
    "Nikdy nelži. Neuváděj neověřené termíny ani stav objednávky nebo zásilky.",
    "Když něco nemáš ověřené, řekni, že to není ověřené, a navrhni předání kolegyni Jarce.",
    "Nikdy nepoužívej slova ticket, tiket ani SupportBox.",
    "Pro předání používej formulaci: předám to kolegyni Jarce.",
    "E-maily nehláskuj a neposílej do odpovědi žádné API klíče, tokeny ani interní secrets.",
    "Vrať výhradně JSON."
  ].join(" ");
}

async function requestOpenAiDecision(env, input) {
  const { apiKey, model } = openAiConfig(env);
  const response = await fetch(OPENAI_ENDPOINT, {
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
          content: systemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Rozpoznej záměr volajícího a napiš krátkou odpověď Šarloty.",
            allowedIntents: Array.from(INTENTS),
            outputShape: {
              intent: "order_status|tracking|sms_link|handoff_jarka|product_advice|complaint_return|call_log|business_hours|general|unsupported",
              reply: "1 až 2 krátké věty česky, tykání",
              needsHuman: true,
              confidence: 0.0
            },
            request: input
          })
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new VoiceSarlotaError(
      cleanString(payload.error?.message || payload.error || `OpenAI API vrátilo chybu ${response.status}.`),
      502,
      "voice_sarlota_openai_failed"
    );
  }

  const parsed = extractJsonObject(payload.choices?.[0]?.message?.content);
  return {
    intent: normalizeIntent(parsed.intent || parsed.tool || input.context.requestedIntent),
    reply: sanitizeSarlotaReply(parsed.reply || parsed.response || ""),
    needsHuman: boolValue(parsed.needsHuman),
    confidence: Math.max(0, Math.min(numberValue(parsed.confidence, 0), 1)),
    model
  };
}

function sanitizeSarlotaReply(value) {
  const text = truncate(value, 420)
    .replace(/\bSupportBox\b/gi, "interní systém")
    .replace(/\btickets?\b/gi, "požadavky")
    .replace(/\btikety?\b/gi, "požadavky")
    .replace(/\bMůžete\b/g, "Můžeš")
    .replace(/\bmůžete\b/g, "můžeš")
    .replace(/\bChcete\b/g, "Chceš")
    .replace(/\bchcete\b/g, "chceš")
    .replace(/\bPotřebujete\b/g, "Potřebuješ")
    .replace(/\bpotřebujete\b/g, "potřebuješ")
    .replace(/\bNemáte\b/g, "Nemáš")
    .replace(/\bnemáte\b/g, "nemáš")
    .replace(/\bZadejte\b/g, "Zadej")
    .replace(/\bzadejte\b/g, "zadej")
    .replace(/\bPošlete\b/g, "Pošli")
    .replace(/\bpošlete\b/g, "pošli");

  return text || "Tomu zatím nerozumím jistě. Předám to kolegyni Jarce.";
}

function orderStatusTool(context) {
  if (!context.orderNumber) {
    return {
      status: "needs_input",
      verified: false,
      message: "Pošli mi číslo objednávky a ověřím, co pro ni máme napojené.",
      preparedActions: []
    };
  }

  return {
    status: "prepared",
    verified: false,
    missingInternalApi: "order_status",
    message: "Stav objednávky zatím nemám z ověřeného zdroje. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "order_status_unverified",
        orderNumber: context.orderNumber
      }
    ]
  };
}

function trackingTool(context) {
  if (!context.trackingNumber && !context.orderNumber) {
    return {
      status: "needs_input",
      verified: false,
      message: "Pošli mi číslo zásilky nebo objednávky a zkontroluju ověřený zdroj.",
      preparedActions: []
    };
  }

  return {
    status: "prepared",
    verified: false,
    missingInternalApi: "shipment_tracking",
    message: "Tracking zatím nemám z ověřeného zdroje. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "tracking_unverified",
        orderNumber: context.orderNumber,
        trackingNumber: context.trackingNumber
      }
    ]
  };
}

function smsLinkTool(context) {
  if (!context.smsConsent) {
    return {
      status: "needs_consent",
      verified: true,
      message: "SMS s odkazem můžu řešit jen po tvém souhlasu. Mám ji připravit?",
      preparedActions: []
    };
  }

  return {
    status: "prepared_not_sent",
    verified: false,
    missingInternalApi: "voice_sms_sender",
    message: "Souhlas mám, ale ostré odeslání SMS pro Šarlotu ještě není napojené. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "sms_link",
        status: "not_sent",
        requiresApprovedSender: true,
        phonePresent: Boolean(context.phone),
        linkPresent: Boolean(context.link)
      }
    ]
  };
}

function handoffTool(context, reason = "handoff_requested") {
  return {
    status: "prepared",
    verified: true,
    message: "Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason,
        orderNumber: context.orderNumber,
        trackingNumber: context.trackingNumber,
        product: context.product
      }
    ]
  };
}

function productAdviceTool(decision, context) {
  return {
    status: context.product ? "answered_general" : "needs_input",
    verified: false,
    message: context.product
      ? sanitizeSarlotaReply(decision.reply)
      : "Napiš mi, o jaký produkt jde. Když si nebudu jistá, předám to kolegyni Jarce.",
    preparedActions: context.product
      ? []
      : [{ type: "handoff_jarka", reason: "product_advice_missing_product" }]
  };
}

function complaintReturnTool(context) {
  return {
    status: "prepared",
    verified: false,
    message: "Reklamaci nebo vrácení bez ověřených dat neuzavřu. Předám to kolegyni Jarce.",
    preparedActions: [
      {
        type: "handoff_jarka",
        reason: "complaint_return",
        orderNumber: context.orderNumber,
        issue: context.issue
      }
    ]
  };
}

function businessHoursTool(businessHours) {
  return {
    status: "ready",
    verified: businessHours.source === "configured",
    message: businessHours.message,
    preparedActions: [],
    businessHours
  };
}

function executeTool(decision, context, businessHours) {
  switch (decision.intent) {
    case "order_status":
      return orderStatusTool(context);
    case "tracking":
      return trackingTool(context);
    case "sms_link":
      return smsLinkTool(context);
    case "handoff_jarka":
      return handoffTool(context);
    case "product_advice":
      return productAdviceTool(decision, context);
    case "complaint_return":
      return complaintReturnTool(context);
    case "business_hours":
      return businessHoursTool(businessHours);
    case "call_log":
      return {
        status: "ready",
        verified: true,
        message: "Hovor zapíšu do logu.",
        preparedActions: []
      };
    case "unsupported":
      return handoffTool(context, "unsupported_request");
    default:
      return {
        status: "answered",
        verified: false,
        message: sanitizeSarlotaReply(decision.reply),
        preparedActions: []
      };
  }
}

function finalReplyFor(decision, toolResult) {
  if (toolResult.message) {
    return sanitizeSarlotaReply(toolResult.message);
  }

  return sanitizeSarlotaReply(decision.reply);
}

export async function handleSarlotaVoiceRequest(env, user, payload = {}, options = {}) {
  const speechText = speechTextFromPayload(payload);
  const context = contextFromPayload(payload);
  const businessHours = businessHoursStatus(env);
  const input = {
    text: speechText,
    context,
    businessHours,
    user: publicUserContext(user),
    authSource: cleanString(options.authSource || "unknown")
  };

  const decision = await requestOpenAiDecision(env, input);
  const toolResult = executeTool(decision, context, businessHours);
  const reply = finalReplyFor(decision, toolResult);
  const logResult = await recordAiAction(env, user, {
    assistantId: ASSISTANT_ID,
    assistantName: ASSISTANT_NAME,
    actionType: "voice",
    toolName: `voice_sarlota_${decision.intent}`,
    input: {
      authSource: input.authSource,
      conversationId: context.conversationId,
      transcriptExcerpt: truncate(speechText, 500),
      requestedIntent: context.requestedIntent,
      smsConsent: context.smsConsent
    },
    result: {
      intent: decision.intent,
      confidence: decision.confidence,
      status: toolResult.status,
      verified: Boolean(toolResult.verified),
      replyExcerpt: truncate(reply, 360),
      preparedActions: toolResult.preparedActions?.length || 0,
      businessHours: businessHours.isBusinessHours
    },
    status: "ok"
  });

  return {
    ok: true,
    assistantId: ASSISTANT_ID,
    assistantName: ASSISTANT_NAME,
    text: reply,
    reply,
    intent: decision.intent,
    confidence: decision.confidence,
    status: toolResult.status,
    verified: Boolean(toolResult.verified),
    needsHuman: Boolean(decision.needsHuman || toolResult.preparedActions?.some((action) => action.type === "handoff_jarka")),
    preparedActions: toolResult.preparedActions || [],
    missingInternalApi: toolResult.missingInternalApi || "",
    businessHours: toolResult.businessHours || businessHours,
    callLog: {
      logged: Boolean(logResult.logged),
      id: cleanString(logResult.id),
      reason: cleanString(logResult.reason)
    },
    model: decision.model,
    apiStatus: "ready"
  };
}

export function voiceSarlotaErrorResponse(error) {
  if (error instanceof VoiceSarlotaError) {
    return {
      payload: {
        ok: false,
        error: error.message,
        code: error.code,
        apiStatus: "waiting"
      },
      status: error.status
    };
  }

  return {
    payload: {
      ok: false,
      error: cleanString(error?.message) || "Šarlota teď požadavek nezpracovala.",
      code: cleanString(error?.code || "voice_sarlota_failed"),
      apiStatus: "waiting"
    },
    status: error?.status || 500
  };
}
