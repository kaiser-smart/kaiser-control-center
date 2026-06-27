import { buildCollectionRouteOptimizationPreview } from "./collection-route-optimization-preview.js";

const COLLECTION_ROUTES_DB_BINDING = "SMART_ODPADY_DB";
export const COLLECTION_ROUTE_SOURCE_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const COLLECTION_ROUTE_SOURCE_MAX_FILES = 20;
export const COLLECTION_ROUTE_SOURCE_MAX_ROWS = 5000;

export class CollectionRouteSourcesError extends Error {
  constructor(message, status = 400, code = "collection_route_sources_error") {
    super(message);
    this.name = "CollectionRouteSourcesError";
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

function jsonString(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
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

function routeSourcesDatabase(env, required = false) {
  const db = env?.[COLLECTION_ROUTES_DB_BINDING] || null;
  if (!db && required) {
    throw new CollectionRouteSourcesError(
      "Databáze Tras svozu není nastavená. Chybí D1 binding SMART_ODPADY_DB.",
      503,
      "collection_route_sources_database_missing"
    );
  }
  return db;
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (message.includes("no such table")) {
    return new CollectionRouteSourcesError(
      "Tabulky Svozových tras z 13 Excelů nejsou v D1 připravené. Je potřeba migrace 0019.",
      503,
      "collection_route_sources_migration_missing"
    );
  }
  console.error("collection_route_sources.store_failed", { message });
  return new CollectionRouteSourcesError(
    "Svozové trasy z 13 Excelů se teď nepodařilo načíst nebo uložit.",
    500,
    "collection_route_sources_store_failed"
  );
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dayFromText(value) {
  const text = normalizeText(value);
  if (text.includes("PONDELI") || text.includes(" PO ")) return "PO";
  if (text.includes("UTERY") || text.includes(" UTERY") || text.includes("UT ")) return "ÚT";
  if (text.includes("STREDA") || text.includes(" ST ")) return "ST";
  if (text.includes("CTVRTEK") || text.includes(" CT ")) return "ČT";
  if (text.includes("PATEK") || text.includes(" PA ")) return "PÁ";
  return "";
}

function weekFromText(value) {
  const text = normalizeText(value);
  if (text.includes("1X30") || text.includes("MESIC")) return "měsíční";
  if (text.includes("SUDE") || text.includes("SUDY")) return "sudý";
  if (text.includes("LICHE") || text.includes("LICHY")) return "lichý";
  return "každý týden";
}

function vehicleFromText(value) {
  const text = normalizeText(value);
  if (text.includes("3BN 3558") || text.includes("AUTO A")) return "A";
  if (text.includes("1BP 8373") || text.includes("AUTO B")) return "B";
  if (text.includes("3BE 2831") || text.includes("FLORIAN") || text.includes("AUTO C")) return "C";
  return "";
}

function routeModeFromWeek(weekMode) {
  if (weekMode === "sudý") return "sudý týden";
  if (weekMode === "lichý") return "lichý týden";
  if (weekMode === "měsíční") return "měsíční / 1x30";
  return "každý týden";
}

function fieldLooksOperational(value) {
  const text = normalizeText(value);
  return Boolean(
    text &&
    !/^\d+$/.test(text) &&
    !/^(SUDY|SUDE|LICHY|LICHE|PONDELI|UTERY|STREDA|CTVRTEK|PATEK|KONTAKT|DPI|PLI|FKU|MAP)$/.test(text) &&
    !/\b(SUDY|SUDE|LICHY|LICHE|PONDELI|UTERY|STREDA|CTVRTEK|PATEK|DPI|PLI|FKU|MAP)\b/.test(text) &&
    !/\b(1X7|2X7|3X7|5X7|1X14|1X30|KONT|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO)\b/.test(text)
  );
}

function deriveFields(row) {
  const parts = cleanString(row.originalText).split("|").map((part) => cleanString(part)).filter(Boolean);
  const operationalParts = parts.filter(fieldLooksOperational);
  const customerName = operationalParts[0] || "";
  const addressText = operationalParts.find((part) => /[,0-9]/.test(part) && part !== customerName) || operationalParts[1] || "";
  const note = parts.find((part) => /\b(pozn|pozastav|vyraz|vyřaz|konec|volat|klic|klíč|kontakt|brana|brána)\b/i.test(part)) || "";
  const issues = Array.isArray(row.qualityIssues) ? row.qualityIssues : [];
  let mappingStatus = "nenamapováno";
  let mappingIssue = "čeká na Vistos match";

  if (!customerName || !addressText) {
    mappingStatus = "chybí adresa";
    mappingIssue = "chybí zákazník nebo adresa z Excel řádku";
  } else if (issues.includes("missing-container-volume")) {
    mappingStatus = "chybí nádoba";
    mappingIssue = "chybí nebo není jistý objem nádoby";
  } else if (!row.frequency || row.frequency === "-") {
    mappingStatus = "chybí frekvence";
    mappingIssue = "chybí četnost svozu";
  } else if (issues.includes("needs-vistos-waste-type")) {
    mappingStatus = "nejasné";
    mappingIssue = "typ odpadu je potřeba potvrdit přes Vistos nebo ručně";
  } else if (issues.includes("source-note-cancelled-or-stopped")) {
    mappingStatus = "nejasné";
    mappingIssue = "zdrojový řádek obsahuje pozastavení, konec nebo vyřazení";
  }

  return { customerName, addressText, note, mappingStatus, mappingIssue };
}

function rowToSourceBatch(row) {
  return {
    id: cleanString(row?.id),
    source: cleanString(row?.source),
    status: cleanString(row?.status),
    message: cleanString(row?.message),
    fileCount: numericValue(row?.file_count),
    rowCount: numericValue(row?.row_count),
    issueCount: numericValue(row?.issue_count),
    createdByUserId: cleanString(row?.created_by_user_id),
    createdAt: cleanString(row?.created_at),
    metadata: parseJson(row?.metadata_json, {})
  };
}

function rowToSourceFile(row) {
  return {
    id: cleanString(row?.id),
    batchId: cleanString(row?.batch_id),
    filename: cleanString(row?.filename),
    dayCode: cleanString(row?.day_code),
    weekMode: cleanString(row?.week_mode),
    vehicleCode: cleanString(row?.vehicle_code),
    sheetCount: numericValue(row?.sheet_count),
    sourceRowCount: numericValue(row?.source_row_count),
    routeRowCount: numericValue(row?.route_row_count),
    metadata: parseJson(row?.metadata_json, {}),
    createdAt: cleanString(row?.created_at)
  };
}

function rowToSourceRow(row) {
  return {
    id: cleanString(row?.id),
    batchId: cleanString(row?.batch_id),
    fileId: cleanString(row?.file_id),
    routeOrder: numericValue(row?.route_order),
    sourceFile: cleanString(row?.source_file),
    sourceSheet: cleanString(row?.source_sheet),
    sourceRowNumber: numericValue(row?.source_row_number),
    originalText: cleanString(row?.original_text),
    dayCode: cleanString(row?.day_code),
    weekMode: cleanString(row?.week_mode),
    vehicleCode: cleanString(row?.vehicle_code),
    wasteType: cleanString(row?.waste_type),
    wasteCode: cleanString(row?.waste_code),
    frequency: cleanString(row?.frequency),
    containerVolume: numericValue(row?.container_volume),
    containerCount: numericValue(row?.container_count),
    customerName: cleanString(row?.customer_name),
    addressText: cleanString(row?.address_text),
    note: cleanString(row?.note),
    mappingStatus: cleanString(row?.mapping_status),
    mappingIssue: cleanString(row?.mapping_issue),
    status: cleanString(row?.status),
    estimatedServiceMinutes: numericValue(row?.estimated_service_minutes),
    estimatedWeightTons: numericValue(row?.estimated_weight_tons),
    metadata: parseJson(row?.metadata_json, {}),
    createdAt: cleanString(row?.created_at)
  };
}

function buildSourceRows(preview, batchId, fileIds) {
  const seen = new Set();
  let routeOrder = 0;
  const rows = [];
  const duplicateCounts = new Map();

  for (const row of preview.rows || []) {
    const dedupeKey = [
      row.sourceFile,
      row.sheetName,
      row.sourceRowNumber,
      row.originalText
    ].map(cleanString).join("\u0001");

    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    duplicateCounts.set(normalizeText(row.originalText), (duplicateCounts.get(normalizeText(row.originalText)) || 0) + 1);
  }

  const emitted = new Set();
  for (const row of preview.rows || []) {
    const dedupeKey = [
      row.sourceFile,
      row.sheetName,
      row.sourceRowNumber,
      row.originalText
    ].map(cleanString).join("\u0001");

    if (emitted.has(dedupeKey)) {
      continue;
    }
    emitted.add(dedupeKey);
    routeOrder += 1;

    const sourceFile = cleanString(row.sourceFile);
    const fileId = fileIds.get(sourceFile) || "";
    const textDay = dayFromText(row.originalText);
    const filenameDay = dayFromText(`${sourceFile} ${row.sheetName || ""}`);
    const textWeek = weekFromText(row.originalText);
    const filenameWeek = weekFromText(`${sourceFile} ${row.sheetName || ""}`);
    const sourceWeek = textWeek !== "každý týden"
      ? routeModeFromWeek(textWeek)
      : row.originalWeek && row.originalWeek !== "-"
        ? row.originalWeek
        : routeModeFromWeek(filenameWeek);
    const derived = deriveFields(row);
    const textKey = normalizeText(row.originalText);
    const isDuplicate = (duplicateCounts.get(textKey) || 0) > 1;
    const mappingStatus = isDuplicate && derived.mappingStatus === "nenamapováno" ? "duplicita" : derived.mappingStatus;
    const mappingIssue = isDuplicate && derived.mappingStatus === "nenamapováno" ? "duplicitní text v historických řádcích" : derived.mappingIssue;

    rows.push({
      id: randomId("collection-route-source-row"),
      batchId,
      fileId,
      routeOrder,
      sourceFile,
      sourceSheet: cleanString(row.sheetName),
      sourceRowNumber: numericValue(row.sourceRowNumber),
      originalText: cleanString(row.originalText).slice(0, 1000),
      dayCode: textDay || (row.originalDay && row.originalDay !== "-" ? row.originalDay : "") || filenameDay || cleanString(row.suggestedDay),
      weekMode: sourceWeek,
      vehicleCode: cleanString(row.vehicleCode || vehicleFromText(sourceFile) || ""),
      wasteType: row.wasteType === "-" ? "" : cleanString(row.wasteType),
      wasteCode: row.wasteCode === "-" ? "" : cleanString(row.wasteCode),
      frequency: cleanString(row.frequency),
      containerVolume: numericValue(row.containerVolume),
      containerCount: numericValue(row.containerCount),
      customerName: derived.customerName,
      addressText: derived.addressText,
      note: derived.note,
      mappingStatus,
      mappingIssue,
      status: "preview",
      estimatedServiceMinutes: numericValue(row.estimatedServiceMinutes),
      estimatedWeightTons: numericValue(row.estimatedWeightTons),
      metadata: {
        sourceRoute: row.sourceRoute,
        optimizationGroup: row.optimizationGroup,
        qualityStatus: row.qualityStatus,
        qualityIssues: row.qualityIssues || [],
        confidence: row.confidence,
        vehicleSource: vehicleFromText(sourceFile) ? "source" : "working-draft",
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      }
    });
  }

  return rows;
}

function sourceSummary(files, rows) {
  const counts = {
    dayCounts: {},
    weekCounts: {},
    vehicleCounts: {},
    wasteCounts: {},
    mappingCounts: {}
  };
  let containerCount = 0;
  let estimatedMinutes = 0;
  let estimatedTons = 0;
  for (const row of rows) {
    counts.dayCounts[row.dayCode || "-"] = (counts.dayCounts[row.dayCode || "-"] || 0) + 1;
    counts.weekCounts[row.weekMode || "-"] = (counts.weekCounts[row.weekMode || "-"] || 0) + 1;
    counts.vehicleCounts[row.vehicleCode || "-"] = (counts.vehicleCounts[row.vehicleCode || "-"] || 0) + 1;
    counts.wasteCounts[row.wasteType || "ostatní / neznámé"] = (counts.wasteCounts[row.wasteType || "ostatní / neznámé"] || 0) + 1;
    counts.mappingCounts[row.mappingStatus || "-"] = (counts.mappingCounts[row.mappingStatus || "-"] || 0) + 1;
    containerCount += numericValue(row.containerCount);
    estimatedMinutes += numericValue(row.estimatedServiceMinutes);
    estimatedTons += numericValue(row.estimatedWeightTons);
  }
  return {
    fileCount: files.length,
    rowCount: rows.length,
    containerCount,
    estimatedMinutes,
    estimatedTons: Number(estimatedTons.toFixed(3)),
    ...counts,
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false
  };
}

export async function createCollectionRouteSourceImport(env, user, { files = [] } = {}) {
  const db = routeSourcesDatabase(env, true);
  const safeFiles = files.slice(0, COLLECTION_ROUTE_SOURCE_MAX_FILES);
  if (!safeFiles.length) {
    throw new CollectionRouteSourcesError("Nahrajte 13 Excel souborů svozových tras.", 400, "collection_route_sources_no_files");
  }

  const preview = await buildCollectionRouteOptimizationPreview({ files: safeFiles });
  const batchId = randomId("collection-route-source-batch");
  const createdAt = nowIso();
  const fileIds = new Map();
  const sourceFiles = (preview.parsedFiles || []).map((file) => {
    const id = randomId("collection-route-source-file");
    fileIds.set(file.filename, id);
    return {
      id,
      batchId,
      filename: file.filename,
      dayCode: dayFromText(file.filename),
      weekMode: weekFromText(file.filename),
      vehicleCode: vehicleFromText(file.filename),
      sheetCount: numericValue(file.sheetCount),
      sourceRowCount: numericValue(file.sourceRowCount),
      routeRowCount: numericValue(file.plannedRowCount),
      metadata: {
        sheets: file.sheets || [],
        source: "13-excel",
        createsOperationalRoutes: false
      },
      createdAt
    };
  });
  const sourceRows = buildSourceRows(preview, batchId, fileIds).slice(0, COLLECTION_ROUTE_SOURCE_MAX_ROWS);
  const summary = sourceSummary(sourceFiles, sourceRows);
  const issueCount = sourceRows.filter((row) => row.mappingStatus !== "nenamapováno").length;
  const batch = {
    id: batchId,
    source: "13-excel",
    status: "preview",
    message: `Načteno ${sourceFiles.length} Excel souborů a ${sourceRows.length} zdrojových řádků. Ostré trasy nevznikly.`,
    fileCount: sourceFiles.length,
    rowCount: sourceRows.length,
    issueCount,
    createdByUserId: cleanString(user?.id),
    createdAt,
    metadata: {
      phase: "svozove-trasy-source-preview",
      source: "13-excel",
      summary,
      unsupportedFiles: preview.unsupportedFiles || [],
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    }
  };

  try {
    await db.prepare(`
      INSERT INTO collection_route_source_batches
        (id, source, status, message, file_count, row_count, issue_count, created_by_user_id, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      batch.id,
      batch.source,
      batch.status,
      batch.message,
      batch.fileCount,
      batch.rowCount,
      batch.issueCount,
      batch.createdByUserId,
      batch.createdAt,
      jsonString(batch.metadata)
    ).run();

    for (const file of sourceFiles) {
      await db.prepare(`
        INSERT INTO collection_route_source_files
          (id, batch_id, filename, day_code, week_mode, vehicle_code, sheet_count, source_row_count, route_row_count, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        file.id,
        file.batchId,
        file.filename,
        file.dayCode,
        file.weekMode,
        file.vehicleCode,
        file.sheetCount,
        file.sourceRowCount,
        file.routeRowCount,
        jsonString(file.metadata),
        file.createdAt
      ).run();
    }

    for (let index = 0; index < sourceRows.length; index += 100) {
      const chunk = sourceRows.slice(index, index + 100);
      await db.batch(chunk.map((row) => db.prepare(`
        INSERT INTO collection_route_source_rows
          (id, batch_id, file_id, route_order, source_file, source_sheet, source_row_number, original_text, day_code, week_mode, vehicle_code, waste_type, waste_code, frequency, container_volume, container_count, customer_name, address_text, note, mapping_status, mapping_issue, status, estimated_service_minutes, estimated_weight_tons, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        row.id,
        row.batchId,
        row.fileId,
        row.routeOrder,
        row.sourceFile,
        row.sourceSheet,
        row.sourceRowNumber,
        row.originalText,
        row.dayCode,
        row.weekMode,
        row.vehicleCode,
        row.wasteType,
        row.wasteCode,
        row.frequency,
        row.containerVolume,
        row.containerCount,
        row.customerName,
        row.addressText,
        row.note,
        row.mappingStatus,
        row.mappingIssue,
        row.status,
        row.estimatedServiceMinutes,
        row.estimatedWeightTons,
        jsonString(row.metadata),
        createdAt
      )));
    }
  } catch (error) {
    throw dbError(error);
  }

  return {
    batch,
    files: sourceFiles,
    rows: sourceRows.slice(0, 200),
    summary,
    apiStatus: "ready"
  };
}

export async function listCollectionRouteSourceBatches(env, limit = 10) {
  const db = routeSourcesDatabase(env, true);
  try {
    const result = await db.prepare(`
      SELECT *
      FROM collection_route_source_batches
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(Math.max(1, Math.min(Number(limit) || 10, 50))).all();
    return (result.results || []).map(rowToSourceBatch);
  } catch (error) {
    throw dbError(error);
  }
}

export async function listCollectionRouteSourceRows(env, {
  batchId = "",
  day = "all",
  week = "all",
  vehicle = "all",
  waste = "all",
  mappingStatus = "all",
  limit = 500
} = {}) {
  const db = routeSourcesDatabase(env, true);
  try {
    let resolvedBatchId = cleanString(batchId);
    if (!resolvedBatchId) {
      const latest = await db.prepare(`
        SELECT id
        FROM collection_route_source_batches
        ORDER BY created_at DESC
        LIMIT 1
      `).first();
      resolvedBatchId = cleanString(latest?.id);
    }
    if (!resolvedBatchId) {
      return { batch: null, files: [], rows: [], summary: sourceSummary([], []) };
    }

    const clauses = ["batch_id = ?"];
    const params = [resolvedBatchId];
    if (day !== "all") {
      clauses.push("day_code = ?");
      params.push(day);
    }
    if (week !== "all") {
      clauses.push("week_mode = ?");
      params.push(week);
    }
    if (vehicle !== "all") {
      clauses.push("vehicle_code = ?");
      params.push(vehicle);
    }
    if (waste !== "all") {
      if (waste === "ostatní") {
        clauses.push("(waste_type = '' OR waste_type NOT IN ('SKO','BIO','PAPIR','PLAST','SKLO'))");
      } else {
        clauses.push("waste_type = ?");
        params.push(waste);
      }
    }
    if (mappingStatus !== "all") {
      clauses.push("mapping_status = ?");
      params.push(mappingStatus);
    }

    const [batchRow, filesResult, rowsResult] = await Promise.all([
      db.prepare("SELECT * FROM collection_route_source_batches WHERE id = ? LIMIT 1").bind(resolvedBatchId).first(),
      db.prepare("SELECT * FROM collection_route_source_files WHERE batch_id = ? ORDER BY filename").bind(resolvedBatchId).all(),
      db.prepare(`
        SELECT *
        FROM collection_route_source_rows
        WHERE ${clauses.join(" AND ")}
        ORDER BY route_order ASC
        LIMIT ?
      `).bind(...params, Math.max(1, Math.min(Number(limit) || 500, 2000))).all()
    ]);

    const files = (filesResult.results || []).map(rowToSourceFile);
    const rows = (rowsResult.results || []).map(rowToSourceRow);
    return {
      batch: batchRow ? rowToSourceBatch(batchRow) : null,
      files,
      rows,
      summary: sourceSummary(files, rows)
    };
  } catch (error) {
    throw dbError(error);
  }
}
