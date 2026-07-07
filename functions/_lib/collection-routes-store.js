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
const VISTOS_KOMUNAL_PERSIST_ROWS_LIMIT = 10000;
const VISTOS_KOMUNAL_CONTRACT_FILTER = {
  Status_FK: 74,
  Typsmlouvy_FK: [14735]
};
const VISTOS_SVOZ_KAISER_WATCHDOG_ISSUE_TYPES = new Set([
  "missing-customer",
  "missing-loading-address",
  "incomplete-address-place",
  "address-place-missing-number",
  "address-place-possible-typo",
  "address-place-loading-address-mismatch",
  "missing-contract-items",
  "unknown-product",
  "unknown-waste-type",
  "unknown-frequency",
  "missing-pickup-days",
  "pickup-day-fields-not-readable",
  "pickup-days-count-mismatch",
  "pickup-days-even-odd-mismatch",
  "pickup-days-missing-week-parity",
  "pickup-days-duplicate",
  "monthly-pickup-days-ambiguous",
  "missing-container-volume",
  "item-not-collection-mappable",
  "non-route-contract-row",
  "multiple-sites-contract",
  "possible-site-duplicate",
  "inactive-contract-range",
  "missing-contract-row-start-date",
  "inactive-contract-row-flag",
  "future-contract-row-start-date",
  "expired-contract-row-end-date",
  "invalid-contract-row-date-range"
]);
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
const VISTOS_SVOZ_KAISER_TARGET_ENTITIES = ["ContractRow", "Contract"];
const VISTOS_SVOZ_KAISER_COLUMN_CANDIDATES = [
  "SvozKaiser",
  "SvozKaiserAno",
  "Svoz_Kaiser",
  "Svoz_Kaiser_ANO",
  "c_SvozKaiser",
  "c_SvozKaiserAno",
  "IsSvozKaiser",
  "KaiserSvoz",
  "KaiserSvozAno"
];
const VISTOS_CONSISTENCY_FIELD_SPECS = [
  {
    key: "pickupDays",
    label: "Svozové dny",
    targetEntities: ["ContractRow", "Contract"],
    maxColumns: 12,
    minScore: 72,
    candidates: [
      "SvozovyDen",
      "SvozoveDny",
      "SvozovyDenSudy",
      "SvozovyDenLichy",
      "SvozovyDenSudyTyden",
      "SvozovyDenLichyTyden",
      "DenSvozu",
      "DnySvozu",
      "SvozDen",
      "SvozDny",
      "PickupDay",
      "PickupDays",
      "CollectionDay",
      "CollectionDays"
    ],
    includeGroups: [
      ["svoz", "den"],
      ["svoz", "dny"],
      ["den", "svozu"],
      ["dny", "svozu"],
      ["pickup", "day"],
      ["collection", "day"],
      ["sudy", "svoz"],
      ["lichy", "svoz"]
    ]
  },
  {
    key: "addressPlace",
    label: "Adresní místo",
    targetEntities: ["Contract", "ContractRow"],
    maxColumns: 4,
    minScore: 76,
    candidates: [
      "AdresniMisto",
      "SvozovaAdresa",
      "SvozoveMisto",
      "Stanoviste",
      "Nakladkovaadresa_FK",
      "LoadingAddress",
      "PickupAddress",
      "AddressPlace"
    ],
    includeGroups: [
      ["adresni", "misto"],
      ["svozova", "adresa"],
      ["svozove", "misto"],
      ["nakladkova", "adresa"],
      ["pickup", "address"],
      ["address", "place"]
    ]
  },
  {
    key: "pickupFrom",
    label: "Svoz od",
    targetEntities: ["ContractRow", "Contract"],
    maxColumns: 3,
    minScore: 75,
    candidates: ["SvozOd", "PickupFrom", "CollectionFrom", "ServiceFrom"],
    includeGroups: [
      ["svoz", "od"],
      ["pickup", "from"],
      ["collection", "from"],
      ["service", "from"]
    ]
  },
  {
    key: "pickupTo",
    label: "Svoz do",
    targetEntities: ["ContractRow", "Contract"],
    maxColumns: 3,
    minScore: 75,
    candidates: ["SvozDo", "PickupTo", "CollectionTo", "ServiceTo"],
    includeGroups: [
      ["svoz", "do"],
      ["pickup", "to"],
      ["collection", "to"],
      ["service", "to"]
    ]
  }
];
const VISTOS_METADATA_DB_OBJECT_COLUMNS = [
  "Id",
  "Name",
  "Caption",
  "EntityName",
  "TableName",
  "DbName",
  "Description",
  "Status_FK"
];
const VISTOS_METADATA_DB_COLUMN_ATTEMPTS = [
  {
    key: "db_column_extended_by_object_fk",
    filterField: "DbObject_FK",
    columns: [
      "Id",
      "Name",
      "Caption",
      "ColumnName",
      "DbColumnName",
      "DbObject_FK",
      "Type_FK",
      "DataType",
      "Nullable",
      "IsNullable",
      "IsReadOnly",
      "IsVisible",
      "VisibleOnGrid",
      "IsVisibleOnFilter",
      "LocalizationString",
      "ReferenceDbObject_FK"
    ]
  },
  {
    key: "db_column_core_by_object_fk",
    filterField: "DbObject_FK",
    columns: ["Id", "Name", "Caption", "ColumnName", "DbObject_FK", "Type_FK"]
  },
  {
    key: "db_column_core_by_record_id",
    filterField: "DbObject_FK_RecordId",
    columns: ["Id", "Name", "Caption", "ColumnName", "DbObject_FK", "Type_FK"]
  }
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
  ["DREVO", { wasteType: "DREVO", wasteCode: "150103" }],
  ["150103", { wasteType: "DREVO", wasteCode: "150103" }],
  ["SKLO", { wasteType: "SKLO", wasteCode: "200102" }],
  ["200102", { wasteType: "SKLO", wasteCode: "200102" }],
  ["BIO", { wasteType: "BIO", wasteCode: "200201" }],
  ["BIOODPAD", { wasteType: "BIO", wasteCode: "200108" }],
  ["200108", { wasteType: "BIO", wasteCode: "200108" }],
  ["200201", { wasteType: "BIO", wasteCode: "200201" }],
  ["SMESNE OBALY", { wasteType: "SMESNE OBALY", wasteCode: "150106" }],
  ["SMESNEOBALY", { wasteType: "SMESNE OBALY", wasteCode: "150106" }],
  ["150106", { wasteType: "SMESNE OBALY", wasteCode: "150106" }]
]);

const ALLOWED_FREQUENCIES = new Set(["1x7", "2x7", "3x7", "5x7", "1x14", "1x30"]);
const ALLOWED_CONTAINER_VOLUMES = new Set([30, 60, 80, 120, 240, 360, 660, 770, 1100, 1500, 2500, 5000]);
const ALLOWED_CONTAINER_VOLUME_PATTERN = "30|60|80|120|240|360|660|770|1100|1500|2500|5000";
const VISTOS_ROUTE_WASTE_CODES = new Set(["150101", "150102", "150106", "200102", "200108", "200139", "200201", "200301"]);
const VISTOS_COLLECTION_TEXT_ALIASES = [
  {
    text: "20 01 08 - 1 x 30 ltr GASTRO 1 x 7",
    wasteType: "BIO",
    wasteCode: "200108",
    frequency: "1x7",
    containerVolume: 30,
    containerType: "container"
  }
];
const VISTOS_NON_ROUTE_NEEDLES = [
  "DOPRAVA",
  "PREPRAVA",
  "JIZDNI VYKON",
  "PRONAJEM",
  "PORADENSTVI",
  "ISPOP",
  "CISTENI",
  "JIMKA",
  "CISTERNA",
  "LABORATOR",
  "VZOREK",
  "ODBER A PREPRAVA",
  "MANIPULACE",
  "PRIJEM ODPADU",
  "POSKYTNUTI NADOBY",
  "VELKOOBJEM",
  "SUD",
  "LAPAK",
  "LAPOL",
  "TUKOVY",
  "ODLUCOVAC",
  "OLEJ",
  "ZAOLEJ",
  "EMULZE",
  "BARVY",
  "LAKY",
  "ROZPOUSTEDL",
  "INFEKCE",
  "OBJEMNY ODPAD",
  "ODPADNI VODA",
  "ROZBOR",
  "ELEKTRO",
  "NEBEZPEC",
  "ABSORPCNI",
  "FILTRACNI",
  "KALY"
];

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

function columnsFromSchemaBody(body = {}) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  if (Array.isArray(data.Columns)) {
    return data.Columns.filter((item) => item && typeof item === "object");
  }
  if (Array.isArray(data.columns)) {
    return data.columns.filter((item) => item && typeof item === "object");
  }
  return extractVistosRows(body);
}

function compactVistosColumn(column = {}) {
  return {
    id: firstNonEmpty(column.Id, column.id),
    name: firstNonEmpty(column.ColumnName, column.DbColumnName, column.Name, column.name),
    caption: firstNonEmpty(column.LocalizationString, column.Caption, column.Description, column.Name, column.ColumnName),
    type: firstNonEmpty(column.Type_FK, column.DataType, column.Type, column.EnumType),
    nullable: column.Nullable ?? column.IsNullable ?? null,
    readOnly: column.IsReadOnly ?? null,
    visible: column.VisibleOnGrid ?? column.IsVisible ?? column.IsVisibleOnFilter ?? null,
    reference: firstNonEmpty(column.ReferenceDbObject_FK, column.ReferenceDbObject_FK_Caption),
    rawKeys: Object.keys(column || {}).slice(0, 16)
  };
}

