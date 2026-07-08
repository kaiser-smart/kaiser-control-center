const STOP_SENTENCE = "Pro odhlášení odpovězte STOP.";

export const CUSTOMER_MESSAGE_TEMPLATES = {
  request_received: {
    label: "Přijetí požadavku",
    category: "transactional",
    body: "Kaiser servis: Přijali jsme váš požadavek. Ozveme se vám s dalším postupem."
  },
  appointment_confirmed: {
    label: "Potvrzení termínu",
    category: "transactional",
    body: "Kaiser servis: Potvrzujeme termín služby {date} v {time}. Adresa: {address}."
  },
  appointment_changed: {
    label: "Změna termínu",
    category: "transactional",
    body: "Kaiser servis: U vašeho požadavku došlo ke změně termínu. Nový termín: {date} v {time}."
  },
  dispatch_message: {
    label: "Dispečink",
    category: "transactional",
    body: "Kaiser servis: Zpráva od dispečinku k vaší službě: {message}."
  },
  missing_information: {
    label: "Doplnění údajů",
    category: "transactional",
    body: "Kaiser servis: Pro dokončení požadavku prosím doplňte údaje zde: {url}."
  }
};

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeTemplateKey(value) {
  return cleanString(value)
    .replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function customerTemplateOptions() {
  return Object.entries(CUSTOMER_MESSAGE_TEMPLATES).map(([key, template]) => ({
    key,
    label: template.label,
    category: template.category
  }));
}

export function templateAlwaysIncludesStop(body) {
  return cleanString(body).toLowerCase().includes(STOP_SENTENCE.toLowerCase());
}

export function appendStopSentence(body) {
  const cleaned = cleanString(body);
  if (!cleaned) {
    return "";
  }

  return templateAlwaysIncludesStop(cleaned) ? cleaned : `${cleaned} ${STOP_SENTENCE}`;
}

export function renderCustomerMessageTemplate(templateKey, variables = {}) {
  const key = normalizeTemplateKey(templateKey);
  const template = CUSTOMER_MESSAGE_TEMPLATES[key];
  if (!template) {
    throw new Error(`Neznámá zákaznická šablona: ${cleanString(templateKey) || "neuvedeno"}.`);
  }

  let body = template.body;
  for (const [variableKey, rawValue] of Object.entries(variables || {})) {
    const value = cleanString(rawValue);
    body = body.replaceAll(`{${variableKey}}`, value);
  }

  const missing = [...body.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
  if (missing.length) {
    throw new Error(`Šabloně chybí hodnoty: ${[...new Set(missing)].join(", ")}.`);
  }

  return {
    key,
    label: template.label,
    category: template.category,
    body: appendStopSentence(body)
  };
}

export const __test = {
  STOP_SENTENCE,
  normalizeTemplateKey,
  appendStopSentence,
  templateAlwaysIncludesStop
};
