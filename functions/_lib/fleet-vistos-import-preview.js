export const FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const FLEET_VISTOS_IMPORT_MAX_ROWS = 5000;
export const FLEET_VISTOS_IMPORT_PREVIEW_ROWS = 100;

const decoder = new TextDecoder("utf-8");

const FIELD_DEFINITIONS = [
  {
    target: "vistosVehicleId",
    label: "Vistos ID",
    category: "identifikace",
    importAction: "klíč pro budoucí párování",
    aliases: ["Id", "ID", "Vistos ID"]
  },
  {
    target: "registrationNumber",
    label: "Registrační značka",
    category: "identifikace",
    importAction: "klíč pro budoucí párování",
    aliases: ["RegistrationPlate", "Registrační značka vozidla", "SPZ", "RZ"]
  },
  {
    target: "vin",
    label: "VIN",
    category: "identifikace",
    importAction: "klíč pro budoucí párování",
    aliases: ["VIN", "VIN vozidla"]
  },
  {
    target: "internalVehicleNumber",
    label: "Evidenční číslo",
    category: "identifikace",
    importAction: "mapovat do náhledu",
    aliases: ["Evidencnicislovozidla", "Evidenční číslo vozidla"]
  },
  {
    target: "name",
    label: "Název",
    category: "základ",
    importAction: "mapovat do náhledu",
    aliases: ["Name", "Název"]
  },
  {
    target: "vehicleCategory",
    label: "Kategorie vozidla",
    category: "základ",
    importAction: "mapovat do náhledu",
    aliases: ["CarCategory_FK", "Kategorie vozidla"]
  },
  {
    target: "vehicleStatus",
    label: "Stav vozidla",
    category: "základ",
    importAction: "mapovat do náhledu",
    aliases: ["Stavvozidla_FK", "Stav vozidla"]
  },
  {
    target: "isActive",
    label: "Aktivní",
    category: "základ",
    importAction: "mapovat do náhledu",
    aliases: ["IsActive", "Aktivní"]
  },
  {
    target: "owner",
    label: "Vlastník vozidla",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Vlastnikvozidla_FK", "Vlastník vozidla"]
  },
  {
    target: "assignedDriver",
    label: "Řidič",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Ridic_FK", "Řidič", "Řidič vozidla"]
  },
  {
    target: "assignedTo",
    label: "Přiřazeno",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Role__AssignedTo", "Přiřazeno"]
  },
  {
    target: "discussionParticipant",
    label: "Účastník diskuze",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Role__DiscussionParticipant", "Účastník diskuze"]
  },
  {
    target: "purchasedFrom1",
    label: "Zakoupeno od 1",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Vozidlozakoupenood_1_FK", "Vozidlo zakoupeno od (1)"]
  },
  {
    target: "purchasedFrom2",
    label: "Zakoupeno od 2",
    category: "vazby",
    importAction: "mapovat do náhledu",
    aliases: ["Vozidlozakoupenood_2_FK", "Vozidlo zakoupeno od (2)"]
  },
  {
    target: "technicalInspectionValidTo",
    label: "Konec STK",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["STK_Konec", "Konec STK"]
  },
  {
    target: "pressureTestDate",
    label: "Datum tlakové zkoušky",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["DatePressureTest", "Datum tlakové zkoušky"]
  },
  {
    target: "purchaseDate",
    label: "Datum zakoupení",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["Datumzakoupeni", "Datum zakoupení"]
  },
  {
    target: "startDate",
    label: "Datum zařazení",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["StartingDate", "Datum zařazení"]
  },
  {
    target: "soldDate",
    label: "Datum prodeje",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["Datumprodeje", "Datum prodeje"]
  },
  {
    target: "decommissionedDate",
    label: "Datum vyřazení",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["EliminatedDate", "Datum vyřazení"]
  },
  {
    target: "leasingEndDate",
    label: "Konec leasingu",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["KonecLeasingu", "Konec leasingu"]
  },
  {
    target: "warrantyEndDate",
    label: "Konec záruky",
    category: "termíny",
    importAction: "mapovat do náhledu",
    aliases: ["Koneczaruky", "Konec záruky"]
  },
  {
    target: "leasingProvider",
    label: "Leasing",
    category: "finance",
    importAction: "mapovat do náhledu",
    aliases: ["Leasing_FK", "Leasing"]
  },
  {
    target: "purchasePriceCzk",
    label: "Pořizovací cena bez DPH",
    category: "finance",
    importAction: "mapovat do náhledu",
    aliases: ["Porizovacicena", "Pořizovací cena Kč (bez DPH)", "Pořizovací cena"]
  },
  {
    target: "insuranceCascoPriceCzk",
    label: "Cena HAV",
    category: "pojištění",
    importAction: "mapovat do náhledu",
    aliases: ["PojistenicenaKc_HAV_", "Pojištění cena Kč HAV"]
  },
  {
    target: "insuranceLiabilityPriceCzk",
    label: "Cena POV",
    category: "pojištění",
    importAction: "mapovat do náhledu",
    aliases: ["PojistenicenaKc_POV_", "Pojištění cena Kč POV"]
  },
  {
    target: "insuranceCascoCompany",
    label: "Pojišťovna HAV",
    category: "pojištění",
    importAction: "mapovat do náhledu",
    aliases: ["Pojistovna_HAV_FK", "Pojišťovna HAV"]
  },
  {
    target: "insuranceLiabilityCompany",
    label: "Pojišťovna POV",
    category: "pojištění",
    importAction: "mapovat do náhledu",
    aliases: ["Pojistovna_POV_FK", "Pojišťovna POV"]
  },
  {
    target: "fuelChipId",
    label: "Tankovací ID čip",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["TankovaciIDcipvozidlo", "Tankovací ID čip vozidlo"]
  },
  {
    target: "fuelTankLiters",
    label: "Objem nádrže PHM",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["objem_nadrze_PHM", "Objem nádrže PHM"]
  },
  {
    target: "odometerKm",
    label: "Stav tachometru",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["Odometer", "Stav tachometru"]
  },
  {
    target: "fuelConsumptionPrimary1",
    label: "Spotřeba 1",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["FuelConsumptionPrimary1"]
  },
  {
    target: "fuelConsumptionPrimary2",
    label: "Spotřeba 2",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["FuelConsumptionPrimary2"]
  },
  {
    target: "fuelConsumptionPrimary3",
    label: "Spotřeba 3",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["FuelConsumptionPrimary3"]
  },
  {
    target: "fuelConsumptionPrimary4",
    label: "Spotřeba 4",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["FuelConsumptionPrimary4"]
  },
  {
    target: "fuelConsumptionPrimary5",
    label: "Spotřeba 5",
    category: "provoz",
    importAction: "mapovat do náhledu",
    aliases: ["FuelConsumptionPrimary5"]
  },
  {
    target: "description",
    label: "Popis",
    category: "poznámky",
    importAction: "mapovat do náhledu",
    aliases: ["Description", "Popis"]
  },
  {
    target: "documentCount",
    label: "Počet dokumentů",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["StatsDocumentCount", "Počet dokumentů"]
  },
  {
    target: "emailCount",
    label: "Počet e-mailů",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["StatsEmailCount", "Počet e-mailů"]
  },
  {
    target: "discussionMessageCount",
    label: "Počet zpráv diskuze",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["StatsDiscussionMessageCount", "Počet zpráv diskuze"]
  },
  {
    target: "createdAt",
    label: "Vytvořeno",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["Created", "Vytvořeno"]
  },
  {
    target: "createdBy",
    label: "Vytvořil",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["CreatedBy_FK", "Vytvořil"]
  },
  {
    target: "modifiedAt",
    label: "Upraveno",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["Modified", "Upraveno"]
  },
  {
    target: "modifiedBy",
    label: "Upravil",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["ModifiedBy_FK", "Upravil"]
  },
  {
    target: "lastChangeDate",
    label: "Poslední změna",
    category: "audit",
    importAction: "mapovat do náhledu",
    aliases: ["LastChangeDate", "Poslední změna"]
  }
];

