export const COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const COLLECTION_ROUTE_OPTIMIZATION_MAX_FILES = 20;
export const COLLECTION_ROUTE_OPTIMIZATION_MAX_ROWS = 1200;

const decoder = new TextDecoder("utf-8");

export const COLLECTION_ROUTE_VEHICLES = [
  {
    code: "A",
    registrationNumber: "3BN 3558",
    label: "A - 3BN 3558",
    driver: "Jakub Kozlíček",
    capacityTons: { SKO: 6, PAPIR: 2, PLAST: 1 }
  },
  {
    code: "B",
    registrationNumber: "1BP 8373",
    label: "B - 1BP 8373",
    driver: "Miroslav Vašek",
    capacityTons: { SKO: 6, PAPIR: 2, PLAST: 1 }
  },
  {
    code: "C",
    registrationNumber: "3BE 2831",
    label: "C - 3BE 2831",
    driver: "Miroslav Florián",
    capacityTons: { SKO: 8, PAPIR: 2.5, PLAST: 1 }
  },
  {
    code: "D",
    registrationNumber: "gastro",
    label: "D - gastro",
    driver: "",
    capacityTons: { BIO: 1 }
  }
];

const WEEKDAY_LABELS = ["PO", "ÚT", "ST", "ČT", "PÁ"];
const DEFAULT_DAY_VEHICLES = {
  PO: "A",
  "ÚT": "B",
  ST: "C",
  "ČT": "A",
  "PÁ": "B"
};
const WASTE_WEIGHTS_TONS = {
  SKO: { 1100: 0.06, 240: 0.015, 120: 0.006 },
  PAPIR: { 1100: 0.02, 240: 0.004, 120: 0.002 },
  PLAST: { 1100: 0.02, 240: 0.004, 120: 0.002 },
  SKLO: { 1100: 0.014, 240: 0.003, 120: 0.002 },
  BIO: { 1100: 0.02, 240: 0.004, 120: 0.002, 30: 0.001 }
};
const SERVICE_MINUTES_BY_VOLUME = { 120: 3, 240: 3, 1100: 5 };

