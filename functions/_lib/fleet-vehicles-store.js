import { getUsers, isProduction, normalizeIdentifier } from "./auth.js";
import { loadFleetVehiclesPayload as loadTcarsFleetVehiclesPayload } from "./tcars-client.js";
import { createFleetVistosVehiclePreview } from "./fleet-vistos-vehicle-preview.js";
import { listEmployeeCards } from "./employees-store.js";
import { hasPermission, isUserActive, normalizeRole } from "../../src/permissions.js";
import {
  findSimilarLicensePlates,
  findVehicleByLicensePlate,
  licensePlateKey,
  normalizeLicensePlate,
  validateLicensePlateFormat,
  vehicleLicensePlateValue
} from "../../src/data/licensePlate.js";

const DB_BINDING = "SMART_ODPADY_DB";

export class FleetVehiclesStoreError extends Error {
  constructor(message, status = 400, code = "fleet_vehicles_error") {
    super(message);
    this.name = "FleetVehiclesStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;

  if (!db && required) {
    throw new FleetVehiclesStoreError(
      "Databáze vozového parku není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "fleet_database_missing"
    );
  }

  return db;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function testFleetPayloadFromEnv(env = {}) {
  if (isProduction(env)) {
    return null;
  }

  const enabled = cleanString(env.SARLOTA_DRIVER_REPORTS_MOCK_MODE).toLowerCase() === "true" ||
    cleanString(env.APP_ENV).toLowerCase() === "test" ||
    cleanString(env.NODE_ENV).toLowerCase() === "test";

  if (!enabled || !cleanString(env.SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON)) {
    return null;
  }

  const payload = parseJson(env.SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON, null);
  if (!payload || typeof payload !== "object") {
    console.error("fleet_vehicles.test_fixture_invalid", { message: "SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON is not valid JSON" });
    return null;
  }

  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  return {
    provider: cleanString(payload.provider || "fleet_db"),
    source: cleanString(payload.source || "fleet_db"),
    apiStatus: cleanString(payload.apiStatus || "ready"),
    configured: true,
    readOnly: true,
    createsFleetRecords: false,
    startsAutomation: false,
    sendsEmailOrSms: false,
    vehicles,
    driverCandidates: Array.isArray(payload.driverCandidates) ? payload.driverCandidates : [],
    summary: payload.summary || fleetSummaryFromVehicles(vehicles),
    message: cleanString(payload.message || "Testovací vozový park pro Šarlotu."),
    assignmentApiStatus: "ready",
    assignmentMessage: "Testovací přiřazení řidičů bez D1.",
    testFixture: true
  };
}

function nullableString(value) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizedPlate(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
}

function normalizedDriverName(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameLookupValue(left, right) {
  const leftValue = cleanString(left).toLowerCase();
  const rightValue = cleanString(right).toLowerCase();
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function uniqueLookupValues(values = []) {
  const result = [];
  const seen = new Set();

  for (const value of values.flat()) {
    const cleaned = cleanString(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function safeErrorMessage(error) {
  return cleanString(error?.message);
}

function isMissingAssignmentTable(error) {
  return /no such table|fleet_vehicle_assignments/i.test(safeErrorMessage(error));
}

function fleetStoreError(error) {
  if (error instanceof FleetVehiclesStoreError) {
    return error;
  }

  if (isMissingAssignmentTable(error)) {
    return new FleetVehiclesStoreError(
      "Tabulka přiřazení řidičů k vozidlům není v D1 připravená. Spusťte migraci 0024_create_fleet_vehicle_assignments.sql.",
      503,
      "fleet_vehicle_assignments_migration_missing"
    );
  }

  console.error("fleet_vehicles.store_failed", { message: safeErrorMessage(error) });
  return new FleetVehiclesStoreError(
    "Vozový park se teď nepodařilo načíst nebo uložit.",
    500,
    "fleet_vehicles_store_failed"
  );
}

function fleetVehicleLicensePlateSummary(vehicle = {}) {
  return {
    id: cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId),
    vehicleId: cleanString(vehicle.vehicleId || vehicle.id || vehicle.tcarsVehicleId),
    licensePlate: normalizeLicensePlate(vehicleLicensePlateValue(vehicle)),
    brand: cleanString(vehicle.brand),
    model: cleanString(vehicle.model || vehicle.internalNumber),
    vehicleType: cleanString(vehicle.vehicleType || vehicle.bodyType || vehicle.vistosVehicleCategory),
    internalNumber: cleanString(vehicle.internalNumber),
    vin: cleanString(vehicle.vin),
    assignedDriverId: cleanString(vehicle.assignedDriverId),
    assignedDriverName: cleanString(vehicle.assignedDriverName),
    assignedDriverPhone: cleanString(vehicle.assignedDriverPhone),
    source: cleanString(vehicle.source || vehicle.telemetrySource)
  };
}

export async function validateFleetLicensePlate(env = {}, value = "", user = null) {
  const normalized = normalizeLicensePlate(value);
  const payload = await loadFleetVehiclesWithAssignments(env, user);
  const vehicles = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
  const format = validateLicensePlateFormat(normalized, vehicles);
  const vehicle = findVehicleByLicensePlate(normalized, vehicles);
  const suggestions = findSimilarLicensePlates(normalized, vehicles, 5)
    .map((item) => ({
      ...fleetVehicleLicensePlateSummary(item.vehicle),
      licensePlate: item.licensePlate,
      distance: item.distance
    }));

  return {
    input: cleanString(value),
    normalized,
    key: licensePlateKey(normalized),
    validFormat: format.valid,
    formatReason: format.reason,
    exact: Boolean(vehicle),
    vehicle: vehicle ? fleetVehicleLicensePlateSummary(vehicle) : null,
    suggestions,
    source: cleanString(payload?.source),
    apiStatus: payload?.apiStatus || "ready",
    message: vehicle
      ? "Vozidlo nalezeno."
      : format.message || "Tahle SPZ není ve Vozovém parku. Zkontrolujte ji prosím."
  };
}

function rowToAssignment(row) {
  return {
    vehicleId: cleanString(row?.vehicle_id),
    licensePlate: cleanString(row?.license_plate),
    vin: cleanString(row?.vin),
    assignedDriverId: cleanString(row?.assigned_driver_user_id),
    assignedDriverName: cleanString(row?.assigned_driver_name),
    assignedDriverPhone: cleanString(row?.assigned_driver_phone),
    assignedDriverEmail: cleanString(row?.assigned_driver_email),
    note: cleanString(row?.note),
    updatedByUserId: cleanString(row?.updated_by_user_id),
    updatedByName: cleanString(row?.updated_by_name),
    createdAt: cleanString(row?.created_at),
    updatedAt: cleanString(row?.updated_at)
  };
}

function assignmentKeysForVehicle(vehicle = {}) {
  return [
    vehicle.id,
    vehicle.vehicleId,
    vehicle.externalVehicleId,
    vehicle.tcarsVehicleId ? `tcars-${vehicle.tcarsVehicleId}` : "",
    vehicle.tcarsVehicleId,
    vehicle.vistosVehicleId ? `vistos-${vehicle.vistosVehicleId}` : "",
    vehicle.vistosVehicleId,
    vehicle.licensePlate,
    vehicle.tcarsLicensePlate,
    normalizedPlate(vehicle.licensePlate || vehicle.tcarsLicensePlate)
  ].map(cleanString).filter(Boolean);
}

function vehicleMatchesId(vehicle, vehicleId) {
  const wanted = cleanString(vehicleId);
  const wantedPlate = normalizedPlate(wanted);

  if (!wanted) {
    return false;
  }

  return assignmentKeysForVehicle(vehicle).some((key) => (
    cleanString(key) === wanted ||
    normalizeKey(key) === normalizeKey(wanted) ||
    (wantedPlate && normalizedPlate(key) === wantedPlate)
  ));
}

function assignmentForVehicle(vehicle, assignments) {
  const keys = new Set(assignmentKeysForVehicle(vehicle).map((key) => normalizeKey(key)));
  const plate = normalizedPlate(vehicle.licensePlate || vehicle.tcarsLicensePlate);
  const vin = normalizeKey(vehicle.vin);

  return assignments.find((assignment) => (
    keys.has(normalizeKey(assignment.vehicleId)) ||
    (plate && normalizedPlate(assignment.licensePlate) === plate) ||
    (vin && normalizeKey(assignment.vin) === vin)
  )) || null;
}

function mergeAssignment(vehicle, assignment = null) {
  return {
    ...vehicle,
    assignedDriverId: cleanString(assignment?.assignedDriverId || vehicle.assignedDriverId),
    assignedDriverName: cleanString(assignment?.assignedDriverName || vehicle.assignedDriverName),
    assignedDriverPhone: cleanString(assignment?.assignedDriverPhone),
    assignedDriverEmail: cleanString(assignment?.assignedDriverEmail),
    driverAssignmentNote: cleanString(assignment?.note),
    driverAssignmentUpdatedAt: cleanString(assignment?.updatedAt),
    driverAssignmentUpdatedByName: cleanString(assignment?.updatedByName),
    driverAssignmentEditable: true,
    driverAssignmentSource: assignment ? "fleet_vehicle_assignments" : ""
  };
}

async function loadAssignments(env) {
  const db = database(env);

  if (!db) {
    return {
      assignments: [],
      assignmentApiStatus: "waiting",
      assignmentMessage: "Přiřazení řidičů čeká na D1 databázi."
    };
  }

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM fleet_vehicle_assignments
        ORDER BY updated_at DESC
      `)
      .all();

    return {
      assignments: (result.results || []).map(rowToAssignment),
      assignmentApiStatus: "ready",
      assignmentMessage: "Přiřazení řidičů se načítá z D1."
    };
  } catch (error) {
    if (isMissingAssignmentTable(error)) {
      return {
        assignments: [],
        assignmentApiStatus: "waiting",
        assignmentMessage: "Přiřazení řidičů čeká na migraci 0024_create_fleet_vehicle_assignments.sql."
      };
    }

    console.error("fleet_vehicles.assignments_load_failed", { message: safeErrorMessage(error) });
    return {
      assignments: [],
      assignmentApiStatus: "waiting",
      assignmentMessage: "Přiřazení řidičů se teď nepodařilo načíst."
    };
  }
}

function summaryWithAssignments(summary = {}, vehicles = []) {
  const assignedDrivers = vehicles.filter((vehicle) => cleanString(vehicle.assignedDriverName || vehicle.assignedDriverId)).length;

  return {
    ...summary,
    assignedDrivers
  };
}

function employeeFullName(employee = {}) {
  return [employee.firstName, employee.lastName].map(cleanString).filter(Boolean).join(" ")
    || cleanString(employee.name)
    || "Zaměstnanec";
}

function employeeCandidateSort(left, right) {
  return employeeFullName(left).localeCompare(employeeFullName(right), "cs");
}

function isActiveEmployee(employee = {}) {
  const status = normalizeKey(employee.employmentStatus || employee.status || "active");
  return status !== "inactive" && status !== "neaktivni" && status !== "ukonceno";
}

function employeeToDriverCandidate(employee = {}) {
  const id = cleanString(employee.id || employee.userId);

  if (!id) {
    return null;
  }

  return {
    id,
    userId: cleanString(employee.userId || employee.id),
    name: employeeFullName(employee),
    phone: cleanString(employee.phone),
    email: cleanString(employee.email),
    role: cleanString(employee.role),
    position: cleanString(employee.position),
    department: cleanString(employee.department),
    source: "employees"
  };
}

function driverCandidateMatchesId(candidate = {}, driverId = "") {
  const target = cleanString(driverId);
  return Boolean(target) && [candidate.id, candidate.userId].some((value) => cleanString(value) === target);
}

function uniqueDriverCandidateMatch(candidates = [], predicate) {
  const matches = candidates.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function driverCandidateMatchesUserId(candidate = {}, user = {}) {
  return [candidate.id, candidate.userId].some((value) => sameLookupValue(value, user?.id));
}

function driverCandidateMatchesUserEmail(candidate = {}, user = {}) {
  return Boolean(
    normalizeIdentifier(candidate.email) &&
    normalizeIdentifier(candidate.email) === normalizeIdentifier(user?.email)
  );
}

function driverCandidateMatchesUserPhone(candidate = {}, user = {}) {
  return Boolean(
    normalizeIdentifier(candidate.phone) &&
    normalizeIdentifier(candidate.phone) === normalizeIdentifier(user?.phone)
  );
}

function driverLookupIdentity(payload = {}, user = {}, driverCandidates = []) {
  const explicitIds = uniqueLookupValues([
    payload.driverIds,
    payload.driverId,
    payload.driverEmployeeId,
    payload.employeeId,
    payload.assignedDriverId,
    payload.driverUserId,
    payload.userId
  ]);
  const explicitMatch = explicitIds.length
    ? driverCandidates.find((candidate) => explicitIds.some((id) => driverCandidateMatchesId(candidate, id)))
    : null;
  const userMatch = explicitMatch ||
    uniqueDriverCandidateMatch(driverCandidates, (candidate) => driverCandidateMatchesUserId(candidate, user)) ||
    uniqueDriverCandidateMatch(driverCandidates, (candidate) => driverCandidateMatchesUserEmail(candidate, user)) ||
    uniqueDriverCandidateMatch(driverCandidates, (candidate) => driverCandidateMatchesUserPhone(candidate, user)) ||
    null;
  const ids = uniqueLookupValues([
    explicitIds,
    userMatch ? [userMatch.id, userMatch.userId] : [],
    user?.id
  ]);

  return {
    ids,
    employeeId: cleanString(userMatch?.id),
    userId: cleanString(userMatch?.userId || user?.id),
    displayName: cleanString(userMatch?.name || user?.name),
    source: userMatch ? userMatch.source || "employees" : "auth_user"
  };
}

async function loadFleetDriverCandidates(env = {}, user = null) {
  try {
    const users = await getUsers(env);
    const employees = await listEmployeeCards(env, users, user);
    return employees
      .filter(isActiveEmployee)
      .sort(employeeCandidateSort)
      .map(employeeToDriverCandidate)
      .filter(Boolean);
  } catch (error) {
    console.error("fleet_vehicles.driver_candidates_failed", { message: safeErrorMessage(error) });
    return [];
  }
}

function numericOrNull(value) {
  const cleaned = cleanString(value).replace(/\s+/g, "").replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function statusFromVistosVehicle(vehicle = {}) {
  const eliminated = cleanString(vehicle.eliminatedDate);
  const status = normalizeKey(`${vehicle.status || ""} ${vehicle.statusId || ""}`);

  if (eliminated || /vyrazen|zrusen|archiv/.test(status)) {
    return "retired";
  }

  if (/servis/.test(status)) {
    return "service";
  }

  if (/mimo|nepojizd|porucha/.test(status)) {
    return "out_of_order";
  }

  return "active";
}

function fleetSummaryFromVehicles(vehicles = []) {
  const active = vehicles.filter((vehicle) => vehicle.status === "active").length;
  const retired = vehicles.filter((vehicle) => vehicle.status === "retired").length;
  const inService = vehicles.filter((vehicle) => vehicle.status === "service").length;
  const outOfOrder = vehicles.filter((vehicle) => vehicle.status === "out_of_order").length;

  return {
    total: vehicles.length,
    active,
    outOfOrder,
    inService,
    retired,
    stkDue: 0,
    revisionDue: 0,
    insuranceDue: 0,
    openDefects: 0
  };
}

function tcarsByRegistrationPlate(vehicles = []) {
  const byPlate = new Map();

  for (const vehicle of vehicles) {
    const plate = normalizedPlate(vehicle.licensePlate || vehicle.tcarsLicensePlate);
    if (plate && !byPlate.has(plate)) {
      byPlate.set(plate, vehicle);
    }
  }

  return byPlate;
}

function fleetVehicleFromVistos(vehicle = {}, tcarsVehicle = null) {
  const vistosVehicleId = cleanString(vehicle.vistosVehicleId);
  const registrationPlate = cleanString(vehicle.registrationPlate);
  const name = cleanString(vehicle.name || registrationPlate || vistosVehicleId);
  const id = vistosVehicleId ? `vistos-${vistosVehicleId}` : `vistos-${normalizedPlate(registrationPlate || name)}`;
  const tcarsId = cleanString(tcarsVehicle?.tcarsVehicleId);

  return {
    id,
    vehicleId: id,
    externalVehicleId: vistosVehicleId,
    internalNumber: name,
    licensePlate: registrationPlate || cleanString(tcarsVehicle?.licensePlate || tcarsVehicle?.tcarsLicensePlate),
    vehicleType: cleanString(vehicle.category || tcarsVehicle?.vehicleType || "Vozidlo"),
    brand: "",
    model: name,
    vin: cleanString(vehicle.vinMasked || tcarsVehicle?.vin),
    year: "",
    fuelType: "",
    euroNorm: "",
    bodyType: "",
    department: "",
    assignedDriverId: "",
    assignedDriverName: cleanString(vehicle.driver),
    status: statusFromVistosVehicle(vehicle),
    mileageKm: numericOrNull(vehicle.odometerKm) ?? numericOrNull(vehicle.gpsKm),
    stkValidTo: "",
    emissionsValidTo: "",
    tachographValidTo: "",
    craneRevisionValidTo: "",
    liftRevisionValidTo: "",
    pressureEquipmentRevisionValidTo: "",
    fireExtinguisherValidTo: "",
    insuranceCompany: "",
    insurancePolicyNumber: "",
    insuranceValidTo: "",
    openDefects: null,
    tcarsVehicleId: tcarsId,
    tcarsUnitId: cleanString(tcarsVehicle?.tcarsUnitId),
    tcarsLicensePlate: cleanString(tcarsVehicle?.tcarsLicensePlate),
    vistosVehicleId,
    vistosVehicleName: name,
    vistosVehicleCategory: cleanString(vehicle.category || vehicle.categoryId),
    vistosVehicleStatus: cleanString(vehicle.status || vehicle.statusId),
    vistosStartingDate: cleanString(vehicle.startingDate),
    vistosEliminatedDate: cleanString(vehicle.eliminatedDate),
    gpsProvider: tcarsId ? "tcars" : cleanString(vehicle.gpsProvider || "vistos"),
    gpsUnitId: cleanString(tcarsVehicle?.tcarsUnitId),
    telemetrySource: tcarsId ? "T-Cars read-only" : "Vistos Vehicle metadata",
    source: "Vistos Vehicle master",
    readOnly: true,
    createdAt: "",
    updatedAt: cleanString(vehicle.gpsUpdatedAt || vehicle.lastPositionSyncDate || tcarsVehicle?.updatedAt)
  };
}

async function loadVistosFleetVehiclesPayload(env = {}, tcarsPayload = null) {
  try {
    const preview = await createFleetVistosVehiclePreview(env);
    const tcarsVehicles = Array.isArray(tcarsPayload?.vehicles) ? tcarsPayload.vehicles : [];
    const tcarsByPlate = tcarsByRegistrationPlate(tcarsVehicles);
    const vehicles = (Array.isArray(preview?.vehicles) ? preview.vehicles : []).map((vehicle) => {
      const match = tcarsByPlate.get(normalizedPlate(vehicle.registrationPlate));
      return fleetVehicleFromVistos(vehicle, match);
    });
    const ready = preview?.apiStatus === "ready" && vehicles.length > 0;

    return {
      provider: "vistos",
      source: "Vistos Vehicle master",
      apiStatus: ready ? "ready" : preview?.apiStatus || "waiting",
      configured: preview?.apiStatus !== "not_configured",
      readOnly: true,
      createsFleetRecords: false,
      startsAutomation: false,
      sendsEmailOrSms: false,
      vehicles,
      summary: fleetSummaryFromVehicles(vehicles),
      message: ready
        ? "Vozidla byla načtena z Vistos Vehicle jako master evidence. T-Cars se používá jen jako doplňkový/GPS zdroj."
        : preview?.message || "Vistos Vehicle master seznam zatím není dostupný.",
      lastFetchedAt: preview?.loadedAt || new Date().toISOString(),
      diagnostics: preview?.diagnostics || null,
      vistosPreviewStatus: preview?.apiStatus || "waiting",
      tcarsApiStatus: tcarsPayload?.apiStatus || "waiting"
    };
  } catch (error) {
    console.error("fleet_vehicles.vistos_master_failed", { message: safeErrorMessage(error) });
    return {
      provider: "vistos",
      source: "Vistos Vehicle master",
      apiStatus: "waiting",
      configured: false,
      readOnly: true,
      createsFleetRecords: false,
      startsAutomation: false,
      sendsEmailOrSms: false,
      vehicles: [],
      summary: fleetSummaryFromVehicles([]),
      message: "Vistos Vehicle master seznam se teď nepodařilo načíst.",
      waitingReason: "vistos_vehicle_read_failed"
    };
  }
}

export async function loadFleetVehiclesWithAssignments(env = {}, user = null) {
  const testPayload = testFleetPayloadFromEnv(env);
  if (testPayload) {
    return {
      ...testPayload,
      driverCandidates: testPayload.driverCandidates.length
        ? testPayload.driverCandidates
        : await loadFleetDriverCandidates(env, user),
      message: [
        cleanString(testPayload.message),
        cleanString(testPayload.assignmentMessage)
      ].filter(Boolean).join(" ")
    };
  }

  const tcarsPayload = await loadTcarsFleetVehiclesPayload(env);
  const vistosPayload = await loadVistosFleetVehiclesPayload(env, tcarsPayload);
  const basePayload = vistosPayload.apiStatus === "ready" && vistosPayload.vehicles.length
    ? vistosPayload
    : {
        ...tcarsPayload,
        provider: "tcars-fallback",
        source: "T-Cars fallback",
        message: [
          "Vistos Vehicle master seznam není dostupný, dočasně zobrazuji T-Cars read-only.",
          cleanString(vistosPayload?.message),
          cleanString(tcarsPayload?.message)
        ].filter(Boolean).join(" ")
      };
  const { assignments, assignmentApiStatus, assignmentMessage } = await loadAssignments(env);
  const driverCandidates = await loadFleetDriverCandidates(env, user);
  const vehicles = (Array.isArray(basePayload?.vehicles) ? basePayload.vehicles : [])
    .map((vehicle) => mergeAssignment(vehicle, assignmentForVehicle(vehicle, assignments)));

  return {
    ...basePayload,
    vehicles,
    driverCandidates,
    summary: summaryWithAssignments(basePayload?.summary, vehicles),
    assignmentApiStatus,
    assignmentMessage,
    message: [
      cleanString(basePayload?.message),
      assignmentMessage
    ].filter(Boolean).join(" ")
  };
}

export async function getFleetVehicleWithAssignment(env = {}, vehicleId = "", user = null) {
  const payload = await loadFleetVehiclesWithAssignments(env, user);
  const vehicle = payload.vehicles.find((item) => vehicleMatchesId(item, vehicleId)) || null;

  if (!vehicle) {
    throw new FleetVehiclesStoreError("Vozidlo nebylo nalezeno.", 404, "fleet_vehicle_not_found");
  }

  return {
    ...payload,
    vehicle
  };
}

function employeeDriverCandidateFromPayload(payload = {}, driverCandidates = []) {
  const driverId = cleanString(payload.assignedDriverId || payload.driverUserId || payload.userId);

  if (!driverId) {
    return null;
  }

  return driverCandidates.find((candidate) => driverCandidateMatchesId(candidate, driverId)) || null;
}

function normalizeAssignmentInput(payload = {}, driverCandidates = []) {
  const driverId = cleanString(payload.assignedDriverId || payload.driverUserId || payload.userId);

  if (!driverId) {
    return {
      assignedDriverId: "",
      assignedDriverName: "",
      assignedDriverPhone: "",
      assignedDriverEmail: "",
      note: ""
    };
  }

  const driver = employeeDriverCandidateFromPayload(payload, driverCandidates);

  if (!driver) {
    throw new FleetVehiclesStoreError(
      "Řidiče lze vybrat pouze ze seznamu zaměstnanců.",
      400,
      "fleet_driver_employee_required"
    );
  }

  return {
    assignedDriverId: cleanString(driver.id),
    assignedDriverName: cleanString(driver.name),
    assignedDriverPhone: cleanString(driver.phone),
    assignedDriverEmail: cleanString(driver.email),
    note: cleanString(payload.note)
  };
}

function isEmptyAssignment(assignment) {
  return !cleanString(assignment.assignedDriverId)
    && !cleanString(assignment.assignedDriverName)
    && !cleanString(assignment.assignedDriverPhone)
    && !cleanString(assignment.assignedDriverEmail)
    && !cleanString(assignment.note);
}

export async function saveFleetVehicleDriverAssignment(env, user, vehicleId, payload = {}) {
  const db = database(env, true);
  const vehiclePayload = await getFleetVehicleWithAssignment(env, vehicleId, user);
  const vehicle = vehiclePayload.vehicle;
  const driverCandidates = await loadFleetDriverCandidates(env, user);
  const assignment = normalizeAssignmentInput(payload, driverCandidates);
  const primaryVehicleId = cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId || vehicleId);
  const plate = cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate);
  const now = new Date().toISOString();

  if (!primaryVehicleId) {
    throw new FleetVehiclesStoreError("Vozidlo nemá stabilní ID pro uložení přiřazení.", 400, "fleet_vehicle_id_missing");
  }

  try {
    if (isEmptyAssignment(assignment)) {
      await db
        .prepare("DELETE FROM fleet_vehicle_assignments WHERE vehicle_id = ?")
        .bind(primaryVehicleId)
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO fleet_vehicle_assignments (
            vehicle_id,
            license_plate,
            vin,
            assigned_driver_user_id,
            assigned_driver_name,
            assigned_driver_phone,
            assigned_driver_email,
            note,
            updated_by_user_id,
            updated_by_name,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(vehicle_id) DO UPDATE SET
            license_plate = excluded.license_plate,
            vin = excluded.vin,
            assigned_driver_user_id = excluded.assigned_driver_user_id,
            assigned_driver_name = excluded.assigned_driver_name,
            assigned_driver_phone = excluded.assigned_driver_phone,
            assigned_driver_email = excluded.assigned_driver_email,
            note = excluded.note,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_by_name = excluded.updated_by_name,
            updated_at = excluded.updated_at
        `)
        .bind(
          primaryVehicleId,
          nullableString(plate),
          nullableString(vehicle.vin),
          nullableString(assignment.assignedDriverId),
          nullableString(assignment.assignedDriverName),
          nullableString(assignment.assignedDriverPhone),
          nullableString(assignment.assignedDriverEmail),
          nullableString(assignment.note),
          nullableString(user?.id),
          nullableString(user?.name),
          now,
          now
        )
        .run();
    }

    return getFleetVehicleWithAssignment(env, primaryVehicleId, user);
  } catch (error) {
    throw fleetStoreError(error);
  }
}

function vehicleTypeForHumanTouch(vehicle = {}) {
  const safeVehicle = vehicle || {};
  const source = normalizeKey([
    safeVehicle.vehicleType,
    safeVehicle.bodyType,
    safeVehicle.model,
    safeVehicle.internalNumber,
    safeVehicle.source
  ].join(" "));

  if (/cisterna|cisteren|tanker|adr/.test(source)) {
    return "cisterna";
  }

  if (/kontejner|hakovy|hákový|container|nosic|nosič/.test(source)) {
    return "kontejnerové auto";
  }

  if (/dodav|van|transit|sprinter|vito/.test(source)) {
    return "dodávka";
  }

  return "vozidlo";
}

function uniqueCleanStrings(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleaned = cleanString(value).replace(/\s+/g, " ");
    const key = normalizeKey(cleaned);
    if (!cleaned || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

export function fleetVehicleVoiceLabel(vehicle = {}, options = {}) {
  const humanType = vehicleTypeForHumanTouch(vehicle);
  const parts = uniqueCleanStrings([
    vehicle.brand,
    vehicle.model,
    vehicle.internalNumber,
    vehicle.vehicleType,
    vehicle.bodyType,
    vehicle.vistosVehicleCategory,
    humanType !== "vozidlo" ? humanType : ""
  ]).filter((part) => normalizeKey(part) !== "vozidlo");

  const base = parts.slice(0, 3).join(" ") || cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate) || "vozidlo";
  if (options.includePlate) {
    const plate = cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate);
    return plate ? `${base} (${plate})` : base;
  }
  return base;
}

function fleetVehicleOptionLabels(vehicles = []) {
  const labels = vehicles.map((vehicle) => fleetVehicleVoiceLabel(vehicle));
  const duplicated = labels.some((label, index) => (
    labels.findIndex((other) => normalizeKey(other) === normalizeKey(label)) !== index
  ));
  return vehicles.map((vehicle) => fleetVehicleVoiceLabel(vehicle, { includePlate: duplicated }));
}

export function fleetVehicleSelectionQuestion(vehicles = []) {
  const labels = fleetVehicleOptionLabels(vehicles).slice(0, 5);
  if (!labels.length) {
    return "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
  }

  return "Vyber vozidlo v aplikaci pro aktuální hlášení.";
}

function withDriverVehicleMeta(vehicle, confidence, extra = {}) {
  return {
    ...vehicle,
    ...extra,
    driverVehicleMatchConfidence: confidence,
    driverVehicleSource: "fleet_vehicle_assignments"
  };
}

function isActiveFleetVehicleForDriverReports(vehicle = {}) {
  if (vehicle.active === false) {
    return false;
  }

  const status = normalizeKey([
    vehicle.status,
    vehicle.vistosVehicleStatus,
    vehicle.vehicleStatus
  ].join(" "));

  return !/(retired|inactive|archiv|vyrazen|vyrazeno|zrusen|zruseno|neaktiv)/.test(status);
}

export function fleetPayloadUsesMockData(payload = {}) {
  const sourceText = normalizeKey([
    payload.provider,
    payload.source,
    payload.message
  ].join(" ")).replace(/[_-]+/g, " ");
  return /\b(mock|demo|local dev|lokalni mock|lokalni dev)\b/.test(sourceText);
}

export function shouldBlockFleetPayloadForDriverReports(env = {}, payload = {}) {
  return isProduction(env) && fleetPayloadUsesMockData(payload);
}

export function driverVehicleCandidateMatches(vehicles = [], payload = {}, user = {}) {
  const strictDriverAssignment = payload.strictDriverAssignment === true;
  const driverIds = uniqueLookupValues([
    payload.driverIds,
    payload.driverId,
    payload.driverEmployeeId,
    payload.employeeId,
    payload.assignedDriverId,
    payload.driverUserId,
    payload.userId,
    user?.id
  ]);
  const driverPhone = normalizeIdentifier(payload.driverPhone || payload.phone || user?.phone);
  const driverName = normalizedDriverName(payload.driverName || payload.name || user?.name);

  if (driverIds.length) {
    const matches = vehicles.filter((vehicle) => driverIds.some((driverId) => sameLookupValue(vehicle.assignedDriverId, driverId)));
    if (matches.length) {
      return { matches, confidence: "assigned_driver_id", fallbackUsed: false, lookupReason: "driver_id" };
    }
  }

  if (strictDriverAssignment) {
    if ((payload.verifiedDriverNameAssignment === true || payload.allowVerifiedDriverNameAssignment === true) && driverName) {
      const matches = vehicles.filter((vehicle) => (
        !cleanString(vehicle.assignedDriverId) &&
        normalizedDriverName(vehicle.assignedDriverName) === driverName
      ));
      if (matches.length) {
        return {
          matches,
          confidence: "verified_assigned_driver_name",
          fallbackUsed: false,
          lookupReason: "verified_driver_name"
        };
      }
    }

    return { matches: [], confidence: "", fallbackUsed: false, lookupReason: "strict_driver_id_no_match" };
  }

  if (driverPhone) {
    const matches = vehicles.filter((vehicle) => normalizeIdentifier(vehicle.assignedDriverPhone) === driverPhone);
    if (matches.length) {
      return { matches, confidence: "assigned_driver_phone", fallbackUsed: true, lookupReason: "driver_phone" };
    }
  }

  if (driverName) {
    const matches = vehicles.filter((vehicle) => normalizedDriverName(vehicle.assignedDriverName) === driverName);
    if (matches.length) {
      return { matches, confidence: "assigned_driver_name", fallbackUsed: true, lookupReason: "driver_name" };
    }
  }

  return { matches: [], confidence: "", fallbackUsed: false, lookupReason: "no_match" };
}

function vehicleSelectionHint(payload = {}) {
  return normalizeKey([
    payload.vehicleSelection,
    payload.vehicleDescription,
    payload.vehicleName,
    payload.vehicleType,
    payload.vehicleBrand,
    payload.brand,
    payload.car,
    payload.licensePlate,
    payload.spz,
    payload.description,
    payload.defectDescription,
    payload.speechText
  ].join(" "));
}

function vehicleOrdinalIndex(hint) {
  const normalized = normalizeKey(hint);
  const ordinals = [
    /\b(prvni|jedna|jednicka|1)\b/,
    /\b(druhe|druhy|dvojka|2)\b/,
    /\b(treti|trojka|3)\b/,
    /\b(ctvrte|ctvrty|ctyrka|4)\b/,
    /\b(pate|paty|petka|5)\b/
  ];
  const index = ordinals.findIndex((pattern) => pattern.test(normalized));
  return index >= 0 ? index : null;
}

function vehicleSearchTerms(vehicle = {}) {
  const values = uniqueCleanStrings([
    vehicle.brand,
    vehicle.model,
    vehicle.internalNumber,
    vehicle.vehicleType,
    vehicle.bodyType,
    vehicle.vistosVehicleCategory,
    vehicle.licensePlate,
    vehicle.tcarsLicensePlate,
    vehicleTypeForHumanTouch(vehicle),
    fleetVehicleVoiceLabel(vehicle)
  ]);
  const stopWords = new Set(["auto", "auta", "vozidlo", "vozidle", "spz"]);
  const terms = new Set();

  for (const value of values) {
    const normalized = normalizeKey(value);
    if (normalized.length >= 3 && !stopWords.has(normalized)) {
      terms.add(normalized);
    }
    normalized
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && !stopWords.has(part))
      .forEach((part) => terms.add(part));
  }

  return [...terms];
}

function selectDriverVehicleFromCandidates(candidates = [], payload = {}) {
  const hint = vehicleSelectionHint(payload);
  if (!hint || !candidates.length) {
    return null;
  }

  const wantedId = cleanString(payload.vehicleId || payload.vehicle_id);
  if (wantedId) {
    const byId = candidates.find((vehicle) => vehicleMatchesId(vehicle, wantedId));
    if (byId) {
      return byId;
    }
  }

  const wantedPlate = normalizedPlate(payload.licensePlate || payload.spz || payload.plate);
  if (wantedPlate) {
    const byPlate = candidates.find((vehicle) => (
      normalizedPlate(vehicle.licensePlate || vehicle.tcarsLicensePlate) === wantedPlate
    ));
    if (byPlate) {
      return byPlate;
    }
  }

  const ordinalIndex = vehicleOrdinalIndex(hint);
  if (ordinalIndex !== null && candidates[ordinalIndex]) {
    return candidates[ordinalIndex];
  }

  const scored = candidates.map((vehicle) => {
    const score = vehicleSearchTerms(vehicle).reduce((total, term) => {
      return hint.includes(term) ? total + Math.min(24, 6 + term.length) : total;
    }, 0);
    return { vehicle, score };
  }).sort((left, right) => right.score - left.score);

  if (!scored.length || scored[0].score <= 0) {
    return null;
  }

  if (scored[1] && scored[1].score === scored[0].score) {
    return null;
  }

  return scored[0].vehicle;
}

function canUseFleetForVoice(user) {
  return isUserActive(user)
    && hasPermission(user, "fleet", "view");
}

export async function resolveFleetVehiclesForDriver(env, user, payload = {}) {
  if (!canUseFleetForVoice(user)) {
    return { status: "unavailable", vehicle: null, candidates: [], question: "" };
  }

  try {
    const fleet = await loadFleetVehiclesWithAssignments(env);
    const dataSource = cleanString(fleet.provider || fleet.source);
    const mockData = fleetPayloadUsesMockData(fleet);
    const identity = driverLookupIdentity(payload, user, Array.isArray(fleet.driverCandidates) ? fleet.driverCandidates : []);
    const vehicles = (Array.isArray(fleet.vehicles) ? fleet.vehicles : []).filter(isActiveFleetVehicleForDriverReports);

    if (shouldBlockFleetPayloadForDriverReports(env, fleet)) {
      console.error("fleet_vehicles.driver_context_mock_data_blocked", {
        userId: cleanString(user?.id),
        identitySource: identity.source,
        dataSource
      });
      return {
        status: "failed",
        vehicle: null,
        candidates: [],
        question: "",
        errorCode: "mock_vehicle_data_in_production",
        message: "Vozidla se teď nepodařilo bezpečně načíst.",
        dataSource,
        mockData: true,
        identity
      };
    }

    const { matches, confidence, fallbackUsed, lookupReason } = driverVehicleCandidateMatches(vehicles, {
      ...payload,
      driverIds: identity.ids
    }, user);
    const candidates = matches.map((vehicle) => withDriverVehicleMeta(vehicle, confidence, {
      driverVehicleLookupReason: lookupReason
    }));
    const baseMeta = {
      dataSource,
      mockData,
      fallbackUsed,
      lookupReason,
      identity
    };

    if (candidates.length === 1) {
      return {
        status: "single",
        vehicle: candidates[0],
        candidates,
        question: "",
        labels: fleetVehicleOptionLabels(candidates),
        ...baseMeta
      };
    }

    if (candidates.length > 1) {
      const selected = selectDriverVehicleFromCandidates(candidates, payload);
      if (selected) {
        return {
          status: "selected",
          vehicle: withDriverVehicleMeta(selected, `${confidence}_selection`, {
            driverVehicleCandidateCount: candidates.length
          }),
          candidates,
          question: "",
          labels: fleetVehicleOptionLabels(candidates),
          ...baseMeta
        };
      }

      return {
        status: "multiple",
        vehicle: null,
        candidates,
        question: fleetVehicleSelectionQuestion(candidates),
        labels: fleetVehicleOptionLabels(candidates),
        ...baseMeta
      };
    }

    return {
      status: payload.strictDriverAssignment === true && !candidates.length ? "no_driver_vehicles" : "none",
      vehicle: null,
      candidates: [],
      question: "",
      ...baseMeta
    };
  } catch (error) {
    console.info("fleet_vehicles.driver_vehicle_lookup_skipped", { message: safeErrorMessage(error) });
    return {
      status: "failed",
      vehicle: null,
      candidates: [],
      question: "",
      errorCode: "fleet_vehicle_lookup_failed",
      message: "Vozidla se teď nepodařilo načíst."
    };
  }
}

export async function resolveFleetVehicleForDriver(env, user, payload = {}) {
  const result = await resolveFleetVehiclesForDriver(env, user, payload);
  if (result.vehicle) {
    return result.vehicle;
  }
  return null;
}

function truncateDynamicVariable(value, max = 260) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

export async function driverReportVehicleDynamicVariables(env, user) {
  const match = await resolveFleetVehiclesForDriver(env, user);
  const vehicle = match.vehicle;
  const licensePlate = cleanString(vehicle?.licensePlate || vehicle?.tcarsLicensePlate);

  if (match.status === "multiple") {
    return {
      driver_report_vehicle_status: "vyber_v_aplikaci",
      driver_report_vehicle_id: "",
      driver_report_vehicle_name: "",
      driver_report_vehicle_license_plate: "",
      driver_report_vehicle_vin: "",
      driver_report_vehicle_type: "",
      driver_report_vehicle_options_count: "0",
      driver_report_vehicle_options: "",
      driver_report_vehicle_selection_question: "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
      driver_report_vehicle_context: "V Hlášení řidičů použij ověřený backend seznam, bezpečný výběr v aplikaci, nebo nouzově značku, typ či SPZ."
    };
  }

  if (!vehicle || !licensePlate) {
    return {
      driver_report_vehicle_status: "nenalezeno",
      driver_report_vehicle_id: "",
      driver_report_vehicle_name: "",
      driver_report_vehicle_license_plate: "",
      driver_report_vehicle_vin: "",
      driver_report_vehicle_type: "",
      driver_report_vehicle_options_count: "0",
      driver_report_vehicle_options: "",
      driver_report_vehicle_selection_question: "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
      driver_report_vehicle_context: "V Hlášení řidičů není vozidlo podle volajícího jistě přiřazené. Otevři výběr v aplikaci, nebo požádej o značku, typ či SPZ."
    };
  }

  return {
    driver_report_vehicle_status: "vyber_v_aplikaci",
    driver_report_vehicle_id: "",
    driver_report_vehicle_name: "",
    driver_report_vehicle_license_plate: "",
    driver_report_vehicle_vin: "",
    driver_report_vehicle_type: "",
    driver_report_vehicle_options_count: "0",
    driver_report_vehicle_options: "",
    driver_report_vehicle_selection_question: "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.",
    driver_report_vehicle_context: "V Hlášení řidičů použij ověřený backend seznam, bezpečný výběr v aplikaci, nebo nouzově značku, typ či SPZ."
  };
}

export function fleetVehicleCanEditDriver(user) {
  return hasPermission(user, "fleet", "edit") || ["admin", "management", "garazmistr"].includes(normalizeRole(user?.role));
}
