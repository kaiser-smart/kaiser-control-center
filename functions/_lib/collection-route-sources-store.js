import { buildCollectionRouteOptimizationPreview } from "./collection-route-optimization-preview.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosKommunalPreviewExport
} from "./collection-routes-store.js";

const COLLECTION_ROUTES_DB_BINDING = "SMART_ODPADY_DB";
export const COLLECTION_ROUTE_SOURCE_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const COLLECTION_ROUTE_SOURCE_MAX_FILES = 20;
export const COLLECTION_ROUTE_SOURCE_MAX_ROWS = 5000;
const VISTOS_SOURCE_MATCH_MAX_ROWS = 5000;
const VISTOS_SOURCE_MATCH_MAX_CANDIDATES = 10000;
const VISTOS_SOURCE_MATCH_MAX_CANDIDATE_POOL = 220;
const VISTOS_SOURCE_MATCH_COMMON_TOKEN_LIMIT = 550;
const VISTOS_MATCH_ADDRESS_NOISE_TOKENS = new Set([
  "CS",
  "CP",
  "BENZINA",
  "OMV",
  "MOL",
  "SHELL",
  "TANK",
  "ONO",
  "REST",
  "RESTAURACE",
  "PROVOZOVNA",
  "POBOCKA"
]);
const VISTOS_MATCH_STOP_WORDS = new Set([
  "A",
  "I",
  "S",
  "U",
  "V",
  "VE",
  "NA",
  "DO",
  "OD",
  "ZA",
  "PRO",
  "NAD",
  "POD",
  "THE",
  "AND",
  "SPOL",
  "SRO",
  "SR",
  "RO",
  "A.S",
  "AS",
  "VOS",
  "VO",
  "OS",
  "DRUZSTVO",
  "PRISPEVKOVA",
  "ORGANIZACE",
  "CESKA",
  "CESKY",
  "CZECH",
  "REPUBLIC",
  "REPUBLIKA",
  "ICO",
  "DIC",
  "UL",
  "ULICE",
  "NAM",
  "NAMESTI",
  "BRNO",
  "BLANSKO",
  "KS",
  "L",
  "LTR",
  "LITR",
  "LITRU",
  "KONT",
  "NADOBA",
  "NADOBY",
  "POPELNICE",
  "TEL",
  "TELEFON",
  "KLIC",
  "MAPA",
  "AREAL",
  "SKLAD",
  "SVOZ",
  "ODPAD",
  "GROUP"
]);
const ROUTE_SOURCE_NON_CUSTOMER_TOKENS = new Set([
  "VSE",
  "VSECHNO",
  "ZVLAST",
  "ZVLASTT",
  "JEDNO",
  "MISTO",
  "MISTA",
  "ZMENA",
  "CETNOSTI",
  "OD",
  "TEL",
  "TELEFON",
  "KONTAKT",
  "KLIC",
  "KLEC",
  "MAPA",
  "SRO",
  "AS",
  "VOS",
  "SPOL",
  "DRUZSTVO"
]);
const ROUTE_SOURCE_ADDRESS_HINTS = new Set([
  "BRNO",
  "BLANSKO",
  "MODRICE",
  "TROUBSKO",
  "POPUVKY",
  "BOSONOHY",
  "STRELICE",
  "SLAPANICE",
  "HOLASICE",
  "PODOLI",
  "JIRIKOVICE",
  "OSTROVACICE",
  "LISEN",
  "ZABOVRESKY",
  "RECKOVICE",
  "SLATINA",
  "HUSOVICE",
  "KOMAROV",
  "MEDLANKY",
  "TUŘANY",
  "TURANY"
]);
const ROUTE_SOURCE_SALES_CODES = new Set([
  "DPI",
  "PLI",
  "FKU",
  "PCE",
  "PPA",
  "ROP"
]);
const ROUTE_SOURCE_LEGAL_SUFFIXES = new Set([
  "SRO",
  "SPOLSRO",
  "SPOLSRRO",
  "AS",
  "VOS",
  "ZS",
  "OPS"
]);

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

function compactText(value) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

function textTokens(value) {
  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !/^\d$/.test(token) && !VISTOS_MATCH_STOP_WORDS.has(token));
}

function tokenSet(value) {
  return new Set(textTokens(value));
}

function isYearToken(token) {
  const number = Number(token);
  return /^\d{4}$/.test(cleanString(token)) && number >= 1900 && number <= 2099;
}

function isAddressNumberToken(token) {
  const text = cleanString(token);
  return Boolean(text && !isYearToken(text) && /^\d+[A-Z]?(?:\/\d+[A-Z]?)?$/.test(text));
}

function isAddressEvidenceToken(token) {
  const text = normalizeText(token);
  if (!text || VISTOS_MATCH_ADDRESS_NOISE_TOKENS.has(text) || isYearToken(text)) {
    return false;
  }
  return /^[A-Z]{4,}$/.test(text) || isAddressNumberToken(text);
}

function addressEvidenceFromOverlap(overlap = []) {
  const tokens = overlap.map(normalizeText).filter(isAddressEvidenceToken);
  const alphaCount = tokens.filter((token) => /^[A-Z]{4,}$/.test(token)).length;
  const numberCount = tokens.filter(isAddressNumberToken).length;
  return {
    tokens,
    alphaCount,
    numberCount,
    hasSpecificAddress: alphaCount >= 2 || (alphaCount >= 1 && numberCount >= 1)
  };
}

function hasReliableNameOverlap(overlap = [], context = {}) {
  if (context.sourceNameLooksAddressOnly) {
    return false;
  }
  const meaningful = overlap
    .map(normalizeText)
    .filter((token) => /^[A-Z0-9]+$/.test(token))
    .filter((token) => !VISTOS_MATCH_ADDRESS_NOISE_TOKENS.has(token))
    .filter((token) => !isYearToken(token))
    .filter((token) => !isAddressNumberToken(token));
  return meaningful.some((token) => token.length >= 5) || meaningful.length >= 2;
}

