const COLLECTION_ROUTES_DB_BINDING = "SMART_ODPADY_DB";
const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
export const COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
const COLLECTION_ROUTES_VISTOS_MAX_ROWS = 1000;
const MANUAL_IMPORT_PHASE = "1C";
const MANUAL_IMPORT_MESSAGE = "Import preview – nevytváří ostré trasy.";
const VISTOS_DISCOVERY_PHASE = "1D";
const VISTOS_DISCOVERY_MESSAGE = "Vistos API discovery – import preview nevytváří ostré trasy.";
const VISTOS_KOMUNAL_PHASE = "1E";
const VISTOS_KOMUNAL_MESSAGE = "Read-only Vistos Komunál preview – nevytváří ostré trasy.";
const DEFAULT_VISTOS_DISCOVERY_PATHS = ["/Contract", "/ServiceList"];
const VISTOS_EXECUTE_API_SUFFIX = "/API/VistosAPI";
const VISTOS_EXECUTE_PAGE_SIZE = 1000;
const VISTOS_EXECUTE_MAX_PAGES = 80;
const VISTOS_KOMUNAL_CONTRACT_FILTER = {
  Status_FK: 74,
  Typsmlouvy_FK: [14735]
};
const VISTOS_CONTRACT_COLUMNS = [
  "Id",
  "ContractNumber",
  "Name",
  "Status_FK",
  "Type_FK",
  "Typsmlouvy_FK",
  "StartDate",
  "EndDate",
  "Directory_FK",
  "DirectoryBranch_FK",
  "Nakladkovaadresa_FK",
  "Sidlo_FK"
];
const VISTOS_CONTRACT_ROW_COLUMNS = [
  "Id",
  "Contract_FK",
  "Product_FK",
  "Name",
  "Description",
  "Quantity",
  "UOM_FK",
  "Typpolozky_FK",
  "Intervalodvozu_FK",
  "Kategorieodpadu_FK",
  "Stanoviste",
  "StartDate",
  "IsActive",
  "ServiceList_FK"
];
const VISTOS_PRODUCT_COLUMNS = [
  "Id",
  "Name",
  "Caption",
  "Quantity",
  "UOM_FK",
  "Currency_FK",
  "CostPrice",
  "ListPrice",
  "WeightedCostPrice",
  "DiscountPrice",
  "Size",
  "Weight",
  "Typodpadu_FK",
  "Typodpadupopelnice_FK",
  "Typnadoby",
  "Cetnostsvozuodpadu_FK",
  "ServiceCycle_FK",
  "Kod_druhotnych_surovin",
  "Waste"
];

export class CollectionRoutesStoreError extends Error {
  constructor(message, status = 400, code = "collection_routes_error") {
    super(message);
    this.name = "CollectionRoutesStoreError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value, fallback = false) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }

  return fallback;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function jsonString(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function collectionRoutesDatabase(env, required = false) {
  const db = env?.[COLLECTION_ROUTES_DB_BINDING] || null;

  if (!db && required) {
    throw new CollectionRoutesStoreError(
      "Databáze pilotu Tras svozu není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "collection_routes_database_missing"
    );
  }

  return db;
}

export function collectionRoutesApiStatus(env) {
  return collectionRoutesDatabase(env) ? "ready" : "waiting";
}

export function isVistosApiConfigured(env) {
  return Boolean(
    cleanString(env?.VISTOS_API_BASE_URL) &&
    (
      cleanString(env?.VISTOS_API_TOKEN) ||
      (cleanString(env?.VISTOS_API_USERNAME) && cleanString(env?.VISTOS_API_PASSWORD)) ||
      (cleanString(env?.VISTOS_API_CLIENT_ID) && cleanString(env?.VISTOS_API_CLIENT_SECRET))
    )
  );
}

function normalizeLookupKey(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeValueKey(value) {
  return cleanString(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COLLECTION_FIELD_ALIASES = {
  customerName: ["zakaznik", "customer", "customerName", "nazevZakaznika", "firma", "odberatel", "subjekt"],
  addressRaw: ["adresa", "address", "addressRaw", "stanovisteAdresa", "misto", "ulice", "svozoveMisto"],
  siteName: ["stanoviste", "site", "siteName", "nazevStanoviste", "svoziste", "mistonazev"],
  wasteType: ["typOdpadu", "odpad", "wasteType", "komodita", "druhOdpadu", "slozka"],
  wasteCode: ["kodOdpadu", "wasteCode", "kod", "catalogCode", "cisloOdpadu"],
  frequency: ["cetnost", "frequency", "frekvence", "interval", "svoz"],
  containerVolume: ["objemNadoby", "containerVolume", "volume", "objem", "nadoba", "litry"],
  containerCount: ["pocetNadob", "containerCount", "count", "pocet", "ks", "mnozstvi"],
  note: ["poznamka", "note", "pozn", "komentar"],
  contact: ["kontakt", "contact", "kontaktniOsoba", "osoba"],
  phone: ["telefon", "phone", "tel", "mobil"],
  email: ["email", "e-mail", "mail", "kontaktEmail"]
};

const NORMALIZED_FIELD_ALIASES = Object.fromEntries(Object.entries(COLLECTION_FIELD_ALIASES)
  .map(([field, aliases]) => [field, aliases.map(normalizeLookupKey)]));

const WASTE_TYPE_MAP = new Map([
  ["SKO", { wasteType: "SKO", wasteCode: "200301" }],
  ["200301", { wasteType: "SKO", wasteCode: "200301" }],
  ["PAPIR", { wasteType: "PAPIR", wasteCode: "200101" }],
  ["PAP", { wasteType: "PAPIR", wasteCode: "200101" }],
  ["200101", { wasteType: "PAPIR", wasteCode: "200101" }],
  ["150101", { wasteType: "PAPIR", wasteCode: "150101" }],
  ["PLAST", { wasteType: "PLAST", wasteCode: "200139" }],
  ["PL", { wasteType: "PLAST", wasteCode: "200139" }],
  ["200139", { wasteType: "PLAST", wasteCode: "200139" }],
  ["150102", { wasteType: "PLAST", wasteCode: "150102" }],
  ["SKLO", { wasteType: "SKLO", wasteCode: "200102" }],
  ["200102", { wasteType: "SKLO", wasteCode: "200102" }],
  ["BIO", { wasteType: "BIO", wasteCode: "200201" }],
  ["200201", { wasteType: "BIO", wasteCode: "200201" }],
  ["SMESNE OBALY", { wasteType: "SMESNE OBALY", wasteCode: "150106" }],
  ["SMESNEOBALY", { wasteType: "SMESNE OBALY", wasteCode: "150106" }],
  ["150106", { wasteType: "SMESNE OBALY", wasteCode: "150106" }]
]);

const ALLOWED_FREQUENCIES = new Set(["1x7", "2x7", "3x7", "5x7", "1x14", "1x30"]);
const ALLOWED_CONTAINER_VOLUMES = new Set([60, 80, 120, 240, 360, 660, 770, 1100]);

function safeBase64(value) {
  const text = String(value || "");
  if (typeof btoa === "function") {
    return btoa(text);
  }
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(text, "utf8").toString("base64");
  }
  return "";
}

function envList(value) {
  const text = cleanString(value);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(cleanString).filter(Boolean);
    }
  } catch {
    // Plain comma/newline separated values are supported too.
  }
  return text
    .split(/[\n,]+/)
    .map(cleanString)
    .filter(Boolean);
}

function vistosDiscoveryPaths(env) {
  const configured = [
    ...envList(env?.VISTOS_COLLECTION_ROUTES_PATHS),
    ...envList(env?.VISTOS_API_DISCOVERY_PATHS)
  ];
  return configured.length ? configured : DEFAULT_VISTOS_DISCOVERY_PATHS;
}

function vistosUrl(baseUrl, path) {
  const base = cleanString(baseUrl).replace(/\/+$/, "");
  const suffix = cleanString(path).replace(/^\/+/, "");
  return `${base}/${suffix}`;
}

function authHeaderValue(token) {
  const value = cleanString(token);
  if (!value) {
    return "";
  }
  return value.includes(" ") ? value : `Bearer ${value}`;
}

function vistosRequestHeaders(env) {
  const headers = {
    Accept: "application/json"
  };
  const token = cleanString(env?.VISTOS_API_TOKEN);
  const authHeader = cleanString(env?.VISTOS_API_AUTH_HEADER) || "Authorization";
  const username = cleanString(env?.VISTOS_API_USERNAME);
  const password = cleanString(env?.VISTOS_API_PASSWORD);
  const clientId = cleanString(env?.VISTOS_API_CLIENT_ID);
  const clientSecret = cleanString(env?.VISTOS_API_CLIENT_SECRET);

  if (token) {
    headers[authHeader] = authHeader.toLowerCase() === "authorization" ? authHeaderValue(token) : token;
  } else if (username && password) {
    headers.Authorization = `Basic ${safeBase64(`${username}:${password}`)}`;
  }

  if (clientId) {
    headers["X-Client-Id"] = clientId;
  }
  if (clientSecret) {
    headers["X-Client-Secret"] = clientSecret;
  }

  return headers;
}

async function fetchVistosJson(env, path) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutMs = Math.max(3000, Math.min(Number(env?.VISTOS_API_TIMEOUT_MS) || 12000, 30000));
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(vistosUrl(env.VISTOS_API_BASE_URL, path), {
      method: "GET",
      headers: vistosRequestHeaders(env),
      signal: controller?.signal
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        path,
        status: response.status,
        rowCount: 0,
        message: `Vistos endpoint vrátil HTTP ${response.status}.`
      };
    }
    try {
      const payload = JSON.parse(text);
      const rows = extractVistosRows(payload).map((row) => flattenVistosRow(row, path));
      return {
        ok: true,
        path,
        status: response.status,
        rowCount: rows.length,
        rows,
        message: `Načteno ${rows.length} řádků.`
      };
    } catch {
      return {
        ok: false,
        path,
        status: response.status,
        rowCount: 0,
        message: "Vistos endpoint nevrátil validní JSON."
      };
    }
  } catch (error) {
    return {
      ok: false,
      path,
      status: 0,
      rowCount: 0,
      message: error?.name === "AbortError"
        ? "Vistos endpoint překročil časový limit."
        : "Vistos endpoint se nepodařilo načíst."
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function extractVistosRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object");
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.data?.data)) {
    return payload.data.data.filter((row) => row && typeof row === "object");
  }

  const directKeys = ["rows", "data", "items", "value", "result", "contracts", "services", "records"];
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((row) => row && typeof row === "object");
    }
  }

  const nested = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      nested.push(...value.filter((row) => row && typeof row === "object"));
    }
  }
  return nested;
}