const FIELD_BY_ALIAS = new Map();

for (const field of FIELD_DEFINITIONS) {
  for (const alias of [field.target, field.label, ...field.aliases]) {
    FIELD_BY_ALIAS.set(normalizeHeader(alias), field);
  }
}

function cleanValue(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function normalizeHeader(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

function isXlsxFile(filename, contentType, bytes) {
  const name = cleanValue(filename).toLowerCase();
  const type = cleanValue(contentType).toLowerCase();
  const data = bytesFrom(bytes);

  return (
    name.endsWith(".xlsx") ||
    type.includes("spreadsheetml") ||
    (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04)
  );
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
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

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === delimiter) {
      row.push(cleanValue(cell));
      cell = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      row.push(cleanValue(cell));
      cell = "";
      rows.push(row);
      row = [];

      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cleanValue(cell));
    rows.push(row);
  }

  return compactRows(rows);
}

function compactRows(rows) {
  return rows
    .map((row) => row.map(cleanValue))
    .filter((row) => row.some(Boolean));
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
    throw new Error("Tento běh neumí rozbalit XLSX. Použijte export CSV.");
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

function xmlAttribute(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(source);
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return cleanValue(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeZipPath(value) {
  const parts = cleanValue(value)
    .replace(/\\/g, "/")
    .split("/");
  const normalized = [];

  for (const part of parts) {
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

  if (!target) {
    return "xl/worksheets/sheet1.xml";
  }

  return normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
}

function resolveWorkbookSheetName(workbookXml) {
  const firstSheet = /<sheet\b[^>]*>/i.exec(workbookXml)?.[0] || "";
  return xmlAttribute(firstSheet, "name") || "List 1";
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => {
    const item = match[1];
    return [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((textMatch) => decodeXml(textMatch[1]))
      .join("");
  });
}

function columnIndexFromReference(reference) {
  const match = /^[A-Z]+/i.exec(cleanValue(reference));

  if (!match) {
    return -1;
  }

  return [...match[0].toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
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
      const inlineValue = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
        .map((match) => decodeXml(match[1]))
        .join("");
      const value = type === "s"
        ? sharedStrings[Number(rawValue)] || ""
        : type === "inlineStr"
          ? inlineValue
          : decodeXml(rawValue);

      cells[targetIndex] = cleanValue(value);
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
    delimiter,
    sheetName: ""
  };
}

function headerDefinition(header) {
  const normalized = normalizeHeader(header);
  return FIELD_BY_ALIAS.get(normalized) || null;
}

function mappedColumns(headers) {
  return headers.map((header, index) => {
    const definition = headerDefinition(header);

    return {
      index,
      header: cleanValue(header) || `Sloupec ${index + 1}`,
      key: definition?.target || "",
      target: definition?.label || "",
      category: definition?.category || "nepodporováno",
      importAction: definition?.importAction || "ignorovat v této fázi",
      supported: Boolean(definition)
    };
  });
}

function rowToRecord(row, columns) {
  return columns.reduce((record, column) => {
    if (column.supported && column.key) {
      record[column.key] = cleanValue(row[column.index]);
    }
    return record;
  }, {});
}

function normalizeVin(value) {
  return cleanValue(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeRegistration(value) {
  return cleanValue(value).replace(/[\s-]+/g, "").toUpperCase();
}

function hasMeaningfulFalse(value) {
  const normalized = cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ["0", "false", "ne", "no", "n", "inactive", "neaktivni", "vyrazeno", "prodano"].includes(normalized);
}

function maskVin(value) {
  const normalized = normalizeVin(value);

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 7) {
    return `${normalized.slice(0, 2)}…`;
  }

  return `${normalized.slice(0, 3)}…${normalized.slice(-4)}`;
}

function maskRegistration(value) {
  const normalized = cleanValue(value).toUpperCase();

  if (!normalized) {
    return "";
  }

  const compact = normalized.replace(/\s+/g, "");

  if (compact.length <= 4) {
    return `${compact.slice(0, 2)}…`;
  }

  return `${compact.slice(0, 2)}…${compact.slice(-2)}`;
}

function duplicateValues(records, keyFn) {
  const counts = new Map();

  for (const record of records) {
    const key = keyFn(record);
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function issueLabel(issue) {
  const labels = {
    duplicate_vin: "duplicitní VIN",
    duplicate_registration: "duplicitní SPZ",
    missing_vin: "chybí VIN",
    missing_registration: "chybí SPZ",
    inactive: "neaktivní vozidlo"
  };

  return labels[issue] || issue;
}

function buildMatchingPreview(records) {
  const duplicateVin = duplicateValues(records, (record) => normalizeVin(record.vin));
  const duplicateRegistration = duplicateValues(records, (record) => normalizeRegistration(record.registrationNumber));
  const issueCounts = {
    sourceOnly: records.length,
    conflicts: 0,
    duplicate_vin: 0,
    duplicate_registration: 0,
    missing_vin: 0,
    missing_registration: 0,
    inactive: 0
  };

  const rows = records.map((record, index) => {
    const vin = normalizeVin(record.vin);
    const registration = normalizeRegistration(record.registrationNumber);
    const issues = [];

    if (!vin) {
      issues.push("missing_vin");
    } else if (duplicateVin.has(vin)) {
      issues.push("duplicate_vin");
    }

    if (!registration) {
      issues.push("missing_registration");
    } else if (duplicateRegistration.has(registration)) {
      issues.push("duplicate_registration");
    }

    if (hasMeaningfulFalse(record.isActive)) {
      issues.push("inactive");
    }

    for (const issue of issues) {
      issueCounts[issue] += 1;
    }

    if (issues.some((issue) => issue.startsWith("duplicate_"))) {
      issueCounts.conflicts += 1;
    }

    const matchedBy = vin && registration
      ? "VIN + SPZ"
      : vin
        ? "VIN"
        : registration
          ? "SPZ"
          : "bez klíče";

    return {
      rowNumber: index + 2,
      status: "source_only",
      statusLabel: issues.length ? "Nutná kontrola" : "Jen zdroj Vistos",
      matchedBy,
      vinMasked: maskVin(record.vin),
      registrationNumberMasked: maskRegistration(record.registrationNumber),
      internalVehicleNumber: cleanValue(record.internalVehicleNumber),
      name: cleanValue(record.name),
      category: cleanValue(record.vehicleCategory),
      warnings: issues.map(issueLabel)
    };
  });

  return {
    summary: issueCounts,
    rows: rows.slice(0, FLEET_VISTOS_IMPORT_PREVIEW_ROWS)
  };
}

function buildPreview({ rows, filename, contentType, sourceType, sheetName = "", delimiter = "" }) {
  const [headers, ...dataRows] = rows;

  if (!headers || headers.length === 0) {
    throw new Error("Export neobsahuje hlavičku.");
  }

  if (dataRows.length > FLEET_VISTOS_IMPORT_MAX_ROWS) {
    throw new Error(`Export má příliš mnoho řádků. Maximum je ${FLEET_VISTOS_IMPORT_MAX_ROWS}.`);
  }

  const columns = mappedColumns(headers);
  const records = dataRows.map((row) => rowToRecord(row, columns));
  const matching = buildMatchingPreview(records);
  const supportedColumnCount = columns.filter((column) => column.supported).length;
  const unsupportedColumnCount = columns.length - supportedColumnCount;

  return {
    filename: cleanValue(filename) || "vistos-export",
    contentType: cleanValue(contentType),
    sourceType,
    sheetName,
    delimiter,
    generatedAt: new Date().toISOString(),
    summary: {
      rowCount: records.length,
      columnCount: columns.length,
      supportedColumnCount,
      unsupportedColumnCount,
      localFleetModelReady: false,
      productionWrite: false,
      valuesStored: false,
      valuesRedacted: true,
      duplicateVinCount: matching.summary.duplicate_vin,
      duplicateRegistrationCount: matching.summary.duplicate_registration,
      missingVinCount: matching.summary.missing_vin,
      missingRegistrationCount: matching.summary.missing_registration,
      inactiveCount: matching.summary.inactive,
      activeCount: Math.max(0, records.length - matching.summary.inactive),
      previewRowsShown: matching.rows.length
    },
    columns,
    matching,
    importPolicy: {
      mode: "preview_only",
      productionWrite: false,
      requiresExplicitCommitStep: true,
      matchingOrder: ["vin", "registrationNumber", "vistosVehicleId"],
      note: "Náhled nic neukládá a nepouští automatickou synchronizaci."
    }
  };
}

export async function buildFleetVistosImportPreview({ buffer, filename = "", contentType = "" }) {
  const bytes = bytesFrom(buffer);

  if (!bytes.length) {
    throw new Error("Vyberte soubor exportu z Vistos.");
  }

  if (bytes.length > FLEET_VISTOS_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new Error("Soubor je příliš velký. Maximum je 10 MB.");
  }

  if (isXlsxFile(filename, contentType, bytes)) {
    const parsed = await parseXlsxRows(bytes);
    return buildPreview({
      ...parsed,
      filename,
      contentType,
      sourceType: "xlsx"
    });
  }

  const parsed = parseTextRows(bytes);
  return buildPreview({
    ...parsed,
    filename,
    contentType,
    sourceType: parsed.delimiter === "\t" ? "tsv" : "csv"
  });
}
