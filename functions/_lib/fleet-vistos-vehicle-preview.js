import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
  getVistosSchemaEntity,
  isVistosExecuteConfigured,
  loginVistosExecute
} from "./vistos-execute-client.js";

const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT = 200;
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
    aliases: ["STK", "Stk", "STKValidTo", "StkValidTo", "STKPlatnostDo", "TechnickaKontrolaDo", "c_STK", "c_STKDo", "c_STKPlatnostDo", "c_TechnickaKontrolaDo"],
    tokens: [["stk"], ["valid", "platnost", "do", "date", "datum", "kontrola"]]
  },
  {
    field: "emissionsValidTo",
    label: "Emise",
    aliases: ["Emise", "EmiseDo", "EmissionsValidTo", "EmissionValidTo", "c_Emise", "c_EmiseDo", "c_EmisePlatnostDo"],
    tokens: [["emise", "emission"], ["valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "tachographValidTo",
    label: "Tachograf",
    aliases: ["Tachograf", "TachografDo", "TachographValidTo", "c_Tachograf", "c_TachografDo", "c_TachografPlatnostDo"],
    tokens: [["tachograf", "tachograph"], ["valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "craneRevisionValidTo",
    label: "Revize jeřábu",
    aliases: ["RevizeJerabu", "RevizeJerabuDo", "CraneRevisionValidTo", "c_RevizeJerabu", "c_RevizeJerabuDo", "c_JerabRevizeDo"],
    tokens: [["jerab", "crane"], ["revize", "revision", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "liftRevisionValidTo",
    label: "Revize čela",
    aliases: ["RevizeCela", "RevizeCelaDo", "TailLiftRevisionValidTo", "LiftRevisionValidTo", "c_RevizeCela", "c_RevizeCelaDo", "c_CeloRevizeDo"],
    tokens: [["celo", "cela", "lift", "taillift"], ["revize", "revision", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "pressureEquipmentRevisionValidTo",
    label: "Tlakové zařízení",
    aliases: ["TlakoveZarizeni", "TlakoveZarizeniDo", "PressureEquipmentRevisionValidTo", "c_TlakoveZarizeni", "c_TlakoveZarizeniDo"],
    tokens: [["tlakove", "tlak", "pressure"], ["zarizeni", "equipment", "revize", "revision", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "fireExtinguisherValidTo",
    label: "Hasicí přístroj",
    aliases: ["HasiciPristroj", "HasiciPristrojDo", "FireExtinguisherValidTo", "c_HasiciPristroj", "c_HasiciPristrojDo"],
    tokens: [["hasici", "hasic", "fireextinguisher"], ["valid", "platnost", "do", "date", "datum", "revize"]]
  },
  {
    field: "insuranceValidTo",
    label: "Pojištění",
    aliases: ["Pojisteni", "PojisteniDo", "InsuranceValidTo", "c_Pojisteni", "c_PojisteniDo", "c_PojisteniPlatnostDo"],
    tokens: [["pojisteni", "insurance"], ["valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "highwayVignetteValidTo",
    label: "Dálniční známka",
    aliases: ["DalnicniZnamka", "DalnicniZnamkaDo", "HighwayVignetteValidTo", "VignetteValidTo", "c_DalnicniZnamka", "c_DalnicniZnamkaDo"],
    tokens: [["dalnicni", "vignette"], ["znamka", "valid", "platnost", "do", "date", "datum"]]
  },
  {
    field: "lastServiceDate",
    label: "Poslední servis",
    aliases: ["LastServiceDate", "PosledniServis", "PosledniServisDatum", "c_PosledniServis", "c_PosledniServisDatum"],
    tokens: [["servis", "service"], ["last", "posledni", "datum", "date"]]
  },
  {
    field: "nextServiceDate",
    label: "Příští servis",
    aliases: ["NextServiceDate", "PristiServis", "PristiServisDatum", "c_PristiServis", "c_PristiServisDatum"],
    tokens: [["servis", "service"], ["next", "pristi", "datum", "date"]]
  }
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

function withVehicleTermColumns(columns, termFields) {
  const extra = Object.values(termFields?.fields || {})
    .filter((field) => field.confirmed && field.columnName)
    .map((field) => field.columnName);
  return Array.from(new Set([...columns, ...extra]));
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
  const source = termFields?.fields?.[field];
  const raw = readVistosDisplayValue(row, source?.columnName);
  return {
    value: normalizeVistosDate(raw),
    sourceColumn: raw && source?.columnName ? source.columnName : "",
    sourceCaption: raw && source?.caption ? source.caption : ""
  };
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

function vehicleIssueCodes(vehicle) {
  const issues = [];

  if (!vehicle.vistosVehicleId) issues.push("missing-vistos-id");
  if (!vehicle.registrationPlate) issues.push("missing-registration-plate");
  if (!vehicle.name) issues.push("missing-name");
  if (!vehicle.vinMasked) issues.push("missing-vin");
  if (!vehicle.gps) issues.push("missing-or-invalid-gps");

  return issues;
}

function mapVehicle(row, termFields = null) {
  const vin = firstValue(row, ["VIN", "Vin"]);
  const termValues = Object.fromEntries(
    FLEET_VISTOS_VEHICLE_TERM_SPECS.map((spec) => [spec.field, termValueFromRow(row, termFields, spec.field)])
  );
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

export async function createFleetVistosVehiclePreview(env) {
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
  const page = await getAllVistosPages(
    env,
    session,
    "Vehicle",
    withVehicleTermColumns(FLEET_VISTOS_VEHICLE_COLUMNS, termFields),
    FLEET_VISTOS_VEHICLE_ACTIVE_FILTER,
    { maxPages: 20 }
  );
  const vehicles = page.rows.slice(0, FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT).map((row) => mapVehicle(row, termFields));
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
      columns: withVehicleTermColumns(FLEET_VISTOS_VEHICLE_COLUMNS, termFields),
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
      }
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