function vistosExecuteApiBase(env) {
  const rawBase = cleanString(env?.VISTOS_API_BASE_URL);
  if (!rawBase) {
    return "";
  }

  try {
    const url = new URL(rawBase);
    url.hash = "";
    url.search = "";
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname.toLowerCase().endsWith(VISTOS_EXECUTE_API_SUFFIX.toLowerCase())) {
      pathname = `${pathname}${VISTOS_EXECUTE_API_SUFFIX}`;
    }
    url.pathname = pathname;
    return url.toString().replace(/\/+$/, "");
  } catch {
    const withoutHash = rawBase.split("#")[0].split("?")[0].replace(/\/+$/, "");
    return withoutHash.toLowerCase().endsWith(VISTOS_EXECUTE_API_SUFFIX.toLowerCase())
      ? withoutHash
      : `${withoutHash}${VISTOS_EXECUTE_API_SUFFIX}`;
  }
}

function isVistosExecuteConfigured(env) {
  return Boolean(
    vistosExecuteApiBase(env) &&
    cleanString(env?.VISTOS_API_USERNAME) &&
    cleanString(env?.VISTOS_API_PASSWORD)
  );
}

function vistosExecuteEnvelope(methodName, payload) {
  return {
    [methodName]: payload,
    RequestGuid: randomId("vistos-request").replace(/^vistos-request-/, ""),
    RequestDatetime: nowIso(),
    Version: "3.0",
    Device: "Browser",
    Culture: "cs-CZ"
  };
}

function parseVistosCookieHeader(headers) {
  const setCookie = cleanString(headers.get("set-cookie"));
  const cookies = [];
  const cookiePattern = /(VistosAccessToken|VistosRefreshToken)=([^;,]+)/g;
  let match = cookiePattern.exec(setCookie);

  while (match) {
    cookies.push(`${match[1]}=${match[2]}`);
    match = cookiePattern.exec(setCookie);
  }

  return cookies.join("; ");
}