function serviceCompatibility(details = {}, context = {}) {
  const wasteCompatible = !context.sourceWaste || Boolean(details.wasteMatches);
  const frequencyCompatible = !context.sourceFrequency || Boolean(details.frequencyMatches);
  const volumeCompatible = !context.sourceContainerVolume || Boolean(details.volumeMatches);
  return wasteCompatible && frequencyCompatible && volumeCompatible;
}

function strongMatchEvidence(details = {}, context = {}) {
  const addressEvidence = addressEvidenceFromOverlap(details.addressOverlap || []);
  const embeddedAddressEvidence = addressEvidenceFromOverlap(details.nameOverlap || []);
  const reliableName = hasReliableNameOverlap(details.nameOverlap || [], context) || numericValue(details.exactName) >= 0.74;
  const reliableAddress =
    addressEvidence.hasSpecificAddress ||
    embeddedAddressEvidence.hasSpecificAddress ||
    numericValue(details.exactAddress) >= 0.62 ||
    (numericValue(details.exactName) >= 0.74 && (addressEvidence.alphaCount + embeddedAddressEvidence.alphaCount) >= 1);
  const serviceCompatible = serviceCompatibility(details, context);
  return {
    reliableName,
    reliableAddress,
    serviceCompatible,
    exactName: numericValue(details.exactName),
    exactAddress: numericValue(details.exactAddress),
    addressEvidenceTokens: addressEvidence.tokens,
    embeddedAddressEvidenceTokens: embeddedAddressEvidence.tokens,
    safeSpecificMatch: reliableName && reliableAddress && serviceCompatible
  };
}

function tokenOverlapScore(sourceTokens, candidateTokens) {
  if (!sourceTokens.size || !candidateTokens.size) {
    return { score: 0, overlap: [] };
  }
  const overlap = [...sourceTokens].filter((token) => candidateTokens.has(token));
  return {
    score: overlap.length / sourceTokens.size,
    overlap
  };
}

function compactContainmentScore(source, candidate) {
  if (source.length < 4 || candidate.length < 4) {
    return 0;
  }
  if (source === candidate) {
    return 1;
  }
  if (source.length >= 5 && candidate.includes(source)) {
    return 0.74;
  }
  if (candidate.length >= 5 && source.includes(candidate)) {
    return 0.62;
  }
  return 0;
}

function normalizeMatchFrequency(value) {
  const compact = normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/([1235])XTYDNE/g, "$1X7")
    .replace(/([1235])X7DNI/g, "$1X7")
    .replace(/([1235])XZA7DNI/g, "$1X7")
    .replace(/([1235])X14DNI/g, "$1X14")
    .replace(/([1235])XZA14DNI/g, "$1X14")
    .replace(/([1235])X30DNI/g, "$1X30")
    .replace(/([1235])XZA30DNI/g, "$1X30")
    .replace(/14DENNI/g, "1X14")
    .replace(/MESICNE/g, "1X30");
  if (compact === "TYDNE") return "1X7";
  if (compact === "OBTYDEN") return "1X14";
  if (compact === "MESICNE" || compact === "MESICNI") return "1X30";
  return compact;
}

function normalizeMatchWaste(value) {
  const text = normalizeText(value);
  if (text.includes("PAPIR") || text.includes("200101") || text.includes("150101")) return "PAPIR";
  if (text.includes("PLAST") || text.includes("200139") || text.includes("150102")) return "PLAST";
  if (text.includes("SKLO") || text.includes("200102")) return "SKLO";
  if (text.includes("BIO") || text.includes("200201") || text.includes("200108")) return "BIO";
  if (text.includes("SKO") || text.includes("SMES") || text.includes("KOMUNAL") || text.includes("200301")) return "SKO";
  return text;
}

function issueStatusFromSourceRow(row) {
  const status = cleanString(row?.mapping_status || row?.mappingStatus);
  if (["chybí adresa", "chybí nádoba", "chybí frekvence", "duplicita"].includes(status)) {
    return status;
  }
  return "";
}

function vistosCandidateFromRow(row) {
  const candidate = {
    contractId: cleanString(row?.contractId || row?.sourceContractId || row?.sourceId),
    contractRowId: cleanString(row?.contractRowId || row?.sourceId),
    productId: cleanString(row?.productId),
    contractNumber: cleanString(row?.contractNumber),
    customerName: cleanString(row?.customerName),
    branchName: cleanString(row?.branchName),
    siteName: cleanString(row?.siteName),
    addressText: cleanString(row?.addressRaw || row?.addressText),
    productName: cleanString(row?.productName || row?.rowName),
    wasteType: cleanString(row?.wasteType),
    wasteCode: cleanString(row?.wasteCode),
    frequency: cleanString(row?.frequency),
    containerVolume: numericValue(row?.containerVolume),
    containerCount: numericValue(row?.containerCount),
    mappingStatus: cleanString(row?.mappingStatus),
    rowKey: cleanString(row?.rowKey || row?.siteKey || row?.sourceId)
  };
  const allText = [
    candidate.contractNumber,
    candidate.customerName,
    candidate.branchName,
    candidate.siteName,
    candidate.addressText,
    candidate.productName,
    candidate.wasteType,
    candidate.wasteCode,
    candidate.frequency
  ].join(" ");
  return {
    ...candidate,
    allText,
    allTokens: tokenSet(allText),
    compactAllText: compactText(allText),
    compactNameText: compactText([candidate.customerName, candidate.branchName, candidate.siteName].join(" ")),
    compactAddressText: compactText([candidate.addressText, candidate.siteName].join(" ")),
    wasteKey: normalizeMatchWaste(`${candidate.wasteType} ${candidate.wasteCode} ${candidate.productName}`),
    frequencyKey: normalizeMatchFrequency(candidate.frequency)
  };
}

