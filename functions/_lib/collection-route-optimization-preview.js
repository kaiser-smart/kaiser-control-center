export const COLLECTION_ROUTE_OPTIMIZATION_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const COLLECTION_ROUTE_OPTIMIZATION_MAX_FILES = 20;
export const COLLECTION_ROUTE_OPTIMIZATION_MAX_ROWS = 5000;

const decoder = new TextDecoder("utf-8");
const legacyTextDecoder = (() => {
  try {
    return new TextDecoder("windows-1250");
  } catch {
    return decoder;
  }
})();

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
  SKO: { 1100: 0.06, 240: 0.015, 120: 0.006, 110: 0.006 },
  PAPIR: { 1100: 0.02, 240: 0.004, 120: 0.002, 110: 0.002 },
  PLAST: { 1100: 0.02, 240: 0.004, 120: 0.002, 110: 0.002 },
  SKLO: { 1100: 0.014, 240: 0.003, 120: 0.002, 110: 0.002 },
  BIO: { 1100: 0.02, 240: 0.004, 120: 0.002, 110: 0.002, 30: 0.001 }
};
const SERVICE_MINUTES_BY_VOLUME = { 110: 3, 120: 3, 240: 3, 1100: 5 };
const CONTAINER_VOLUME_PATTERN = "(30|60|80|110|120|240|360|660|770|1100|1500|2500|5000)";
const MAX_REASONABLE_CONTAINER_COUNT = 20;