async function fetchVistosExecute(env, methodName, payload, cookieHeader = "") {
  const apiBase = vistosExecuteApiBase(env);
  if (!apiBase) {
    throw new CollectionRoutesStoreError(VISTOS_NOT_CONFIGURED_MESSAGE, 503, "vistos_api_not_configured");
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutMs = Math.max(5000, Math.min(Number(env?.VISTOS_API_TIMEOUT_MS) || 20000, 45000));
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(`${apiBase}/Execute?${methodName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(vistosExecuteEnvelope(methodName, payload)),
      signal: controller?.signal
    });
    const text = await response.text();
    let body = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new CollectionRoutesStoreError(
        "Vistos API nevrátilo validní JSON.",
        502,
        "vistos_api_invalid_json"
      );
    }

    if (!response.ok || body?.status !== "OK") {
      throw new CollectionRoutesStoreError(
        response.status === 401 || response.status === 403 || response.status === 215
          ? "Vistos API odmítlo přístup pro read-only preview."
          : "Vistos API požadavek se nepodařil.",
        response.status === 401 || response.status === 403 || response.status === 215 ? 502 : 502,
        "vistos_api_execute_failed"
      );
    }

    return {
      status: response.status,
      body,
      cookieHeader: parseVistosCookieHeader(response.headers)
    };
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError) {
      throw error;
    }

    throw new CollectionRoutesStoreError(
      error?.name === "AbortError"
        ? "Vistos API překročilo časový limit."
        : "Vistos API se nepodařilo načíst.",
      502,
      "vistos_api_unavailable"
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function loginVistosExecute(env) {
  if (!isVistosExecuteConfigured(env)) {
    throw new CollectionRoutesStoreError(VISTOS_NOT_CONFIGURED_MESSAGE, 503, "vistos_api_not_configured");
  }

  const login = await fetchVistosExecute(env, "LoginParam", {
    UserName: cleanString(env.VISTOS_API_USERNAME),
    Password: cleanString(env.VISTOS_API_PASSWORD)
  });

  if (!login.cookieHeader) {
    throw new CollectionRoutesStoreError(
      "Vistos API login nevrátil bezpečnou session cookie.",
      502,
      "vistos_api_session_missing"
    );
  }

  return {
    cookieHeader: login.cookieHeader
  };
}

function vistosRecordsTotal(payload) {
  const data = payload?.data;
  return {
    total: numericValue(data?.recordsTotal),
    filtered: numericValue(data?.recordsFiltered)
  };
}

async function getVistosPage(env, session, entityName, columns, filter = null, start = 0, length = VISTOS_EXECUTE_PAGE_SIZE) {
  const request = {
    EntityName: entityName,
    Start: start,
    Length: length,
    Columns: columns.map((column) => ({ ColumnName: column, Status: 1 }))
  };

  if (filter && Object.keys(filter).length) {
    request.Filter = filter;
  }

  const result = await fetchVistosExecute(env, "GetPageParam", request, session.cookieHeader);
  const rows = extractVistosRows(result.body);
  return {
    rows,
    ...vistosRecordsTotal(result.body)
  };
}

async function getAllVistosPages(env, session, entityName, columns, filter = null, {
  pageSize = VISTOS_EXECUTE_PAGE_SIZE,
  maxPages = VISTOS_EXECUTE_MAX_PAGES
} = {}) {
  const rows = [];
  let total = 0;
  let filtered = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const result = await getVistosPage(env, session, entityName, columns, filter, start, pageSize);
    rows.push(...result.rows);
    total = result.total;
    filtered = result.filtered;

    if (result.rows.length < pageSize || (filtered && rows.length >= filtered)) {
      break;
    }
  }

  return {
    rows,
    total,
    filtered,
    capped: Boolean(filtered && rows.length < filtered)
  };
}

function flattenVistosRow(row, path) {
  const flattened = {
    __vistosEndpoint: cleanString(path)
  };

  function walk(value, prefix = "") {
    if (Array.isArray(value)) {
      flattened[prefix] = value.length;
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nestedValue] of Object.entries(value)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        walk(nestedValue, nextPrefix);
      }
      return;
    }
    flattened[prefix] = cleanString(value);
  }

  walk(row);
  return flattened;
}

function parseCsvRows(source) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const headerLine = String(source || "").split(/\r?\n/, 1)[0] || "";
  const delimiter = (headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length
    ? ";"
    : ",";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows.filter((item) => item.some((cell) => cleanString(cell)));
}

function parseManualImportRows({ text, filename }) {
  const content = cleanString(text);
  const lowerName = cleanString(filename).toLowerCase();

  if (!content) {
    throw new CollectionRoutesStoreError("Soubor je prázdný.", 400, "collection_routes_manual_import_empty");
  }

  if (lowerName.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new CollectionRoutesStoreError("JSON soubor se nepodařilo načíst.", 400, "collection_routes_manual_import_invalid_json");
    }

    const rows = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.rows)
        ? parsed.rows
        : (Array.isArray(parsed?.data)
          ? parsed.data
          : (Array.isArray(parsed?.items) ? parsed.items : [])));

    if (!rows.length || !rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
      throw new CollectionRoutesStoreError("JSON musí obsahovat pole objektů nebo vlastnost rows/data/items.", 400, "collection_routes_manual_import_invalid_json_rows");
    }

    return rows;
  }

  if (lowerName.endsWith(".csv")) {
    const csvRows = parseCsvRows(content);
    if (csvRows.length < 2) {
      throw new CollectionRoutesStoreError("CSV musí obsahovat hlavičku a alespoň jeden datový řádek.", 400, "collection_routes_manual_import_invalid_csv");
    }
    const headers = csvRows[0].map(cleanString);
    return csvRows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }

  throw new CollectionRoutesStoreError("Podporované jsou pouze soubory .json a .csv.", 400, "collection_routes_manual_import_unsupported_file");
}

function readMappedField(rawRow, field) {
  const aliases = NORMALIZED_FIELD_ALIASES[field] || [];
  for (const [key, value] of Object.entries(rawRow || {})) {
    if (aliases.includes(normalizeLookupKey(key))) {
      return cleanString(value);
    }
  }
  return "";
}

function normalizeWaste(rawWasteType, rawWasteCode) {
  const candidates = [rawWasteCode, rawWasteType].map(normalizeValueKey).filter(Boolean);
  for (const candidate of candidates) {
    const compact = candidate.replace(/\s+/g, "");
    if (WASTE_TYPE_MAP.has(candidate)) {
      return { ...WASTE_TYPE_MAP.get(candidate), known: true };
    }
    if (WASTE_TYPE_MAP.has(compact)) {
      return { ...WASTE_TYPE_MAP.get(compact), known: true };
    }
  }
  return {
    wasteType: cleanString(rawWasteType),
    wasteCode: cleanString(rawWasteCode),
    known: false
  };
}

function normalizeFrequency(value) {
  const normalized = cleanString(value).toLowerCase().replace(/\s+/g, "").replace("×", "x");
  return {
    frequency: normalized,
    known: ALLOWED_FREQUENCIES.has(normalized)
  };
}

function normalizeContainerVolume(value) {
  const raw = cleanString(value);
  const preferredVolume = raw.match(/\b(60|80|120|240|360|660|770|1100)\s*(?:l|lt|ltr|litru|litr|litry)?\b/i);
  const directVolume = raw.match(/^\s*(60|80|120|240|360|660|770|1100)\s*$/);
  const match = preferredVolume || directVolume || raw.match(/\d+/);
  const volume = match ? Number(match[1] || match[0]) : 0;
  return {
    volume,
    known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
  };
}

function normalizeContainerCount(value) {
  const count = Math.max(0, Math.round(numericValue(cleanString(value).replace(",", "."), 0)));
  return count || 1;
}

function firstNonEmpty(...values) {
  return values.map(cleanString).find(Boolean) || "";
}

function fkRecordId(row, fieldName) {
  return firstNonEmpty(row?.[`${fieldName}_RecordId`], row?.[fieldName]);
}

function fkCaption(row, fieldName) {
  return firstNonEmpty(row?.[fieldName], row?.[`${fieldName}_Caption`], row?.[`${fieldName}_MainProjection`]);
}

function isoDateValue(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const czechMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (czechMatch) {
    const [, day, month, year] = czechMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const vistosTicks = text.match(/\/Date\((-?\d+)/i);
  if (vistosTicks) {
    const date = new Date(Number(vistosTicks[1]));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function dateInActiveRange(startDate, endDate, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  const start = isoDateValue(startDate);
  const end = isoDateValue(endDate);
  return (!start || start <= todayIso) && (!end || end >= todayIso);
}

function productSearchText(contractRow, product) {
  return [
    product?.Kod_druhotnych_surovin,
    product?.Typodpadu_FK,
    product?.Typodpadu_FK_Caption,
    product?.Typodpadupopelnice_FK,
    product?.Typodpadupopelnice_FK_Caption,
    product?.Typnadoby,
    product?.Typnadoby_Caption,
    product?.Cetnostsvozuodpadu_FK,
    product?.Cetnostsvozuodpadu_FK_Caption,
    product?.ServiceCycle_FK,
    product?.ServiceCycle_FK_Caption,
    product?.Caption,
    product?.Name,
    product?.Code,
    product?.ProductNumber,
    contractRow?.Caption,
    contractRow?.Name,
    contractRow?.Description,
    contractRow?.Product_FK,
    contractRow?.Product_FK_Caption
  ].map(cleanString).filter(Boolean).join(" ");
}

function textLooksLikeCollectionService(text) {
  const normalized = normalizeValueKey(text);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }

  if (/\b(60|80|120|240|360|660|770|1100)\s*(?:L|LT|LTR|LITRU|LITR|LITRY)?\b/.test(normalized)) {
    return true;
  }
  if (/[1235]\s*X\s*(7|14|30)/.test(normalized)) {
    return true;
  }

  const collectionNeedles = [
    "SKO",
    "KOMUNAL",
    "KOMUNALNI",
    "SMESNYKOMUNALNI",
    "POPELNICE",
    "POPELNICA",
    "KONTEJNER",
    "PAPIR",
    "PLAST",
    "SKLO",
    "BIO",
    "200301",
    "200101",
    "200139",
    "200102",
    "200201",
    "150106",
    "150101",
    "150102"
  ];
  return collectionNeedles.some((needle) => normalized.includes(needle) || compact.includes(needle));
}

function rowHasExplicitLoadingAddress(contract) {
  return Boolean(firstNonEmpty(fkRecordId(contract, "Nakladkovaadresa_FK"), fkCaption(contract, "Nakladkovaadresa_FK")));
}

function inferVistosWaste(contractRow, product) {
  const text = productSearchText(contractRow, product);
  const structured = normalizeWaste(
    firstNonEmpty(product?.Typodpadupopelnice_FK, product?.Typodpadu_FK, text),
    product?.Kod_druhotnych_surovin
  );

  if (structured.known) {
    return structured;
  }

  const normalized = normalizeValueKey(text);
  const compact = normalized.replace(/\s+/g, "");
  const candidates = [
    ["150106", { wasteType: "SMESNE OBALY", wasteCode: "150106" }],
    ["150101", { wasteType: "PAPIR", wasteCode: "150101" }],
    ["150102", { wasteType: "PLAST", wasteCode: "150102" }],
    ["200301", { wasteType: "SKO", wasteCode: "200301" }],
    ["200101", { wasteType: "PAPIR", wasteCode: "200101" }],
    ["200139", { wasteType: "PLAST", wasteCode: "200139" }],
    ["200102", { wasteType: "SKLO", wasteCode: "200102" }],
    ["200201", { wasteType: "BIO", wasteCode: "200201" }],
    ["SKO", { wasteType: "SKO", wasteCode: "200301" }],
    ["SMESNYKOMUNALNI", { wasteType: "SKO", wasteCode: "200301" }],
    ["KOMUNALNI", { wasteType: "SKO", wasteCode: "200301" }],
    ["KOMUNAL", { wasteType: "SKO", wasteCode: "200301" }],
    ["PAPIR", { wasteType: "PAPIR", wasteCode: "200101" }],
    ["PAP", { wasteType: "PAPIR", wasteCode: "200101" }],
    ["PLAST", { wasteType: "PLAST", wasteCode: "200139" }],
    ["PLASTY", { wasteType: "PLAST", wasteCode: "200139" }],
    ["SKLO", { wasteType: "SKLO", wasteCode: "200102" }],
    ["BIO", { wasteType: "BIO", wasteCode: "200201" }],
    ["SMESNEOBALY", { wasteType: "SMESNE OBALY", wasteCode: "150106" }]
  ];

  for (const [needle, value] of candidates) {
    if (normalized.includes(needle) || compact.includes(needle)) {
      return { ...value, known: true };
    }
  }

  return {
    wasteType: "",
    wasteCode: "",
    known: false
  };
}

function inferVistosFrequency(contractRow, product) {
  const rawStructured = firstNonEmpty(product?.Cetnostsvozuodpadu_FK, product?.ServiceCycle_FK, contractRow?.Intervalodvozu_FK);
  const structured = normalizeFrequency(rawStructured);
  if (structured.known) {
    return structured;
  }

  const text = productSearchText(contractRow, product).replace("×", "x");
  const match = text.match(/([1235])\s*x\s*(7|14|30)/i);
  if (match) {
    return normalizeFrequency(`${match[1]}x${match[2]}`);
  }

  return {
    frequency: cleanString(rawStructured),
    known: false
  };
}

function inferVistosContainer(contractRow, product) {
  const raw = firstNonEmpty(product?.Typnadoby, product?.Size, product?.Caption, product?.Name, contractRow?.Name);
  const volume = normalizeContainerVolume(raw);
  const quantitySource = firstNonEmpty(contractRow?.Quantity, product?.Quantity);
  return {
    volume: volume.volume,
    known: volume.known,
    count: normalizeContainerCount(quantitySource),
    type: cleanString(product?.Typnadoby || "container")
  };
}

function vistosSiteKey(contract) {
  const sourceSiteId = firstNonEmpty(fkRecordId(contract, "Nakladkovaadresa_FK"), fkRecordId(contract, "DirectoryBranch_FK"));
  if (sourceSiteId) {
    return `vistos-site-${sourceSiteId}`;
  }
  return normalizeLookupKey([
    fkCaption(contract, "Directory_FK"),
    fkCaption(contract, "Nakladkovaadresa_FK"),
    fkCaption(contract, "DirectoryBranch_FK")
  ].join("|"));
}

function buildVistosKommunalPreview({ contracts, contractRows, products, totals = {} }) {
  const productsById = new Map(products.map((product) => [cleanString(product?.Id), product]));
  const contractIds = new Set(contracts.map((contract) => cleanString(contract?.Id)).filter(Boolean));
  const rowsByContractId = new Map();

  for (const row of contractRows) {
    const contractId = cleanString(row?.Contract_FK_RecordId || row?.Contract_FK);
    if (!contractIds.has(contractId)) {
      continue;
    }
    if (!rowsByContractId.has(contractId)) {
      rowsByContractId.set(contractId, []);
    }
    rowsByContractId.get(contractId).push(row);
  }

  const mappedRows = [];
  const today = new Date();

  for (const contract of contracts) {
    const contractId = cleanString(contract?.Id);
    const contractRowsForContract = rowsByContractId.get(contractId) || [];
    const baseIssues = [];
    const customerName = fkCaption(contract, "Directory_FK");
    const branchName = fkCaption(contract, "DirectoryBranch_FK");
    const addressRaw = firstNonEmpty(fkCaption(contract, "Nakladkovaadresa_FK"), branchName);
    const siteName = firstNonEmpty(fkCaption(contract, "Nakladkovaadresa_FK"), branchName, customerName);
    const sourceCustomerId = fkRecordId(contract, "Directory_FK");
    const sourceSiteId = firstNonEmpty(fkRecordId(contract, "Nakladkovaadresa_FK"), fkRecordId(contract, "DirectoryBranch_FK"));
    const contractActiveRange = dateInActiveRange(contract?.StartDate, contract?.EndDate, today);
    const possibleSiteIds = new Set([
      fkRecordId(contract, "Nakladkovaadresa_FK"),
      fkRecordId(contract, "DirectoryBranch_FK"),
      fkRecordId(contract, "Sidlo_FK")
    ].filter(Boolean));

    if (!customerName) {
      baseIssues.push({ type: "missing-customer", severity: "error", message: "Chybí zákazník." });
    }
    if (!sourceSiteId && !addressRaw) {
      baseIssues.push({ type: "missing-loading-address", severity: "error", message: "Chybí nakládková adresa." });
    }
    if (!contractActiveRange) {
      baseIssues.push({ type: "inactive-contract-range", severity: "warning", message: "Smlouva nemá aktivní datumový rozsah." });
    }
    if (possibleSiteIds.size > 1 && !rowHasExplicitLoadingAddress(contract)) {
      baseIssues.push({ type: "multiple-sites-contract", severity: "info", message: "Smlouva má více možných adresních vazeb bez jasné nakládkové adresy." });
    }

    if (!contractRowsForContract.length) {
      mappedRows.push({
        rowNumber: mappedRows.length + 1,
        sourceEntity: "Contract",
        sourceId: `Contract:${contractId}`,
        sourceContractId: contractId,
        sourceCustomerId,
        sourceSiteId,
        contractId,
        contractNumber: cleanString(contract?.ContractNumber),
        validFrom: isoDateValue(contract?.StartDate),
        validTo: isoDateValue(contract?.EndDate),
        customerName,
        branchName,
        addressRaw,
        siteName,
        wasteType: "",
        wasteCode: "",
        frequency: "",
        containerVolume: 0,
        containerCount: 0,
        productName: "",
        productId: "",
        contractRowId: "",
        mappingStatus: "needs_review",
        rowKey: `vistos-contract-${contractId}`,
        siteKey: vistosSiteKey(contract),
        locationQuality: sourceSiteId ? "vistos_unverified" : "missing",
        latitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Lat),
        longitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Long),
        issues: [
          ...baseIssues,
          { type: "missing-contract-items", severity: "warning", message: "Chybí položky smlouvy." },
          { type: "item-not-collection-mappable", severity: "warning", message: "Položka není mapovatelná na svoz." }
        ]
      });
      continue;
    }

    for (const contractRow of contractRowsForContract) {
      const productId = cleanString(contractRow?.Product_FK_RecordId || contractRow?.Product_FK);
      const product = productsById.get(productId) || null;
      const searchText = productSearchText(contractRow, product);
      const looksLikeCollection = textLooksLikeCollectionService(searchText);
      const waste = inferVistosWaste(contractRow, product);
      const frequency = inferVistosFrequency(contractRow, product);
      const container = inferVistosContainer(contractRow, product);
      const issues = [...baseIssues];

      if (!looksLikeCollection) {
        issues.push({ type: "item-not-collection-mappable", severity: "info", message: "Položka podle dostupných polí nevypadá jako svoz odpadu." });
      } else {
        if (!productId || !product) {
          issues.push({ type: "unknown-product", severity: "warning", message: "Neznámý produkt." });
        }
        if (!waste.known) {
          issues.push({ type: "unknown-waste-type", severity: "warning", message: "Neznámý typ odpadu." });
        }
        if (!frequency.known) {
          issues.push({ type: "unknown-frequency", severity: "warning", message: "Neznámá četnost." });
        }
        if (!container.known) {
          issues.push({ type: "missing-container-volume", severity: "warning", message: "Chybí nádoba/objem." });
        }
        if (!waste.known || !frequency.known || !container.known) {
          issues.push({ type: "item-not-collection-mappable", severity: "warning", message: "Položka není mapovatelná na svoz." });
        }
      }

      mappedRows.push({
        rowNumber: mappedRows.length + 1,
        sourceEntity: "ContractRow",
        sourceId: `Contract:${contractId}:ContractRow:${cleanString(contractRow?.Id)}`,
        sourceContractId: contractId,
        sourceCustomerId,
        sourceSiteId,
        contractId,
        contractRowId: cleanString(contractRow?.Id),
        productId,
        contractNumber: cleanString(contract?.ContractNumber),
        validFrom: isoDateValue(contract?.StartDate),
        validTo: isoDateValue(contract?.EndDate),
        customerName,
        branchName,
        addressRaw,
        siteName,
        wasteType: waste.wasteType,
        wasteCode: waste.wasteCode,
        frequency: frequency.frequency,
        containerVolume: container.volume,
        containerCount: container.count,
        containerType: container.type,
        productName: firstNonEmpty(product?.Caption, product?.Name, contractRow?.Name),
        rowName: cleanString(contractRow?.Name),
        note: cleanString(contractRow?.Description),
        mappingStatus: issues.length ? "needs_review" : "mapped",
        rowKey: `vistos-contract-${contractId}-row-${cleanString(contractRow?.Id) || productId || mappedRows.length + 1}`,
        siteKey: vistosSiteKey(contract),
        locationQuality: sourceSiteId ? "vistos_unverified" : "missing",
        latitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Lat),
        longitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Long),
        unitPrice: numericValue(product?.ListPrice || product?.CostPrice || product?.WeightedCostPrice || product?.DiscountPrice, 0),
        issues
      });
    }
  }

  const siteKeysByAddress = new Map();
  for (const row of mappedRows) {
    const addressKey = normalizeLookupKey(row.addressRaw || row.siteName);
    if (!addressKey || !row.siteKey) {
      continue;
    }
    if (!siteKeysByAddress.has(addressKey)) {
      siteKeysByAddress.set(addressKey, new Set());
    }
    siteKeysByAddress.get(addressKey).add(row.siteKey);
  }
  const duplicateAddressKeys = new Set(Array.from(siteKeysByAddress.entries())
    .filter(([, siteKeys]) => siteKeys.size > 1)
    .map(([addressKey]) => addressKey));
  for (const row of mappedRows) {
    const addressKey = normalizeLookupKey(row.addressRaw || row.siteName);
    if (duplicateAddressKeys.has(addressKey)) {
      row.issues.push({ type: "possible-site-duplicate", severity: "info", message: "Možná duplicita stanoviště se stejnou adresou a jiným Vistos ID." });
    }
  }

  const uniqueSites = new Set(mappedRows.map((row) => row.siteKey).filter(Boolean));
  const uniqueCustomers = new Set(mappedRows.map((row) => row.sourceCustomerId || normalizeLookupKey(row.customerName)).filter(Boolean));
  const containerCount = mappedRows.reduce((sum, row) => sum + (row.containerVolume ? row.containerCount : 0), 0);
  const issueCount = mappedRows.reduce((sum, row) => sum + row.issues.length, 0);
  const itemCount = mappedRows.filter((row) => row.sourceEntity === "ContractRow").length;
  const previewRows = mappedRows.slice(0, 10).map((row) => ({
    rowNumber: row.rowNumber,
    customerName: row.customerName,
    addressRaw: row.addressRaw,
    siteName: row.siteName,
    wasteType: row.wasteType,
    wasteCode: row.wasteCode,
    frequency: row.frequency,
    containerVolume: row.containerVolume,
    containerCount: row.containerCount,
    contractNumber: row.contractNumber,
    mappingStatus: row.mappingStatus,
    issueCount: row.issues.length
  }));

  const contractPreviewRows = mappedRows.slice(0, 50).map((row) => ({
    contractId: row.contractId,
    contractNumber: row.contractNumber,
    validFrom: row.validFrom,
    validTo: row.validTo,
    customerName: row.customerName,
    branchName: row.branchName,
    siteName: row.siteName,
    sourceEntity: row.sourceEntity,
    productName: row.productName,
    mappingStatus: row.mappingStatus,
    issueCount: row.issues.length
  }));
  const sitePreviewRows = [...uniqueSites].slice(0, 50).map((siteKey) => {
    const row = mappedRows.find((item) => item.siteKey === siteKey) || {};
    return {
      siteKey,
      customerName: row.customerName,
      siteName: row.siteName,
      addressRaw: row.addressRaw,
      locationQuality: row.locationQuality,
      itemCount: siteCounts.get(siteKey) || 0
    };
  });
  const issuePreviewRows = mappedRows
    .flatMap((row) => row.issues.map((issue) => ({
      contractNumber: row.contractNumber,
      siteName: row.siteName,
      issueType: issue.type,
      severity: issue.severity,
      message: issue.message
    })))
    .slice(0, 80);

  return {
    filename: "vistos-komunal-preview.json",
    contentType: "application/json",
    rows: mappedRows,
    summary: {
      status: "preview",
      message: VISTOS_KOMUNAL_MESSAGE,
      rowCount: mappedRows.length,
      contractCount: contracts.length,
      customerCount: uniqueCustomers.size,
      itemCount,
      siteCount: uniqueSites.size,
      containerCount,
      issueCount,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    previewRows,
    contractPreviewRows,
    sitePreviewRows,
    issuePreviewRows,
    metadata: {
      filter: VISTOS_KOMUNAL_CONTRACT_FILTER,
      vistosTotals: totals,
      mappingStats: {
        contracts: contracts.length,
        contractRows: contractRows.length,
        products: products.length,
        mappedItems: itemCount,
        sites: uniqueSites.size,
        issues: issueCount
      }
    }
  };
}

function mappedManualRow(rawRow, rowNumber) {
  const customerName = readMappedField(rawRow, "customerName");
  const addressRaw = readMappedField(rawRow, "addressRaw");
  const siteName = readMappedField(rawRow, "siteName");
  const rawWasteType = readMappedField(rawRow, "wasteType");
  const rawWasteCode = readMappedField(rawRow, "wasteCode");
  const rawFrequency = readMappedField(rawRow, "frequency");
  const rawVolume = readMappedField(rawRow, "containerVolume");
  const rawCount = readMappedField(rawRow, "containerCount");
  const waste = normalizeWaste(rawWasteType, rawWasteCode);
  const frequency = normalizeFrequency(rawFrequency);
  const container = normalizeContainerVolume(rawVolume);
  const issues = [];

  if (!customerName) {
    issues.push({ type: "missing-customer", severity: "error", message: "Chybí zákazník." });
  }
  if (!addressRaw) {
    issues.push({ type: "missing-address", severity: "error", message: "Chybí adresa." });
  }
  if (!waste.known) {
    issues.push({ type: "unknown-waste-type", severity: "warning", message: "Neznámý typ odpadu." });
  }
  if (!frequency.known) {
    issues.push({ type: "unknown-frequency", severity: "warning", message: "Neznámá četnost." });
  }
  if (!container.known) {
    issues.push({ type: "unknown-container-volume", severity: "warning", message: "Neznámý objem nádoby." });
  }
  if (!addressRaw || normalizeLookupKey(addressRaw).length < 8) {
    issues.push({ type: "unclear-location", severity: "warning", message: "Nejasná poloha." });
  }

  return {
    rowNumber,
    customerName,
    addressRaw,
    siteName,
    wasteType: waste.wasteType,
    wasteCode: waste.wasteCode,
    frequency: frequency.frequency,
    containerVolume: container.volume,
    containerCount: normalizeContainerCount(rawCount),
    note: readMappedField(rawRow, "note"),
    contact: readMappedField(rawRow, "contact"),
    phone: readMappedField(rawRow, "phone"),
    email: readMappedField(rawRow, "email"),
    issues,
    rowKey: normalizeLookupKey(`${customerName}|${addressRaw}|${waste.wasteType}|${frequency.frequency}|${container.volume}`),
    siteKey: normalizeLookupKey(`${customerName}|${siteName}|${addressRaw}`)
  };
}

function buildCollectionRoutesImportPreviewFromRows(sourceRows, { filename = "", contentType = "", message = MANUAL_IMPORT_MESSAGE } = {}) {
  if (sourceRows.length > 1000) {
    throw new CollectionRoutesStoreError("Import preview může mít maximálně 1000 řádků.", 400, "collection_routes_manual_import_too_many_rows");
  }
  const mappedRows = sourceRows.map((row, index) => mappedManualRow(row, index + 1));
  const rowKeys = new Map();
  const siteKeys = new Map();

  for (const row of mappedRows) {
    if (row.rowKey) {
      rowKeys.set(row.rowKey, (rowKeys.get(row.rowKey) || 0) + 1);
    }
    if (row.siteKey) {
      siteKeys.set(row.siteKey, (siteKeys.get(row.siteKey) || 0) + 1);
    }
  }

  for (const row of mappedRows) {
    if (row.rowKey && rowKeys.get(row.rowKey) > 1) {
      row.issues.push({ type: "duplicate-row", severity: "warning", message: "Duplicita řádku." });
    }
    if (row.siteKey && siteKeys.get(row.siteKey) > 1) {
      row.issues.push({ type: "possible-site-duplicate", severity: "info", message: "Možná duplicita stanoviště." });
    }
  }

  const uniqueCustomers = new Set(mappedRows.map((row) => normalizeLookupKey(row.customerName)).filter(Boolean));
  const uniqueSites = new Set(mappedRows.map((row) => row.siteKey).filter(Boolean));
  const containerCount = mappedRows.reduce((sum, row) => sum + (row.containerVolume ? row.containerCount : 0), 0);
  const issueCount = mappedRows.reduce((sum, row) => sum + row.issues.length, 0);
  const previewRows = mappedRows.slice(0, 10).map((row) => ({
    rowNumber: row.rowNumber,
    customerName: row.customerName,
    addressRaw: row.addressRaw,
    siteName: row.siteName,
    wasteType: row.wasteType,
    wasteCode: row.wasteCode,
    frequency: row.frequency,
    containerVolume: row.containerVolume,
    containerCount: row.containerCount,
    note: row.note,
    issueCount: row.issues.length
  }));

  return {
    filename: cleanString(filename),
    contentType: cleanString(contentType),
    rows: mappedRows,
    summary: {
      status: "preview",
      message,
      rowCount: mappedRows.length,
      customerCount: uniqueCustomers.size,
      siteCount: uniqueSites.size,
      containerCount,
      issueCount,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    previewRows
  };
}

export function buildCollectionRoutesManualImportPreview({ text, filename = "", contentType = "" }) {
  const sourceRows = parseManualImportRows({ text, filename });
  return buildCollectionRoutesImportPreviewFromRows(sourceRows, {
    filename,
    contentType,
    message: MANUAL_IMPORT_MESSAGE
  });
}

function siteLocationQuality(row) {
  if (row.locationQuality) {
    return row.locationQuality;
  }
  return row.issues.some((issue) => issue.type === "missing-address" || issue.type === "unclear-location")
    ? "missing"
    : "approximate";
}

function manualRowSummary(row) {
  return {
    sourceEntity: row.sourceEntity || "",
    sourceId: row.sourceId || "",
    contractId: row.contractId || "",
    contractRowId: row.contractRowId || "",
    contractNumber: row.contractNumber || "",
    validFrom: row.validFrom || "",
    validTo: row.validTo || "",
    customerName: row.customerName,
    branchName: row.branchName || "",
    addressRaw: row.addressRaw,
    siteName: row.siteName,
    productId: row.productId || "",
    productName: row.productName || "",
    rowName: row.rowName || "",
    wasteType: row.wasteType,
    wasteCode: row.wasteCode,
    frequency: row.frequency,
    containerVolume: row.containerVolume,
    containerCount: row.containerCount,
    containerType: row.containerType || "",
    unitPrice: row.unitPrice || 0,
    mappingStatus: row.mappingStatus || "",
    note: row.note,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    createsOperationalRoutes: false
  };
}

async function persistCollectionRoutesImportPreview(env, user, preview, {
  phase,
  mode,
  source,
  sourceMode,
  siteSourceSystem,
  sourceEntity,
  locationSource,
  locationNote,
  message,
  metadata = {}
}) {
  const db = collectionRoutesDatabase(env, true);
  const createdAt = nowIso();
  const batchId = randomId("collection-import-batch");
  const siteIds = new Map();
  const metadataJson = {
    phase,
    mode,
    source,
    filename: preview.filename,
    contentType: preview.contentType,
    customerCount: preview.summary.customerCount,
    siteCount: preview.summary.siteCount,
    containerCount: preview.summary.containerCount,
    previewRows: preview.previewRows,
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    ...(preview.metadata || {}),
    ...metadata
  };

  try {
    await db
      .prepare(`
        INSERT INTO collection_import_batches (
          id,
          source,
          source_mode,
          status,
          api_status,
          message,
          row_count,
          issue_count,
          created_by_user_id,
          created_at,
          finished_at,
          metadata_json
        )
        VALUES (?, ?, ?, 'preview', 'ready', ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        batchId,
        source,
        sourceMode,
        message,
        preview.summary.rowCount,
        preview.summary.issueCount,
        cleanString(user?.id),
        createdAt,
        createdAt,
        jsonString(metadataJson)
      )
      .run();

    for (const row of preview.rows) {
      const rowId = randomId("collection-import-row");
      const importSourceId = cleanString(row.sourceId) || row.rowKey || `manual-row-${row.rowNumber}`;
      let siteId = "";

      if (row.siteKey && !siteIds.has(row.siteKey)) {
        siteId = randomId("collection-site");
        siteIds.set(row.siteKey, siteId);
        const locationQuality = siteLocationQuality(row);
        const latitude = nullableNumericValue(row.latitude);
        const longitude = nullableNumericValue(row.longitude);

        await db
          .prepare(`
            INSERT INTO collection_customer_sites (
              id,
              source_system,
              source_customer_id,
              source_site_id,
              customer_name,
              site_name,
              address_text,
              status,
              active,
              location_quality,
              last_import_batch_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'preview', 1, ?, ?, ?, ?)
          `)
          .bind(
            siteId,
            siteSourceSystem,
            cleanString(row.sourceCustomerId) || normalizeLookupKey(row.customerName),
            cleanString(row.sourceSiteId) || row.siteKey,
            row.customerName,
            row.siteName,
            row.addressRaw,
            locationQuality,
            batchId,
            createdAt,
            createdAt
          )
          .run();

        await db
          .prepare(`
            INSERT INTO collection_site_locations (
              id,
              site_id,
              latitude,
              longitude,
              quality,
              status,
              source,
              note,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'needs-review', ?, ?, ?, ?)
          `)
          .bind(
            randomId("collection-site-location"),
            siteId,
            latitude,
            longitude,
            locationQuality,
            locationSource,
            locationNote,
            createdAt,
            createdAt
          )
          .run();
      } else {
        siteId = siteIds.get(row.siteKey) || "";
      }

      await db
        .prepare(`
          INSERT INTO collection_import_rows (
            id,
            batch_id,
            row_number,
            source_entity,
            source_id,
            status,
            summary_json,
            issues_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, 'preview', ?, ?, ?)
        `)
        .bind(
          rowId,
          batchId,
          row.rowNumber,
          row.sourceEntity || sourceEntity,
          importSourceId,
          jsonString(manualRowSummary(row)),
          jsonString(row.issues),
          createdAt
        )
        .run();

      let serviceId = null;
      if (siteId && row.wasteType) {
        serviceId = randomId("collection-service");
        await db
          .prepare(`
            INSERT INTO collection_contract_services (
              id,
              site_id,
              source_contract_id,
              waste_type,
              waste_code,
              frequency_code,
              stable_pattern,
              valid_from,
              valid_to,
              status,
              last_import_batch_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 'preview', ?, ?, ?)
          `)
          .bind(
            serviceId,
            siteId,
            cleanString(row.sourceContractId) || cleanString(row.contractId) || importSourceId,
            row.wasteType,
            row.wasteCode,
            row.frequency,
            row.validFrom || null,
            row.validTo || null,
            batchId,
            createdAt,
            createdAt
          )
          .run();
      }

      if (siteId && row.containerVolume) {
        await db
          .prepare(`
            INSERT INTO collection_containers (
              id,
              site_id,
              service_id,
              container_type,
              volume_liters,
              quantity,
              waste_type,
              status,
              last_import_batch_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'preview', ?, ?, ?)
          `)
          .bind(
            randomId("collection-container"),
            siteId,
            serviceId,
            cleanString(row.containerType) || "container",
            row.containerVolume,
            row.containerCount,
            row.wasteType,
            batchId,
            createdAt,
            createdAt
          )
          .run();
      }

      for (const issue of row.issues) {
        await db
          .prepare(`
            INSERT INTO collection_data_issues (
              id,
              batch_id,
              site_id,
              issue_type,
              severity,
              message,
              status,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
          `)
          .bind(
            randomId("collection-data-issue"),
            batchId,
            siteId || null,
            issue.type,
            issue.severity,
            issue.message,
            createdAt
          )
          .run();
      }
    }

    const { batch } = await getCollectionImportBatch(env, batchId);
    return {
      batch,
      summary: preview.summary,
      previewRows: preview.previewRows,
      apiStatus: "ready"
    };
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError) {
      throw error;
    }
    throw collectionRoutesDbError(error);
  }
}