function vistosCandidateFromPersistedImportRow(row) {
  const summary = parseJson(row?.summary_json, {});
  return vistosCandidateFromRow({
    ...summary,
    sourceId: summary.sourceId || row?.source_id,
    sourceEntity: summary.sourceEntity || row?.source_entity
  });
}

async function loadPersistedVistosKommunalCandidates(db) {
  const batch = await db.prepare(`
    SELECT *
    FROM collection_import_batches
    WHERE source_mode = 'vistos-komunal-preview'
    ORDER BY created_at DESC
    LIMIT 1
  `).first();

  if (!batch) {
    return {
      source: "none",
      batch: null,
      candidates: []
    };
  }

  const rowsResult = await db.prepare(`
    SELECT *
    FROM collection_import_rows
    WHERE batch_id = ?
    ORDER BY row_number ASC
    LIMIT ?
  `).bind(cleanString(batch.id), VISTOS_SOURCE_MATCH_MAX_CANDIDATES).all();

  return {
    source: "d1-vistos-komunal-preview",
    batch,
    candidates: (rowsResult.results || [])
      .map(vistosCandidateFromPersistedImportRow)
      .filter((candidate) => candidate.allTokens.size || candidate.contractId || candidate.contractNumber)
  };
}

function buildVistosCandidateIndex(candidates) {
  const tokenCandidates = new Map();
  for (const candidate of candidates) {
    for (const token of candidate.allTokens) {
      if (token.length < 3) {
        continue;
      }
      if (!tokenCandidates.has(token)) {
        tokenCandidates.set(token, []);
      }
      tokenCandidates.get(token).push(candidate);
    }
  }
  return { tokenCandidates };
}

function sourceMatchContext(sourceRow) {
  const sourceName = cleanString(sourceRow.customer_name);
  const sourceAddress = cleanString(sourceRow.address_text);
  const sourceOriginal = cleanString(sourceRow.original_text);
  const normalizedSourceName = normalizeText(sourceName);
  const sourceAll = [
    sourceName,
    sourceAddress,
    sourceOriginal,
    sourceRow.waste_type,
    sourceRow.waste_code,
    sourceRow.frequency
  ].join(" ");

  return {
    nameTokens: tokenSet(sourceName),
    addressTokens: tokenSet(sourceAddress),
    originalTokens: tokenSet(sourceOriginal),
    poolTokens: [
      ...textTokens(sourceName).map((token) => ({ token, weight: 5 })),
      ...textTokens(sourceAddress).map((token) => ({ token, weight: 4 })),
      ...textTokens(sourceOriginal).map((token) => ({ token, weight: 1 }))
    ].filter((item) => item.token.length >= 3),
    compactName: compactText(sourceName),
    compactAddress: compactText(sourceAddress),
    compactAll: compactText(sourceAll),
    sourceWaste: normalizeMatchWaste(`${sourceRow.waste_type} ${sourceRow.waste_code}`),
    sourceFrequency: normalizeMatchFrequency(sourceRow.frequency),
    sourceContainerVolume: numericValue(sourceRow.container_volume),
    sourceNameLooksAddressOnly: /^BRNO\b/.test(normalizedSourceName)
  };
}

function candidatePoolForSourceRow(context, candidateIndex) {
  const scores = new Map();
  for (const { token, weight } of context.poolTokens) {
    const candidates = candidateIndex.tokenCandidates.get(token) || [];
    if (!candidates.length || candidates.length > VISTOS_SOURCE_MATCH_COMMON_TOKEN_LIMIT) {
      continue;
    }
    const tokenWeight = weight + Math.max(0, 6 - Math.log10(Math.max(candidates.length, 1) + 1) * 2);
    for (const candidate of candidates) {
      scores.set(candidate, (scores.get(candidate) || 0) + tokenWeight);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, VISTOS_SOURCE_MATCH_MAX_CANDIDATE_POOL)
    .map(([candidate]) => candidate);
}

function scoreVistosCandidate(candidate, context) {
  const nameOverlap = tokenOverlapScore(context.nameTokens, candidate.allTokens);
  const addressOverlap = tokenOverlapScore(context.addressTokens, candidate.allTokens);
  const originalOverlap = tokenOverlapScore(context.originalTokens, candidate.allTokens);
  const exactName = Math.max(
    compactContainmentScore(context.compactName, candidate.compactNameText),
    compactContainmentScore(context.compactName, candidate.compactAllText)
  );
  const exactAddress = Math.max(
    compactContainmentScore(context.compactAddress, candidate.compactAddressText),
    compactContainmentScore(context.compactAddress, candidate.compactAllText)
  );
  const wasteMatches = Boolean(context.sourceWaste && candidate.wasteKey && (context.sourceWaste === candidate.wasteKey || candidate.wasteKey.includes(context.sourceWaste) || context.sourceWaste.includes(candidate.wasteKey)));
  const frequencyMatches = Boolean(context.sourceFrequency && candidate.frequencyKey && context.sourceFrequency === candidate.frequencyKey);
  const volumeMatches = context.sourceContainerVolume > 0 &&
    numericValue(candidate.containerVolume) > 0 &&
    context.sourceContainerVolume === numericValue(candidate.containerVolume);
  const allContainment = compactContainmentScore(context.compactAll, candidate.compactAllText);

  let score = 0;
  score += nameOverlap.score * 38;
  score += addressOverlap.score * 28;
  score += originalOverlap.score * 10;
  score += exactName * 12;
  score += exactAddress * 8;
  score += allContainment * 4;
  if (wasteMatches) score += 5;
  if (frequencyMatches) score += 3;
  if (volumeMatches) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    nameOverlap: nameOverlap.overlap,
    addressOverlap: addressOverlap.overlap,
    originalOverlap: originalOverlap.overlap,
    exactName,
    exactAddress,
    allContainment,
    wasteMatches,
    frequencyMatches,
    volumeMatches
  };
}