function cleanValue(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function normalizeKey(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function bytesFrom(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array(input || []);
}

function decodeText(bytes) {
  return decoder.decode(bytesFrom(bytes)).replace(/^\uFEFF/, "");
}

function isZipXlsx(bytes) {
  const data = bytesFrom(bytes);
  return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

function isLegacyXls(bytes) {
  const data = bytesFrom(bytes);
  return data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0;
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 10);
  const candidates = [";", "\t", ","];
  let bestDelimiter = ";";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = lines.reduce((sum, line) => sum + countDelimiter(line, delimiter), 0);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }
  return bestDelimiter;
}

function compactRows(rows) {
  return rows
    .map((row) => row.map(cleanValue))
    .filter((row) => row.some(Boolean));
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cleanValue(cell));
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cleanValue(cell));
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cleanValue(cell));
    rows.push(row);
  }
  return compactRows(rows);
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function parseZipEntries(bytes) {
  const data = bytesFrom(bytes);
  const endOffset = findEndOfCentralDirectory(data);
  if (endOffset < 0) {
    throw new Error("Soubor XLSX nejde přečíst jako ZIP.");
  }

  const directoryOffset = readUint32(data, endOffset + 16);
  const entryCount = readUint16(data, endOffset + 10);
  const entries = new Map();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(data, offset) !== 0x02014b50) {
      throw new Error("Soubor XLSX má nečekanou ZIP strukturu.");
    }
    const method = readUint16(data, offset + 10);
    const compressedSize = readUint32(data, offset + 20);
    const nameLength = readUint16(data, offset + 28);
    const extraLength = readUint16(data, offset + 30);
    const commentLength = readUint16(data, offset + 32);
    const localHeaderOffset = readUint32(data, offset + 42);
    const name = decodeText(data.slice(offset + 46, offset + 46 + nameLength));

    if (readUint32(data, localHeaderOffset) !== 0x04034b50) {
      throw new Error("Soubor XLSX má poškozenou lokální ZIP hlavičku.");
    }
    const localNameLength = readUint16(data, localHeaderOffset + 26);
    const localExtraLength = readUint16(data, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name.replace(/^\/+/, ""), {
      name,
      method,
      data: data.slice(dataStart, dataStart + compressedSize)
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateZipEntry(entry) {
  if (!entry) {
    return null;
  }
  if (entry.method === 0) {
    return entry.data;
  }
  if (entry.method !== 8) {
    throw new Error("Soubor XLSX používá nepodporovanou kompresi.");
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("Tento běh neumí rozbalit XLSX. Použijte CSV.");
  }
  const formats = ["deflate-raw", "deflate"];
  let lastError = null;
  for (const format of formats) {
    try {
      const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message || "Soubor XLSX se nepodařilo rozbalit.");
}

function decodeXml(value) {
  return cleanValue(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(source);
  return match ? decodeXml(match[1]) : "";
}

function normalizeZipPath(value) {
  const normalized = [];
  for (const part of cleanValue(value).replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  return normalized.join("/");
}

function resolveWorkbookSheetPath(workbookXml, relsXml) {
  const firstSheet = /<sheet\b[^>]*>/i.exec(workbookXml)?.[0] || "";
  const relationshipId = xmlAttribute(firstSheet, "r:id");
  if (!relationshipId) {
    return "xl/worksheets/sheet1.xml";
  }
  const relMatch = [...relsXml.matchAll(/<Relationship\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((node) => xmlAttribute(node, "Id") === relationshipId);
  const target = xmlAttribute(relMatch || "", "Target");
  return target ? normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
}

function resolveWorkbookSheetName(workbookXml) {
  const firstSheet = /<sheet\b[^>]*>/i.exec(workbookXml)?.[0] || "";
  return xmlAttribute(firstSheet, "name") || "List 1";
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => (
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((textMatch) => decodeXml(textMatch[1]))
      .join("")
  ));
}

function columnIndexFromReference(reference) {
  const match = /^[A-Z]+/i.exec(cleanValue(reference));
  return match
    ? [...match[0].toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
    : -1;
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells = [];
    let fallbackColumnIndex = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1] || "";
      const body = cellMatch[2] || "";
      const type = xmlAttribute(attributes, "t");
      const reference = xmlAttribute(attributes, "r");
      const columnIndex = columnIndexFromReference(reference);
      const targetIndex = columnIndex >= 0 ? columnIndex : fallbackColumnIndex;
      const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] || "";
      const inlineValue = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1])).join("");
      cells[targetIndex] = cleanValue(type === "s"
        ? sharedStrings[Number(rawValue)] || ""
        : type === "inlineStr"
          ? inlineValue
          : decodeXml(rawValue));
      fallbackColumnIndex = targetIndex + 1;
    }
    rows.push(cells.map((cell) => cleanValue(cell)));
  }
  return compactRows(rows);
}

async function zipEntryText(entries, path) {
  const entry = entries.get(path);
  const data = await inflateZipEntry(entry);
  return data ? decodeText(data) : "";
}