export async function createCollectionRoutesManualImportPreview(env, user, { text, filename = "", contentType = "" } = {}) {
  const preview = buildCollectionRoutesManualImportPreview({ text, filename, contentType });
  return persistCollectionRoutesImportPreview(env, user, preview, {
    phase: MANUAL_IMPORT_PHASE,
    mode: "manual-import-preview",
    source: "manual-upload",
    sourceMode: "manual-import-preview",
    siteSourceSystem: "manual-upload",
    sourceEntity: "manual-upload-row",
    locationSource: "manual-import-preview",
    locationNote: "Ruční import preview bez geokódování.",
    message: MANUAL_IMPORT_MESSAGE
  });
}

async function loadVistosKommunalPreviewData(env) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      configured: false,
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      apiStatus: "not_configured"
    };
  }

  const session = await loginVistosExecute(env);
  const [contractsPage, contractRowsPage, productsPage] = await Promise.all([
    getAllVistosPages(env, session, "Contract", VISTOS_CONTRACT_COLUMNS, VISTOS_KOMUNAL_CONTRACT_FILTER),
    getAllVistosPages(env, session, "ContractRow", VISTOS_CONTRACT_ROW_COLUMNS, null),
    getAllVistosPages(env, session, "Product", VISTOS_PRODUCT_COLUMNS, null, { maxPages: 10 })
  ]);
  const today = new Date();
  const activeContracts = contractsPage.rows.filter((contract) => dateInActiveRange(contract?.StartDate, contract?.EndDate, today));
  const contractIds = new Set(activeContracts.map((contract) => cleanString(contract?.Id)).filter(Boolean));
  const relevantContractRows = contractRowsPage.rows.filter((row) => (
    contractIds.has(cleanString(row?.Contract_FK_RecordId || row?.Contract_FK))
  ));
  const productIds = new Set(relevantContractRows.map((row) => cleanString(row?.Product_FK_RecordId || row?.Product_FK)).filter(Boolean));
  const relevantProducts = productsPage.rows.filter((product) => productIds.has(cleanString(product?.Id)));

  return {
    configured: true,
    apiStatus: "ready",
    preview: buildVistosKommunalPreview({
      contracts: activeContracts,
      contractRows: relevantContractRows,
      products: relevantProducts,
      totals: {
        contracts: {
          total: contractsPage.total,
          filtered: contractsPage.filtered,
          loaded: contractsPage.rows.length,
          dateValid: activeContracts.length,
          dateExcluded: Math.max(0, contractsPage.rows.length - activeContracts.length),
          capped: contractsPage.capped
        },
        contractRows: {
          total: contractRowsPage.total,
          filtered: contractRowsPage.filtered,
          loaded: contractRowsPage.rows.length,
          relevant: relevantContractRows.length,
          capped: contractRowsPage.capped
        },
        products: {
          total: productsPage.total,
          filtered: productsPage.filtered,
          loaded: productsPage.rows.length,
          relevant: relevantProducts.length,
          capped: productsPage.capped
        }
      }
    })
  };
}