function buildVistosSourceMatch(sourceRow, candidates, createdAt, context = sourceMatchContext(sourceRow)) {
  const sourceIssueStatus = issueStatusFromSourceRow(sourceRow);
  if (!cleanString(sourceRow.customer_name) || !cleanString(sourceRow.address_text)) {
    return {
      sourceRow,
      candidate: null,
      status: "chybí adresa",
      confidence: "bez match",
      issue: "Zdrojový Excel řádek nemá spolehlivého zákazníka nebo adresu pro Vistos match.",
      score: 0,
      secondScore: 0,
      metadata: { sourceOriginalMappingStatus: cleanString(sourceRow.mapping_status), sourceOriginalMappingIssue: cleanString(sourceRow.mapping_issue) },
      createdAt
    };
  }

  let best = null;
  let second = null;
  for (const candidate of candidates) {
    const details = scoreVistosCandidate(candidate, context);
    if (details.score <= 0) {
      continue;
    }
    const item = { candidate, details };
    if (!best || details.score > best.details.score) {
      second = best;
      best = item;
    } else if (!second || details.score > second.details.score) {
      second = item;
    }
  }
  const score = best?.details?.score || 0;
  const secondScore = second?.details?.score || 0;
  const ambiguous = Boolean(best && second && score - secondScore < 8 && secondScore >= 48);
  const evidence = best ? strongMatchEvidence(best.details, context) : {
    reliableName: false,
    reliableAddress: false,
    serviceCompatible: false,
    safeSpecificMatch: false
  };
  const clearSpecificMatch = Boolean(best && evidence.safeSpecificMatch && score >= 70 && score - secondScore >= 10);
  const directSpecificMatch = Boolean(
    best &&
    evidence.safeSpecificMatch &&
    score >= 62 &&
    score - secondScore >= 8 &&
    (evidence.exactName >= 0.74 || best.details.nameOverlap.length >= 2) &&
    (evidence.exactAddress >= 0.62 || best.details.addressOverlap.length >= 1)
  );
  const safeAmbiguousMatch = Boolean(best && evidence.safeSpecificMatch && score >= 74);

  let status = "nenamapováno";
  let confidence = "žádná";
  let issue = "Ve Vistos read-only exportu se nenašel dostatečně jistý protějšek.";
  if (sourceIssueStatus) {
    status = sourceIssueStatus;
    confidence = score >= 58 ? "částečná" : "nízká";
    issue = `${cleanString(sourceRow.mapping_issue) || "Zdrojový Excel řádek má datový problém."} Vistos match je jen pomocný údaj.`;
  } else if (best && ((score >= 74 && (!ambiguous || safeAmbiguousMatch)) || clearSpecificMatch || directSpecificMatch)) {
    status = "namapováno";
    confidence = ambiguous ? "vysoká se shodným specifickým důkazem" : "vysoká";
    issue = evidence.safeSpecificMatch && (ambiguous || score < 74)
      ? "Read-only Vistos match podle konkrétní shody zákazníka, adresy a svozových parametrů. Zdrojová trasa zůstává podle 13 Excelů."
      : "Read-only Vistos match. Zdrojová trasa zůstává podle 13 Excelů.";
  } else if (best && score >= 48) {
    status = "nejasné";
    confidence = ambiguous ? "nejistá duplicita" : "střední";
    issue = ambiguous
      ? "Více Vistos kandidátů má podobné skóre. Je potřeba ruční potvrzení."
      : "Vistos kandidát existuje, ale skóre nestačí pro jisté namapování.";
  }

  return {
    sourceRow,
    candidate: best?.candidate || null,
    status,
    confidence,
    issue,
    score,
    secondScore,
    metadata: {
      sourceOriginalMappingStatus: cleanString(sourceRow.mapping_status),
      sourceOriginalMappingIssue: cleanString(sourceRow.mapping_issue),
      score,
      secondScore,
      matchEvidence: evidence,
      matchDetails: best?.details || null,
      secondCandidate: second ? {
        contractId: second.candidate.contractId,
        contractNumber: second.candidate.contractNumber,
        customerName: second.candidate.customerName,
        branchName: second.candidate.branchName,
        siteName: second.candidate.siteName,
        addressText: second.candidate.addressText,
        productName: second.candidate.productName,
        score: second.details.score
      } : null,
      sourceScope: "13-excel-only",
      vistosUse: "read-only mapping",
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    },
    createdAt
  };
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

function weekFromSourceContext(value) {
  const text = normalizeText(value);
  const hasMonthly = text.includes("1X30") || text.includes("MESIC");
  const hasEven = text.includes("SUDE") || text.includes("SUDY") || text.includes("SUDA");
  const hasOdd = text.includes("LICHE") || text.includes("LICHY") || text.includes("LICHA");
  if (hasMonthly) return "měsíční";
  if (hasEven && hasOdd) return "každý týden";
  if (hasEven) return "sudý";
  if (hasOdd) return "lichý";
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
  const compact = compactText(value);
  return Boolean(
    text &&
    !/^\d+$/.test(text) &&
    !/^[0-9+\s./-]{6,}$/.test(text) &&
    !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/.test(text) &&
    !sourcePartLooksContactOrNote(value) &&
    !ROUTE_SOURCE_NON_CUSTOMER_TOKENS.has(text) &&
    !ROUTE_SOURCE_NON_CUSTOMER_TOKENS.has(compact) &&
    !ROUTE_SOURCE_SALES_CODES.has(compact) &&
    !/^(SUDY|SUDE|LICHY|LICHE|PONDELI|UTERY|STREDA|CTVRTEK|PATEK|KONTAKT|DPI|PLI|FKU|PCE|PPA|ROP|MAP)$/.test(text) &&
    !/\b(SUDY|SUDE|LICHY|LICHE|PONDELI|UTERY|STREDA|CTVRTEK|PATEK|DPI|PLI|FKU|PCE|PPA|ROP|MAP)\b/.test(text) &&
    !/\b(1X7|2X7|3X7|5X7|1X14|1X30|KONT|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO)\b/.test(text)
  );
}

function routeSourceSalesCode(value) {
  const parts = cleanString(value).split("|").map((part) => cleanString(part)).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const code = compactText(parts[index]);
    if (ROUTE_SOURCE_SALES_CODES.has(code)) {
      return code;
    }
  }
  return "";
}