function cleanValue(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .trim();
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

function decodeLegacyText(bytes) {
  return legacyTextDecoder.decode(bytesFrom(bytes)).replace(/^\uFEFF/, "");
}

function decodeUtf16Le(bytes) {
  const data = bytesFrom(bytes);
  let text = "";
  for (let offset = 0; offset + 1 < data.length; offset += 2) {
    const code = data[offset] | (data[offset + 1] << 8);
    if (code) {
      text += String.fromCharCode(code);
    }
  }
  return text;
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

const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_FREE_SECTOR = 0xffffffff;
const CFB_DIFAT_SECTOR = 0xfffffffc;
const CFB_FAT_SECTOR = 0xfffffffd;

function isCfbChainSector(sector) {
  return Number.isInteger(sector) && sector >= 0 && sector < CFB_DIFAT_SECTOR;
}

function sectorOffset(sector, sectorSize) {
  return (sector + 1) * sectorSize;
}

function cfbSector(bytes, sector, sectorSize) {
  const offset = sectorOffset(sector, sectorSize);
  return bytes.slice(offset, offset + sectorSize);
}

function readCfbChain(bytes, fat, startSector, sectorSize, maxBytes = 0) {
  const chunks = [];
  let sector = startSector;
  const seen = new Set();

  while (isCfbChainSector(sector) && !seen.has(sector)) {
    seen.add(sector);
    chunks.push(cfbSector(bytes, sector, sectorSize));
    sector = fat[sector];
  }

  const output = concatUint8Arrays(chunks);
  return maxBytes > 0 ? output.slice(0, maxBytes) : output;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function parseCfb(bytes) {
  const data = bytesFrom(bytes);
  if (!isLegacyXls(data)) {
    throw new Error("Soubor není starý binární Excel .xls.");
  }

  const sectorSize = 1 << readUint16(data, 30);
  const miniSectorSize = 1 << readUint16(data, 32);
  const firstDirectorySector = readUint32(data, 48);
  const miniStreamCutoffSize = readUint32(data, 56);
  const firstMiniFatSector = readUint32(data, 60);
  const miniFatSectorCount = readUint32(data, 64);
  const firstDifatSector = readUint32(data, 68);
  const difatSectorCount = readUint32(data, 72);

  const fatSectorIds = [];
  for (let offset = 76; offset < 512; offset += 4) {
    const sector = readUint32(data, offset);
    if (sector !== CFB_FREE_SECTOR) {
      fatSectorIds.push(sector);
    }
  }

  let difatSector = firstDifatSector;
  for (let index = 0; index < difatSectorCount && isCfbChainSector(difatSector); index += 1) {
    const sectorData = cfbSector(data, difatSector, sectorSize);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) {
      const sector = readUint32(sectorData, offset);
      if (sector !== CFB_FREE_SECTOR) {
        fatSectorIds.push(sector);
      }
    }
    difatSector = readUint32(sectorData, sectorSize - 4);
  }

  const fat = [];
  for (const sectorId of fatSectorIds) {
    if (!isCfbChainSector(sectorId) && sectorId !== CFB_FAT_SECTOR && sectorId !== CFB_DIFAT_SECTOR) {
      continue;
    }
    const sectorData = cfbSector(data, sectorId, sectorSize);
    for (let offset = 0; offset < sectorData.length; offset += 4) {
      fat.push(readUint32(sectorData, offset));
    }
  }

  const directoryStream = readCfbChain(data, fat, firstDirectorySector, sectorSize);
  const entries = [];
  for (let offset = 0; offset + 128 <= directoryStream.length; offset += 128) {
    const entry = directoryStream.slice(offset, offset + 128);
    const nameLength = readUint16(entry, 64);
    const nameBytes = nameLength > 2 ? entry.slice(0, nameLength - 2) : new Uint8Array();
    const name = decodeUtf16Le(nameBytes);
    const type = entry[66];
    const startSector = readUint32(entry, 116);
    const sizeLow = readUint32(entry, 120);
    const sizeHigh = readUint32(entry, 124);
    const size = sizeHigh ? sizeHigh * 4294967296 + sizeLow : sizeLow;
    if (name) {
      entries.push({ name, type, startSector, size });
    }
  }

  const rootEntry = entries.find((entry) => entry.type === 5) || null;
  const miniFatStream = miniFatSectorCount && isCfbChainSector(firstMiniFatSector)
    ? readCfbChain(data, fat, firstMiniFatSector, sectorSize, miniFatSectorCount * sectorSize)
    : new Uint8Array();
  const miniFat = [];
  for (let offset = 0; offset + 4 <= miniFatStream.length; offset += 4) {
    miniFat.push(readUint32(miniFatStream, offset));
  }
  const miniStream = rootEntry && isCfbChainSector(rootEntry.startSector)
    ? readCfbChain(data, fat, rootEntry.startSector, sectorSize, rootEntry.size)
    : new Uint8Array();

  function readMiniStream(startSector, size) {
    const chunks = [];
    let sector = startSector;
    const seen = new Set();
    while (isCfbChainSector(sector) && !seen.has(sector)) {
      seen.add(sector);
      const offset = sector * miniSectorSize;
      chunks.push(miniStream.slice(offset, offset + miniSectorSize));
      sector = miniFat[sector];
    }
    return concatUint8Arrays(chunks).slice(0, size);
  }

  function readStream(nameOptions) {
    const names = Array.isArray(nameOptions) ? nameOptions : [nameOptions];
    const entry = entries.find((item) => item.type === 2 && names.includes(item.name));
    if (!entry) {
      return null;
    }
    if (entry.size < miniStreamCutoffSize && miniFat.length && miniStream.length) {
      return readMiniStream(entry.startSector, entry.size);
    }
    return readCfbChain(data, fat, entry.startSector, sectorSize, entry.size);
  }

  return { entries, readStream };
}

function parseBiffString(data, offset) {
  if (offset + 3 > data.length) {
    return { text: "", nextOffset: data.length };
  }
  const charCount = readUint16(data, offset);
  const options = data[offset + 2] || 0;
  const isUtf16 = Boolean(options & 0x01);
  const hasExtended = Boolean(options & 0x04);
  const hasRichText = Boolean(options & 0x08);
  let cursor = offset + 3;
  let richTextRuns = 0;
  let extendedSize = 0;
  if (hasRichText && cursor + 2 <= data.length) {
    richTextRuns = readUint16(data, cursor);
    cursor += 2;
  }
  if (hasExtended && cursor + 4 <= data.length) {
    extendedSize = readUint32(data, cursor);
    cursor += 4;
  }
  const byteLength = charCount * (isUtf16 ? 2 : 1);
  const rawText = data.slice(cursor, Math.min(data.length, cursor + byteLength));
  const text = isUtf16 ? decodeUtf16Le(rawText) : decodeLegacyText(rawText);
  return {
    text: cleanValue(text),
    nextOffset: Math.min(data.length, cursor + byteLength + richTextRuns * 4 + extendedSize)
  };
}

function parseBiffRecords(workbookStream) {
  const records = [];
  for (let offset = 0; offset + 4 <= workbookStream.length;) {
    const sid = readUint16(workbookStream, offset);
    const length = readUint16(workbookStream, offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + length;
    if (dataEnd > workbookStream.length) {
      break;
    }
    records.push({
      sid,
      offset,
      data: workbookStream.slice(dataStart, dataEnd)
    });
    offset = dataEnd;
  }
  return records;
}

function parseBiffBoundSheet(data) {
  if (data.length < 8) {
    return null;
  }
  const offset = readUint32(data, 0);
  const charCount = data[6] || 0;
  const options = data[7] || 0;
  const rawName = data.slice(8, 8 + charCount * (options & 0x01 ? 2 : 1));
  const sheetName = options & 0x01 ? decodeUtf16Le(rawName) : decodeLegacyText(rawName);
  return {
    offset,
    sheetName: cleanValue(sheetName) || "List"
  };
}

function parseBiffSst(records, startIndex) {
  const chunks = [records[startIndex].data];
  for (let index = startIndex + 1; index < records.length && records[index].sid === 0x003c; index += 1) {
    chunks.push(records[index].data);
  }
  const data = concatUint8Arrays(chunks);
  const uniqueCount = data.length >= 8 ? readUint32(data, 4) : 0;
  const strings = [];
  let offset = 8;
  for (let index = 0; index < uniqueCount && offset < data.length; index += 1) {
    const parsed = parseBiffString(data, offset);
    strings.push(parsed.text);
    if (parsed.nextOffset <= offset) {
      break;
    }
    offset = parsed.nextOffset;
  }
  return strings;
}

function decodeRkNumber(value) {
  const multiplied = Boolean(value & 0x01);
  const isInteger = Boolean(value & 0x02);
  let number;
  if (isInteger) {
    number = value >> 2;
  } else {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 0, true);
    view.setUint32(4, value & 0xfffffffc, true);
    number = view.getFloat64(0, true);
  }
  return multiplied ? number / 100 : number;
}

function sheetIndexForRecord(recordOffset, sheets) {
  for (let index = 0; index < sheets.length; index += 1) {
    const nextOffset = sheets[index + 1]?.offset ?? Number.POSITIVE_INFINITY;
    if (recordOffset >= sheets[index].offset && recordOffset < nextOffset) {
      return index;
    }
  }
  return -1;
}

function setBiffCell(sheet, rowIndex, columnIndex, value) {
  const text = cleanValue(value);
  if (!text) {
    return;
  }
  if (!sheet.rows[rowIndex]) {
    sheet.rows[rowIndex] = [];
  }
  sheet.rows[rowIndex][columnIndex] = text;
}

function parseLegacyXlsRows(bytes) {
  const cfb = parseCfb(bytes);
  const workbookStream = cfb.readStream(["Workbook", "Book"]);
  if (!workbookStream) {
    throw new Error("V souboru .xls se nepodařilo najít Workbook stream.");
  }

  const records = parseBiffRecords(workbookStream);
  const boundSheets = records
    .filter((record) => record.sid === 0x0085)
    .map((record) => parseBiffBoundSheet(record.data))
    .filter(Boolean)
    .sort((left, right) => left.offset - right.offset);
  const sheets = (boundSheets.length ? boundSheets : [{ offset: 0, sheetName: "List 1" }])
    .map((sheet) => ({ ...sheet, rows: [] }));
  let sharedStrings = [];

  for (let index = 0; index < records.length; index += 1) {
    if (records[index].sid === 0x00fc) {
      sharedStrings = parseBiffSst(records, index);
      break;
    }
  }

  for (const record of records) {
    const sheetIndex = sheetIndexForRecord(record.offset, sheets);
    if (sheetIndex < 0) {
      continue;
    }
    const sheet = sheets[sheetIndex];
    const data = record.data;

    if (record.sid === 0x00fd && data.length >= 10) {
      const rowIndex = readUint16(data, 0);
      const columnIndex = readUint16(data, 2);
      const sstIndex = readUint32(data, 6);
      setBiffCell(sheet, rowIndex, columnIndex, sharedStrings[sstIndex] || "");
    } else if (record.sid === 0x0204 && data.length >= 8) {
      const rowIndex = readUint16(data, 0);
      const columnIndex = readUint16(data, 2);
      const parsed = parseBiffString(data, 6);
      setBiffCell(sheet, rowIndex, columnIndex, parsed.text);
    } else if (record.sid === 0x0203 && data.length >= 14) {
      const rowIndex = readUint16(data, 0);
      const columnIndex = readUint16(data, 2);
      const number = new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true);
      setBiffCell(sheet, rowIndex, columnIndex, number);
    } else if (record.sid === 0x027e && data.length >= 10) {
      const rowIndex = readUint16(data, 0);
      const columnIndex = readUint16(data, 2);
      setBiffCell(sheet, rowIndex, columnIndex, decodeRkNumber(readUint32(data, 6)));
    } else if (record.sid === 0x00bd && data.length >= 10) {
      const rowIndex = readUint16(data, 0);
      const firstColumn = readUint16(data, 2);
      const lastColumn = readUint16(data, data.length - 2);
      let cursor = 4;
      for (let columnIndex = firstColumn; columnIndex <= lastColumn && cursor + 6 <= data.length - 2; columnIndex += 1) {
        setBiffCell(sheet, rowIndex, columnIndex, decodeRkNumber(readUint32(data, cursor + 2)));
        cursor += 6;
      }
    } else if (record.sid === 0x0006 && data.length >= 14) {
      const rowIndex = readUint16(data, 0);
      const columnIndex = readUint16(data, 2);
      const number = new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true);
      if (Number.isFinite(number)) {
        setBiffCell(sheet, rowIndex, columnIndex, number);
      }
    }
  }

  const parsedSheets = sheets
    .map((sheet) => ({
      sheetName: sheet.sheetName,
      rows: compactRows(sheet.rows.map((row) => row || []))
    }))
    .filter((sheet) => sheet.rows.length);

  if (!parsedSheets.length) {
    throw new Error("Soubor .xls se podařilo otevřít, ale neobsahuje čitelné řádky.");
  }

  return {
    rows: parsedSheets[0].rows,
    sheetName: parsedSheets[0].sheetName,
    sheets: parsedSheets
  };
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

function workbookSheetEntries(workbookXml, relsXml) {
  const relationships = new Map(
    [...relsXml.matchAll(/<Relationship\b[^>]*>/gi)].map((match) => {
      const node = match[0];
      return [xmlAttribute(node, "Id"), xmlAttribute(node, "Target")];
    })
  );
  return [...workbookXml.matchAll(/<sheet\b[^>]*>/gi)]
    .map((match, index) => {
      const node = match[0];
      const relationshipId = xmlAttribute(node, "r:id");
      const target = relationships.get(relationshipId) || "";
      return {
        sheetName: xmlAttribute(node, "name") || `List ${index + 1}`,
        path: target ? normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`) : `xl/worksheets/sheet${index + 1}.xml`
      };
    })
    .filter((sheet) => sheet.path);
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
  const sheetEntries = workbookSheetEntries(workbookXml, relsXml);
  const fallbackSheetPath = resolveWorkbookSheetPath(workbookXml, relsXml);
  const sheets = [];
  for (const sheetEntry of sheetEntries.length ? sheetEntries : [{ sheetName: resolveWorkbookSheetName(workbookXml), path: fallbackSheetPath }]) {
    const sheetXml = await zipEntryText(entries, sheetEntry.path);
    if (!sheetXml) {
      continue;
    }
    sheets.push({
      rows: parseWorksheetRows(sheetXml, parseSharedStrings(sharedStringsXml)),
      sheetName: sheetEntry.sheetName
    });
  }
  if (!sheets.length) {
    const sheetXml = await zipEntryText(entries, "xl/worksheets/sheet1.xml");
    if (sheetXml) {
      sheets.push({
        rows: parseWorksheetRows(sheetXml, parseSharedStrings(sharedStringsXml)),
        sheetName: resolveWorkbookSheetName(workbookXml)
      });
    }
  }
  if (!sheets.length) {
    throw new Error("V XLSX se nepodařilo najít první list.");
  }
  return {
    rows: sheets[0].rows,
    sheetName: sheets[0].sheetName,
    sheets
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

export async function parseSpreadsheetRows(file) {
  const bytes = bytesFrom(file.buffer);
  const name = cleanValue(file.filename || file.name).toLowerCase();
  const type = cleanValue(file.contentType || file.type).toLowerCase();
  if (isLegacyXls(bytes) || name.endsWith(".xls")) {
    return parseLegacyXlsRows(bytes);
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

function parseSafeContainerCount(value) {
  const text = cleanValue(value);
  if (!/^[1-9]\d?$/.test(text)) {
    return 0;
  }
  const count = Number(text);
  return count <= MAX_REASONABLE_CONTAINER_COUNT ? count : 0;
}

function normalizeContainerCount(count) {
  const numeric = Number(count) || 0;
  if (!numeric) {
    return { containerCount: 0, issue: "missing-container-count" };
  }
  if (numeric > MAX_REASONABLE_CONTAINER_COUNT) {
    return { containerCount: 0, issue: "suspicious-container-count" };
  }
  return { containerCount: Math.max(1, numeric), issue: "" };
}

function containerResult(volume, count = 1, source = "") {
  const normalizedCount = normalizeContainerCount(count);
  return {
    containerCount: normalizedCount.containerCount,
    containerVolume: Number(volume) || 0,
    containerIssue: normalizedCount.issue,
    containerSource: source
  };
}

function containerVolumeFromText(value) {
  const normalized = normalizeKey(value).replace("×", "X");
  const counted = normalized.match(new RegExp(`\\b([1-9]\\d?)\\s*X\\s*${CONTAINER_VOLUME_PATTERN}\\b`));
  if (counted) {
    return { volume: Number(counted[2]) || 0, count: Number(counted[1]) || 1, source: "counted-text" };
  }
  const prefixed = normalized.match(new RegExp(`\\b(?:KONT|KONTEJNER|NADOBA|NADOBY|P)\\s*${CONTAINER_VOLUME_PATTERN}\\b`));
  if (prefixed) {
    return { volume: Number(prefixed[1]) || 0, count: 1, source: "prefixed-volume" };
  }
  const suffixed = normalized.match(new RegExp(`\\b${CONTAINER_VOLUME_PATTERN}\\s*(?:L|LT|LTR|LITR|LITRU|TR)\\b`));
  if (suffixed) {
    return { volume: Number(suffixed[1]) || 0, count: 1, source: "literal-volume" };
  }
  return { volume: 0, count: 0, source: "" };
}

function inferContainer(text, cells = []) {
  for (let index = 0; index < cells.length; index += 1) {
    const parsed = containerVolumeFromText(cells[index]);
    if (!parsed.volume) {
      continue;
    }
    const nextCount = parseSafeContainerCount(cells[index + 1]);
    return containerResult(parsed.volume, nextCount || parsed.count || 1, nextCount ? "cell-next-count" : parsed.source);
  }

  const normalized = normalizeKey(text).replace("×", "X");
  const counted = normalized.match(new RegExp(`\\b([1-9]\\d?)\\s*X\\s*${CONTAINER_VOLUME_PATTERN}\\b`));
  if (counted) {
    return containerResult(counted[2], counted[1], "counted-text");
  }
  const prefixedWithCount = normalized.match(new RegExp(`\\b(?:KONT|KONTEJNER|NADOBA|NADOBY|P)\\s*${CONTAINER_VOLUME_PATTERN}\\s+([1-9]\\d?)\\b`));
  if (prefixedWithCount) {
    return containerResult(prefixedWithCount[1], prefixedWithCount[2], "prefixed-volume-next-count");
  }
  const parsed = containerVolumeFromText(text);
  if (parsed.volume) {
    return containerResult(parsed.volume, parsed.count || 1, parsed.source);
  }
  return { containerCount: 0, containerVolume: 0, containerIssue: "missing-container-volume", containerSource: "" };
}

export function __inferCollectionRouteContainerForTest(text, cells = []) {
  return inferContainer(text, cells);
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
  if (!Number(volume) || !Number(count)) {
    return 0;
  }
  return (SERVICE_MINUTES_BY_VOLUME[volume] || (volume >= 1000 ? 5 : 3)) * Math.max(1, Number(count) || 1);
}

function estimatedWeightTons(wasteType, volume, count) {
  if (!Number(volume) || !Number(count)) {
    return 0;
  }
  const weight = WASTE_WEIGHTS_TONS[wasteType]?.[volume] || 0;
  return Math.round(weight * Math.max(1, Number(count) || 1) * 1000) / 1000;
}

function routeQuality({ waste, container, text, cells }) {
  const issues = [];
  const normalized = normalizeKey(text);
  if (!waste.wasteType || !waste.wasteCode) {
    issues.push("needs-vistos-waste-type");
  }
  if (!container.containerVolume) {
    issues.push("missing-container-volume");
  }
  if (!container.containerCount) {
    issues.push(container.containerIssue || "missing-container-count");
  } else if (container.containerIssue) {
    issues.push(container.containerIssue);
  }
  if (cells.length <= 2 && text.length > 300) {
    issues.push("suspicious-source-row");
  }
  if (/\b(UKONCENO|UKONENO|VYMAZAT|NEPLATI|STOP)\b/.test(normalized)) {
    issues.push("source-note-cancelled-or-stopped");
  }
  const qualityIssues = [...new Set(issues)];
  const qualityStatus = qualityIssues.some((issue) => issue.startsWith("suspicious") || issue.includes("cancelled"))
    ? "suspect"
    : qualityIssues.length ? "needs_vistos_mapping" : "ok";
  return { qualityStatus, qualityIssues };
}

function sourceRouteName(filename) {
  return cleanValue(filename)
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, " ");
}

function buildRowsFromSheet({ rows, filename, sheetName }) {
  const routeMeta = routeMetaFromFilename(`${filename} ${sheetName || ""}`);
  const output = [];
  rows.forEach((cells, index) => {
    const cleanedCells = cells.map(cleanValue).filter(Boolean);
    const text = cleanedCells.join(" | ");
    if (!routeRowLooksUseful(cleanedCells, text)) {
      return;
    }
    const waste = inferWaste(text);
    const frequency = inferFrequency(text, routeMeta) || "1x7";
    const container = inferContainer(text, cleanedCells);
    const region = inferRegion(text, waste);
    const days = suggestedDays(frequency, routeMeta.day);
    const quality = routeQuality({ waste, container, text, cells: cleanedCells });
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
        confidence: quality.qualityStatus === "ok" ? "střední" : "nízká",
        qualityStatus: quality.qualityStatus,
        qualityIssues: quality.qualityIssues,
        containerSource: container.containerSource,
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
    const parsedSheets = Array.isArray(parsed.sheets) && parsed.sheets.length
      ? parsed.sheets
      : [{ rows: parsed.rows || [], sheetName: parsed.sheetName || "" }];
    const sheetSummaries = [];
    const plannedRows = [];
    let sourceRowCount = 0;
    for (const sheet of parsedSheets) {
      const sourceRows = compactRows(sheet.rows || []);
      const sheetPlannedRows = buildRowsFromSheet({ rows: sourceRows, filename, sheetName: sheet.sheetName });
      sourceRowCount += sourceRows.length;
      plannedRows.push(...sheetPlannedRows);
      sheetSummaries.push({
        sheetName: sheet.sheetName || "",
        sourceRowCount: sourceRows.length,
        plannedRowCount: sheetPlannedRows.length
      });
    }
    parsedFiles.push({
      filename,
      sheetName: sheetSummaries[0]?.sheetName || parsed.sheetName || "",
      sheetCount: sheetSummaries.length,
      sourceRowCount,
      plannedRowCount: plannedRows.length,
      sheets: sheetSummaries.slice(0, 20)
    });
    rows.push(...plannedRows);
  }

  const limitedRows = rows.slice(0, COLLECTION_ROUTE_OPTIMIZATION_MAX_ROWS);
  const dayCounts = new Map();
  const vehicleCounts = new Map();
  const qualityCounts = new Map();
  const qualityIssueCounts = new Map();
  for (const row of limitedRows) {
    dayCounts.set(row.suggestedDay, (dayCounts.get(row.suggestedDay) || 0) + 1);
    vehicleCounts.set(row.vehicleCode, (vehicleCounts.get(row.vehicleCode) || 0) + 1);
    qualityCounts.set(row.qualityStatus || "unknown", (qualityCounts.get(row.qualityStatus || "unknown") || 0) + 1);
    for (const issue of row.qualityIssues || []) {
      qualityIssueCounts.set(issue, (qualityIssueCounts.get(issue) || 0) + 1);
    }
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
      qualityCounts: Object.fromEntries(qualityCounts),
      qualityIssueCounts: Object.fromEntries(qualityIssueCounts),
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    rows: limitedRows
  };
}