export async function createCollectionRoutesVistosKommunalPreview(env, user) {
  let loaded;
  try {
    loaded = await loadVistosKommunalPreviewData(env);
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError && error.code?.startsWith("vistos_api")) {
      return createCollectionRoutesStatusBatch(env, user, {
        status: "waiting_mapping",
        apiStatus: error.code === "vistos_api_not_configured" ? "not_configured" : "waiting",
        message: error.message,
        issueType: "vistos-komunal-preview",
        severity: "warning",
        phase: VISTOS_KOMUNAL_PHASE,
        mode: "vistos-komunal-preview",
        source: "vistos",
        sourceMode: "vistos-komunal-preview",
        metadata: {
          filter: VISTOS_KOMUNAL_CONTRACT_FILTER
        }
      });
    }
    throw error;
  }

  if (!loaded.configured) {
    return createCollectionRoutesStatusBatch(env, user, {
      status: "waiting_configuration",
      apiStatus: loaded.apiStatus,
      message: loaded.message,
      issueType: "vistos-api",
      severity: "warning",
      phase: VISTOS_KOMUNAL_PHASE,
      mode: "vistos-komunal-preview",
      source: "vistos",
      sourceMode: "vistos-komunal-preview",
      metadata: {
        filter: VISTOS_KOMUNAL_CONTRACT_FILTER,
        hint: "Nastavte VISTOS_API_BASE_URL, VISTOS_API_USERNAME a VISTOS_API_PASSWORD v Cloudflare secrets."
      }
    });
  }

  if (!loaded.preview.summary.contractCount) {
    return createCollectionRoutesStatusBatch(env, user, {
      status: "waiting_mapping",
      apiStatus: "waiting",
      message: "Vistos Komunál preview nenašlo žádné aktivní Komunál smlouvy.",
      issueType: "vistos-komunal-preview",
      severity: "info",
      phase: VISTOS_KOMUNAL_PHASE,
      mode: "vistos-komunal-preview",
      source: "vistos",
      sourceMode: "vistos-komunal-preview",
      metadata: {
        filter: VISTOS_KOMUNAL_CONTRACT_FILTER
      }
    });
  }

  return persistCollectionRoutesImportPreview(env, user, loaded.preview, {
    phase: VISTOS_KOMUNAL_PHASE,
    mode: "vistos-komunal-preview",
    source: "vistos",
    sourceMode: "vistos-komunal-preview",
    siteSourceSystem: "vistos",
    sourceEntity: "vistos-contract-row",
    locationSource: "vistos-komunal-preview",
    locationNote: "Vistos Komunál preview bez Google geokódování.",
    message: VISTOS_KOMUNAL_MESSAGE,
    metadata: {
      filter: VISTOS_KOMUNAL_CONTRACT_FILTER
    }
  });
}