function sourcePartLooksContactOrNote(value) {
  const text = normalizeText(value);
  const compact = compactText(value);
  return Boolean(
    /\b(TEL|TELEFON|MOBIL|KONTAKT)\b/.test(text) ||
    /^OD\s+\d/.test(text) ||
    compact === "MYVSE" ||
    compact === "VSE" ||
    (/^\+?\d{6,}$/.test(compact) && !/[A-Z]{2,}/.test(text))
  );
}

function addressCandidateScore(value) {
  const tokens = textTokens(value);
  const normalizedTokens = tokens.map(normalizeText);
  const alphaCount = normalizedTokens.filter((token) => /^[A-Z]{4,}$/.test(token)).length;
  const rawNumberCount = (normalizeText(value).match(/\b\d+[A-Z]?(?:\/\d+[A-Z]?)?\b/g) || [])
    .filter((token) => !isYearToken(token)).length;
  const numberCount = Math.max(normalizedTokens.filter(isAddressNumberToken).length, rawNumberCount);
  const cityCount = normalizedTokens.filter((token) => ROUTE_SOURCE_ADDRESS_HINTS.has(token)).length;
  const hasStreetLike = alphaCount >= 1 && numberCount >= 1;
  const hasCityAndStreet = cityCount >= 1 && alphaCount >= 2;
  const hasCommaAddress = cleanString(value).includes(",") && alphaCount >= 1;
  return (hasStreetLike ? 3 : 0) + (hasCityAndStreet ? 2 : 0) + (hasCommaAddress ? 1 : 0);
}

function looksLikeAddressCandidate(value) {
  return addressCandidateScore(value) >= 2;
}

function sourcePartLooksLikeServiceOnly(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  const hasServiceToken = /\b(1X7|2X7|3X7|5X7|1X14|1X30|KONT|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO|NADOBA|NADOBY|POPELNICE)\b/.test(text);
  const hasSpecificAddress = looksLikeAddressCandidate(value);
  const nonServiceAlphaTokens = textTokens(value).filter((token) =>
    /^[A-Z]/.test(token) &&
    !["SKO", "PAPIR", "PLAST", "SKLO", "BIO", "KONT", "LTR", "LITR", "NADOBA", "NADOBY", "POPELNICE", "VLASTNI"].includes(token)
  );
  return hasServiceToken && (!hasSpecificAddress || nonServiceAlphaTokens.length === 0) && nonServiceAlphaTokens.length <= 1;
}

function sourcePartLooksOnlyLegalSuffix(value) {
  return ROUTE_SOURCE_LEGAL_SUFFIXES.has(compactText(value));
}

function sourcePartLooksOnlyAddressHint(value) {
  const tokens = normalizeText(value).split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => ROUTE_SOURCE_ADDRESS_HINTS.has(token));
}

function sourceSplitHasRealCustomerAndAddress(split) {
  return Boolean(
    split?.customerName &&
    split?.addressText &&
    normalizeText(split.customerName) !== normalizeText(split.addressText)
  );
}

function splitCombinedCustomerAddress(value) {
  const text = cleanString(value);
  if (!text) {
    return { customerName: "", addressText: "" };
  }

  const commaParts = text.split(",").map(cleanString).filter(Boolean);
  const commaRest = commaParts.slice(1).join(", ");
  const commaRestLooksLikeAddress = looksLikeAddressCandidate(commaRest) && !sourcePartLooksOnlyLegalSuffix(commaRest);
  if (
    commaParts.length >= 2 &&
    fieldLooksOperational(commaParts[0]) &&
    commaRestLooksLikeAddress &&
    !sourcePartLooksOnlyAddressHint(commaParts[0])
  ) {
    return {
      customerName: commaParts[0],
      addressText: commaRest
    };
  }

  const dashParts = text.split(/\s+-\s+/).map(cleanString).filter(Boolean);
  if (dashParts.length >= 2 && fieldLooksOperational(dashParts[0])) {
    const rest = dashParts.slice(1).join(" - ");
    if (looksLikeAddressCandidate(rest) || normalizeText(rest).includes("BRNO")) {
      return {
        customerName: dashParts[0],
        addressText: rest
      };
    }
  }

  if (looksLikeAddressCandidate(text)) {
    return {
      customerName: "",
      addressText: text
    };
  }

  return {
    customerName: text,
    addressText: ""
  };
}

function sourcePartLooksLikeCustomerAddress(value) {
  const text = cleanString(value);
  const normalized = normalizeText(text);
  const compact = compactText(text);
  if (
    !text ||
    /^\d+$/.test(normalized) ||
    ROUTE_SOURCE_SALES_CODES.has(compact) ||
    sourcePartLooksContactOrNote(text) ||
    sourcePartLooksLikeServiceOnly(text)
  ) {
    return false;
  }
  const split = splitCombinedCustomerAddress(text);
  return sourceSplitHasRealCustomerAndAddress(split);
}

