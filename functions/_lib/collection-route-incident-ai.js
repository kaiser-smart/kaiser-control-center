const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_TEXT_LENGTH = 3000;

const ESCALATION_PATTERNS = [
  /\b(pr[aá]vn[ií]k|advok[aá]t|[zž]alob|soud|polici|inspekc|[cč]oi|[zž]ivotn[ií]\s+prost[rř]ed[ií])\b/i,
  /\b(m[eé]di|novin[aá][rř]|televiz|facebook|soci[aá]ln[ií]\s+s[ií][tť])\b/i,
  /\b(st[ií][zž]nost|reklamac|n[aá]hrad[auy]?\s+[sš]kod|od[sš]kodn)/i,
  /\b(neskute[cč]n|katastrof|ostud|neschopn|podvod|l[žz]ete|lh[aá][rř])\b/i,
  /\b(okam[zž]it[eě]|naposled|nikdy\s+v[ií]c|ukon[cč][ií]m|vypov[ií]d[aá]m)\b/i
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function truncate(value, max = MAX_TEXT_LENGTH) {
  const text = cleanString(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatCzechDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "v domluveném čase";
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function incidentLabel(type) {
  if (type === "overfilled_container") return "Přeplněná nádoba";
  if (type === "damaged_container") return "Poškozená nádoba";
  if (type === "site_inaccessible") return "Nepřístupné nádoby";
  return "Hlášení ze stanoviště";
}

export function collectionRouteIncidentRequiresEscalation(text) {
  const value = cleanString(text);
  return Boolean(value && ESCALATION_PATTERNS.some((pattern) => pattern.test(value)));
}

export function collectionRouteIncidentFallbackMessage(input = {}) {
  const audience = cleanString(input.audience || "dispatcher");
  const customerName = cleanString(input.customerName || "zákazníku");
  const stationName = cleanString(input.stationName || "stanoviště");
  const address = cleanString(input.address || "neuvedená adresa");
  const eventAt = formatCzechDateTime(input.eventAt);
  const eta = formatCzechDateTime(input.etaAt);
  const nextPickup = formatCzechDateTime(input.nextStandardPickupAt);
  const dispatcherName = cleanString(input.dispatcherName || "dispečink");
  const label = incidentLabel(cleanString(input.incidentType));

  if (audience === "customer-recovery") {
    if (input.recoveryBranch === "route-within-24h") {
      return {
        subject: "[TEST SVOZ] Náhradní bezplatný svoz je naplánovaný",
        body: `Dobrý den, omlouváme se, dnes kolem ${eventAt} jsme nádoby na stanovišti ${stationName} nemohli obsloužit, protože nebyly přístupné. Zítra jedeme poblíž a mimořádný bezplatný svoz jsme zařadili přibližně na ${eta}. Prosíme jen o zajištění volného přístupu k nádobám. Děkujeme za pochopení a přejeme hezký den.`,
        classification: "normal",
        escalate: false,
        reason: "fallback-route-within-24h"
      };
    }
    return {
      subject: "[TEST SVOZ] Omluva za neprovedený svoz",
      body: `Dobrý den, omlouváme se, dnes kolem ${eventAt} jsme nádoby na stanovišti ${stationName} nemohli obsloužit, protože nebyly přístupné. Do 24 hodin bohužel poblíž nejede vhodné svozové vozidlo, proto proběhne další obsluha v pravidelném termínu ${nextPickup}. Před příjezdem Vám pošleme krátkou připomínku. Prosíme jen o zajištění volného přístupu k nádobám. Děkujeme za pochopení.`,
      classification: "normal",
      escalate: false,
      reason: "fallback-next-standard-pickup"
    };
  }

  if (audience === "customer-reminder") {
    return {
      subject: "[TEST SVOZ] Připomínka před příjezdem",
      body: `Dobrý den, za přibližně 30 minut přijedeme ke stanovišti ${stationName}, ${address}. Prosíme o kontrolu, že je přístup k nádobám volný. Děkujeme za pomoc a přejeme hezký den.`,
      classification: "normal",
      escalate: false,
      reason: "fallback-standard-reminder"
    };
  }

  if (audience === "customer-reply") {
    return {
      subject: "[TEST SVOZ] Odpověď Kaiser servis",
      body: `Dobrý den, děkujeme za zprávu. Situaci u stanoviště ${stationName} evidujeme a náš tým ji řeší. Pokud bude potřeba cokoli upřesnit, ozve se Vám ${dispatcherName}. Přejeme hezký den.`,
      classification: "normal",
      escalate: false,
      reason: "fallback-customer-reply"
    };
  }

  return {
    subject: `[TEST DISPEČINK] ${label} · ${stationName}`,
    body: `${dispatcherName}, ${label.toLocaleLowerCase("cs-CZ")}: ${stationName}, ${address}, přibližně ${eventAt}. Nahlásil: ${cleanString(input.testerName || "neuvedeno")}. Poznámka: ${cleanString(input.note || "bez poznámky")}. Fotografie je přiložená. Prosíme o prověření.`,
    classification: "internal",
    escalate: false,
    reason: "fallback-dispatcher"
  };
}

function extractOutputText(payload = {}) {
  const direct = cleanString(payload.output_text);
  if (direct) return direct;
  const parts = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      const text = cleanString(content?.text || content?.output_text);
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function outputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["subject", "body", "classification", "escalate", "reason"],
    properties: {
      subject: { type: "string", minLength: 1, maxLength: 160 },
      body: { type: "string", minLength: 1, maxLength: 1800 },
      classification: { type: "string", enum: ["internal", "normal", "dissatisfied", "escalate"] },
      escalate: { type: "boolean" },
      reason: { type: "string", maxLength: 300 }
    }
  };
}

function buildRequest(model, input, fallback) {
  return {
    model,
    instructions: [
      "Jsi serverová komunikační vrstva KSO pro bezpečný TEST svozových incidentů.",
      "Piš česky, mile, přirozeně, stručně a bez obviňování řidiče nebo zákazníka.",
      "Interní hlášení dispečerovi drž nejvýše kolem 450 znaků a osobu řidiče označ slovem Nahlásil, nikdy Tester.",
      "Nikdy neměň zadaný výsledek plánování, čas, vozidlo, příjemce ani provozní větev.",
      "Nevymýšlej kontakt, termín, kapacitu ani provedenou akci.",
      "Je-li vstup rozhořčený, právní, výhružný, mediální nebo žádá stížnost či náhradu škody, nastav escalate=true a classification=escalate.",
      "Jde o TEST. Slovo TEST ponech v předmětu."
    ].join("\n"),
    input: JSON.stringify({
      audience: cleanString(input.audience),
      incidentType: cleanString(input.incidentType),
      recoveryBranch: cleanString(input.recoveryBranch),
      customerName: truncate(input.customerName, 180),
      stationName: truncate(input.stationName, 240),
      address: truncate(input.address, 260),
      eventAt: cleanString(input.eventAt),
      etaAt: cleanString(input.etaAt),
      nextStandardPickupAt: cleanString(input.nextStandardPickupAt),
      dispatcherName: truncate(input.dispatcherName, 180),
      testerName: truncate(input.testerName, 180),
      note: truncate(input.note, 500),
      customerReply: truncate(input.customerReply, 1800),
      factualFallback: fallback
    }),
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "collection_route_incident_message",
        strict: true,
        schema: outputSchema()
      }
    }
  };
}