export function collectionRoutesDbError(error) {
  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return new CollectionRoutesStoreError(
      "Pilotní tabulky Tras svozu nejsou v D1 připravené. Spusťte aditivní migraci Fáze 1A.",
      503,
      "collection_routes_migration_missing"
    );
  }

  console.error("collection_routes.store_failed", { message });
  return new CollectionRoutesStoreError(
    "Pilot Tras svozu se teď nepodařilo načíst nebo auditovat.",
    500,
    "collection_routes_store_failed"
  );
}

function rowToBatch(row) {
  return {
    id: cleanString(row?.id),
    source: cleanString(row?.source),
    sourceMode: cleanString(row?.source_mode),
    status: cleanString(row?.status),
    apiStatus: cleanString(row?.api_status),
    message: cleanString(row?.message),
    rowCount: numericValue(row?.row_count),
    issueCount: numericValue(row?.issue_count),
    createdByUserId: cleanString(row?.created_by_user_id),
    createdAt: cleanString(row?.created_at),
    finishedAt: cleanString(row?.finished_at),
    metadata: parseJson(row?.metadata_json, {})
  };
}

function rowToImportRow(row) {
  return {
    id: cleanString(row?.id),
    batchId: cleanString(row?.batch_id),
    rowNumber: numericValue(row?.row_number),
    sourceEntity: cleanString(row?.source_entity),
    sourceId: cleanString(row?.source_id),
    status: cleanString(row?.status),
    summary: parseJson(row?.summary_json, {}),
    issues: parseJson(row?.issues_json, []),
    createdAt: cleanString(row?.created_at)
  };
}