function sourceMappingFromFields(row, { customerName = "", addressText = "", salesCode = "" } = {}) {
  const issues = Array.isArray(row.qualityIssues) ? row.qualityIssues : [];
  if (!customerName || !addressText) {
    return {
      mappingStatus: "chybí adresa",
      mappingIssue: "chybí zákazník nebo adresa z Excel řádku"
    };
  }
  if (issues.includes("missing-container-volume")) {
    return {
      mappingStatus: "chybí nádoba",
      mappingIssue: "chybí nebo není jistý objem nádoby"
    };
  }
  if (!row.frequency || row.frequency === "-") {
    return {
      mappingStatus: "chybí frekvence",
      mappingIssue: "chybí četnost svozu"
    };
  }
  if (issues.includes("needs-vistos-waste-type") && !salesCode) {
    return {
      mappingStatus: "nejasné",
      mappingIssue: "typ odpadu je potřeba potvrdit přes Vistos nebo ručně"
    };
  }
  if (issues.includes("source-note-cancelled-or-stopped")) {
    return {
      mappingStatus: "nejasné",
      mappingIssue: "zdrojový řádek obsahuje pozastavení, konec nebo vyřazení"
    };
  }
  return {
    mappingStatus: "nenamapováno",
    mappingIssue: "čeká na Vistos match"
  };
}

function deriveFields(row, context = {}) {
  const parts = cleanString(row.originalText).split("|").map((part) => cleanString(part)).filter(Boolean);
  const operationalParts = parts.filter(fieldLooksOperational);
  const customerAddressParts = parts.filter(sourcePartLooksLikeCustomerAddress);
  const candidateParts = [...customerAddressParts];
  for (const part of operationalParts) {
    if (!candidateParts.includes(part)) {
      candidateParts.push(part);
    }
  }
  const salesCode = cleanString(context.salesCode) || routeSourceSalesCode(row.originalText);
  const splitPrimary = splitCombinedCustomerAddress(candidateParts[0] || "");
  const customerName = splitPrimary.customerName || "";
  const addressText = splitPrimary.addressText ||
    candidateParts
      .slice(1)
      .find((part) => looksLikeAddressCandidate(part) && part !== customerName) ||
    candidateParts.find((part) => /[,0-9]/.test(part) && part !== customerName && !sourcePartLooksContactOrNote(part)) ||
    splitCombinedCustomerAddress(candidateParts[1] || "").addressText ||
    candidateParts[1] ||
    "";
  const note = parts.find((part) => /\b(pozn|pozastav|vyraz|vyřaz|konec|volat|klic|klíč|kontakt|brana|brána)\b/i.test(part)) || "";
  const { mappingStatus, mappingIssue } = sourceMappingFromFields(row, { customerName, addressText, salesCode });

  return { customerName, addressText, note, mappingStatus, mappingIssue, continuationRow: false };
}

function sourceRowHasRoutePayload(row) {
  const text = normalizeText(row.originalText);
  return Boolean(
    cleanString(row.frequency) ||
    numericValue(row.containerVolume) ||
    numericValue(row.containerCount) ||
    cleanString(row.wasteType).replace("-", "") ||
    /\b(1X7|2X7|3X7|5X7|1X14|1X30|LTR|LITR|SKO|PAPIR|PLAST|SKLO|BIO|NADOBA|NADOBY|POPELNICE)\b/.test(text)
  );
}

function sourceNameIsContinuationPlaceholder(value) {
  const compact = compactText(value);
  return ["VLASTNINADOBA", "VLASTNINADOBY", "VLASTNIPOPELNICE"].includes(compact);
}

function shouldInheritPreviousStop(row, derived, previousStop) {
  if (!previousStop?.customerName || !previousStop?.addressText || !sourceRowHasRoutePayload(row)) {
    return false;
  }
  if (derived.customerName && derived.addressText) {
    return false;
  }
  const parts = cleanString(row.originalText).split("|").map((part) => cleanString(part)).filter(Boolean);
  if (parts.some(sourcePartLooksLikeCustomerAddress)) {
    return false;
  }
  return !derived.customerName || sourceNameIsContinuationPlaceholder(derived.customerName);
}

function deriveFieldsWithInheritedStop(row, context = {}) {
  const derived = deriveFields(row, context);
  const previousStop = context.previousStop || null;
  if (!shouldInheritPreviousStop(row, derived, previousStop)) {
    return derived;
  }
  const customerName = previousStop.customerName;
  const addressText = previousStop.addressText;
  const { mappingStatus, mappingIssue } = sourceMappingFromFields(row, {
    customerName,
    addressText,
    salesCode: context.salesCode
  });
  return {
    ...derived,
    customerName,
    addressText,
    mappingStatus,
    mappingIssue,
    continuationRow: true,
    inheritedStop: previousStop
  };
}

