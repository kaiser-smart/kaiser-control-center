const COLLECTION_ROUTES_DB_BINDING = "SMART_ODPADY_DB";
const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
export const COLLECTION_ROUTES_MANUAL_IMPORT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
const COLLECTION_ROUTES_VISTOS_MAX_ROWS = 1000;
const MANUAL_IMPORT_PHASE = "1C";
const MANUAL_IMPORT_MESSAGE = "Import preview – nevytváří ostré trasy.";
const VISTOS_DISCOVERY_PHASE = "1D";
const VISTOS_DISCOVERY_MESSAGE = "Vistos API discovery – import preview nevytváří ostré trasy.";
const DEFAULT_VISTOS_DISCOVERY_PATHS = ["/Contract", "/ServiceList"];

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
  const match = raw.match(/\d+/);
  const volume = match ? Number(match[0]) : 0;
  return {
    volume,
    known: Number.isFinite(volume) && ALLOWED_CONTAINER_VOLUMES.has(volume)
  };
}

function normalizeContainerCount(value) {
  const count = Math.max(0, Math.round(numericValue(cleanString(value).replace(",", "."), 0)));
  return count || 1;
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
  return row.issues.some((issue) => issue.type === "missing-address" || issue.type === "unclear-location")
    ? "missing"
    : "approximate";
}

function manualRowSummary(row) {
  return {
    customerName: row.customerName,
    addressRaw: row.addressRaw,
    siteName: row.siteName,
    wasteType: row.wasteType,
    wasteCode: row.wasteCode,
    frequency: row.frequency,
    containerVolume: row.containerVolume,
    containerCount: row.containerCount,
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
      const importSourceId = row.rowKey || `manual-row-${row.rowNumber}`;
      let siteId = "";

      if (row.siteKey && !siteIds.has(row.siteKey)) {
        siteId = randomId("collection-site");
        siteIds.set(row.siteKey, siteId);
        const locationQuality = siteLocationQuality(row);

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
            normalizeLookupKey(row.customerName),
            row.siteKey,
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
              quality,
              status,
              source,
              note,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, 'needs-review', ?, ?, ?, ?)
          `)
          .bind(
            randomId("collection-site-location"),
            siteId,
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
          sourceEntity,
          importSourceId,
          jsonString(manualRowSummary(row)),
          jsonString(row.issues),
          createdAt
        )
        .run();

      let serviceId = "";
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
              status,
              last_import_batch_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, '', 'preview', ?, ?, ?)
          `)
          .bind(
            serviceId,
            siteId,
            importSourceId,
            row.wasteType,
            row.wasteCode,
            row.frequency,
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
            VALUES (?, ?, ?, 'container', ?, ?, ?, 'preview', ?, ?, ?)
          `)
          .bind(
            randomId("collection-container"),
            siteId,
            serviceId,
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
            siteId,
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
  metadata = {},
  issues = []
}) {
  const db = collectionRoutesDatabase(env, true);
  const createdAt = nowIso();
  const batchId = randomId("collection-import-batch");
  const safeIssues = issues.length ? issues : [{ issueType, severity, message }];
  const metadataJson = {
    phase: VISTOS_DISCOVERY_PHASE,
    mode: "vistos-api-discovery",
    source: "vistos-api-discovery",
    vistosConfigured: isVistosApiConfigured(env),
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
        VALUES (?, 'vistos', 'api-discovery', ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `)
      .bind(
        batchId,
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