function rowToSite(row) {
  return {
    id: cleanString(row?.id),
    sourceSystem: cleanString(row?.source_system),
    sourceCustomerId: cleanString(row?.source_customer_id),
    sourceSiteId: cleanString(row?.source_site_id),
    customerName: cleanString(row?.customer_name),
    siteName: cleanString(row?.site_name),
    addressText: cleanString(row?.address_text),
    city: cleanString(row?.city),
    postalCode: cleanString(row?.postal_code),
    status: cleanString(row?.status),
    active: booleanValue(row?.active, true),
    locationQuality: cleanString(row?.location_quality || row?.location_quality_location || "missing"),
    lastImportBatchId: cleanString(row?.last_import_batch_id),
    createdAt: cleanString(row?.created_at),
    updatedAt: cleanString(row?.updated_at),
    location: row?.location_id ? {
      id: cleanString(row.location_id),
      latitude: row.latitude === null || row.latitude === undefined ? null : numericValue(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : numericValue(row.longitude),
      quality: cleanString(row.location_quality_location),
      status: cleanString(row.location_status),
      source: cleanString(row.location_source),
      note: cleanString(row.location_note),
      confirmedAt: cleanString(row.confirmed_at)
    } : null
  };
}

function rowToService(row) {
  return {
    id: cleanString(row?.id),
    siteId: cleanString(row?.site_id),
    sourceContractId: cleanString(row?.source_contract_id),
    wasteType: cleanString(row?.waste_type),
    wasteCode: cleanString(row?.waste_code),
    frequencyCode: cleanString(row?.frequency_code),
    stablePattern: cleanString(row?.stable_pattern),
    validFrom: cleanString(row?.valid_from),
    validTo: cleanString(row?.valid_to),
    status: cleanString(row?.status)
  };
}

function rowToContainer(row) {
  return {
    id: cleanString(row?.id),
    siteId: cleanString(row?.site_id),
    serviceId: cleanString(row?.service_id),
    containerType: cleanString(row?.container_type),
    volumeLiters: numericValue(row?.volume_liters),
    quantity: numericValue(row?.quantity),
    wasteType: cleanString(row?.waste_type),
    status: cleanString(row?.status)
  };
}

function rowToIssue(row) {
  return {
    id: cleanString(row?.id),
    batchId: cleanString(row?.batch_id),
    siteId: cleanString(row?.site_id),
    issueType: cleanString(row?.issue_type),
    severity: cleanString(row?.severity),
    message: cleanString(row?.message),
    status: cleanString(row?.status),
    createdAt: cleanString(row?.created_at),
    resolvedAt: cleanString(row?.resolved_at)
  };
}

export async function listCollectionImportBatches(env, limit = 20) {
  const db = collectionRoutesDatabase(env, true);
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM collection_import_batches
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(Math.max(1, Math.min(Number(limit) || 20, 100)))
      .all();
    return (result.results || []).map(rowToBatch);
  } catch (error) {
    throw collectionRoutesDbError(error);
  }
}

export async function getCollectionImportBatch(env, id) {
  const db = collectionRoutesDatabase(env, true);
  const batchId = cleanString(id);
  try {
    const batchRow = await db
      .prepare("SELECT * FROM collection_import_batches WHERE id = ? LIMIT 1")
      .bind(batchId)
      .first();

    if (!batchRow) {
      throw new CollectionRoutesStoreError("Importní batch nebyl nalezen.", 404, "collection_routes_batch_not_found");
    }

    const rowsResult = await db
      .prepare(`
        SELECT *
        FROM collection_import_rows
        WHERE batch_id = ?
        ORDER BY row_number ASC
        LIMIT 500
      `)
      .bind(batchId)
      .all();

    return {
      batch: rowToBatch(batchRow),
      rows: (rowsResult.results || []).map(rowToImportRow)
    };
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError) {
      throw error;
    }
    throw collectionRoutesDbError(error);
  }
}