export async function composeCollectionRouteIncidentMessage(env = {}, input = {}, options = {}) {
  const fallback = collectionRouteIncidentFallbackMessage(input);
  const forcedEscalation = collectionRouteIncidentRequiresEscalation(input.customerReply);
  if (forcedEscalation) {
    return {
      ...fallback,
      classification: "escalate",
      escalate: true,
      reason: "deterministic-safety-escalation",
      aiStatus: "skipped-safety-escalation",
      model: ""
    };
  }

  const apiKey = cleanString(env.OPENAI_API_KEY);
  const model = cleanString(env.COLLECTION_ROUTE_INCIDENT_OPENAI_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL);
  if (!apiKey) {
    return { ...fallback, aiStatus: "fallback-missing-key", model: "" };
  }

  const timeoutMs = Math.min(Math.max(Number(env.COLLECTION_ROUTE_INCIDENT_OPENAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 3000), 25000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildRequest(model, input, fallback)),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const parsed = JSON.parse(extractOutputText(payload));
    if (!parsed?.subject || !parsed?.body || typeof parsed?.escalate !== "boolean") {
      throw new Error("OpenAI vrátil neplatný tvar");
    }
    const escalation = parsed.escalate === true || parsed.classification === "escalate";
    return {
      subject: truncate(parsed.subject, 160),
      body: truncate(parsed.body, 1800),
      classification: escalation ? "escalate" : cleanString(parsed.classification || fallback.classification),
      escalate: escalation,
      reason: truncate(parsed.reason, 300),
      aiStatus: "generated",
      model
    };
  } catch (error) {
    return {
      ...fallback,
      aiStatus: error?.name === "AbortError" ? "fallback-timeout" : "fallback-error",
      model,
      aiError: cleanString(error?.message)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const __test = {
  ESCALATION_PATTERNS,
  buildRequest,
  extractOutputText,
  incidentLabel
};