async function parseXlsxRows(bytes) {
  const entries = parseZipEntries(bytes);
  const workbookXml = await zipEntryText(entries, "xl/workbook.xml");
  const relsXml = await zipEntryText(entries, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await zipEntryText(entries, "xl/sharedStrings.xml");
  const sheetPath = resolveWorkbookSheetPath(workbookXml, relsXml);
  const sheetXml = await zipEntryText(entries, sheetPath) || await zipEntryText(entries, "xl/worksheets/sheet1.xml");
  if (!sheetXml) {
    throw new Error("V XLSX se nepodařilo najít první list.");
  }
  return {
    rows: parseWorksheetRows(sheetXml, parseSharedStrings(sharedStringsXml)),
    sheetName: resolveWorkbookSheetName(workbookXml)
  };
}

function parseTextRows(bytes) {
  const text = decodeText(bytes);
  const delimiter = detectDelimiter(text);
  return {
    rows: parseDelimitedRows(text, delimiter),
    sheetName: "",
    delimiter
  };
}

async function parseSpreadsheetRows(file) {
  const bytes = bytesFrom(file.buffer);
  const name = cleanValue(file.filename || file.name).toLowerCase();
  const type = cleanValue(file.contentType || file.type).toLowerCase();
  if (isLegacyXls(bytes) || name.endsWith(".xls")) {
    return {
      unsupported: true,
      reason: "Starý binární .xls v produkci nepřečtu. Soubor prosím přeuložte jako .xlsx nebo CSV.",
      rows: [],
      sheetName: ""
    };
  }
  if (name.endsWith(".xlsx") || type.includes("spreadsheetml") || isZipXlsx(bytes)) {
    return parseXlsxRows(bytes);
  }
  return parseTextRows(bytes);
}

function routeMetaFromFilename(filename) {
  const normalized = normalizeKey(filename);
  const day = [
    ["PONDELI", "PO"],
    ["UTERY", "ÚT"],
    ["STREDA", "ST"],
    ["CTVRT", "ČT"],
    ["PATEK", "PÁ"]
  ].find(([needle]) => normalized.includes(needle))?.[1] || "";
  const parity = normalized.includes("SUDE") || normalized.includes("SUDY") || normalized.includes("SUDA")
    ? "sudý týden"
    : normalized.includes("LICHE") || normalized.includes("LICHY") || normalized.includes("LICHA")
      ? "lichý týden"
      : normalized.includes("MESICNI") ? "měsíční" : "";
  return { day, parity };
}

function inferWaste(text) {
  const normalized = normalizeKey(text);
  const key = normalized.replace(/\s+/g, "");
  if (key.includes("200201") || key.includes("200108") || /\bBIO\b/.test(normalized) || /\bGASTRO\b/.test(normalized)) {
    return { wasteType: "BIO", wasteCode: key.includes("200108") || /\bGASTRO\b/.test(normalized) ? "200108" : "200201" };
  }
  if (key.includes("200301") || /\bSKO\b/.test(normalized) || normalized.includes("KOMUNAL")) return { wasteType: "SKO", wasteCode: "200301" };
  if (key.includes("200101") || key.includes("150101") || /\bPAPIR\b/.test(normalized)) return { wasteType: "PAPIR", wasteCode: key.includes("150101") ? "150101" : "200101" };
  if (key.includes("200139") || key.includes("150102") || /\bPLAST\b/.test(normalized)) return { wasteType: "PLAST", wasteCode: key.includes("150102") ? "150102" : "200139" };
  if (key.includes("200102") || /\bSKLO\b/.test(normalized)) return { wasteType: "SKLO", wasteCode: "200102" };
  if (key.includes("150106") || key.includes("SMESNEOBALY")) return { wasteType: "SMESNE OBALY", wasteCode: "150106" };
  return { wasteType: "", wasteCode: "" };
}

function inferFrequency(text, routeMeta) {
  const normalized = normalizeKey(text).replace("×", "X");
  const explicit = [...normalized.matchAll(/\b([1235])\s*X\s*(7|14|30)\b(?!\s*(?:L|LT|LTR|LITR))/g)];
  if (explicit.length) {
    const last = explicit[explicit.length - 1];
    return `${last[1]}x${last[2]}`;
  }
  if (routeMeta.parity === "měsíční") {
    return "1x30";
  }
  if (routeMeta.parity === "sudý týden" || routeMeta.parity === "lichý týden") {
    return "1x14";
  }
  return "";
}

function inferContainer(text) {
  const normalized = normalizeKey(text).replace(",", ".");
  const counted = normalized.match(/(\d+)\s*[X]\s*(30|60|80|120|240|360|660|770|1100|1500|2500|5000)\s*(?:L|LT|LTR)?/);
  if (counted) {
    return { containerCount: Math.max(1, Number(counted[1]) || 1), containerVolume: Number(counted[2]) || 0 };
  }
  const volume = normalized.match(/\b(30|60|80|120|240|360|660|770|1100|1500|2500|5000)\s*(?:L|LT|LTR)\b/);
  return { containerCount: 1, containerVolume: volume ? Number(volume[1]) || 0 : 0 };
}

function inferRegion(text, waste) {
  const key = normalizeKey(text);
  if (key.includes("BLANSKO") || (waste.wasteType === "BIO" && key.includes("BIO"))) {
    return "Blansko";
  }
  if (key.includes("BRNO")) {
    return "Brno";
  }
  return "Brno/Blansko";
}

function routeRowLooksUseful(cells, text) {
  const key = normalizeKey(text);
  if (key.length < 8 || cells.length < 2) {
    return false;
  }
  if (/^(PO|UT|ST|CT|PA|SOBOTA|NEDELE|TRASA|ZAKAZNIK|ADRESA|CELKEM|SUMA|DATUM)\b/.test(key)) {
    return false;
  }
  return /\b(30|60|80|120|240|360|660|770|1100|1500|2500|5000)\b/.test(key) ||
    /SKO|KOMUNAL|PAPIR|PLAST|SKLO|BIO|GASTRO|200301|200101|200139|200102|200201|150106|150101|150102/.test(key);
}

function suggestedDays(frequency, baselineDay) {
  if (frequency === "5x7") return WEEKDAY_LABELS;
  if (frequency === "3x7") return ["PO", "ST", "PÁ"];
  if (frequency === "2x7") return baselineDay && ["PO", "ÚT"].includes(baselineDay) ? [baselineDay, "ČT"] : ["ÚT", "ČT"];
  if (frequency === "1x30") return [baselineDay || "ST"];
  return [baselineDay || "PO"];
}

function vehicleFor({ day, wasteType, wasteCode, region, text }) {
  if (wasteCode === "200108" || normalizeKey(text).includes("GASTRO")) {
    return COLLECTION_ROUTE_VEHICLES.find((vehicle) => vehicle.code === "D");
  }
  if (wasteType === "BIO" && region === "Blansko") {
    return COLLECTION_ROUTE_VEHICLES.find((vehicle) => vehicle.code === "B");
  }
  const code = DEFAULT_DAY_VEHICLES[day] || "A";
  return COLLECTION_ROUTE_VEHICLES.find((vehicle) => vehicle.code === code) || COLLECTION_ROUTE_VEHICLES[0];
}

function disposalSiteFor({ wasteType, region }) {
  if (wasteType === "PAPIR") return "Hamburger Recycling CZ, Pratecká 788/12, Brno Tuřany";
  if (wasteType === "PLAST") return "FCC Brno, Líšeňská 35, Brno";
  if (wasteType === "BIO" && region === "Blansko") return "Fertia kompostárna, Blansko";
  return "SAKO Brno, Jedovnická 2";
}

function estimatedServiceMinutes(volume, count) {
  return (SERVICE_MINUTES_BY_VOLUME[volume] || (volume >= 1000 ? 5 : 3)) * Math.max(1, Number(count) || 1);
}

function estimatedWeightTons(wasteType, volume, count) {
  const weight = WASTE_WEIGHTS_TONS[wasteType]?.[volume] || 0;
  return Math.round(weight * Math.max(1, Number(count) || 1) * 1000) / 1000;
}

function sourceRouteName(filename) {
  return cleanValue(filename)
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, " ");
}