function normalizeVistosMetadataKey(value = "") {
  return cleanString(value)
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function vistosMetadataValues(column = {}) {
  return [
    column.ColumnName,
    column.DbColumnName,
    column.Name,
    column.Caption,
    column.LocalizationString,
    column.Description
  ].map(normalizeVistosMetadataKey).filter(Boolean);
}

function vistosSvozKaiserColumnScore(column = {}) {
  const values = vistosMetadataValues(column);
  const candidateKeys = VISTOS_SVOZ_KAISER_COLUMN_CANDIDATES.map(normalizeVistosMetadataKey);

  if (values.some((value) => candidateKeys.includes(value))) {
    return 100;
  }
  if (values.some((value) => value.includes("svozkaiserano") || value.includes("kaisersvozano"))) {
    return 95;
  }
  if (values.some((value) => value.includes("svozkaiser") || value.includes("kaisersvoz"))) {
    return 90;
  }
  if (values.some((value) => value.includes("svoz") && value.includes("kaiser") && value.includes("ano"))) {
    return 85;
  }
  if (values.some((value) => value.includes("svoz") && value.includes("kaiser"))) {
    return 80;
  }
  return 0;
}

function vistosConsistencyColumnScore(column = {}, spec = {}) {
  const values = vistosMetadataValues(column);
  const candidateKeys = (spec.candidates || []).map(normalizeVistosMetadataKey).filter(Boolean);
  if (values.some((value) => candidateKeys.includes(value))) {
    return 100;
  }

  const includeGroups = Array.isArray(spec.includeGroups) ? spec.includeGroups : [];
  let best = 0;
  for (const value of values) {
    for (const group of includeGroups) {
      const keys = group.map(normalizeVistosMetadataKey).filter(Boolean);
      if (keys.length && keys.every((key) => value.includes(key))) {
        best = Math.max(best, 82 + Math.min(keys.length * 4, 12));
      }
    }
  }
  return best;
}

function compactVistosConsistencyCandidate(candidate = {}) {
  return {
    entityName: cleanString(candidate.entityName),
    columnName: cleanString(candidate.columnName),
    caption: cleanString(candidate.compact?.caption || candidate.column?.Caption || candidate.column?.Name),
    score: numericValue(candidate.score, 0),
    source: cleanString(candidate.source || candidate.method)
  };
}

function vistosDbObjectId(row = {}) {
  return firstNonEmpty(row.Id, row.DbObjectId, row.DbObject_FK_RecordId, row.RecordId);
}

function matchVistosDbObjects(rows = [], targetEntities = VISTOS_SVOZ_KAISER_TARGET_ENTITIES) {
  return targetEntities.map((entityName) => {
    const targetKey = normalizeVistosMetadataKey(entityName);
    const row = rows.find((item) => {
      const values = [
        item.Name,
        item.EntityName,
        item.Caption,
        item.TableName,
        item.DbName
      ].map(normalizeVistosMetadataKey).filter(Boolean);
      return values.includes(targetKey) || values.some((value) => value.endsWith(targetKey));
    });

    return {
      entityName,
      found: Boolean(row),
      dbObjectId: row ? vistosDbObjectId(row) : "",
      name: firstNonEmpty(row?.Name, row?.EntityName),
      caption: firstNonEmpty(row?.Caption, row?.Description),
      tableName: firstNonEmpty(row?.TableName, row?.DbName)
    };
  });
}

async function loadVistosSvozKaiserSchemaEntity(env, session, entityName) {
  try {
    const result = await fetchVistosExecute(env, "GetSchemaEntity", {
      EntityName: entityName,
      Force: false
    }, session.cookieHeader);
    const columns = columnsFromSchemaBody(result.body);
    return {
      entityName,
      method: "GetSchemaEntity",
      ok: true,
      status: result.status,
      columnCount: columns.length,
      columns,
      candidates: columns
        .map((column) => ({ column, score: vistosSvozKaiserColumnScore(column) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
    };
  } catch (error) {
    return {
      entityName,
      method: "GetSchemaEntity",
      ok: false,
      error: error?.message || "GetSchemaEntity se nepodařilo načíst.",
      code: error?.code || "vistos_schema_entity_failed",
      columnCount: 0,
      columns: [],
      candidates: []
    };
  }
}

async function loadVistosSvozKaiserDbColumns(env, session, dbObject) {
  if (!dbObject?.found || !dbObject.dbObjectId) {
    return {
      entityName: dbObject?.entityName || "",
      dbObjectId: dbObject?.dbObjectId || "",
      ok: false,
      reason: "DB_OBJECT_NOT_FOUND",
      columnCount: 0,
      columns: [],
      candidates: [],
      diagnostics: []
    };
  }

  const diagnostics = [];
  for (const attempt of VISTOS_METADATA_DB_COLUMN_ATTEMPTS) {
    try {
      const page = await getAllVistosPages(
        env,
        session,
        "DbColumn",
        attempt.columns,
        { [attempt.filterField]: dbObject.dbObjectId },
        { pageSize: 500, maxPages: 2 }
      );
      const candidates = page.rows
        .map((column) => ({ column, score: vistosSvozKaiserColumnScore(column) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8);

      return {
        entityName: dbObject.entityName,
        dbObjectId: dbObject.dbObjectId,
        method: "DbColumn",
        ok: true,
        key: attempt.key,
        filterField: attempt.filterField,
        returnedRows: page.rows.length,
        totalRows: page.total || page.rows.length,
        capped: Boolean(page.capped),
        columnCount: page.rows.length,
        columns: page.rows,
        candidates,
        diagnostics: [...diagnostics, {
          key: attempt.key,
          ok: true,
          returnedRows: page.rows.length,
          totalRows: page.total || page.rows.length,
          capped: Boolean(page.capped)
        }]
      };
    } catch (error) {
      diagnostics.push({
        key: attempt.key,
        filterField: attempt.filterField,
        ok: false,
        error: error?.message || "DbColumn se nepodařilo načíst.",
        code: error?.code || "vistos_db_column_failed"
      });
    }
  }

  return {
    entityName: dbObject.entityName,
    dbObjectId: dbObject.dbObjectId,
    method: "DbColumn",
    ok: false,
    reason: "DB_COLUMN_READ_FAILED",
    columnCount: 0,
    columns: [],
    candidates: [],
    diagnostics
  };
}

function bestVistosSvozKaiserCandidate(candidates = [], source = "") {
  const sorted = candidates
    .map((candidate) => ({
      ...candidate,
      columnName: firstNonEmpty(candidate.column?.ColumnName, candidate.column?.DbColumnName, candidate.column?.Name),
      compact: compactVistosColumn(candidate.column),
      source
    }))
    .filter((candidate) => candidate.score > 0 && candidate.columnName)
    .sort((left, right) => right.score - left.score);
  return sorted[0] || null;
}

async function resolveVistosSvozKaiserField(env, session) {
  const schemaAttempts = [];
  for (const entityName of VISTOS_SVOZ_KAISER_TARGET_ENTITIES) {
    schemaAttempts.push(await loadVistosSvozKaiserSchemaEntity(env, session, entityName));
  }

  const schemaCandidates = schemaAttempts.flatMap((attempt) => (
    attempt.candidates || []
  ).map((candidate) => ({
    ...candidate,
    entityName: attempt.entityName,
    method: attempt.method
  })));
  const schemaBest = bestVistosSvozKaiserCandidate(schemaCandidates, "GetSchemaEntity");
  if (schemaBest) {
    return {
      confirmed: true,
      entityName: schemaBest.entityName,
      columnName: schemaBest.columnName,
      caption: schemaBest.compact.caption,
      score: schemaBest.score,
      source: "GetSchemaEntity",
      candidates: schemaCandidates.slice(0, 10).map((candidate) => ({
        entityName: candidate.entityName,
        score: candidate.score,
        column: compactVistosColumn(candidate.column)
      })),
      diagnostics: {
        schemaAttempts: schemaAttempts.map((attempt) => ({
          entityName: attempt.entityName,
          ok: attempt.ok,
          method: attempt.method,
          columnCount: attempt.columnCount,
          candidateCount: attempt.candidates?.length || 0,
          error: attempt.error || ""
        })),
        dbObjectAttempts: []
      }
    };
  }

  let dbObjectPage;
  try {
    dbObjectPage = await getAllVistosPages(
      env,
      session,
      "DbObject",
      VISTOS_METADATA_DB_OBJECT_COLUMNS,
      null,
      { pageSize: 500, maxPages: 4 }
    );
  } catch (error) {
    return {
      confirmed: false,
      entityName: "",
      columnName: "",
      caption: "",
      score: 0,
      source: "",
      candidates: [],
      diagnostics: {
        schemaAttempts: schemaAttempts.map((attempt) => ({
          entityName: attempt.entityName,
          ok: attempt.ok,
          method: attempt.method,
          columnCount: attempt.columnCount,
          candidateCount: attempt.candidates?.length || 0,
          error: attempt.error || ""
        })),
        dbObjectAttempts: [{
          ok: false,
          error: error?.message || "DbObject metadata se nepodařilo načíst.",
          code: error?.code || "vistos_db_object_failed"
        }],
        dbColumnAttempts: []
      },
      message: "Pole Svoz Kaiser ANO se nepodařilo potvrdit přes GetSchemaEntity ani DbObject/DbColumn metadata."
    };
  }
  const dbObjects = matchVistosDbObjects(dbObjectPage.rows);
  const dbColumnAttempts = [];
  for (const dbObject of dbObjects) {
    dbColumnAttempts.push(await loadVistosSvozKaiserDbColumns(env, session, dbObject));
  }
  const dbColumnCandidates = dbColumnAttempts.flatMap((attempt) => (
    attempt.candidates || []
  ).map((candidate) => ({
    ...candidate,
    entityName: attempt.entityName,
    method: attempt.method
  })));
  const dbColumnBest = bestVistosSvozKaiserCandidate(dbColumnCandidates, "DbColumn");
  if (dbColumnBest) {
    return {
      confirmed: true,
      entityName: dbColumnBest.entityName,
      columnName: dbColumnBest.columnName,
      caption: dbColumnBest.compact.caption,
      score: dbColumnBest.score,
      source: "DbColumn",
      candidates: dbColumnCandidates.slice(0, 10).map((candidate) => ({
        entityName: candidate.entityName,
        score: candidate.score,
        column: compactVistosColumn(candidate.column)
      })),
      diagnostics: {
        schemaAttempts: schemaAttempts.map((attempt) => ({
          entityName: attempt.entityName,
          ok: attempt.ok,
          method: attempt.method,
          columnCount: attempt.columnCount,
          candidateCount: attempt.candidates?.length || 0,
          error: attempt.error || ""
        })),
        dbObjectAttempts: dbObjects,
        dbColumnAttempts: dbColumnAttempts.map((attempt) => ({
          entityName: attempt.entityName,
          ok: attempt.ok,
          method: attempt.method,
          columnCount: attempt.columnCount,
          candidateCount: attempt.candidates?.length || 0,
          reason: attempt.reason || "",
          diagnostics: attempt.diagnostics || []
        }))
      }
    };
  }

  return {
    confirmed: false,
    entityName: "",
    columnName: "",
    caption: "",
    score: 0,
    source: "",
    candidates: [],
    diagnostics: {
      schemaAttempts: schemaAttempts.map((attempt) => ({
        entityName: attempt.entityName,
        ok: attempt.ok,
        method: attempt.method,
        columnCount: attempt.columnCount,
        candidateCount: attempt.candidates?.length || 0,
        error: attempt.error || ""
      })),
      dbObjectAttempts: dbObjects,
      dbColumnAttempts: dbColumnAttempts.map((attempt) => ({
        entityName: attempt.entityName,
        ok: attempt.ok,
        method: attempt.method,
        columnCount: attempt.columnCount,
        candidateCount: attempt.candidates?.length || 0,
        reason: attempt.reason || "",
        diagnostics: attempt.diagnostics || []
      }))
    },
    message: "Pole Svoz Kaiser ANO se nepodařilo potvrdit v ContractRow ani Contract metadatech."
  };
}

async function resolveVistosSvozKaiserConsistencyFields(env, session) {
  const targetEntities = Array.from(new Set(VISTOS_CONSISTENCY_FIELD_SPECS
    .flatMap((spec) => spec.targetEntities || [])
    .filter(Boolean)));
  const schemaAttempts = [];
  for (const entityName of targetEntities) {
    schemaAttempts.push(await loadVistosSvozKaiserSchemaEntity(env, session, entityName));
  }

  const fields = {};
  for (const spec of VISTOS_CONSISTENCY_FIELD_SPECS) {
    const candidates = schemaAttempts
      .filter((attempt) => (spec.targetEntities || []).includes(attempt.entityName))
      .flatMap((attempt) => (attempt.columns || []).map((column) => {
        const compact = compactVistosColumn(column);
        return {
          entityName: attempt.entityName,
          method: attempt.method,
          source: "GetSchemaEntity",
          column,
          compact,
          columnName: firstNonEmpty(column.ColumnName, column.DbColumnName, column.Name),
          score: vistosConsistencyColumnScore(column, spec)
        };
      }))
      .filter((candidate) => candidate.columnName && candidate.score >= (spec.minScore || 75))
      .sort((left, right) => right.score - left.score || left.columnName.localeCompare(right.columnName, "cs"));

    const unique = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const key = `${candidate.entityName}:${candidate.columnName}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(candidate);
      if (unique.length >= (spec.maxColumns || 1)) {
        break;
      }
    }

    fields[spec.key] = {
      key: spec.key,
      label: spec.label,
      confirmed: unique.length > 0,
      columns: unique.map(compactVistosConsistencyCandidate),
      candidates: candidates.slice(0, 12).map(compactVistosConsistencyCandidate),
      message: unique.length
        ? `${spec.label} potvrzeno přes Vistos metadata.`
        : `${spec.label} se v metadatech Contract/ContractRow nepodařilo jednoznačně najít.`
    };
  }

  return {
    confirmed: Object.values(fields).some((field) => field.confirmed),
    source: "GetSchemaEntity",
    fields,
    diagnostics: {
      schemaAttempts: schemaAttempts.map((attempt) => ({
        entityName: attempt.entityName,
        ok: attempt.ok,
        method: attempt.method,
        columnCount: attempt.columnCount,
        error: attempt.error || ""
      }))
    }
  };
}

function withVistosSvozKaiserColumn(columns, field, entityName) {
  if (!field?.confirmed || field.entityName !== entityName || !field.columnName) {
    return columns;
  }
  return Array.from(new Set([...columns, field.columnName]));
}

function withVistosConsistencyColumns(columns, consistencyFields, entityName) {
  const extra = Object.values(consistencyFields?.fields || {})
    .flatMap((field) => field.confirmed ? field.columns || [] : [])
    .filter((column) => column.entityName === entityName && column.columnName)
    .map((column) => column.columnName);
  return Array.from(new Set([...columns, ...extra]));
}

function readVistosColumnValue(row, columnName) {
  if (!row || !columnName) {
    return "";
  }
  return firstNonEmpty(
    row[columnName],
    row[`${columnName}_Caption`],
    row[`${columnName}_MainProjection`],
    row[`${columnName}_Value`],
    row[`${columnName}_RecordId`]
  );
}

function readVistosColumnDisplayValue(row, columnName) {
  if (!row || !columnName) {
    return "";
  }
  return firstNonEmpty(
    row[`${columnName}_Caption`],
    row[`${columnName}_MainProjection`],
    row[`${columnName}_Value`],
    row[columnName],
    row[`${columnName}_RecordId`]
  );
}

function readVistosConsistencyFieldValues(contract, contractRow, consistencyFields, fieldKey) {
  const field = consistencyFields?.fields?.[fieldKey];
  if (!field?.confirmed) {
    return [];
  }
  return (field.columns || []).map((column) => {
    const row = column.entityName === "ContractRow" ? contractRow : contract;
    const value = readVistosColumnDisplayValue(row, column.columnName);
    const rawValue = readVistosColumnValue(row, column.columnName);
    return {
      ...column,
      value,
      rawValue
    };
  }).filter((item) => cleanString(item.value) || cleanString(item.rawValue));
}

function isVistosYesValue(value) {
  if (value === true || value === 1) {
    return true;
  }
  const key = normalizeVistosMetadataKey(value);
  return ["1", "true", "ano", "yes", "y", "a", "checked", "zapnuto", "aktivni"].includes(key);
}

function rowSvozKaiserValue(contract, contractRow, field) {
  if (!field?.confirmed || !field.columnName) {
    return "";
  }
  if (field.entityName === "ContractRow") {
    return readVistosColumnValue(contractRow, field.columnName);
  }
  if (field.entityName === "Contract") {
    return readVistosColumnValue(contract, field.columnName);
  }
  return "";
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
  const alias = normalizeFrequencyAlias(value);
  if (alias) {
    return {
      frequency: alias,
      known: true
    };
  }
  const normalized = cleanString(value).toLowerCase().replace(/\s+/g, "").replace("×", "x");
  return {
    frequency: normalized,
    known: ALLOWED_FREQUENCIES.has(normalized)
  };
}

function normalizeFrequencyAlias(value) {
  const normalized = normalizeValueKey(value).replaceAll("×", "X");
  const compact = normalized.replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  const direct = compact.match(/([1-5])X(7|14|30)/);
  if (direct) {
    return `${direct[1]}x${direct[2]}`;
  }
  const weekly = compact.match(/([1-5])X(?:TYDNE|TYDEN|TYD|7DNI|7DEN)/);
  if (weekly) {
    return `${weekly[1]}x7`;
  }
  if (/KAZDYTYDEN|TYDNE|TYDENNI|1KRATZA7DNI|1KRATTYDNE|1XTYD/.test(compact)) {
    return "1x7";
  }
  if (/2KRATTYDNE|2XTYD|2TYDNE/.test(compact)) {
    return "2x7";
  }
  if (/3KRATTYDNE|3XTYD|3TYDNE/.test(compact)) {
    return "3x7";
  }
  if (/5KRATTYDNE|5XTYD|5TYDNE/.test(compact)) {
    return "5x7";
  }
  if (/14DNI|14DEN|CTRNACTIDEN|CTRNACTIDENNI|OBTYDEN|1X14|1KRATZA14DNI|2TYDNY/.test(compact)) {
    return "1x14";
  }
  if (/MESIC|MESICNE|MESICNI|30DNI|30DEN|1X30|1KRATZAMESIC/.test(compact)) {
    return "1x30";
  }
  return "";
}

function normalizeContainerVolume(value) {
  const raw = cleanString(value);
  const cubic = raw.match(/\b(\d+(?:[,.]\d+)?)\s*(?:m3|m\s*3|m³|cbm|kubik)\b/i);
  if (cubic) {
    const volume = Math.round(Number(cubic[1].replace(",", ".")) * 1000);
    return {
      volume,
      known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
    };
  }
  const countedVolume = raw.match(new RegExp(`\\b\\d+\\s*[x×]\\s*(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*(?:l|lt|ltr|litru|litr|litry)?\\b`, "i"));
  const prefixedVolume = raw.match(new RegExp(`\\b(?:P|POP|POPEL|KONT|KONTEJNER)\\.?\\s*(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\b`, "i"));
  const preferredVolume = raw.match(new RegExp(`\\b(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*(?:l|lt|ltr|litru|litr|litry)?\\b`, "i"));
  const directVolume = raw.match(new RegExp(`^\\s*(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*$`));
  const match = countedVolume || prefixedVolume || preferredVolume || directVolume;
  const volume = match ? Number(match[1] || match[0]) : 0;
  return {
    volume,
    known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
  };
}

function normalizeExplicitContainerVolumeText(value) {
  const raw = cleanString(value);
  const cubic = raw.match(/\b(\d+(?:[,.]\d+)?)\s*(?:m3|m\s*3|m³|cbm|kubik)\b/i);
  if (cubic) {
    const volume = Math.round(Number(cubic[1].replace(",", ".")) * 1000);
    return {
      volume,
      known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
    };
  }

  const countedVolume = raw.match(new RegExp(`\\b\\d+\\s*[x×]\\s*(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*(?:l|lt|ltr|litru|litr|litry)?\\b`, "i"));
  const prefixedVolume = raw.match(new RegExp(`\\b(?:P|POP|POPEL|KONT|KONTEJNER)\\.?\\s*(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\b`, "i"));
  const unitVolume = raw.match(new RegExp(`\\b(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*(?:l|lt|ltr|litru|litr|litry)\\b`, "i"));
  const contextualVolume = raw.match(new RegExp(`\\b(?:NADOB(?:A|Y|U|OU|E)?|POPELNIC(?:E|I|A|OU)?|KONTEJNER|KONT|KAPACIT(?:A|OU|Y)?|VELIKOST(?:I)?|OBJEM(?:EM)?|VYKLOP(?:U)?)\\D{0,40}(${ALLOWED_CONTAINER_VOLUME_PATTERN})\\b`, "i"));
  const match = countedVolume || prefixedVolume || unitVolume || contextualVolume;
  const volume = match ? Number(match[1] || match[0]) : 0;
  return {
    volume,
    known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
  };
}

function normalizeContainerCount(value) {
  const raw = cleanString(value).replace(",", ".");
  const countedVolume = raw.match(new RegExp(`^\\s*(\\d+)\\s*[x×]\\s*(?:${ALLOWED_CONTAINER_VOLUME_PATTERN})\\s*(?:l|lt|ltr|litru|litr|litry)?\\b`, "i"));
  const count = Math.max(0, Math.round(countedVolume ? Number(countedVolume[1]) : numericValue(raw, 0)));
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

function contractRowInActiveRange(row, today = new Date()) {
  if (!booleanValue(row?.IsActive, true)) {
    return false;
  }

  return dateInActiveRange(row?.StartDate, row?.EndDate, today);
}

function contractRowValidityIssues(row, today = new Date()) {
  const issues = [];
  const todayIso = today.toISOString().slice(0, 10);
  const start = isoDateValue(row?.StartDate);
  const end = isoDateValue(row?.EndDate);

  if (!booleanValue(row?.IsActive, true)) {
    issues.push({
      type: "inactive-contract-row-flag",
      severity: "warning",
      message: "Položka smlouvy má ve Vistosu příznak neaktivní. Zůstává v read-only preview k ověření."
    });
  }

  if (start && start > todayIso) {
    issues.push({
      type: "future-contract-row-start-date",
      severity: "warning",
      message: "Položka smlouvy má začátek platnosti v budoucnu."
    });
  }

  if (end && end < todayIso) {
    issues.push({
      type: "expired-contract-row-end-date",
      severity: "warning",
      message: "Položka smlouvy má konec platnosti v minulosti."
    });
  }

  if (start && end && start > end) {
    issues.push({
      type: "invalid-contract-row-date-range",
      severity: "error",
      message: "Položka smlouvy má začátek svozu po konci svozu."
    });
  }

  return issues;
}

const VISTOS_PICKUP_WEEKDAYS = [
  { code: "PO", label: "pondělí", patterns: [/\bPO\b/, /\bPOND(?:ELI)?\b/] },
  { code: "UT", label: "úterý", patterns: [/\bUT\b/, /\bUTERY\b/] },
  { code: "ST", label: "středa", patterns: [/\bST\b/, /\bSTREDA\b/] },
  { code: "CT", label: "čtvrtek", patterns: [/\bCT\b/, /\bCTVRTEK\b/] },
  { code: "PA", label: "pátek", patterns: [/\bPA\b/, /\bPATEK\b/] }
];

function normalizeVistosWatchdogText(value = "") {
  return cleanString(value)
    .toLocaleUpperCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickupParityFromText(text = "") {
  const normalized = normalizeVistosWatchdogText(text);
  const compact = normalized.replace(/\s+/g, "");
  if (/\bSUD(?:Y|A|E|EM|YCH)?\b/.test(normalized) || compact.includes("SUDY") || compact.includes("SUDE")) {
    return "even";
  }
  if (/\bLICH(?:Y|A|E|EM|YCH)?\b/.test(normalized) || compact.includes("LICHY") || compact.includes("LICHE")) {
    return "odd";
  }
  if (/\b(KAZDY|KAZDE|KAZD|TYDNE|TYDENNE|OBA|OBOU)\b/.test(normalized)) {
    return "both";
  }
  return "";
}

function pickupWeekdaysFromText(text = "") {
  const normalized = normalizeVistosWatchdogText(text);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) {
    return [];
  }
  return VISTOS_PICKUP_WEEKDAYS
    .filter((day) => (
      day.patterns.some((pattern) => pattern.test(normalized)) ||
      (day.code === "PO" && compact.includes("PONDELI")) ||
      (day.code === "UT" && compact.includes("UTERY")) ||
      (day.code === "ST" && compact.includes("STREDA")) ||
      (day.code === "CT" && compact.includes("CTVRTEK")) ||
      (day.code === "PA" && compact.includes("PATEK"))
    ))
    .map((day) => day.code);
}

function pickupDayEntriesFromValues(values = []) {
  const entries = [];
  const unknownTexts = [];

  for (const item of values) {
    const value = cleanString(item.value);
    const rawValue = cleanString(item.rawValue);
    const labelText = [item.caption, item.columnName].map(cleanString).filter(Boolean).join(" ");
    const normalizedValue = normalizeVistosMetadataKey(value || rawValue);
    const booleanLikeValue = ["1", "true", "ano", "yes", "checked", "zapnuto", "aktivni"].includes(normalizedValue);
    const falseLikeValue = ["0", "false", "ne", "no", "unchecked", "vypnuto", "neaktivni"].includes(normalizedValue);

    if (falseLikeValue) {
      continue;
    }

    const text = booleanLikeValue
      ? labelText
      : [value, labelText].filter(Boolean).join(" ");
    const days = pickupWeekdaysFromText(text);
    const parity = pickupParityFromText(text) || "unknown";

    if (!days.length) {
      if (value || rawValue) {
        unknownTexts.push(text);
      }
      continue;
    }

    days.forEach((day) => entries.push({
      day,
      parity,
      source: text
    }));
  }

  const unique = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.day}:${entry.parity}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  return {
    entries: unique,
    duplicateCount: Math.max(0, entries.length - unique.length),
    unknownTexts
  };
}

function expectedPickupCountsForFrequency(frequency = "") {
  const normalized = normalizeFrequencyAlias(frequency) || normalizeFrequency(frequency).frequency;
  const weekly = cleanString(normalized).match(/^([1-5])x7$/);
  if (weekly) {
    const perWeek = Number(weekly[1]);
    return {
      mode: "weekly",
      perWeek,
      expectedEven: perWeek,
      expectedOdd: perWeek,
      expectedTotal: perWeek * 2
    };
  }
  if (normalized === "1x14") {
    return {
      mode: "biweekly",
      perWeek: 0,
      expectedEven: null,
      expectedOdd: null,
      expectedTotal: 1
    };
  }
  if (normalized === "1x30") {
    return {
      mode: "monthly",
      perWeek: 0,
      expectedEven: null,
      expectedOdd: null,
      expectedTotal: 1
    };
  }
  return {
    mode: "unknown",
    perWeek: 0,
    expectedEven: null,
    expectedOdd: null,
    expectedTotal: 0
  };
}

function pickupDayConsistencyIssues({ frequency, values, fieldConfirmed }) {
  const issues = [];
  const expected = expectedPickupCountsForFrequency(frequency);
  const { entries, duplicateCount, unknownTexts } = pickupDayEntriesFromValues(values);

  if (!fieldConfirmed) {
    issues.push({
      type: "pickup-day-fields-not-readable",
      severity: "warning",
      message: "Hlídač nenašel čitelné pole svozových dnů ve Vistos API; interval nejde křížově ověřit."
    });
    return issues;
  }

  if (duplicateCount > 0) {
    issues.push({
      type: "pickup-days-duplicate",
      severity: "warning",
      message: "Svozové dny obsahují duplicitu stejného dne/režimu."
    });
  }

  if (unknownTexts.length && !entries.length) {
    issues.push({
      type: "missing-pickup-days",
      severity: "warning",
      message: "Svozové dny jsou vyplněné nečitelně; hlídač z nich neumí určit pracovní den."
    });
    return issues;
  }

  if (expected.mode === "unknown") {
    return issues;
  }

  if (!entries.length) {
    issues.push({
      type: "missing-pickup-days",
      severity: "warning",
      message: "Chybí svozový den pro zadaný interval odvozu."
    });
    return issues;
  }

  const evenCount = entries.filter((entry) => entry.parity === "even").length;
  const oddCount = entries.filter((entry) => entry.parity === "odd").length;
  const bothCount = entries.filter((entry) => entry.parity === "both").length;
  const unknownParityCount = entries.filter((entry) => entry.parity === "unknown").length;
  const effectiveEven = evenCount + bothCount;
  const effectiveOdd = oddCount + bothCount;
  const total = entries.length;

  if (expected.mode === "weekly") {
    if (effectiveEven !== expected.expectedEven || effectiveOdd !== expected.expectedOdd) {
      issues.push({
        type: "pickup-days-even-odd-mismatch",
        severity: "warning",
        message: `Interval ${frequency || "-"} neodpovídá rozložení svozových dnů: sudý ${effectiveEven}, lichý ${effectiveOdd}, očekáváno ${expected.expectedEven}/${expected.expectedOdd}.`
      });
    }
    if (unknownParityCount > 0) {
      issues.push({
        type: "pickup-days-missing-week-parity",
        severity: "warning",
        message: "U některých svozových dnů chybí jasné rozlišení sudý/lichý/každý týden."
      });
    }
    return issues;
  }

  if (expected.mode === "biweekly") {
    if (total !== 1 || bothCount > 0 || unknownParityCount > 0) {
      issues.push({
        type: "pickup-days-count-mismatch",
        severity: "warning",
        message: "Interval 1x14 má mít jeden svozový den s jasným sudým nebo lichým týdnem."
      });
    }
    return issues;
  }

  if (expected.mode === "monthly" && total > 1) {
    issues.push({
      type: "monthly-pickup-days-ambiguous",
      severity: "warning",
      message: "Měsíční interval má více týdenních svozových dnů; ověřte měsíční režim ve Vistosu."
    });
  }

  return issues;
}

function addressTokenSet(value = "") {
  return new Set(normalizeVistosWatchdogText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token)));
}

function addressTokenSimilarity(left = "", right = "") {
  const leftTokens = addressTokenSet(left);
  const rightTokens = addressTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) {
    return 1;
  }
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function addressPlaceQualityIssues({ addressPlaceRaw, addressRaw, siteName }) {
  const issues = [];
  const address = firstNonEmpty(addressPlaceRaw, addressRaw, siteName);
  const normalized = normalizeVistosWatchdogText(address);
  const loadingAddress = cleanString(addressRaw);

  if (!address) {
    return issues;
  }

  if (
    normalized.length < 8 ||
    /^(BRNO|PRAHA|BLANSKO|VYSKOV|MESTO|OBEC|ADRESA|STANOVISTE)$/.test(normalized) ||
    /\b(BEZ ADRESY|NEZNAMA|NEZNAMY|DOPLNIT|XXX|TEST)\b/.test(normalized)
  ) {
    issues.push({
      type: "incomplete-address-place",
      severity: "warning",
      message: "Adresní místo je neúplné nebo vypadá jako zástupný text."
    });
  }

  if (!/\d/.test(normalized)) {
    issues.push({
      type: "address-place-missing-number",
      severity: "warning",
      message: "Adresní místo neobsahuje číslo popisné/orientační."
    });
  }

  if (/[,;:/\\-]{2,}/.test(address) || /\?{2,}/.test(address) || /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])\1\1/i.test(address)) {
    issues.push({
      type: "address-place-possible-typo",
      severity: "warning",
      message: "Adresní místo obsahuje podezřelý překlep nebo poškozený zápis."
    });
  }

  if (addressPlaceRaw && loadingAddress && /\d/.test(addressPlaceRaw) && /\d/.test(loadingAddress)) {
    const similarity = addressTokenSimilarity(addressPlaceRaw, loadingAddress);
    if (similarity < 0.35) {
      issues.push({
        type: "address-place-loading-address-mismatch",
        severity: "warning",
        message: "Adresní místo se výrazně liší od nakládkové/svozové adresy."
      });
    }
  }

  return issues;
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

function findVistosCollectionTextAlias(text) {
  const normalized = normalizeValueKey(text);
  const compact = normalized.replace(/\s+/g, "");
  if (!compact) {
    return null;
  }

  return VISTOS_COLLECTION_TEXT_ALIASES.find((alias) => {
    const aliasNormalized = normalizeValueKey(alias.text);
    const aliasCompact = aliasNormalized.replace(/\s+/g, "");
    return normalized.includes(aliasNormalized) || compact.includes(aliasCompact);
  }) || null;
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
    "SEPARAT",
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

function textLooksLikeNonCollectionRouteService(text) {
  const normalized = normalizeValueKey(text);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }
  if (/VYZVA|VYZVU|NAVYZVU|NAZAVOLANI|DLEPOTREB|NAOBJEDNANI|OBJEDNAVK/.test(compact)) {
    return true;
  }
  if (/MIMORADNYVYVOZ|SKARTAC|SANON|VYKUPN|RUCNISBER|LISOVAN|OBCHODOVATELN/.test(compact)) {
    return true;
  }
  if (/CENABUDEUPRAVOVANA|CENABUDEAKTUALIZOVANA|CENAJEUPRAVOVANA|CENAPOHYBLIVA|AKTUALNICEN|DLECEN/.test(compact)) {
    return true;
  }
  if (/TRIDENELEPENK|CISTETRIDENE|SUCHEOBALY|VOK|SPALOVN|SKLADK|ROCNI.*1X|PLASTKARTON|PROLOZK|PLASTBUDEVB/.test(compact)) {
    return true;
  }
  const wasteCode = compact.match(/(^|\D)(\d{6})(\D|$)/)?.[2] || "";
  if (wasteCode && !VISTOS_ROUTE_WASTE_CODES.has(wasteCode)) {
    return true;
  }
  return VISTOS_NON_ROUTE_NEEDLES.some((needle) => {
    const normalizedNeedle = normalizeValueKey(needle);
    const compactNeedle = normalizedNeedle.replace(/\s+/g, "");
    return normalized.includes(normalizedNeedle) || compact.includes(compactNeedle);
  });
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
    ["150103", { wasteType: "DREVO", wasteCode: "150103" }],
    ["200301", { wasteType: "SKO", wasteCode: "200301" }],
    ["200101", { wasteType: "PAPIR", wasteCode: "200101" }],
    ["200139", { wasteType: "PLAST", wasteCode: "200139" }],
    ["200102", { wasteType: "SKLO", wasteCode: "200102" }],
    ["200108", { wasteType: "BIO", wasteCode: "200108" }],
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
    ["BIOLOGICKY", { wasteType: "BIO", wasteCode: "200108" }],
    ["BIOODPAD", { wasteType: "BIO", wasteCode: "200108" }],
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
  const textAlias = normalizeFrequency(text);
  if (textAlias.known) {
    return textAlias;
  }
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
  const raw = firstNonEmpty(product?.Typnadoby, product?.Size);
  const volume = normalizeContainerVolume(raw);
  const textVolume = volume.known
    ? volume
    : normalizeExplicitContainerVolumeText([
      product?.Typnadoby_Caption,
      product?.Caption,
      product?.Name,
      contractRow?.Caption,
      contractRow?.Name,
      contractRow?.Description,
      contractRow?.Product_FK_Caption
    ].map(cleanString).filter(Boolean).join(" "));
  const quantitySource = firstNonEmpty(contractRow?.Quantity, product?.Quantity);
  return {
    volume: textVolume.volume,
    known: textVolume.known,
    count: normalizeContainerCount(quantitySource || raw),
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

function buildVistosKommunalPreview({ contracts, contractRows, products, totals = {}, today = new Date(), filterDiagnostics = {}, svozKaiserField = null, consistencyFields = null }) {
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

  for (const contract of contracts) {
    const contractId = cleanString(contract?.Id);
    const contractRowsForContract = rowsByContractId.get(contractId) || [];
    const baseIssues = [];
    const customerName = fkCaption(contract, "Directory_FK");
    const branchName = fkCaption(contract, "DirectoryBranch_FK");
    const addressRaw = firstNonEmpty(fkCaption(contract, "Nakladkovaadresa_FK"), branchName);
    const siteName = firstNonEmpty(fkCaption(contract, "Nakladkovaadresa_FK"), branchName, customerName);
    const addressPlaceValues = readVistosConsistencyFieldValues(contract, null, consistencyFields, "addressPlace");
    const addressPlaceRaw = firstNonEmpty(...addressPlaceValues.map((item) => item.value), addressRaw);
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
    baseIssues.push(...addressPlaceQualityIssues({ addressPlaceRaw, addressRaw, siteName }));

    if (!contractRowsForContract.length) {
      const svozKaiserValue = rowSvozKaiserValue(contract, null, svozKaiserField);
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
        addressPlaceRaw,
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
        svozKaiserValue,
        svozKaiserIncluded: isVistosYesValue(svozKaiserValue),
        issues: [
          ...baseIssues,
          { type: "missing-contract-items", severity: "warning", message: "Chybí položky smlouvy." }
        ]
      });
      continue;
    }

    for (const contractRow of contractRowsForContract) {
      const svozKaiserValue = rowSvozKaiserValue(contract, contractRow, svozKaiserField);
      const productId = cleanString(contractRow?.Product_FK_RecordId || contractRow?.Product_FK);
      const product = productsById.get(productId) || null;
      const searchText = productSearchText(contractRow, product);
      const looksOutsideCollectionRoute = textLooksLikeNonCollectionRouteService(searchText);
      const looksLikeCollection = !looksOutsideCollectionRoute && textLooksLikeCollectionService(searchText);
      const isOutsideCollectionRoute = looksOutsideCollectionRoute || !looksLikeCollection;
      const textAlias = findVistosCollectionTextAlias(searchText);
      const inferredContainer = inferVistosContainer(contractRow, product);
      const waste = textAlias
        ? { wasteType: textAlias.wasteType, wasteCode: textAlias.wasteCode, known: true }
        : inferVistosWaste(contractRow, product);
      const frequency = textAlias
        ? { frequency: textAlias.frequency, known: true }
        : inferVistosFrequency(contractRow, product);
      const container = textAlias
        ? {
          volume: textAlias.containerVolume,
          known: true,
          count: inferredContainer.count,
          type: textAlias.containerType || inferredContainer.type || "container"
        }
        : inferredContainer;
      const issues = [...baseIssues];

      if (!isoDateValue(contractRow?.StartDate)) {
        issues.push({ type: "missing-contract-row-start-date", severity: "warning", message: "Položka smlouvy zatím nemá začátek platnosti z Vistosu." });
      }
      issues.push(...contractRowValidityIssues(contractRow, today));

      if (isOutsideCollectionRoute) {
        issues.push({ type: "non-route-contract-row", severity: "info", message: "Položka podle textu patří mimo pravidelnou svozovou trasu." });
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
          issues.push({ type: "item-not-collection-mappable", severity: "warning", message: "Svozová položka má obchodní text, který zatím nejde převést na trasu." });
        }
      }

      const routeWaste = isOutsideCollectionRoute ? { wasteType: "", wasteCode: "" } : waste;
      const routeFrequency = isOutsideCollectionRoute ? { frequency: "" } : frequency;
      const routeContainer = isOutsideCollectionRoute ? { volume: 0, count: 0, type: "" } : container;
      const rowAddressPlaceValues = readVistosConsistencyFieldValues(contract, contractRow, consistencyFields, "addressPlace");
      const rowAddressPlaceRaw = firstNonEmpty(...rowAddressPlaceValues.map((item) => item.value), addressPlaceRaw, addressRaw);
      const pickupDayValues = readVistosConsistencyFieldValues(contract, contractRow, consistencyFields, "pickupDays");
      const pickupFromValues = readVistosConsistencyFieldValues(contract, contractRow, consistencyFields, "pickupFrom");
      const pickupToValues = readVistosConsistencyFieldValues(contract, contractRow, consistencyFields, "pickupTo");
      const pickupFrom = firstNonEmpty(...pickupFromValues.map((item) => item.value), contractRow?.StartDate);
      const pickupTo = firstNonEmpty(...pickupToValues.map((item) => item.value), contractRow?.EndDate);

      if (normalizeLookupKey(rowAddressPlaceRaw) !== normalizeLookupKey(addressPlaceRaw)) {
        issues.push(...addressPlaceQualityIssues({
          addressPlaceRaw: rowAddressPlaceRaw,
          addressRaw,
          siteName
        }));
      }
      if (!isOutsideCollectionRoute && routeFrequency.frequency) {
        issues.push(...pickupDayConsistencyIssues({
          frequency: routeFrequency.frequency,
          values: pickupDayValues,
          fieldConfirmed: Boolean(consistencyFields?.fields?.pickupDays?.confirmed)
        }));
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
        pickupFrom: isoDateValue(pickupFrom),
        pickupTo: isoDateValue(pickupTo),
        customerName,
        branchName,
        addressRaw,
        addressPlaceRaw: rowAddressPlaceRaw,
        siteName,
        wasteType: routeWaste.wasteType,
        wasteCode: routeWaste.wasteCode,
        frequency: routeFrequency.frequency,
        containerVolume: routeContainer.volume,
        containerCount: routeContainer.count,
        containerType: routeContainer.type,
        productName: firstNonEmpty(product?.Caption, product?.Name, contractRow?.Name),
        rowName: cleanString(contractRow?.Name),
        note: cleanString(contractRow?.Description),
        mappingStatus: isOutsideCollectionRoute ? "outside_route" : issues.length ? "needs_review" : "mapped",
        rowKey: `vistos-contract-${contractId}-row-${cleanString(contractRow?.Id) || productId || mappedRows.length + 1}`,
        siteKey: vistosSiteKey(contract),
        locationQuality: sourceSiteId ? "vistos_unverified" : "missing",
        latitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Lat),
        longitude: nullableNumericValue(contract?.Nakladkovaadresa_FK_Long),
        unitPrice: numericValue(product?.ListPrice || product?.CostPrice || product?.WeightedCostPrice || product?.DiscountPrice, 0),
        svozKaiserValue,
        svozKaiserIncluded: isVistosYesValue(svozKaiserValue),
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
  const siteCounts = new Map();
  for (const row of mappedRows) {
    if (!row.siteKey) {
      continue;
    }
    siteCounts.set(row.siteKey, (siteCounts.get(row.siteKey) || 0) + 1);
  }
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
  const severityRank = { error: 3, warning: 2, info: 1 };
  const issueSummaryByType = new Map();
  for (const row of mappedRows) {
    for (const issue of row.issues) {
      const issueType = cleanString(issue?.type || "data_issue") || "data_issue";
      const severity = cleanString(issue?.severity || "warning") || "warning";
      const message = cleanString(issue?.message || "Datový problém import preview.");
      const existing = issueSummaryByType.get(issueType) || {
        issueType,
        severity,
        message,
        count: 0
      };
      existing.count += 1;
      if ((severityRank[severity] || 0) > (severityRank[existing.severity] || 0)) {
        existing.severity = severity;
      }
      if (!existing.message && message) {
        existing.message = message;
      }
      issueSummaryByType.set(issueType, existing);
    }
  }
  const issueSummaryRows = Array.from(issueSummaryByType.values())
    .sort((left, right) => (
      right.count - left.count ||
      (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0) ||
      left.issueType.localeCompare(right.issueType)
    ))
    .slice(0, 50);
  const mappingGapRows = buildVistosKommunalMappingGapRows(mappedRows);
  const routeDraftRows = buildVistosKommunalRouteDraftRows(mappedRows);
  const routeDraftContainerCount = routeDraftRows.reduce((sum, row) => sum + (row.containerCount || 0), 0);
  const svozKaiserFieldSummary = {
    ...(svozKaiserField || {}),
    confirmed: Boolean(svozKaiserField?.confirmed && svozKaiserField?.columnName),
    yesRowCount: mappedRows.filter((row) => row.svozKaiserIncluded === true).length,
    checkedRowCount: mappedRows.length
  };
  const consistencyFieldSummary = {
    source: cleanString(consistencyFields?.source),
    readFailed: Boolean(consistencyFields?.readFailed),
    message: cleanString(consistencyFields?.message),
    fields: Object.fromEntries(Object.entries(consistencyFields?.fields || {}).map(([key, field]) => [key, {
      label: field.label,
      confirmed: Boolean(field.confirmed),
      columns: Array.isArray(field.columns) ? field.columns : [],
      message: field.message || ""
    }]))
  };

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
      routeDraftGroupCount: routeDraftRows.length,
      routeDraftContainerCount,
      issueCount,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    previewRows,
    contractPreviewRows,
    sitePreviewRows,
    issuePreviewRows,
    issueSummaryRows,
    mappingGapRows,
    routeDraftRows,
    metadata: {
      filter: VISTOS_KOMUNAL_CONTRACT_FILTER,
      filterDiagnostics,
      vistosTotals: totals,
      svozKaiserField: svozKaiserFieldSummary,
      consistencyFields: consistencyFieldSummary,
      mappingStats: {
        contracts: contracts.length,
        contractRows: contractRows.length,
        products: products.length,
        mappedItems: itemCount,
        sites: uniqueSites.size,
        routeDraftGroups: routeDraftRows.length,
        routeDraftContainers: routeDraftContainerCount,
        issues: issueCount
      }
    }
  };
}

function watchdogIssueLabel(issueType = "") {
  const labels = {
    "missing-customer": "Chybí zákazník",
    "missing-loading-address": "Chybí svozová/nakládková adresa",
    "incomplete-address-place": "Neúplné adresní místo",
    "address-place-missing-number": "Adresní místo bez čísla",
    "address-place-possible-typo": "Možný překlep v adresním místě",
    "address-place-loading-address-mismatch": "Adresní místo nesedí s nakládkovou adresou",
    "missing-contract-items": "Smlouva nemá svozové položky",
    "unknown-product": "Neznámý produkt",
    "unknown-waste-type": "Chybí nebo nejde určit druh odpadu",
    "unknown-frequency": "Chybí nebo nejde určit interval odvozu",
    "missing-pickup-days": "Chybí svozové dny",
    "pickup-day-fields-not-readable": "Nelze ověřit svozové dny",
    "pickup-days-count-mismatch": "Interval nesedí na počet svozových dnů",
    "pickup-days-even-odd-mismatch": "Sudé/liché svozové dny nesedí s intervalem",
    "pickup-days-missing-week-parity": "Chybí sudý/lichý režim u svozového dne",
    "pickup-days-duplicate": "Duplicitní svozový den",
    "monthly-pickup-days-ambiguous": "Nejasný měsíční svoz",
    "missing-container-volume": "Chybí nádoba / objem",
    "item-not-collection-mappable": "Položka nejde převést na svoz",
    "non-route-contract-row": "Svoz Kaiser ANO je mimo pravidelnou trasu",
    "multiple-sites-contract": "Smlouva má více možných stanovišť",
    "possible-site-duplicate": "Možná duplicita stanoviště",
    "inactive-contract-range": "Smlouva není v platném období",
    "missing-contract-row-start-date": "Chybí Svoz od",
    "inactive-contract-row-flag": "Svozová položka je neaktivní",
    "future-contract-row-start-date": "Svoz začíná v budoucnu",
    "expired-contract-row-end-date": "Svoz už skončil",
    "invalid-contract-row-date-range": "Svoz od je po Svoz do"
  };
  return labels[issueType] || "Datová chyba svozu";
}

function watchdogIssueAction(issueType = "") {
  const actions = {
    "missing-customer": "Doplnit zákazníka / sídlo ve Vistosu.",
    "missing-loading-address": "Doplnit svozovou nebo nakládkovou adresu ve Vistosu.",
    "incomplete-address-place": "Doplnit úplné Adresní místo ve Vistosu.",
    "address-place-missing-number": "Doplnit číslo popisné/orientační v Adresním místě.",
    "address-place-possible-typo": "Zkontrolovat překlep nebo poškozený zápis v Adresním místě.",
    "address-place-loading-address-mismatch": "Sjednotit Adresní místo a svozovou/nakládkovou adresu.",
    "missing-contract-items": "Doplnit svozovou položku smlouvy.",
    "unknown-product": "Zkontrolovat produkt a jeho vazbu na svoz.",
    "unknown-waste-type": "Doplnit druh odpadu / katalogové zařazení.",
    "unknown-frequency": "Doplnit interval odvozu nebo svozový den.",
    "missing-pickup-days": "Doplnit svozové dny podle intervalu odvozu.",
    "pickup-day-fields-not-readable": "Ověřit technické pole svozových dnů ve Vistosu nebo doplnit čitelné pole.",
    "pickup-days-count-mismatch": "Opravit počet svozových dnů podle zadaného intervalu.",
    "pickup-days-even-odd-mismatch": "Srovnat sudé a liché svozové dny podle intervalu.",
    "pickup-days-missing-week-parity": "Doplnit sudý/lichý/každý týden u svozového dne.",
    "pickup-days-duplicate": "Odstranit duplicitně zadaný svozový den.",
    "monthly-pickup-days-ambiguous": "Ověřit měsíční režim a nenechat ho jako běžný týdenní svoz.",
    "missing-container-volume": "Doplnit nádobu, objem nebo počet.",
    "item-not-collection-mappable": "Opravit text produktu tak, aby šel převést na svoz.",
    "non-route-contract-row": "Ověřit produkt/položku, nebo vypnout Svoz Kaiser ANO.",
    "multiple-sites-contract": "Ručně potvrdit správné stanoviště.",
    "possible-site-duplicate": "Sloučit nebo rozlišit duplicitní stanoviště.",
    "inactive-contract-range": "Ověřit platnost smlouvy pro svoz.",
    "missing-contract-row-start-date": "Doplnit Svoz od.",
    "inactive-contract-row-flag": "Aktivovat položku, nebo vypnout Svoz Kaiser ANO.",
    "future-contract-row-start-date": "Ověřit, jestli má položka už patřit do aktuálních tras.",
    "expired-contract-row-end-date": "Prodloužit Svoz do, nebo vypnout Svoz Kaiser ANO.",
    "invalid-contract-row-date-range": "Opravit Svoz od / Svoz do."
  };
  return actions[issueType] || "Zkontrolovat Vistos smlouvu a svozovou položku.";
}

function buildVistosSvozKaiserWatchdog(preview, apiStatus = "ready") {
  const allRows = Array.isArray(preview?.rows) ? preview.rows : [];
  const svozKaiserField = preview?.metadata?.svozKaiserField || {};
  const consistencyFields = preview?.metadata?.consistencyFields || {};
  const svozKaiserFieldConfirmed = Boolean(svozKaiserField?.confirmed && svozKaiserField?.columnName);
  const rows = svozKaiserFieldConfirmed
    ? allRows.filter((row) => row?.svozKaiserIncluded === true)
    : [];
  const issueRows = [];
  const siteAlertsByKey = new Map();
  const issueCounts = new Map();

  for (const row of rows) {
    const issues = Array.isArray(row?.issues) ? row.issues : [];
    const blockingIssues = issues.filter((issue) => VISTOS_SVOZ_KAISER_WATCHDOG_ISSUE_TYPES.has(cleanString(issue?.type || issue?.issueType)));
    if (!blockingIssues.length) {
      continue;
    }

    const siteKey = cleanString(row?.siteKey || row?.sourceSiteId || row?.siteName || row?.addressRaw || row?.contractNumber || row?.rowKey) || `watchdog-site-${siteAlertsByKey.size + 1}`;
    const existing = siteAlertsByKey.get(siteKey) || {
      siteKey,
      siteName: cleanString(row?.siteName || row?.addressRaw || "Stanoviště bez názvu"),
      addressRaw: cleanString(row?.addressRaw),
      customerName: cleanString(row?.customerName),
      contractNumber: cleanString(row?.contractNumber),
      issueCount: 0,
      issues: []
    };

    for (const issue of blockingIssues) {
      const issueType = cleanString(issue?.type || issue?.issueType || "data_issue");
      const item = {
        issueType,
        severity: cleanString(issue?.severity || "warning"),
        label: watchdogIssueLabel(issueType),
        message: cleanString(issue?.message || watchdogIssueLabel(issueType)),
        action: watchdogIssueAction(issueType),
        siteKey,
        siteName: existing.siteName,
        addressRaw: existing.addressRaw,
        customerName: existing.customerName,
        contractNumber: existing.contractNumber
      };
      issueRows.push(item);
      existing.issues.push(item);
      existing.issueCount += 1;
      issueCounts.set(issueType, (issueCounts.get(issueType) || 0) + 1);
    }

    siteAlertsByKey.set(siteKey, existing);
  }

  const issueSummary = Array.from(issueCounts.entries())
    .map(([issueType, count]) => ({
      issueType,
      count,
      label: watchdogIssueLabel(issueType),
      action: watchdogIssueAction(issueType)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "cs"));

  const siteAlerts = Array.from(siteAlertsByKey.values())
    .sort((left, right) => right.issueCount - left.issueCount || left.siteName.localeCompare(right.siteName, "cs"));
  const sourceRule = svozKaiserFieldConfirmed
    ? `Vistos ${svozKaiserField.entityName}.${svozKaiserField.columnName} = ANO`
    : cleanString(svozKaiserField.message) || "Svoz Kaiser ANO zatím není potvrzené technické pole ve Vistos API; širší Komunál diagnostika se nepočítá jako chyba Svoz Kaiser.";
  const message = !svozKaiserFieldConfirmed
    ? "Hlídač čeká na potvrzené pole Svoz Kaiser ANO. Nehlásí chyby nad celým Komunálem."
    : rows.length
      ? issueRows.length
        ? `Hlídač našel ${issueRows.length} chyb jen v řádcích Svoz Kaiser ANO.`
        : "Hlídač nenašel blokující chyby v řádcích Svoz Kaiser ANO."
      : "Pole Svoz Kaiser ANO je potvrzené, ale v aktivních Komunál datech zatím není žádný řádek zakliknutý ANO.";

  return {
    apiStatus,
    mode: "vistos-svoz-kaiser-watchdog",
    source: "vistos",
    sourceMode: "vistos-komunal-read-only-watchdog",
    generatedAt: nowIso(),
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    summary: {
      status: apiStatus === "ready" && svozKaiserFieldConfirmed ? "ready" : "waiting",
      errorCount: issueRows.length,
      siteErrorCount: siteAlerts.length,
      checkedRows: rows.length,
      rawKomunalRows: allRows.length,
      contractCount: preview?.summary?.contractCount || preview?.metadata?.mappingStats?.contracts || 0,
      itemCount: preview?.summary?.itemCount || preview?.metadata?.mappingStats?.mappedItems || 0,
      svozKaiserFieldConfirmed,
      svozKaiserFilterConfirmed: svozKaiserFieldConfirmed,
      svozKaiserFiltered: svozKaiserFieldConfirmed,
      svozKaiserEntity: cleanString(svozKaiserField.entityName),
      svozKaiserColumn: cleanString(svozKaiserField.columnName),
      svozKaiserCaption: cleanString(svozKaiserField.caption),
      svozKaiserMetadataSource: cleanString(svozKaiserField.source),
      consistencyFieldsReadFailed: Boolean(consistencyFields?.readFailed),
      consistencyFields,
      svozKaiserYesRows: rows.length,
      sourceRule,
      message
    },
    metadata: {
      svozKaiserField,
      consistencyFields
    },
    requiredFields: [
      "Číslo smlouvy",
      "Sídlo",
      "Nakládková adresa",
      "Stav Aktivní",
      "Typ Komunál",
      "Kategorie odpadu",
      "Interval odvozu",
      "Svoz Kaiser ANO",
      "Adresní místo",
      "Svoz Od",
      "Svoz Do",
      "Druh odpadu",
      "Svozový den",
      "Svozová adresa - ulice",
      "Svozová adresa - město",
      "Produkt",
      "Název",
      "Poznámky"
    ],
    issueSummary,
    issueRows: issueRows.slice(0, 200),
    siteAlerts: siteAlerts.slice(0, 100)
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
    containerCount: normalizeContainerCount(rawCount || rawVolume),
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

function kommunalMappingGapReason(issueTypes) {
  const reasons = [];
  if (issueTypes.has("non-route-contract-row")) {
    reasons.push("mimo svozovou trasu");
  }
  if (issueTypes.has("unknown-waste-type")) {
    reasons.push("neznámý typ odpadu");
  }
  if (issueTypes.has("unknown-frequency")) {
    reasons.push("neznámá četnost");
  }
  if (issueTypes.has("missing-container-volume")) {
    reasons.push("chybí objem nádoby");
  }
  if (issueTypes.has("unknown-product")) {
    reasons.push("neznámý produkt");
  }
  if (issueTypes.has("missing-contract-items")) {
    reasons.push("smlouva nemá položky");
  }
  if (!reasons.length && issueTypes.has("item-not-collection-mappable")) {
    reasons.push("nevypadá jako svoz odpadu");
  }
  return reasons.join(", ") || "datová kontrola";
}

function kommunalMappingGapAction(issueTypes) {
  if (issueTypes.has("non-route-contract-row")) {
    return "Neřešit v mapování tras; položka patří mimo pravidelnou svozovou trasu.";
  }
  if (issueTypes.has("missing-contract-items")) {
    return "Zkontrolovat, zda má smlouva ve Vistosu svozové položky.";
  }
  if (issueTypes.has("unknown-waste-type") || issueTypes.has("unknown-frequency") || issueTypes.has("missing-container-volume")) {
    return "Doplnit alias obchodního textu pro odpad, četnost nebo objem.";
  }
  if (issueTypes.has("unknown-product")) {
    return "Doplnit produkt do mapování Vistos položek.";
  }
  return "Rozhodnout, jestli jde o svoz odpadu, nebo položku označit jako nesvozovou.";
}

function buildVistosKommunalMappingGapRows(mappedRows) {
  const rowsByKey = new Map();

  for (const row of mappedRows) {
    const issueTypes = new Set((row.issues || []).map((issue) => cleanString(issue?.type)).filter(Boolean));
    if (!issueTypes.has("item-not-collection-mappable")) {
      continue;
    }
    if (issueTypes.has("non-route-contract-row")) {
      continue;
    }

    const label = firstNonEmpty(row.productName, row.rowName, row.note, row.productId, row.sourceId, "Bez názvu položky");
    const key = normalizeLookupKey(label) || normalizeLookupKey(row.productId) || normalizeLookupKey(row.sourceId) || `row-${row.rowNumber}`;
    const existing = rowsByKey.get(key) || {
      label,
      count: 0,
      reasonCounts: new Map(),
      sampleContracts: [],
      sampleCustomers: new Set(),
      sampleRowNames: new Set(),
      sampleNotes: new Set(),
      issueTypes: new Set()
    };

    existing.count += 1;
    const reason = kommunalMappingGapReason(issueTypes);
    existing.reasonCounts.set(reason, (existing.reasonCounts.get(reason) || 0) + 1);
    for (const issueType of issueTypes) {
      existing.issueTypes.add(issueType);
    }
    if (row.contractNumber && existing.sampleContracts.length < 3 && !existing.sampleContracts.includes(row.contractNumber)) {
      existing.sampleContracts.push(row.contractNumber);
    }
    if (row.customerName && existing.sampleCustomers.size < 3) {
      existing.sampleCustomers.add(row.customerName);
    }
    if (row.rowName && existing.sampleRowNames.size < 3) {
      existing.sampleRowNames.add(row.rowName);
    }
    if (row.note && existing.sampleNotes.size < 2) {
      existing.sampleNotes.add(row.note);
    }
    rowsByKey.set(key, existing);
  }

  return Array.from(rowsByKey.values())
    .map((row) => {
      const topReason = Array.from(row.reasonCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "cs"))[0]?.[0] || "datová kontrola";
      return {
        label: row.label,
        count: row.count,
        reason: topReason,
        action: kommunalMappingGapAction(row.issueTypes),
        sampleContracts: row.sampleContracts,
        sampleCustomers: Array.from(row.sampleCustomers),
        sampleRowNames: Array.from(row.sampleRowNames),
        sampleNotes: Array.from(row.sampleNotes),
        issueTypes: Array.from(row.issueTypes).sort()
      };
    })
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "cs"))
    .slice(0, 30);
}

function buildVistosKommunalRouteDraftRows(mappedRows) {
  const blockingIssueTypes = new Set([
    "non-route-contract-row",
    "item-not-collection-mappable",
    "unknown-waste-type",
    "unknown-frequency",
    "missing-container-volume",
    "missing-address",
    "unclear-location"
  ]);
  const rowsByKey = new Map();

  for (const row of mappedRows) {
    const issueTypes = new Set((row.issues || []).map((issue) => cleanString(issue?.type)).filter(Boolean));
    const hasBlockingIssue = Array.from(blockingIssueTypes).some((issueType) => issueTypes.has(issueType));
    if (hasBlockingIssue || !row.wasteType || !row.frequency || !row.containerVolume || !row.siteKey) {
      continue;
    }

    const key = [
      row.wasteType,
      row.wasteCode,
      row.frequency,
      row.containerVolume,
      row.containerType || "container"
    ].map(cleanString).join("|");
    const existing = rowsByKey.get(key) || {
      wasteType: row.wasteType,
      wasteCode: row.wasteCode,
      frequency: row.frequency,
      containerVolume: row.containerVolume,
      containerType: row.containerType || "container",
      itemCount: 0,
      containerCount: 0,
      contractNumbers: new Set(),
      siteKeys: new Set(),
      sampleSites: new Set(),
      sampleContracts: []
    };

    existing.itemCount += 1;
    existing.containerCount += row.containerCount || 1;
    if (row.contractNumber) {
      existing.contractNumbers.add(row.contractNumber);
      if (existing.sampleContracts.length < 4 && !existing.sampleContracts.includes(row.contractNumber)) {
        existing.sampleContracts.push(row.contractNumber);
      }
    }
    if (row.siteKey) {
      existing.siteKeys.add(row.siteKey);
    }
    if (row.siteName || row.addressRaw || row.customerName) {
      existing.sampleSites.add(firstNonEmpty(row.siteName, row.addressRaw, row.customerName));
    }
    rowsByKey.set(key, existing);
  }

  return Array.from(rowsByKey.values())
    .map((row) => ({
      wasteType: row.wasteType,
      wasteCode: row.wasteCode,
      frequency: row.frequency,
      containerVolume: row.containerVolume,
      containerType: row.containerType,
      itemCount: row.itemCount,
      siteCount: row.siteKeys.size,
      contractCount: row.contractNumbers.size,
      containerCount: row.containerCount,
      sampleSites: Array.from(row.sampleSites).slice(0, 4),
      sampleContracts: row.sampleContracts,
      createsOperationalRoutes: false
    }))
    .sort((left, right) => (
      left.wasteType.localeCompare(right.wasteType, "cs") ||
      left.frequency.localeCompare(right.frequency, "cs") ||
      Number(left.containerVolume) - Number(right.containerVolume) ||
      right.containerCount - left.containerCount
    ))
    .slice(0, 80);
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
  metadata = {},
  persistRowsLimit = null,
  derivedRowsLimit = null
}) {
  const db = collectionRoutesDatabase(env, true);
  const createdAt = nowIso();
  const batchId = randomId("collection-import-batch");
  const siteIds = new Map();
  const maxPersistRows = Number.isFinite(Number(persistRowsLimit)) && Number(persistRowsLimit) >= 0
    ? Math.floor(Number(persistRowsLimit))
    : null;
  const maxDerivedRows = Number.isFinite(Number(derivedRowsLimit)) && Number(derivedRowsLimit) >= 0
    ? Math.floor(Number(derivedRowsLimit))
    : null;
  const rowsToPersist = maxPersistRows === null ? preview.rows : preview.rows.slice(0, maxPersistRows);
  const rowsToDerive = maxDerivedRows === null ? rowsToPersist : rowsToPersist.slice(0, maxDerivedRows);
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
    issueSummaryRows: preview.issueSummaryRows,
    mappingGapRows: preview.mappingGapRows,
    routeDraftRows: preview.routeDraftRows,
    persistedRowCount: rowsToPersist.length,
    persistedRowsLimit: maxPersistRows,
    derivedRowCount: rowsToDerive.length,
    derivedRowsLimit: maxDerivedRows,
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

    const importRowRecords = rowsToPersist.map((row) => ({
      id: randomId("collection-import-row"),
      row,
      importSourceId: cleanString(row.sourceId) || row.rowKey || `manual-row-${row.rowNumber}`
    }));

    for (let index = 0; index < importRowRecords.length; index += 100) {
      const chunk = importRowRecords.slice(index, index + 100);
      await db.batch(chunk.map((record) => db.prepare(`
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
      `).bind(
        record.id,
        batchId,
        record.row.rowNumber,
        record.row.sourceEntity || sourceEntity,
        record.importSourceId,
        jsonString(manualRowSummary(record.row)),
        jsonString(record.row.issues || []),
        createdAt
      )));
    }

    for (const row of rowsToDerive) {
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

      for (const issue of row.issues || []) {
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
  let svozKaiserField = await resolveVistosSvozKaiserField(env, session);
  let consistencyFields = await resolveVistosSvozKaiserConsistencyFields(env, session);
  const baseContractColumns = withVistosSvozKaiserColumn(VISTOS_CONTRACT_COLUMNS, svozKaiserField, "Contract");
  const baseContractRowColumns = withVistosSvozKaiserColumn(VISTOS_CONTRACT_ROW_COLUMNS, svozKaiserField, "ContractRow");
  const contractColumns = withVistosConsistencyColumns(baseContractColumns, consistencyFields, "Contract");
  const contractRowColumns = withVistosConsistencyColumns(baseContractRowColumns, consistencyFields, "ContractRow");
  let contractsPage;
  let contractRowsPage;
  let productsPage;

  try {
    [contractsPage, contractRowsPage, productsPage] = await Promise.all([
      getAllVistosPages(env, session, "Contract", contractColumns, VISTOS_KOMUNAL_CONTRACT_FILTER),
      getAllVistosPages(env, session, "ContractRow", contractRowColumns, null),
      getAllVistosPages(env, session, "Product", VISTOS_PRODUCT_COLUMNS, null, { maxPages: 10 })
    ]);
  } catch (error) {
    const hasConsistencyColumns = contractColumns.length !== baseContractColumns.length || contractRowColumns.length !== baseContractRowColumns.length;
    if (hasConsistencyColumns && svozKaiserField?.confirmed) {
      try {
        [contractsPage, contractRowsPage, productsPage] = await Promise.all([
          getAllVistosPages(env, session, "Contract", baseContractColumns, VISTOS_KOMUNAL_CONTRACT_FILTER),
          getAllVistosPages(env, session, "ContractRow", baseContractRowColumns, null),
          getAllVistosPages(env, session, "Product", VISTOS_PRODUCT_COLUMNS, null, { maxPages: 10 })
        ]);
        consistencyFields = {
          ...consistencyFields,
          readFailed: true,
          message: `Konzistenční pole existují v metadatech, ale GetPageParam je teď nepřečetl: ${error?.message || "neznámá chyba"}.`
        };
      } catch (fallbackError) {
        if (!svozKaiserField?.confirmed) {
          throw fallbackError;
        }
        svozKaiserField = {
          ...svozKaiserField,
          confirmed: false,
          readFailed: true,
          message: `Pole ${svozKaiserField.entityName}.${svozKaiserField.columnName} existuje v metadatech, ale GetPageParam ho teď nepřečetl: ${fallbackError?.message || "neznámá chyba"}.`
        };
        consistencyFields = {
          ...consistencyFields,
          readFailed: true,
          message: `Konzistenční pole nebyla čitelná při fallbacku: ${fallbackError?.message || "neznámá chyba"}.`
        };
        [contractsPage, contractRowsPage, productsPage] = await Promise.all([
          getAllVistosPages(env, session, "Contract", VISTOS_CONTRACT_COLUMNS, VISTOS_KOMUNAL_CONTRACT_FILTER),
          getAllVistosPages(env, session, "ContractRow", VISTOS_CONTRACT_ROW_COLUMNS, null),
          getAllVistosPages(env, session, "Product", VISTOS_PRODUCT_COLUMNS, null, { maxPages: 10 })
        ]);
      }
    } else {
      if (!svozKaiserField?.confirmed) {
        throw error;
      }
      svozKaiserField = {
        ...svozKaiserField,
        confirmed: false,
        readFailed: true,
        message: `Pole ${svozKaiserField.entityName}.${svozKaiserField.columnName} existuje v metadatech, ale GetPageParam ho teď nepřečetl: ${error?.message || "neznámá chyba"}.`
      };
      [contractsPage, contractRowsPage, productsPage] = await Promise.all([
        getAllVistosPages(env, session, "Contract", VISTOS_CONTRACT_COLUMNS, VISTOS_KOMUNAL_CONTRACT_FILTER),
        getAllVistosPages(env, session, "ContractRow", VISTOS_CONTRACT_ROW_COLUMNS, null),
        getAllVistosPages(env, session, "Product", VISTOS_PRODUCT_COLUMNS, null, { maxPages: 10 })
      ]);
    }
  }
  const today = new Date();
  const kommunalContracts = contractsPage.rows;
  const contractIds = new Set(kommunalContracts.map((contract) => cleanString(contract?.Id)).filter(Boolean));
  const rowContractId = (row) => cleanString(row?.Contract_FK_RecordId || row?.Contract_FK || row?.Contract_FK_Id || row?.ContractId);
  const contractRowsForKommunalContracts = contractRowsPage.rows.filter((row) => contractIds.has(rowContractId(row)));
  const matchedContractIds = new Set(contractRowsForKommunalContracts.map((row) => rowContractId(row)).filter(Boolean));
  const contractsInDateRange = kommunalContracts.filter((contract) => dateInActiveRange(contract?.StartDate, contract?.EndDate, today));
  const contractRowsWithActiveFlag = contractRowsForKommunalContracts.filter((row) => booleanValue(row?.IsActive, true));
  const contractRowsInDateRange = contractRowsForKommunalContracts.filter((row) => dateInActiveRange(row?.StartDate, row?.EndDate, today));
  const contractRowsInStrictActiveDateRange = contractRowsForKommunalContracts.filter((row) => contractRowInActiveRange(row, today));
  const relevantContractRows = contractRowsForKommunalContracts;
  const productIds = new Set(relevantContractRows.map((row) => cleanString(row?.Product_FK_RecordId || row?.Product_FK)).filter(Boolean));
  const relevantProducts = productsPage.rows.filter((product) => productIds.has(cleanString(product?.Id)));
  const filterDiagnostics = {
    contractsBeforeVistosFilter: contractsPage.total,
    contractsAfterStatusAndTypeFilter: contractsPage.filtered || contractsPage.rows.length,
    contractsLoadedAfterStatusAndTypeFilter: contractsPage.rows.length,
    contractsPassingDateRange: contractsInDateRange.length,
    contractsUsedForPreview: kommunalContracts.length,
    contractsWithMatchedContractRows: matchedContractIds.size,
    contractRowsLoaded: contractRowsPage.rows.length,
    contractRowsMatchedToContracts: contractRowsForKommunalContracts.length,
    contractRowsPassingIsActiveFlag: contractRowsWithActiveFlag.length,
    contractRowsPassingDateRange: contractRowsInDateRange.length,
    contractRowsPassingStrictActiveDateRange: contractRowsInStrictActiveDateRange.length,
    contractRowsUsedForPreview: relevantContractRows.length,
    productsLoaded: productsPage.rows.length,
    productsMatchedToRows: relevantProducts.length,
    zeroResultReason: !kommunalContracts.length
      ? "Vistos nevrátil žádné Contract pro filtr Status_FK = 74 a Typsmlouvy_FK = [14735]."
      : !contractRowsForKommunalContracts.length
        ? "ContractRow se nepodařilo napárovat na načtené Komunál smlouvy. Preview zobrazuje smlouvy jako needs_review."
        : ""
  };

  return {
    configured: true,
    apiStatus: "ready",
    preview: buildVistosKommunalPreview({
      contracts: kommunalContracts,
      contractRows: relevantContractRows,
      products: relevantProducts,
      today,
      filterDiagnostics,
      svozKaiserField,
      consistencyFields,
      totals: {
        contracts: {
          total: contractsPage.total,
          filtered: contractsPage.filtered,
          loaded: contractsPage.rows.length,
          dateValid: contractsInDateRange.length,
          dateExcluded: Math.max(0, kommunalContracts.length - contractsInDateRange.length),
          withMatchedContractRows: matchedContractIds.size,
          usedForPreview: kommunalContracts.length,
          capped: contractsPage.capped
        },
        contractRows: {
          total: contractRowsPage.total,
          filtered: contractRowsPage.filtered,
          loaded: contractRowsPage.rows.length,
          matchedToContracts: contractRowsForKommunalContracts.length,
          passingIsActiveFlag: contractRowsWithActiveFlag.length,
          passingDateRange: contractRowsInDateRange.length,
          passingStrictActiveDateRange: contractRowsInStrictActiveDateRange.length,
          usedForPreview: relevantContractRows.length,
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
    loaded.preview.summary.status = "empty";
    loaded.preview.summary.message = "Preview nenačetlo žádné smlouvy. Zkontrolujte diagnostiku filtrů.";
    loaded.preview.rows = [];
    loaded.preview.issuePreviewRows = [{
      contractNumber: "-",
      siteName: "-",
      issueType: "vistos-komunal-empty-preview",
      severity: "warning",
      message: loaded.preview.metadata?.filterDiagnostics?.zeroResultReason || "Vistos Komunál preview skončilo bez smluv."
    }];
    loaded.preview.issueSummaryRows = [{
      issueType: "vistos-komunal-empty-preview",
      severity: "warning",
      message: loaded.preview.metadata?.filterDiagnostics?.zeroResultReason || "Vistos Komunál preview skončilo bez smluv.",
      count: 1
    }];
    loaded.preview.metadata.mappingStats.issues = loaded.preview.issuePreviewRows.length;
    loaded.preview.summary.issueCount = loaded.preview.issuePreviewRows.length;
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
    },
    persistRowsLimit: VISTOS_KOMUNAL_PERSIST_ROWS_LIMIT,
    derivedRowsLimit: 250
  });
}

export async function createCollectionRoutesVistosSvozKaiserWatchdog(env) {
  let loaded;
  try {
    loaded = await loadVistosKommunalPreviewData(env);
  } catch (error) {
    if (error instanceof CollectionRoutesStoreError && error.code?.startsWith("vistos_api")) {
      return {
        apiStatus: error.code === "vistos_api_not_configured" ? "not_configured" : "waiting",
        mode: "vistos-svoz-kaiser-watchdog",
        source: "vistos",
        generatedAt: nowIso(),
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false,
        summary: {
          status: "waiting",
          errorCount: 0,
          siteErrorCount: 0,
          checkedRows: 0,
          contractCount: 0,
          itemCount: 0,
          message: error.message
        },
        requiredFields: [],
        issueSummary: [],
        issueRows: [],
        siteAlerts: []
      };
    }
    throw error;
  }

  if (!loaded.configured) {
    return {
      apiStatus: loaded.apiStatus,
      mode: "vistos-svoz-kaiser-watchdog",
      source: "vistos",
      generatedAt: nowIso(),
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false,
      summary: {
        status: "waiting",
        errorCount: 0,
        siteErrorCount: 0,
        checkedRows: 0,
        contractCount: 0,
        itemCount: 0,
        message: loaded.message
      },
      requiredFields: [],
      issueSummary: [],
      issueRows: [],
      siteAlerts: []
    };
  }

  return buildVistosSvozKaiserWatchdog(loaded.preview, loaded.apiStatus || "ready");
}

export async function createCollectionRoutesVistosKommunalPreviewExport(env, {
  issueType = "",
  query = "",
  limit = 5000
} = {}) {
  const loaded = await loadVistosKommunalPreviewData(env);

  if (!loaded.configured) {
    throw new CollectionRoutesStoreError(loaded.message, 503, "vistos_api_not_configured");
  }

  const preview = loaded.preview || {};
  const type = cleanString(issueType);
  const search = cleanString(query).toLowerCase();
  const maxRows = Math.max(1, Math.min(Number(limit) || 5000, 10000));
  const allRows = Array.isArray(preview.rows) ? preview.rows : [];
  const rows = allRows
    .filter((row) => {
      if (!type) {
        return true;
      }
      return (row.issues || []).some((issue) => cleanString(issue?.type) === type);
    })
    .filter((row) => {
      if (!search) {
        return true;
      }
      return [
        row.sourceId,
        row.sourceContractId,
        row.sourceCustomerId,
        row.sourceSiteId,
        row.contractId,
        row.contractRowId,
        row.productId,
        row.contractNumber,
        row.customerName,
        row.branchName,
        row.addressRaw,
        row.siteName,
        row.wasteType,
        row.wasteCode,
        row.frequency,
        row.containerVolume,
        row.containerCount,
        row.containerType,
        row.productName,
        row.rowName,
        row.note,
        row.mappingStatus,
        row.rowKey,
        row.siteKey,
        row.unitPrice
      ].some((value) => cleanString(value).toLowerCase().includes(search));
    })
    .slice(0, maxRows);

  return {
    status: "preview-export",
    apiStatus: loaded.apiStatus || "ready",
    phase: VISTOS_KOMUNAL_PHASE,
    mode: "vistos-komunal-preview-export",
    source: "vistos",
    sourceMode: "vistos-komunal-preview",
    issueType: type,
    query: search,
    rowCount: rows.length,
    totalPreviewRows: allRows.length,
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    summary: preview.summary || {},
    issueSummaryRows: preview.issueSummaryRows || [],
    metadata: preview.metadata || {},
    rows
  };
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
