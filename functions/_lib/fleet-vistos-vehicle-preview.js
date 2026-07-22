import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  getVistosById,
  getVistosSchemaEntity,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT = 200;
const FLEET_VISTOS_VEHICLE_DETAIL_LIMIT = 12;
const FLEET_VISTOS_VEHICLE_DETAIL_CONCURRENCY = 3;
const FLEET_VISTOS_VEHICLE_COLUMNS = [
  "Id",
  "Name",
  "RegistrationPlate",
  "VIN",
  "IsActive",
  "Archived",
  "StartingDate",
  "EliminatedDate",
  "Odometer",
  "c_Km",
  "Stavvozidla_FK",
  "CarCategory_FK",
  "c_LastGpsLocation1",
  "c_LastLocation",
  "LastPositionSyncDate",
  "c_DateUpdateGPS",
  "Ridic_FK",
  "c_GpsProvider_FK"
];
const FLEET_VISTOS_VEHICLE_ACTIVE_FILTER = {
  Stavvozidla_FK: [16541]
};
const FLEET_VISTOS_VEHICLE_TERM_SPECS = [
  {
    field: "stkValidTo",
    label: "STK",
    aliases: [
      "STK",
      "Stk",
      "KonecSTK",
      "KonecStk",
      "Konec STK",
      "STKValidTo",
      "StkValidTo",
      "STKPlatnostDo",
      "TechnickaKontrolaDo",
      "TechnickaProhlidkaDo",
      "TechnicalInspectionValidTo",
      "c_STK",
      "c_STKDo",
      "c_KonecSTK",
      "c_KonecStk",
      "c_STKPlatnostDo",
      "c_TechnickaKontrolaDo",
      "c_TechnickaProhlidkaDo"
    ],
    tokens: [["stk"], ["konec", "valid", "platnost", "do", "date", "datum", "kontrola", "prohlidka"]]
  },
  {
    field: "emissionsValidTo",
    label: "Emise",
    aliases: ["Emise", "EmiseDo", "KonecEmisi", "KonecEmise", "Konec emisí", "EmissionsValidTo", "EmissionValidTo", "c_Emise", "c_EmiseDo", "c_KonecEmisi", "c_KonecEmise", "c_EmisePlatnostDo"],
    tokens: [["emise", "emisi", "emission"], ["konec", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "tachographValidTo",
    label: "Tachograf",
    aliases: ["Tachograf", "TachografDo", "KonecTachografu", "Konec tachografu", "TachographValidTo", "c_Tachograf", "c_TachografDo", "c_KonecTachografu", "c_TachografPlatnostDo"],
    tokens: [["tachograf", "tachograph"], ["konec", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "craneRevisionValidTo",
    label: "Revize jeřábu",
    aliases: ["RevizeJerabu", "RevizeJerabuDo", "KonecRevizeJerabu", "Konec revize jeřábu", "CraneRevisionValidTo", "c_RevizeJerabu", "c_RevizeJerabuDo", "c_KonecRevizeJerabu", "c_JerabRevizeDo"],
    tokens: [["jerab", "crane"], ["konec", "revize", "revision", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "liftRevisionValidTo",
    label: "Revize čela",
    aliases: ["RevizeCela", "RevizeCelaDo", "KonecRevizeCela", "Konec revize čela", "TailLiftRevisionValidTo", "LiftRevisionValidTo", "c_RevizeCela", "c_RevizeCelaDo", "c_KonecRevizeCela", "c_CeloRevizeDo"],
    tokens: [["celo", "cela", "lift", "taillift"], ["konec", "revize", "revision", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "pressureEquipmentRevisionValidTo",
    label: "Tlakové zařízení",
    aliases: ["TlakoveZarizeni", "TlakoveZarizeniDo", "KonecTlakoveZkousky", "DatumTlakoveZkousky", "Datum tlakové zkoušky", "PressureEquipmentRevisionValidTo", "PressureTestDate", "c_TlakoveZarizeni", "c_TlakoveZarizeniDo", "c_KonecTlakoveZkousky", "c_DatumTlakoveZkousky"],
    tokens: [["tlakove", "tlak", "pressure"], ["zarizeni", "equipment", "zkouska", "revize", "revision", "valid", "platnost", "do", "date", "datum", "konec"]]
  },
  {
    field: "fireExtinguisherValidTo",
    label: "Hasicí přístroj",
    aliases: ["HasiciPristroj", "HasiciPristrojDo", "KonecRevizeHasicihoPristroje", "Konec revize hasicího přístroje", "FireExtinguisherValidTo", "c_HasiciPristroj", "c_HasiciPristrojDo", "c_KonecRevizeHasicihoPristroje"],
    tokens: [["hasici", "hasic", "fireextinguisher"], ["konec", "valid", "platnost", "do", "date", "datum", "revize"]]
  },
  {
    field: "insuranceValidTo",
    label: "Pojištění",
    aliases: ["Pojisteni", "PojisteniDo", "KonecPojisteni", "Konec pojištění", "PojistkaDo", "InsuranceValidTo", "InsuranceEndDate", "c_Pojisteni", "c_PojisteniDo", "c_KonecPojisteni", "c_PojistkaDo", "c_PojisteniPlatnostDo"],
    tokens: [["pojisteni", "pojistka", "insurance"], ["konec", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "highwayVignetteValidTo",
    label: "Dálniční známka",
    aliases: ["DalnicniZnamka", "DalnicniZnamkaDo", "KonecDalnicniZnamky", "Konec dálniční známky", "HighwayVignetteValidTo", "VignetteValidTo", "c_DalnicniZnamka", "c_DalnicniZnamkaDo", "c_KonecDalnicniZnamky"],
    tokens: [["dalnicni", "vignette"], ["znamka", "konec", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "lastServiceDate",
    label: "Poslední servis",
    aliases: ["LastServiceDate", "PosledniServis", "PosledniServisDatum", "DatumPoslednihoServisu", "c_PosledniServis", "c_PosledniServisDatum", "c_DatumPoslednihoServisu"],
    tokens: [["servis", "service"], ["last", "posledni", "datum", "date"]]
  },
  {
    field: "nextServiceDate",
    label: "Příští servis",
    aliases: ["NextServiceDate", "PristiServis", "PristiServisDatum", "DalsiServis", "KonecServisnihoIntervalu", "c_PristiServis", "c_PristiServisDatum", "c_DalsiServis", "c_KonecServisnihoIntervalu"],
    tokens: [["servis", "service"], ["next", "pristi", "dalsi", "datum", "date", "konec", "interval"]]
  }
];
const FLEET_VISTOS_VEHICLE_TECHNICAL_SPECS = [
  { field: "emptyWeightKg", label: "Prázdná hmotnost", aliases: ["c_EmptyWeightKg"], kind: "integer" },
  { field: "maxPermittedWeightKg", label: "Nejvyšší povolená hmotnost", aliases: ["c_MaxPermittedWeightKg"], kind: "integer" },
  { field: "payloadKg", label: "Nosnost", aliases: ["c_PayloadKg"], kind: "integer" },
  { field: "lengthMeters", label: "Délka", aliases: ["c_LengthMeters"], kind: "decimal" },
  { field: "widthMeters", label: "Šířka", aliases: ["c_WidthMeters"], kind: "decimal" },
  { field: "heightMeters", label: "Výška", aliases: ["c_HeightMeters"], kind: "decimal" },
  { field: "axleCount", label: "Počet náprav", aliases: ["c_AxleCount_FK"], kind: "enum" },
  { field: "axleCountOther", label: "Vlastní počet náprav", aliases: ["c_AxleCountOther"], kind: "integer" },
  { field: "axleConfiguration", label: "Konfigurace náprav", aliases: ["c_AxleConfiguration_FK"], kind: "enum" },
  { field: "maxSingleAxleLoad", label: "Nejvyšší zatížení jedné nápravy", aliases: ["c_MaxSingleAxleLoad"], kind: "axle-load" },
  { field: "singleAxleGroupLoadT", label: "Zatížení jednoduché skupiny náprav", aliases: ["c_SingleAxleGroupLoadT"], kind: "decimal" },
  { field: "tandemAxleGroupLoadT", label: "Zatížení tandemové skupiny náprav", aliases: ["c_TandemAxleGroupLoadT"], kind: "decimal" },
  { field: "tridemAxleGroupLoadT", label: "Zatížení tridemové skupiny náprav", aliases: ["c_TridemAxleGroupLoadT"], kind: "decimal" },
  { field: "vehicleType", label: "Typ vozidla", aliases: ["c_VehicleType_FK"], kind: "enum" },
  { field: "trailerCount", label: "Počet přívěsů", aliases: ["c_TrailerCount_FK"], kind: "enum" },
  // Ve zdrojovém číselníku je pole bez prefixu c_; podporujeme obě bezpečně potvrzené varianty.
  { field: "fuelType", label: "Palivo", aliases: ["c_FuelType_FK", "FuelType_FK"], kind: "enum" },
  { field: "euroEmissionStandard", label: "Emisní norma EURO", aliases: ["c_EuroEmissionStandard_FK"], kind: "enum" },
  { field: "bodyType", label: "Typ nástavby", aliases: ["c_BodyType_FK"], kind: "enum" },
  { field: "usableBodyVolumeM3", label: "Využitelný objem nástavby", aliases: ["c_UsableBodyVolumeM3"], kind: "decimal" },
  { field: "additionalEquipment", label: "Další vybavení", aliases: ["c_AdditionalEquipment_FK"], kind: "multi-enum" },
  { field: "supportedContainerSizes", label: "Podporované nádoby", aliases: ["c_SupportedContainerSizes_FK"], kind: "multi-enum" },
  { field: "depotAddressRuian", label: "RÚIAN domovského depa", aliases: ["DepoAddressRuian"], kind: "text" },
  { field: "depotAddressStreet", label: "Ulice domovského depa", aliases: ["DepoAddressStreet"], kind: "text" },
  { field: "depotAddressCity", label: "Město domovského depa", aliases: ["DepoAddressCity"], kind: "text" },
  { field: "depotAddressState", label: "Kraj domovského depa", aliases: ["DepoAddressState_FK"], kind: "enum" },
  { field: "depotAddressCountry", label: "Země domovského depa", aliases: ["DepoAddressCountry_FK"], kind: "enum" },
  { field: "depotAddressPostalCode", label: "PSČ domovského depa", aliases: ["DepoAddressPostalCode"], kind: "text" },
  { field: "depotAddressGps", label: "GPS domovského depa", aliases: ["DepoAddressGps"], kind: "gps" }
];

function clean(value) {
  return cleanVistosValue(value);
}

function normalizeMetadataKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = clean(row?.[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function schemaColumnName(column = {}) {
  return firstValue(column, ["ColumnName", "columnName", "DbColumnName", "Name", "name", "FieldName", "fieldName"]);
}

function schemaColumnCaption(column = {}) {
  return firstValue(column, ["Caption", "caption", "Title", "title", "Label", "label", "Description", "description"]);
}

function schemaColumnsFromPayload(payload) {
  const columns = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const columnName = schemaColumnName(value);
    if (columnName && !columns.has(columnName)) {
      columns.set(columnName, {
        columnName,
        caption: schemaColumnCaption(value),
        type: firstValue(value, ["DataType", "dataType", "Type", "type"])
      });
    }

    for (const key of ["Columns", "columns", "Fields", "fields", "Items", "items", "Data", "data", "Result", "result"]) {
      visit(value[key]);
    }
  };

  visit(payload);
  return [...columns.values()].sort((left, right) => left.columnName.localeCompare(right.columnName, "cs"));
}

function termColumnScore(column = {}, spec = {}) {
  const columnName = clean(column.columnName);
  if (!columnName) return 0;

  const columnKey = normalizeMetadataKey(columnName);
  const captionKey = normalizeMetadataKey(column.caption);
  const combinedKey = `${columnKey}${captionKey}`;
  const aliasKeys = (spec.aliases || []).map(normalizeMetadataKey).filter(Boolean);

  if (aliasKeys.includes(columnKey)) return 120;
  if (captionKey && aliasKeys.includes(captionKey)) return 105;
  if (aliasKeys.some((alias) => alias && (columnKey.includes(alias) || captionKey.includes(alias)))) return 88;

  const tokenGroups = spec.tokens || [];
  if (tokenGroups.length && tokenGroups.every((group) => group.some((token) => combinedKey.includes(normalizeMetadataKey(token))))) {
    return 72;
  }

  return 0;
}

function technicalColumnScore(column = {}, spec = {}) {
  const columnName = clean(column.columnName);
  if (!columnName) return 0;

  const columnKey = normalizeMetadataKey(columnName);
  const captionKey = normalizeMetadataKey(column.caption);
  const aliases = (spec.aliases || []).map(normalizeMetadataKey).filter(Boolean);

  if (aliases.includes(columnKey)) return 120;
  if (captionKey && aliases.includes(captionKey)) return 105;
  return 0;
}

async function resolveVehicleTermFields(env, session) {
  try {
    const payload = await getVistosSchemaEntity(env, session, "Vehicle");
    const schemaColumns = schemaColumnsFromPayload(payload);
    const fields = {};

    for (const spec of FLEET_VISTOS_VEHICLE_TERM_SPECS) {
      const candidates = schemaColumns
        .map((column) => ({
          ...column,
          score: termColumnScore(column, spec)
        }))
        .filter((column) => column.score > 0)
        .sort((left, right) => right.score - left.score || left.columnName.localeCompare(right.columnName, "cs"));
      const best = candidates[0] || null;
      fields[spec.field] = {
        field: spec.field,
        label: spec.label,
        confirmed: Boolean(best),
        columnName: best?.columnName || "",
        caption: best?.caption || "",
        score: best?.score || 0,
        candidates: candidates.slice(0, 5).map((column) => ({
          columnName: column.columnName,
          caption: column.caption,
          score: column.score
        }))
      };
    }

    return {
      ok: true,
      source: "GetSchemaEntity",
      columns: schemaColumns,
      fields
    };
  } catch (error) {
    return {
      ok: false,
      source: "GetSchemaEntity",
      columns: [],
      fields: {},
      error: clean(error?.message).slice(0, 160),
      code: clean(error?.code)
    };
  }
}

function resolveVehicleTechnicalFields(termFields = {}) {
  const schemaColumns = Array.isArray(termFields?.columns) ? termFields.columns : [];
  const fields = {};

  for (const spec of FLEET_VISTOS_VEHICLE_TECHNICAL_SPECS) {
    const candidates = schemaColumns
      .map((column) => ({
        ...column,
        score: technicalColumnScore(column, spec)
      }))
      .filter((column) => column.score > 0)
      .sort((left, right) => right.score - left.score || left.columnName.localeCompare(right.columnName, "cs"));
    const best = candidates[0] || null;
    fields[spec.field] = {
      field: spec.field,
      label: spec.label,
      kind: spec.kind,
      confirmed: Boolean(best),
      columnName: best?.columnName || "",
      caption: best?.caption || "",
      score: best?.score || 0,
      candidates: candidates.slice(0, 5).map((column) => ({
        columnName: column.columnName,
        caption: column.caption,
        score: column.score
      }))
    };
  }

  return {
    ok: Boolean(termFields?.ok),
    source: termFields?.source || "GetSchemaEntity",
    fields,
    error: clean(termFields?.error).slice(0, 160)
  };
}

function withVehicleTermColumns(columns, termFields) {
  const extra = Object.values(termFields?.fields || {})
    .filter((field) => field.confirmed && field.columnName)
    .map((field) => field.columnName);
  return Array.from(new Set([...columns, ...extra]));
}

function withVehicleTechnicalColumns(columns, technicalFields) {
  const extra = Object.values(technicalFields?.fields || {})
    .filter((field) => field.confirmed && field.columnName)
    .map((field) => field.columnName);
  return Array.from(new Set([...columns, ...extra]));
}

function normalizeRegistration(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizedDetailVehicleIds(options = {}) {
  const values = [options.detailVehicleId, ...(Array.isArray(options.detailVehicleIds) ? options.detailVehicleIds : [])];
  return new Set(values
    .map((value) => clean(value).replace(/^vistos-/i, ""))
    .filter(Boolean));
}

function normalizedDetailRegistrationPlates(options = {}) {
  const values = [
    options.detailRegistrationPlate,
    ...(Array.isArray(options.detailRegistrationPlates) ? options.detailRegistrationPlates : [])
  ];
  return new Set(values.map(normalizeRegistration).filter(Boolean));
}

function selectedVehicleDetailRows(rows = [], options = {}) {
  const requestedIds = normalizedDetailVehicleIds(options);
  const requestedPlates = normalizedDetailRegistrationPlates(options);
  if (!requestedIds.size && !requestedPlates.size) return [];

  return rows.filter((row) => {
    const id = firstValue(row, ["Id", "VehicleId"]);
    const registrationPlate = normalizeRegistration(firstValue(row, ["RegistrationPlate", "RegistrationNumber", "SPZ"]));
    return requestedIds.has(id) || requestedPlates.has(registrationPlate);
  });
}

function hasVistosDetailValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return clean(value) !== "";
}

function mergeVehicleDetailRow(baseRow = {}, detailRow = {}) {
  const merged = { ...baseRow };
  for (const [key, value] of Object.entries(detailRow || {})) {
    // GetByIdParam je pro otevřený vůz přesnější než seznam GetPage.
    // Proto jeho potvrzené hodnoty přepisují i nulové zástupné hodnoty seznamu.
    if (hasVistosDetailValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

async function enrichVistosVehicleRows(env, session, rows = [], columns = [], options = {}) {
  const selectedRows = selectedVehicleDetailRows(rows, options);
  const detailRows = selectedRows.slice(0, FLEET_VISTOS_VEHICLE_DETAIL_LIMIT);
  const loadDetail = typeof options.loadDetail === "function" ? options.loadDetail : getVistosById;
  const enrichedById = new Map();
  const failedIds = new Set();
  const diagnostics = {
    source: "GetByIdParam",
    requested: detailRows.length,
    succeeded: 0,
    failed: 0,
    capped: selectedRows.length > FLEET_VISTOS_VEHICLE_DETAIL_LIMIT,
    limit: FLEET_VISTOS_VEHICLE_DETAIL_LIMIT,
    concurrency: FLEET_VISTOS_VEHICLE_DETAIL_CONCURRENCY,
    readOnly: true,
    attempts: []
  };

  for (let index = 0; index < detailRows.length; index += FLEET_VISTOS_VEHICLE_DETAIL_CONCURRENCY) {
    const chunk = detailRows.slice(index, index + FLEET_VISTOS_VEHICLE_DETAIL_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (row) => {
      const id = firstValue(row, ["Id", "VehicleId"]);
      if (!id) return { id, ok: false };
      try {
        const detail = await loadDetail(env, session, "Vehicle", id, columns);
        if (detail?.row && Object.keys(detail.row).length) {
          return {
            id,
            ok: true,
            row: mergeVehicleDetailRow(row, detail.row),
            status: Number(detail.status) || 0,
            detailDiagnostics: detail.diagnostics || null
          };
        }
        return {
          id,
          ok: false,
          status: Number(detail?.status) || 0,
          detailDiagnostics: detail?.diagnostics || null,
          errorCode: "empty-detail-record"
        };
      } catch (error) {
        // Diagnostika odliší chybu detailového čtení od prázdného pole ve Vistosu.
        return {
          id,
          ok: false,
          status: Number(error?.status) || 0,
          detailDiagnostics: null,
          errorCode: clean(error?.code || error?.name || "detail-read-failed").slice(0, 80)
        };
      }
    }));

    for (const result of results) {
      diagnostics.attempts.push({
        vehicleId: result.id,
        ok: result.ok,
        status: result.status || 0,
        errorCode: result.errorCode || "",
        response: result.detailDiagnostics
      });
      if (result.ok) {
        enrichedById.set(result.id, result.row);
        diagnostics.succeeded += 1;
      } else {
        failedIds.add(result.id);
        diagnostics.failed += 1;
      }
    }
  }

  return {
    rows: rows.map((row) => {
      const id = firstValue(row, ["Id", "VehicleId"]);
      if (enrichedById.has(id)) return enrichedById.get(id);
      if (failedIds.has(id)) return { ...row, __vistosVehicleDetailReadFailed: true };
      return row;
    }),
    diagnostics
  };
}

function readVistosDisplayValue(row, columnName) {
  if (!row || !columnName) return "";
  return firstValue(row, [
    `${columnName}_Caption`,
    `${columnName}_FK_Caption`,
    `${columnName}_MainProjection`,
    `${columnName}_FK_MainProjection`,
    `${columnName}_Value`,
    `${columnName}_FK_Value`,
    columnName,
    `${columnName}_FK`,
    `${columnName}_RecordId`,
    `${columnName}_FK_RecordId`
  ]);
}

function normalizeVistosDate(value) {
  const raw = clean(value);
  if (!raw) return "";

  const msMatch = raw.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (msMatch) {
    const date = new Date(Number(msMatch[1]));
    return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
  }

  const czechMatch = raw.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (czechMatch) {
    const [, day, month, year] = czechMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function termValueFromRow(row, termFields, field) {
  const spec = FLEET_VISTOS_VEHICLE_TERM_SPECS.find((item) => item.field === field) || {};
  const source = termFields?.fields?.[field];
  const explicitRaw = readVistosDisplayValue(row, source?.columnName);
  const fallback = explicitRaw ? null : termValueFallbackFromRow(row, spec);
  const raw = explicitRaw || fallback?.raw || "";
  return {
    value: normalizeVistosDate(raw),
    sourceColumn: raw && source?.columnName ? source.columnName : fallback?.columnName || "",
    sourceCaption: raw && source?.caption ? source.caption : fallback?.caption || ""
  };
}

function termValueFallbackFromRow(row, spec = {}) {
  if (!row || typeof row !== "object") return null;
  const candidates = Object.keys(row)
    .map((columnName) => ({
      columnName,
      caption: "",
      raw: readVistosDisplayValue(row, columnName),
      score: termColumnScore({ columnName, caption: "" }, spec)
    }))
    .filter((item) => item.raw && item.score > 0)
    .sort((left, right) => right.score - left.score || left.columnName.localeCompare(right.columnName, "cs"));

  return candidates[0] || null;
}

function recordId(row, baseKey) {
  return firstValue(row, [
    `${baseKey}_RecordId`,
    `${baseKey}.RecordId`,
    `${baseKey}_Id`,
    `${baseKey}.Id`,
    baseKey
  ]);
}

function caption(row, baseKey) {
  return firstValue(row, [
    `${baseKey}_Caption`,
    `${baseKey}.Caption`,
    `${baseKey}_Name`,
    `${baseKey}.Name`,
    baseKey
  ]);
}

function shortVin(vin) {
  const value = clean(vin);
  if (!value) {
    return "";
  }
  return value.length > 6 ? `…${value.slice(-6)}` : value;
}

function gpsFromRow(row) {
  const lat = Number(row?.c_LastGpsLocation1_Lat ?? row?.["c_LastGpsLocation1.Lat"]);
  const lng = Number(row?.c_LastGpsLocation1_Long ?? row?.["c_LastGpsLocation1.Long"]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }

  return {
    lat,
    lng
  };
}

function firstRawValue(row, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return null;
}

function parseVistosNumber(value, { integer = false } = {}) {
  const compact = clean(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "");
  const raw = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : integer && /^\d{1,3}(?:\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, "")
      : compact;
  if (!raw || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) return null;
  return number;
}

function parseAxleLoadKg(value) {
  const raw = clean(value).replace(/\u00a0/g, " ").trim();
  if (!raw) return null;
  const match = raw.match(/^([0-9][0-9\s.,]*)\s*(kg|t|tun|tuny)$/iu);
  if (!match) return null;
  const numeric = parseVistosNumber(match[1], { integer: /^kg$/iu.test(match[2]) });
  if (!numeric || numeric <= 0) return null;
  return Math.round(/^(t|tun|tuny)$/iu.test(match[2]) ? numeric * 1000 : numeric);
}

function validCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 &&
    !(latitude === 0 && longitude === 0);
}

function coordinateFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const latitude = Number(value.lat ?? value.latitude ?? value.Lat ?? value.Latitude);
  const longitude = Number(value.lng ?? value.lon ?? value.longitude ?? value.Long ?? value.Longitude);
  return validCoordinate(latitude, longitude) ? { lat: latitude, lng: longitude } : null;
}

function depotGpsFromRow(row, columnName) {
  if (!columnName) return null;
  const direct = firstRawValue(row, [
    columnName,
    `${columnName}_Value`,
    `${columnName}_MainProjection`
  ]);
  const objectCoordinate = coordinateFromObject(direct);
  if (objectCoordinate) return objectCoordinate;

  const raw = clean(direct);
  if (raw.startsWith("{")) {
    try {
      const parsedCoordinate = coordinateFromObject(JSON.parse(raw));
      if (parsedCoordinate) return parsedCoordinate;
    } catch {
      // Neplatný JSON není navigační bod.
    }
  }
  const textMatch = raw.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (textMatch) {
    const latitude = Number(textMatch[1].replace(",", "."));
    const longitude = Number(textMatch[2].replace(",", "."));
    if (validCoordinate(latitude, longitude)) return { lat: latitude, lng: longitude };
  }

  const latitude = Number(firstRawValue(row, [
    `${columnName}_Lat`, `${columnName}.Lat`, `${columnName}_Latitude`, `${columnName}.Latitude`
  ]));
  const longitude = Number(firstRawValue(row, [
    `${columnName}_Long`, `${columnName}.Long`, `${columnName}_Lng`, `${columnName}.Lng`,
    `${columnName}_Longitude`, `${columnName}.Longitude`
  ]));
  return validCoordinate(latitude, longitude) ? { lat: latitude, lng: longitude } : null;
}

function fieldSource(technicalFields, field) {
  const source = technicalFields?.fields?.[field] || {};
  return {
    columnName: clean(source.columnName),
    caption: clean(source.caption),
    confirmed: Boolean(source.confirmed)
  };
}

function technicalRawValue(row, technicalFields, field) {
  const source = fieldSource(technicalFields, field);
  if (!source.columnName) return "";
  const raw = firstRawValue(row, [
    source.columnName,
    `${source.columnName}_Value`,
    `${source.columnName}_FK_Value`
  ]);
  return raw !== null ? clean(raw) : readVistosDisplayValue(row, source.columnName);
}

function technicalNumericValue(row, technicalFields, field, options = {}) {
  return parseVistosNumber(technicalRawValue(row, technicalFields, field), options);
}

function technicalEnumValue(row, technicalFields, field) {
  const source = fieldSource(technicalFields, field);
  if (!source.columnName) return { id: "", caption: "", source };
  return {
    id: recordId(row, source.columnName),
    caption: caption(row, source.columnName),
    source
  };
}

function technicalMultiEnumValue(row, technicalFields, field) {
  const source = fieldSource(technicalFields, field);
  if (!source.columnName) return { ids: [], captions: [], source };
  const rawIds = firstRawValue(row, [
    `${source.columnName}_RecordId`, `${source.columnName}.RecordId`, `${source.columnName}_Id`, source.columnName
  ]);
  const rawCaptions = firstRawValue(row, [
    `${source.columnName}_Caption`, `${source.columnName}.Caption`, `${source.columnName}_MainProjection`, source.columnName
  ]);
  const values = (value) => Array.isArray(value)
    ? value.flatMap(values)
    : clean(value).split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
  return {
    ids: [...new Set(values(rawIds))],
    captions: [...new Set(values(rawCaptions))],
    source
  };
}

function hasPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function technicalProfileFromRow(row, technicalFields) {
  const emptyWeightKg = technicalNumericValue(row, technicalFields, "emptyWeightKg", { integer: true });
  const maxPermittedWeightKg = technicalNumericValue(row, technicalFields, "maxPermittedWeightKg", { integer: true });
  const payloadKg = technicalNumericValue(row, technicalFields, "payloadKg", { integer: true });
  const lengthMeters = technicalNumericValue(row, technicalFields, "lengthMeters");
  const widthMeters = technicalNumericValue(row, technicalFields, "widthMeters");
  const heightMeters = technicalNumericValue(row, technicalFields, "heightMeters");
  const maxSingleAxleLoadRaw = technicalRawValue(row, technicalFields, "maxSingleAxleLoad");
  const axleGroupLoadsKg = {
    single: technicalNumericValue(row, technicalFields, "singleAxleGroupLoadT") * 1000 || null,
    tandem: technicalNumericValue(row, technicalFields, "tandemAxleGroupLoadT") * 1000 || null,
    triple: technicalNumericValue(row, technicalFields, "tridemAxleGroupLoadT") * 1000 || null
  };
  const dimensionsCm = {
    length: hasPositiveNumber(lengthMeters) ? Math.round(lengthMeters * 100) : null,
    width: hasPositiveNumber(widthMeters) ? Math.round(widthMeters * 100) : null,
    height: hasPositiveNumber(heightMeters) ? Math.round(heightMeters * 100) : null
  };
  const blockers = [];
  if (!hasPositiveNumber(dimensionsCm.length) || !hasPositiveNumber(dimensionsCm.width) || !hasPositiveNumber(dimensionsCm.height)) {
    blockers.push("chybí délka, šířka nebo výška");
  }
  if (!hasPositiveNumber(emptyWeightKg) || !hasPositiveNumber(maxPermittedWeightKg) || !hasPositiveNumber(payloadKg)) {
    blockers.push("chybí prázdná, nejvyšší povolená hmotnost nebo nosnost");
  } else if (Math.abs((maxPermittedWeightKg - emptyWeightKg) - payloadKg) > 2) {
    blockers.push("prázdná hmotnost, nosnost a nejvyšší povolená hmotnost si neodpovídají");
  }
  const resolvedGroupLoads = Object.fromEntries(Object.entries(axleGroupLoadsKg)
    .filter(([, value]) => hasPositiveNumber(value))
    .map(([key, value]) => [key, Math.round(value)]));
  const maxSingleAxleLoadKg = parseAxleLoadKg(maxSingleAxleLoadRaw);
  if (!Object.keys(resolvedGroupLoads).length && !hasPositiveNumber(maxSingleAxleLoadKg)) {
    blockers.push("chybí potvrzené zatížení nápravy nebo skupiny náprav");
  }

  return {
    source: "Vistos Vehicle",
    emptyWeightKg,
    maxPermittedWeightKg,
    payloadKg,
    lengthMeters,
    widthMeters,
    heightMeters,
    dimensionsCm,
    axleCount: technicalEnumValue(row, technicalFields, "axleCount"),
    axleCountOther: technicalNumericValue(row, technicalFields, "axleCountOther", { integer: true }),
    axleConfiguration: technicalEnumValue(row, technicalFields, "axleConfiguration"),
    maxSingleAxleLoadRaw,
    maxSingleAxleLoadKg,
    axleGroupLoadsKg: resolvedGroupLoads,
    vehicleType: technicalEnumValue(row, technicalFields, "vehicleType"),
    trailerCount: technicalEnumValue(row, technicalFields, "trailerCount"),
    fuelType: technicalEnumValue(row, technicalFields, "fuelType"),
    euroEmissionStandard: technicalEnumValue(row, technicalFields, "euroEmissionStandard"),
    bodyType: technicalEnumValue(row, technicalFields, "bodyType"),
    usableBodyVolumeM3: technicalNumericValue(row, technicalFields, "usableBodyVolumeM3"),
    additionalEquipment: technicalMultiEnumValue(row, technicalFields, "additionalEquipment"),
    supportedContainerSizes: technicalMultiEnumValue(row, technicalFields, "supportedContainerSizes"),
    fieldSources: Object.fromEntries(FLEET_VISTOS_VEHICLE_TECHNICAL_SPECS.map((spec) => [spec.field, fieldSource(technicalFields, spec.field)])),
    blockers,
    status: blockers.length ? "needs_review" : "ready"
  };
}

function homeDepotFromRow(row, technicalFields) {
  const gpsSource = fieldSource(technicalFields, "depotAddressGps");
  const gps = depotGpsFromRow(row, gpsSource.columnName);
  const address = {
    ruian: technicalRawValue(row, technicalFields, "depotAddressRuian"),
    street: technicalRawValue(row, technicalFields, "depotAddressStreet"),
    city: technicalRawValue(row, technicalFields, "depotAddressCity"),
    state: technicalEnumValue(row, technicalFields, "depotAddressState"),
    country: technicalEnumValue(row, technicalFields, "depotAddressCountry"),
    postalCode: technicalRawValue(row, technicalFields, "depotAddressPostalCode")
  };
  return {
    gps,
    address,
    gpsSource,
    status: gps ? "ready" : "needs_gps",
    warning: gps ? "" : "GPS domovského depa není potvrzené; textová adresa se nepoužije jako tichá náhrada pro navigaci."
  };
}

function hereNavigationFromTechnicalProfile(technicalProfile, homeDepot) {
  const options = {
    height: technicalProfile?.dimensionsCm?.height || null,
    width: technicalProfile?.dimensionsCm?.width || null,
    length: technicalProfile?.dimensionsCm?.length || null,
    grossWeight: technicalProfile?.maxPermittedWeightKg || null,
    currentWeightPolicy: "empty-plus-planned-route-load"
  };
  if (Object.keys(technicalProfile?.axleGroupLoadsKg || {}).length) {
    options.weightPerAxleGroup = technicalProfile.axleGroupLoadsKg;
  } else if (hasPositiveNumber(technicalProfile?.maxSingleAxleLoadKg)) {
    options.weightPerAxle = Math.round(technicalProfile.maxSingleAxleLoadKg);
  }
  return {
    status: technicalProfile?.status || "needs_review",
    blockers: [...(technicalProfile?.blockers || [])],
    options,
    homeDepotStatus: homeDepot?.status || "needs_gps",
    homeDepotGps: homeDepot?.gps || null,
    currentWeightPolicy: "Prázdná hmotnost + konzervativní plánovaný náklad; nosnost se nikdy nezaměňuje za aktuální hmotnost."
  };
}

function vehicleIssueCodes(vehicle) {
  const issues = [];

  if (!vehicle.vistosVehicleId) issues.push("missing-vistos-id");
  if (!vehicle.registrationPlate) issues.push("missing-registration-plate");
  if (!vehicle.name) issues.push("missing-name");
  if (!vehicle.vinMasked) issues.push("missing-vin");
  if (!vehicle.gps) issues.push("missing-or-invalid-gps");

  return issues;
}

function mapVehicle(row, termFields = null, technicalFields = null) {
  const vin = firstValue(row, ["VIN", "Vin"]);
  const termValues = Object.fromEntries(
    FLEET_VISTOS_VEHICLE_TERM_SPECS.map((spec) => [spec.field, termValueFromRow(row, termFields, spec.field)])
  );
  const technicalProfile = technicalProfileFromRow(row, technicalFields);
  const homeDepot = homeDepotFromRow(row, technicalFields);
  const hereNavigation = hereNavigationFromTechnicalProfile(technicalProfile, homeDepot);
  const vehicle = {
    vistosVehicleId: firstValue(row, ["Id", "VehicleId"]),
    name: firstValue(row, ["Name", "Caption"]),
    registrationPlate: firstValue(row, ["RegistrationPlate", "RegistrationNumber", "SPZ"]),
    vinMasked: shortVin(vin),
    categoryId: recordId(row, "CarCategory_FK"),
    category: caption(row, "CarCategory_FK"),
    statusId: recordId(row, "Stavvozidla_FK"),
    status: caption(row, "Stavvozidla_FK"),
    isActive: firstValue(row, ["IsActive"]),
    archivedAt: firstValue(row, ["Archived"]),
    startingDate: firstValue(row, ["StartingDate"]),
    eliminatedDate: firstValue(row, ["EliminatedDate"]),
    odometerKm: firstValue(row, ["Odometer"]),
    gpsKm: firstValue(row, ["c_Km"]),
    gpsProviderId: recordId(row, "c_GpsProvider_FK"),
    gpsProvider: caption(row, "c_GpsProvider_FK"),
    driverId: recordId(row, "Ridic_FK"),
    driver: caption(row, "Ridic_FK"),
    lastLocation: firstValue(row, ["c_LastLocation"]),
    lastPositionSyncDate: firstValue(row, ["LastPositionSyncDate"]),
    gpsUpdatedAt: firstValue(row, ["c_DateUpdateGPS"]),
    gps: gpsFromRow(row),
    stkValidTo: termValues.stkValidTo?.value || "",
    emissionsValidTo: termValues.emissionsValidTo?.value || "",
    tachographValidTo: termValues.tachographValidTo?.value || "",
    craneRevisionValidTo: termValues.craneRevisionValidTo?.value || "",
    liftRevisionValidTo: termValues.liftRevisionValidTo?.value || "",
    pressureEquipmentRevisionValidTo: termValues.pressureEquipmentRevisionValidTo?.value || "",
    fireExtinguisherValidTo: termValues.fireExtinguisherValidTo?.value || "",
    insuranceValidTo: termValues.insuranceValidTo?.value || "",
    highwayVignetteValidTo: termValues.highwayVignetteValidTo?.value || "",
    lastServiceDate: termValues.lastServiceDate?.value || "",
    nextServiceDate: termValues.nextServiceDate?.value || "",
    termSources: Object.fromEntries(
      Object.entries(termValues)
        .filter(([, item]) => item?.sourceColumn)
        .map(([field, item]) => [field, {
          columnName: item.sourceColumn,
          caption: item.sourceCaption
        }])
    ),
    technicalProfile,
    homeDepot,
    hereNavigation,
    sourceEntity: "Vehicle",
    mappingTarget: "fleet",
    readOnly: true
  };

  const issues = vehicleIssueCodes(vehicle);

  return {
    ...vehicle,
    mappingStatus: issues.length ? "needs_review" : "mapped",
    issues
  };
}

function diagnosticsFromPage(page) {
  return {
    entity: "Vehicle",
    filter: FLEET_VISTOS_VEHICLE_ACTIVE_FILTER,
    columns: FLEET_VISTOS_VEHICLE_COLUMNS,
    recordsTotal: page.total || 0,
    recordsFiltered: page.filtered || 0,
    returnedRows: page.rows?.length || 0,
    capped: Boolean(page.capped),
    previewLimit: FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT,
    masterRegistry: "Vozový park je master evidence vozidel. Ostatní moduly používají jen vazbu na Vozový park."
  };
}

function summaryFromVehicles(vehicles, page) {
  return {
    total: page.rows.length,
    previewRows: vehicles.length,
    withRegistrationPlate: vehicles.filter((vehicle) => vehicle.registrationPlate).length,
    withVin: vehicles.filter((vehicle) => vehicle.vinMasked).length,
    withGps: vehicles.filter((vehicle) => vehicle.gps).length,
    hereReady: vehicles.filter((vehicle) => vehicle.hereNavigation?.status === "ready").length,
    withHomeDepotGps: vehicles.filter((vehicle) => vehicle.homeDepot?.gps).length,
    needsReview: vehicles.filter((vehicle) => vehicle.issues.length).length
  };
}

function issueSummary(vehicles) {
  const counts = new Map();
  for (const vehicle of vehicles) {
    for (const issue of vehicle.issues) {
      counts.set(issue, (counts.get(issue) || 0) + 1);
    }
  }

  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

export async function createFleetVistosVehiclePreview(env, options = {}) {
  if (!isVistosExecuteConfigured(env)) {
    return {
      apiStatus: "not_configured",
      message: VISTOS_NOT_CONFIGURED_MESSAGE,
      readOnly: true,
      createsFleetRecords: false,
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      startsAutomation: false,
      summary: {
        total: 0,
        previewRows: 0,
        withRegistrationPlate: 0,
        withVin: 0,
        withGps: 0,
        hereReady: 0,
        withHomeDepotGps: 0,
        needsReview: 0
      },
      vehicles: [],
      issues: [],
      diagnostics: {
        entity: "Vehicle",
        filter: FLEET_VISTOS_VEHICLE_ACTIVE_FILTER,
        columns: FLEET_VISTOS_VEHICLE_COLUMNS,
        configured: false
      }
    };
  }

  const session = await loginVistosExecute(env);
  const termFields = await resolveVehicleTermFields(env, session);
  const technicalFields = resolveVehicleTechnicalFields(termFields);
  const requestedColumns = withVehicleTechnicalColumns(withVehicleTermColumns(FLEET_VISTOS_VEHICLE_COLUMNS, termFields), technicalFields);
  const page = await getAllVistosPages(
    env,
    session,
    "Vehicle",
    requestedColumns,
    FLEET_VISTOS_VEHICLE_ACTIVE_FILTER,
    { maxPages: 20 }
  );
  const previewRows = page.rows.slice(0, FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT);
  const detailEnrichment = await enrichVistosVehicleRows(env, session, previewRows, requestedColumns, options);
  const vehicles = detailEnrichment.rows.map((row) => mapVehicle(row, termFields, technicalFields));
  const diagnostics = diagnosticsFromPage(page);

  return {
    apiStatus: page.rows.length ? "ready" : "empty",
    message: page.rows.length
      ? "Vistos Vehicle preview načteno. Data jsou pouze pro mapování do Vozového parku."
      : "Vistos Vehicle preview nenašlo žádná aktivní vozidla.",
    readOnly: true,
    createsFleetRecords: false,
    createsOperationalRoutes: false,
    sendsEmailOrSms: false,
    startsAutomation: false,
    summary: summaryFromVehicles(vehicles, page),
    vehicles,
    issues: issueSummary(vehicles),
    diagnostics: {
      ...diagnostics,
      columns: requestedColumns,
      vehicleTermFields: {
        ok: termFields.ok,
        source: termFields.source,
        matched: Object.values(termFields.fields || {})
          .filter((field) => field.confirmed)
          .map((field) => ({
            field: field.field,
            label: field.label,
            columnName: field.columnName,
            caption: field.caption,
            score: field.score
          })),
        missing: Object.values(termFields.fields || {})
          .filter((field) => !field.confirmed)
          .map((field) => field.label),
        error: termFields.error || ""
      },
      vehicleTechnicalFields: {
        ok: technicalFields.ok,
        source: technicalFields.source,
        matched: Object.values(technicalFields.fields || {})
          .filter((field) => field.confirmed)
          .map((field) => ({
            field: field.field,
            label: field.label,
            columnName: field.columnName,
            caption: field.caption,
            score: field.score
          })),
        missing: Object.values(technicalFields.fields || {})
          .filter((field) => !field.confirmed)
          .map((field) => field.label),
        error: technicalFields.error || ""
      },
      vehicleDetailEnrichment: detailEnrichment.diagnostics
    },
    loadedAt: new Date().toISOString()
  };
}

export function fleetVistosVehiclePreviewError(error) {
  if (error instanceof VistosExecuteError) {
    return {
      status: error.status,
      payload: {
        error: error.message,
        code: error.code,
        apiStatus: error.code === "vistos_api_not_configured" ? "not_configured" : "waiting"
      }
    };
  }

  const detail = clean(error?.message).slice(0, 240);
  return {
    status: 500,
    payload: {
      error: "Vistos Vehicle preview se teď nepodařilo spustit.",
      detail: detail || "Neznámá chyba backendu.",
      apiStatus: "waiting"
    }
  };
}

export const __test = {
  FLEET_VISTOS_VEHICLE_TECHNICAL_SPECS,
  enrichVistosVehicleRows,
  mapVehicle,
  parseAxleLoadKg,
  resolveVehicleTechnicalFields
};