function buildRowsFromSheet({ rows, filename, sheetName }) {
  const routeMeta = routeMetaFromFilename(filename);
  const output = [];
  rows.forEach((cells, index) => {
    const cleanedCells = cells.map(cleanValue).filter(Boolean);
    const text = cleanedCells.join(" | ");
    if (!routeRowLooksUseful(cleanedCells, text)) {
      return;
    }
    const waste = inferWaste(text);
    const frequency = inferFrequency(text, routeMeta) || "1x7";
    const container = inferContainer(text);
    const region = inferRegion(text, waste);
    const days = suggestedDays(frequency, routeMeta.day);
    for (const day of days) {
      const vehicle = vehicleFor({ day, ...waste, region, text });
      output.push({
        sourceFile: cleanValue(filename),
        sheetName: cleanValue(sheetName),
        sourceRoute: sourceRouteName(filename),
        sourceRowNumber: index + 1,
        originalText: text.slice(0, 500),
        originalDay: routeMeta.day || "-",
        originalWeek: routeMeta.parity || "-",
        suggestedDay: day,
        vehicleCode: vehicle.code,
        vehicleRegistration: vehicle.registrationNumber,
        vehicleLabel: vehicle.label,
        region,
        wasteType: waste.wasteType || "-",
        wasteCode: waste.wasteCode || "-",
        frequency,
        containerVolume: container.containerVolume,
        containerCount: container.containerCount,
        estimatedServiceMinutes: estimatedServiceMinutes(container.containerVolume, container.containerCount),
        estimatedWeightTons: estimatedWeightTons(waste.wasteType, container.containerVolume, container.containerCount),
        disposalSite: disposalSiteFor({ wasteType: waste.wasteType, region }),
        optimizationGroup: `${day}-${vehicle.code}-${waste.wasteType || "ODPAD"}-${frequency}`,
        reason: "Read-only návrh: drží stabilní četnost, všední dny PO-PÁ a přiřazení vozidla podle odpadu/oblasti.",
        confidence: waste.wasteType && container.containerVolume ? "střední" : "nízká",
        createsOperationalRoutes: false
      });
    }
  });
  return output;
}