export async function listCollectionImportRows(env, batchId, limit = 500) {
  const db = collectionRoutesDatabase(env, true);
  const id = cleanString(batchId);
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM collection_import_rows
        WHERE batch_id = ?
        ORDER BY row_number ASC
        LIMIT ?
      `)
      .bind(id, Math.max(1, Math.min(Number(limit) || 500, 1000)))
      .all();
    return (result.results || []).map(rowToImportRow);
  } catch (error) {
    throw collectionRoutesDbError(error);
  }
}

export async function listCollectionImportIssues(env, batchId, limit = 500) {
  const db = collectionRoutesDatabase(env, true);
  const id = cleanString(batchId);
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM collection_data_issues
        WHERE batch_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(id, Math.max(1, Math.min(Number(limit) || 500, 1000)))
      .all();
    return (result.results || []).map(rowToIssue);
  } catch (error) {
    throw collectionRoutesDbError(error);
  }
}

export async function listCollectionSites(env, limit = 100) {
  const db = collectionRoutesDatabase(env, true);
  try {
    const result = await db
      .prepare(`
        SELECT
          s.*,
          l.id AS location_id,
          l.latitude,
          l.longitude,
          l.quality AS location_quality_location,
          l.status AS location_status,
          l.source AS location_source,
          l.note AS location_note,
          l.confirmed_at
        FROM collection_customer_sites s
        LEFT JOIN collection_site_locations l ON l.site_id = s.id
        ORDER BY s.updated_at DESC
        LIMIT ?
      `)
      .bind(Math.max(1, Math.min(Number(limit) || 100, 500)))
      .all();
    return (result.results || []).map(rowToSite);
  } catch (error) {
    throw collectionRoutesDbError(error);
  }
}

export async function getCollectionSite(env, id) {
  const db = collectionRoutesDatabase(env, true);
  const siteId = cleanString(id);
  try {
    const siteRow = await db
      .prepare(`
        SELECT
          s.*,
          l.id AS location_id,
          l.latitude,
          l.longitude,
          l.quality AS location_quality_location,
          l.status AS location_status,
          l.source AS location_source,
          l.note AS location_note,
          l.confirmed_at
        FROM collection_customer_sites s
        LEFT JOIN collection_site_locations l ON l.site_id = s.id
        WHERE s.id = ?
        LIMIT 1
      `)
      .bind(siteId)
      .first();

    if (!siteRow) {
      throw new CollectionRoutesStoreError("Stanoviště nebylo nalezeno.", 404, "collection_routes_site_not_found");
    }

    const [servicesResult, containersResult, issuesResult] = await Promise.all([
      db.prepare("SELECT * FROM collection_contract_services WHERE site_id = ? ORDER BY waste_type, waste_code").bind(siteId).all(),
      db.prepare("SELECT * FROM collection_containers WHERE site_id = ? ORDER BY waste_type, volume_liters").bind(siteId).all(),
      db.prepare("SELECT * FROM collection_data_issues WHERE site_id = ? ORDER BY created_at DESC LIMIT 100").bind(siteId).all()
    ]);

    return {
      site: rowToSite(siteRow),
      services: (servicesResult.results || []).map(rowToService),
      containers: (containersResult.results || []).map(rowToContainer),
      issues: (issuesResult.results || []).map(rowToIssue)
    };
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError) {
      throw error;
    }
    throw collectionRoutesDbError(error);
  }
}

export async function listCollectionLocationIssues(env, limit = 100) {
  const db = collectionRoutesDatabase(env, true);
  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM collection_data_issues
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(Math.max(1, Math.min(Number(limit) || 100, 500)))
      .all();
    return (result.results || []).map(rowToIssue);
  } catch (error) {
    throw collectionRoutesDbError(error);
  }
}

async function createCollectionRoutesStatusBatch(env, user, {
  status,
  apiStatus,
  message,
  issueType = "vistos-api",
  severity = "warning",
  phase = VISTOS_DISCOVERY_PHASE,
  mode = "vistos-api-discovery",
  source = "vistos-api-discovery",
  sourceMode = "api-discovery",
  metadata = {},
  issues = []
}) {
  const db = collectionRoutesDatabase(env, true);
  const createdAt = nowIso();
  const batchId = randomId("collection-import-batch");
  const safeIssues = issues.length ? issues : [{ issueType, severity, message }];
  const executeMode = sourceMode === "vistos-komunal-preview";
  const metadataJson = {
    phase,
    mode,
    source,
    vistosConfigured: executeMode ? isVistosExecuteConfigured(env) : isVistosApiConfigured(env),
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    ...metadata
  };

  try {
    await db
      .prepare(`
        INSERT INTO collection_import_batches (
          id,
          source,
          source_mode,
          status,
          api_status,
          message,
          row_count,
          issue_count,
          created_by_user_id,
          created_at,
          finished_at,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `)
      .bind(
        batchId,
        source,
        sourceMode,
        status,
        apiStatus,
        message,
        safeIssues.length,
        cleanString(user?.id),
        createdAt,
        createdAt,
        jsonString(metadataJson)
      )
      .run();

    for (const issue of safeIssues) {
      await db
        .prepare(`
          INSERT INTO collection_data_issues (
            id,
            batch_id,
            issue_type,
            severity,
            message,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, 'open', ?)
        `)
        .bind(
          randomId("collection-data-issue"),
          batchId,
          cleanString(issue.issueType || issueType),
          cleanString(issue.severity || severity),
          cleanString(issue.message || message),
          createdAt
        )
        .run();
    }

    const { batch } = await getCollectionImportBatch(env, batchId);
    return {
      batch,
      summary: {
        status: batch.status,
        message,
        rowCount: 0,
        issueCount: safeIssues.length,
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      },
      apiStatus
    };
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError) {
      throw error;
    }
    throw collectionRoutesDbError(error);
  }
}

async function loadVistosCollectionRows(env) {
  if (!isVistosApiConfigured(env)) {
    return {
      configured: false,
      rows: [],
      endpoints: [],
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      apiStatus: "not_configured"
    };
  }

  const paths = vistosDiscoveryPaths(env);
  const endpoints = [];
  const rows = [];
  for (const path of paths) {
    const result = await fetchVistosJson(env, path);
    endpoints.push({
      path,
      ok: result.ok,
      status: result.status,
      rowCount: result.rowCount,
      message: result.message
    });
    if (result.ok && Array.isArray(result.rows)) {
      rows.push(...result.rows);
    }
    if (rows.length >= COLLECTION_ROUTES_VISTOS_MAX_ROWS) {
      break;
    }
  }

  return {
    configured: true,
    rows: rows.slice(0, COLLECTION_ROUTES_VISTOS_MAX_ROWS),
    endpoints,
    message: rows.length
      ? VISTOS_DISCOVERY_MESSAGE
      : "Vistos API discovery nevrátilo žádné mapovatelné řádky.",
    apiStatus: rows.length ? "ready" : "waiting"
  };
}

export async function createCollectionRoutesImportPreview(env, user) {
  const discovery = await loadVistosCollectionRows(env);

  if (!discovery.configured) {
    return createCollectionRoutesStatusBatch(env, user, {
      status: "waiting_configuration",
      apiStatus: "not_configured",
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      issueType: "vistos-api",
      severity: "warning",
      metadata: {
        endpoints: [],
        hint: "Nastavte VISTOS_API_BASE_URL a autentizační secret v Cloudflare."
      }
    });
  }

  if (!discovery.rows.length) {
    const failedEndpoints = discovery.endpoints.filter((endpoint) => !endpoint.ok);
    return createCollectionRoutesStatusBatch(env, user, {
      status: "waiting_mapping",
      apiStatus: "waiting",
      message: discovery.message,
      issueType: "vistos-api-discovery",
      severity: failedEndpoints.length ? "warning" : "info",
      metadata: {
        endpoints: discovery.endpoints
      },
      issues: (failedEndpoints.length ? failedEndpoints : [{ message: discovery.message, severity: "info" }])
        .map((endpoint) => ({
          issueType: "vistos-api-discovery",
          severity: endpoint.severity || "warning",
          message: endpoint.path
            ? `${endpoint.path}: ${endpoint.message}`
            : endpoint.message
        }))
    });
  }

  const preview = buildCollectionRoutesImportPreviewFromRows(discovery.rows, {
    filename: "vistos-api-discovery.json",
    contentType: "application/json",
    message: VISTOS_DISCOVERY_MESSAGE
  });

  return persistCollectionRoutesImportPreview(env, user, preview, {
    phase: VISTOS_DISCOVERY_PHASE,
    mode: "vistos-api-discovery",
    source: "vistos",
    sourceMode: "api-discovery",
    siteSourceSystem: "vistos",
    sourceEntity: "vistos-api-row",
    locationSource: "vistos-api-discovery",
    locationNote: "Vistos API discovery bez geokódování.",
    message: VISTOS_DISCOVERY_MESSAGE,
    metadata: {
      endpoints: discovery.endpoints,
      cappedAtRows: COLLECTION_ROUTES_VISTOS_MAX_ROWS
    }
  });
}
