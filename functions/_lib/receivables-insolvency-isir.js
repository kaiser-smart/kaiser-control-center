import { ReceivablesStoreError } from "./receivables-store.js";

export const ISIR_CUZK_ENDPOINT = "https://isir.justice.cz:8443/isir_cuzk_ws/IsirWsCuzkService";
export const ISIR_CUZK_SOURCE = "Ministerstvo spravedlnosti ČR - ISIR_CUZK_WS2";
export const ISIR_CUZK_REQUEST_LIMIT_PER_MINUTE = 50;
export const ISIR_CUZK_REQUEST_LIMIT_PER_DAY = 3000;

function cleanString(value) {
  return String(value ?? "").trim();
}

export function normalizeReceivableIco(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  if (!digits || digits.length > 8) return "";
  return digits.padStart(8, "0");
}

function decodeXmlEntities(value) {
  return cleanString(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValues(xml, tagName) {
  const matches = [];
  const expression = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tagName}>`,
    "gi"
  );
  let match = expression.exec(xml);
  while (match) {
    matches.push(match[1]);
    match = expression.exec(xml);
  }
  return matches;
}

function tagValue(xml, tagName) {
  return decodeXmlEntities(tagValues(xml, tagName)[0] || "");
}

function proceedingReference(dataXml) {
  const senate = tagValue(dataXml, "cisloSenatu");
  const kind = tagValue(dataXml, "druhVec");
  const number = tagValue(dataXml, "bcVec");
  const year = tagValue(dataXml, "rocnik");
  return [senate, kind, number && year ? `${number}/${year}` : number || year].filter(Boolean).join(" ");
}

export function buildIsirCuzkIcoRequest(ico) {
  const normalizedIco = normalizeReceivableIco(ico);
  if (!normalizedIco) {
    throw new ReceivablesStoreError("Zákazník nemá použitelné IČO pro insolvenční kontrolu.", 400, "receivables_insolvency_ico_missing");
  }

  return [
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://isirws.cca.cz/types/">',
    "<soapenv:Header/>",
    "<soapenv:Body>",
    "<typ:getIsirWsCuzkDataRequest>",
    `<ic>${normalizedIco}</ic>`,
    "<maxPocetVysledku>50</maxPocetVysledku>",
    "<filtrAktualniRizeni>T</filtrAktualniRizeni>",
    "<maxRelevanceVysledku>2</maxRelevanceVysledku>",
    "</typ:getIsirWsCuzkDataRequest>",
    "</soapenv:Body>",
    "</soapenv:Envelope>"
  ].join("");
}

export function parseIsirCuzkResponse(xml, expectedIco) {
  const payload = cleanString(xml);
  const ico = normalizeReceivableIco(expectedIco);
  if (!payload || !ico) {
    return {
      status: "unavailable",
      found: null,
      sourceStatus: "invalid_response",
      reason: "ISIR nevrátil použitelnou odpověď.",
      proceedings: []
    };
  }

  const errorCode = tagValue(payload, "kodChyby");
  const sourceSynchronizedAt = tagValue(payload, "casSynchronizace");
  if (errorCode === "WS2") {
    return {
      status: "clear",
      found: false,
      sourceStatus: "ready",
      reason: "Pro zadané IČO nebylo nalezeno probíhající insolvenční řízení.",
      sourceSynchronizedAt,
      proceedings: []
    };
  }
  if (errorCode) {
    return {
      status: "unavailable",
      found: null,
      sourceStatus: errorCode,
      reason: tagValue(payload, "popisChyby") || tagValue(payload, "textChyby") || "ISIR kontrolu nelze spolehlivě vyhodnotit.",
      sourceSynchronizedAt,
      proceedings: []
    };
  }

  const proceedings = tagValues(payload, "data")
    .map((dataXml) => ({
      ico: normalizeReceivableIco(tagValue(dataXml, "ic")),
      isAdditionalDebtor: tagValue(dataXml, "dalsiDluznikVRizeni") === "T",
      reference: proceedingReference(dataXml),
      proceedingStatus: tagValue(dataXml, "druhStavKonkursu"),
      detailUrl: tagValue(dataXml, "urlDetailRizeni"),
      insolvencyStartedAt: tagValue(dataXml, "datumPmZahajeniUpadku"),
      insolvencyEndedAt: tagValue(dataXml, "datumPmUkonceniUpadku")
    }))
    .filter((item) => item.ico === ico && !item.isAdditionalDebtor);

  if (!proceedings.length) {
    return {
      status: "unavailable",
      found: null,
      sourceStatus: "no_exact_ico_result",
      reason: "Odpověď ISIR neobsahuje jednoznačný záznam pro kontrolované IČO.",
      sourceSynchronizedAt,
      proceedings: []
    };
  }

  return {
    status: "found",
    found: true,
    sourceStatus: "ready",
    reason: "Pro zadané IČO bylo nalezeno probíhající insolvenční řízení.",
    sourceSynchronizedAt,
    proceedings: proceedings.map(({ ico: _ico, isAdditionalDebtor: _additional, ...item }) => item)
  };
}

function timeoutSignal(timeoutMs) {
  if (typeof globalThis.AbortSignal?.timeout === "function") return globalThis.AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function checkIsirCuzkByIco(ico, options = {}) {
  const normalizedIco = normalizeReceivableIco(ico);
  const checkedAt = new Date().toISOString();
  if (!normalizedIco) {
    return {
      status: "missing_ico",
      found: null,
      sourceStatus: "not_checked",
      reason: "Zákazník nemá použitelné IČO; insolvenční stav nelze ověřit.",
      sourceSynchronizedAt: "",
      proceedings: [],
      checkedAt
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 8000, 15000));
  try {
    const response = await fetchImpl(ISIR_CUZK_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: '""'
      },
      body: buildIsirCuzkIcoRequest(normalizedIco),
      signal: timeoutSignal(timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`ISIR HTTP ${response.status}`);
    }
    return {
      ...parseIsirCuzkResponse(await response.text(), normalizedIco),
      checkedAt
    };
  } catch (error) {
    return {
      status: "unavailable",
      found: null,
      sourceStatus: "request_failed",
      reason: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "ISIR neodpověděl v časovém limitu; výsledek zůstává neznámý."
        : "ISIR kontrola je dočasně nedostupná; výsledek zůstává neznámý.",
      sourceSynchronizedAt: "",
      proceedings: [],
      checkedAt
    };
  }
}

export async function previewReceivableCustomerInsolvency(env, customerId, options = {}) {
  const db = env?.SMART_ODPADY_DB;
  if (!db) {
    throw new ReceivablesStoreError("Databáze Pohledávek není nastavená.", 503, "receivables_database_missing");
  }
  const id = cleanString(customerId);
  const customer = await db.prepare("SELECT id, company_name, ico FROM receivable_customers WHERE id = ? LIMIT 1").bind(id).first();
  if (!customer) {
    throw new ReceivablesStoreError("Zákazník nebyl nalezen.", 404, "receivables_customer_not_found");
  }

  const result = await checkIsirCuzkByIco(customer.ico, options);
  return {
    apiStatus: result.sourceStatus === "ready" ? "ready" : "waiting",
    mode: "read_only_preview",
    customer: {
      id: cleanString(customer.id),
      companyName: cleanString(customer.company_name),
      ico: normalizeReceivableIco(customer.ico)
    },
    result,
    source: {
      id: "ISIR_CUZK_WS2",
      name: ISIR_CUZK_SOURCE,
      endpoint: ISIR_CUZK_ENDPOINT,
      requestLimitPerMinute: ISIR_CUZK_REQUEST_LIMIT_PER_MINUTE,
      requestLimitPerDay: ISIR_CUZK_REQUEST_LIMIT_PER_DAY
    },
    safety: {
      readOnly: true,
      writesD1: false,
      changesRating: false,
      startsAutomation: false,
      sendsCustomerCommunication: false
    }
  };
}