export function __deriveCollectionRouteSourceFieldsForTest(row = {}, context = {}) {
  return deriveFieldsWithInheritedStop({
    originalText: "",
    qualityIssues: [],
    frequency: "1x7",
    containerVolume: 1100,
    containerCount: 1,
    wasteType: "SKO",
    ...row
  }, context);
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
    sourceMappingStatus: cleanString(row?.source_mapping_status || row?.mapping_status),
    sourceMappingIssue: cleanString(row?.source_mapping_issue || row?.mapping_issue),
    mappingStatus: cleanString(row?.mapping_status),
    mappingIssue: cleanString(row?.mapping_issue),
    vistosMatchStatus: cleanString(row?.vistos_match_status),
    vistosMatchConfidence: cleanString(row?.vistos_match_confidence),
    vistosContractId: cleanString(row?.vistos_contract_id),
    vistosContractNumber: cleanString(row?.vistos_contract_number),
    vistosCustomerName: cleanString(row?.vistos_customer_name),
    vistosBranchName: cleanString(row?.vistos_branch_name),
    vistosSiteName: cleanString(row?.vistos_site_name),
    vistosAddressText: cleanString(row?.vistos_address_text),
    vistosProductName: cleanString(row?.vistos_product_name),
    vistosIssue: cleanString(row?.vistos_issue),
    vistosMatchMetadata: parseJson(row?.vistos_match_metadata_json, {}),
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
  const previousStopByScope = new Map();
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
    const filenameWeek = weekFromSourceContext(`${sourceFile} ${row.sheetName || ""}`);
    const sourceWeek = filenameWeek !== "každý týden"
      ? routeModeFromWeek(filenameWeek)
      : textWeek !== "každý týden"
          ? routeModeFromWeek(textWeek)
          : row.originalWeek && row.originalWeek !== "-"
            ? row.originalWeek
            : routeModeFromWeek(filenameWeek);
    const sourceVehicle = vehicleFromText(sourceFile) || cleanString(row.vehicleCode || "");
    const salesCode = routeSourceSalesCode(row.originalText);
    const sourceSheet = cleanString(row.sheetName);
    const scopeKey = [sourceFile, sourceSheet].join("\u0001");
    const derived = deriveFieldsWithInheritedStop(row, {
      salesCode,
      previousStop: previousStopByScope.get(scopeKey) || null
    });
    const textKey = normalizeText(row.originalText);
    const isDuplicate = !derived.continuationRow && (duplicateCounts.get(textKey) || 0) > 1;
    const mappingStatus = isDuplicate && derived.mappingStatus === "nenamapováno" ? "duplicita" : derived.mappingStatus;
    const mappingIssue = isDuplicate && derived.mappingStatus === "nenamapováno" ? "duplicitní text v historických řádcích" : derived.mappingIssue;
    const inheritedStop = derived.inheritedStop || null;

    rows.push({
      id: randomId("collection-route-source-row"),
      batchId,
      fileId,
      routeOrder,
      sourceFile,
      sourceSheet,
      sourceRowNumber: numericValue(row.sourceRowNumber),
      originalText: cleanString(row.originalText).slice(0, 1000),
      dayCode: filenameDay || (row.originalDay && row.originalDay !== "-" ? row.originalDay : "") || textDay || cleanString(row.suggestedDay),
      weekMode: sourceWeek,
      vehicleCode: sourceVehicle,
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
        salesCode,
        salesCodeSource: salesCode ? "source-row-suffix" : "",
        continuationRow: Boolean(derived.continuationRow),
        inheritedStopSource: inheritedStop ? {
          sourceFile: inheritedStop.sourceFile,
          sourceSheet: inheritedStop.sourceSheet,
          sourceRowNumber: inheritedStop.sourceRowNumber,
          routeOrder: inheritedStop.routeOrder
        } : null,
        vehicleSource: vehicleFromText(sourceFile) ? "source-file" : "working-draft",
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      }
    });

    if (derived.customerName && derived.addressText) {
      previousStopByScope.set(scopeKey, {
        customerName: derived.customerName,
        addressText: derived.addressText,
        sourceFile,
        sourceSheet,
        sourceRowNumber: inheritedStop?.sourceRowNumber || numericValue(row.sourceRowNumber),
        routeOrder: inheritedStop?.routeOrder || routeOrder
      });
    }
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

    const clauses = ["r.batch_id = ?"];
    const params = [resolvedBatchId];
    if (day !== "all") {
      clauses.push("r.day_code = ?");
      params.push(day);
    }
    if (week !== "all") {
      clauses.push("r.week_mode = ?");
      params.push(week);
    }
    if (vehicle !== "all") {
      clauses.push("r.vehicle_code = ?");
      params.push(vehicle);
    }
    if (waste !== "all") {
      if (waste === "ostatní") {
        clauses.push("(r.waste_type = '' OR r.waste_type NOT IN ('SKO','BIO','PAPIR','PLAST','SKLO'))");
      } else {
        clauses.push("r.waste_type = ?");
        params.push(waste);
      }
    }
    if (mappingStatus !== "all") {
      clauses.push("COALESCE(NULLIF(vm.status, ''), r.mapping_status) = ?");
      params.push(mappingStatus);
    }

    const [batchRow, filesResult, rowsResult] = await Promise.all([
      db.prepare("SELECT * FROM collection_route_source_batches WHERE id = ? LIMIT 1").bind(resolvedBatchId).first(),
      db.prepare("SELECT * FROM collection_route_source_files WHERE batch_id = ? ORDER BY filename").bind(resolvedBatchId).all(),
      db.prepare(`
        SELECT
          r.*,
          r.mapping_status AS source_mapping_status,
          r.mapping_issue AS source_mapping_issue,
          COALESCE(NULLIF(vm.status, ''), r.mapping_status) AS mapping_status,
          COALESCE(NULLIF(vm.issue, ''), r.mapping_issue) AS mapping_issue,
          vm.status AS vistos_match_status,
          vm.confidence AS vistos_match_confidence,
          vm.contract_id AS vistos_contract_id,
          vm.contract_number AS vistos_contract_number,
          vm.customer_name AS vistos_customer_name,
          vm.branch_name AS vistos_branch_name,
          vm.site_name AS vistos_site_name,
          vm.address_text AS vistos_address_text,
          vm.product_name AS vistos_product_name,
          vm.issue AS vistos_issue,
          vm.metadata_json AS vistos_match_metadata_json
        FROM collection_route_source_rows r
        LEFT JOIN collection_route_vistos_matches vm ON vm.id = (
          SELECT latest_vm.id
          FROM collection_route_vistos_matches latest_vm
          WHERE latest_vm.source_row_id = r.id
          ORDER BY latest_vm.created_at DESC, latest_vm.id DESC
          LIMIT 1
        )
        WHERE ${clauses.join(" AND ")}
        ORDER BY r.route_order ASC
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

export async function matchCollectionRouteSourceRowsWithVistos(env, user, {
  batchId = "",
  limit = VISTOS_SOURCE_MATCH_MAX_ROWS
} = {}) {
  const db = routeSourcesDatabase(env, true);
  const createdAt = nowIso();

  let resolvedBatchId = cleanString(batchId);
  try {
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
      throw new CollectionRouteSourcesError(
        "Nejdřív je potřeba uložit import 13 Excelů do Svozových tras.",
        400,
        "collection_route_sources_no_batch"
      );
    }

    const batch = await db.prepare(`
      SELECT *
      FROM collection_route_source_batches
      WHERE id = ?
      LIMIT 1
    `).bind(resolvedBatchId).first();

    if (!batch) {
      throw new CollectionRouteSourcesError(
        "Vybraný import 13 Excelů neexistuje.",
        404,
        "collection_route_sources_batch_not_found"
      );
    }

    const maxRows = Math.max(1, Math.min(Number(limit) || VISTOS_SOURCE_MATCH_MAX_ROWS, VISTOS_SOURCE_MATCH_MAX_ROWS));
    const rowsResult = await db.prepare(`
      SELECT *
      FROM collection_route_source_rows
      WHERE batch_id = ?
      ORDER BY route_order ASC
      LIMIT ?
    `).bind(resolvedBatchId, maxRows).all();
    const sourceRows = rowsResult.results || [];

    if (!sourceRows.length) {
      throw new CollectionRouteSourcesError(
        "Vybraný import neobsahuje žádné zdrojové řádky.",
        400,
        "collection_route_sources_no_rows"
      );
    }

    let candidateSource = await loadPersistedVistosKommunalCandidates(db);
    let apiStatus = "ready";
    if (!candidateSource.candidates.length) {
      try {
        const vistosExport = await createCollectionRoutesVistosKommunalPreviewExport(env, {
          limit: VISTOS_SOURCE_MATCH_MAX_CANDIDATES
        });
        apiStatus = vistosExport.apiStatus || "ready";
        candidateSource = {
          source: "live-vistos-komunal-export",
          batch: null,
          candidates: (Array.isArray(vistosExport.rows) ? vistosExport.rows : [])
            .map(vistosCandidateFromRow)
            .filter((candidate) => candidate.allTokens.size || candidate.contractId || candidate.contractNumber)
        };
      } catch (error) {
        if (error instanceof CollectionRoutesStoreError) {
          throw new CollectionRouteSourcesError(
            `Vistos match nemá uložený Vistos-only preview batch a živý Vistos export se nepodařilo načíst: ${error.message}`,
            error.status || 503,
            error.code || "vistos_api_match_failed"
          );
        }
        throw new CollectionRouteSourcesError(
          "Vistos match nemá uložený Vistos-only preview batch a živý Vistos export se nepodařilo načíst.",
          503,
          "vistos_api_match_failed"
        );
      }
    }

    const candidates = candidateSource.candidates;
    const candidateIndex = buildVistosCandidateIndex(candidates);

    const matches = sourceRows.map((row) => {
      const context = sourceMatchContext(row);
      return buildVistosSourceMatch(row, candidatePoolForSourceRow(context, candidateIndex), createdAt, context);
    });

    for (let index = 0; index < matches.length; index += 100) {
      const chunk = matches.slice(index, index + 100);
      await db.batch(chunk.map((match) => {
        const candidate = match.candidate || {};
        return db.prepare(`
          INSERT INTO collection_route_vistos_matches
            (id, source_row_id, status, confidence, contract_id, contract_number, customer_name, branch_name, site_name, address_text, product_name, issue, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          randomId("collection-route-vistos-match"),
          match.sourceRow.id,
          match.status,
          match.confidence,
          candidate.contractId || "",
          candidate.contractNumber || "",
          candidate.customerName || "",
          candidate.branchName || "",
          candidate.siteName || "",
          candidate.addressText || "",
          candidate.productName || "",
          match.issue,
          jsonString({
            ...match.metadata,
            contractRowId: candidate.contractRowId || "",
            productId: candidate.productId || "",
            rowKey: candidate.rowKey || "",
            vistosMappingStatus: candidate.mappingStatus || "",
            triggeredByUserId: cleanString(user?.id),
            triggeredAt: createdAt
          }),
          createdAt
        );
      }));
    }

    await db.prepare(`
      DELETE FROM collection_route_vistos_matches
      WHERE created_at <> ?
        AND source_row_id IN (
          SELECT id FROM collection_route_source_rows WHERE batch_id = ?
        )
    `).bind(createdAt, resolvedBatchId).run();

    const summary = {
      batchId: resolvedBatchId,
      sourceRowCount: sourceRows.length,
      limited: sourceRows.length >= maxRows && numericValue(batch.row_count) > sourceRows.length,
      sourceBatchRowCount: numericValue(batch.row_count),
      vistosCandidateCount: candidates.length,
      matchedCount: matches.filter((match) => match.status === "namapováno").length,
      ambiguousCount: matches.filter((match) => match.status === "nejasné").length,
      unmatchedCount: matches.filter((match) => match.status === "nenamapováno").length,
      missingAddressCount: matches.filter((match) => match.status === "chybí adresa").length,
      missingContainerCount: matches.filter((match) => match.status === "chybí nádoba").length,
      missingFrequencyCount: matches.filter((match) => match.status === "chybí frekvence").length,
      duplicateCount: matches.filter((match) => match.status === "duplicita").length,
      candidateSource: candidateSource.source,
      candidateBatchId: cleanString(candidateSource.batch?.id),
      candidateBatchCreatedAt: cleanString(candidateSource.batch?.created_at),
      candidateBatchRowCount: numericValue(candidateSource.batch?.row_count),
      candidatePoolLimit: VISTOS_SOURCE_MATCH_MAX_CANDIDATE_POOL,
      commonTokenLimit: VISTOS_SOURCE_MATCH_COMMON_TOKEN_LIMIT,
      createdAt,
      createdByUserId: cleanString(user?.id),
      source: "13-excel",
      vistosUse: "read-only mapping",
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false
    };

    return {
      status: "matched",
      apiStatus,
      message: `Vistos match hotový pro ${sourceRows.length} řádků z 13 Excelů. Ostré trasy nevznikly.`,
      summary
    };
  } catch (error) {
    if (error instanceof CollectionRouteSourcesError) {
      throw error;
    }
    throw dbError(error);
  }
}