export async function buildCollectionRouteOptimizationPreview({ files = [] } = {}) {
  const safeFiles = files.slice(0, COLLECTION_ROUTE_OPTIMIZATION_MAX_FILES);
  const parsedFiles = [];
  const unsupportedFiles = [];
  const rows = [];

  for (const file of safeFiles) {
    const filename = cleanValue(file.filename || file.name || "soubor");
    const parsed = await parseSpreadsheetRows(file);
    if (parsed.unsupported) {
      unsupportedFiles.push({ filename, reason: parsed.reason });
      continue;
    }
    const sourceRows = compactRows(parsed.rows || []);
    const plannedRows = buildRowsFromSheet({ rows: sourceRows, filename, sheetName: parsed.sheetName });
    parsedFiles.push({
      filename,
      sheetName: parsed.sheetName || "",
      sourceRowCount: sourceRows.length,
      plannedRowCount: plannedRows.length
    });
    rows.push(...plannedRows);
  }

  const limitedRows = rows.slice(0, COLLECTION_ROUTE_OPTIMIZATION_MAX_ROWS);
  const dayCounts = new Map();
  const vehicleCounts = new Map();
  for (const row of limitedRows) {
    dayCounts.set(row.suggestedDay, (dayCounts.get(row.suggestedDay) || 0) + 1);
    vehicleCounts.set(row.vehicleCode, (vehicleCounts.get(row.vehicleCode) || 0) + 1);
  }

  return {
    status: "preview",
    phase: "1F",
    mode: "route-optimization-preview",
    source: "excel-baseline-upload",
    rowCount: limitedRows.length,
    totalExtractedRows: rows.length,
    parsedFiles,
    unsupportedFiles,
    vehicles: COLLECTION_ROUTE_VEHICLES,
    summary: {
      fileCount: safeFiles.length,
      parsedFileCount: parsedFiles.length,
      unsupportedFileCount: unsupportedFiles.length,
      rowCount: limitedRows.length,
      dayCounts: Object.fromEntries(dayCounts),
      vehicleCounts: Object.fromEntries(vehicleCounts),
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    rows: limitedRows
  };
}
