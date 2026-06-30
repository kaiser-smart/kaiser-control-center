import {
  VistosExecuteError,
  cleanVistosValue,
  getAllVistosPages,
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
  "EliminatedDate",
  "Stavvozidla_FK",
  "CarCategory_FK",
  "c_LastGpsLocation1",
  "c_LastLocation",
  "LastPositionSyncDate",
  "c_GpsProvider_FK"
];
const FLEET_VISTOS_VEHICLE_ACTIVE_FILTER = {
  Stavvozidla_FK: [16541]
};

function clean(value) {
  return cleanVistosValue(value);
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

function mapVehicle(row) {
  const vehicle = {
    vistosVehicleId: firstValue(row, ["Id", "VehicleId"]),
    name: firstValue(row, ["Name", "Caption"]),
    registrationPlate: firstValue(row, ["RegistrationPlate", "RegistrationNumber", "SPZ"]),
    vinMasked: shortVin(firstValue(row, ["VIN", "Vin"])),
    categoryId: recordId(row, "CarCategory_FK"),
    category: caption(row, "CarCategory_FK"),
    statusId: recordId(row, "Stavvozidla_FK"),
    status: caption(row, "Stavvozidla_FK"),
    gpsProviderId: recordId(row, "c_GpsProvider_FK"),
    gpsProvider: caption(row, "c_GpsProvider_FK"),
    lastLocation: firstValue(row, ["c_LastLocation"]),
    lastPositionSyncDate: firstValue(row, ["LastPositionSyncDate"]),
    gps: gpsFromRow(row),
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
  const page = await getAllVistosPages(
    env,
    session,
    "Vehicle",
    FLEET_VISTOS_VEHICLE_COLUMNS,
    FLEET_VISTOS_VEHICLE_ACTIVE_FILTER,
    { maxPages: 20 }
  );
  const vehicles = page.rows.slice(0, FLEET_VISTOS_VEHICLE_PREVIEW_LIMIT).map(mapVehicle);
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
    diagnostics,
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
