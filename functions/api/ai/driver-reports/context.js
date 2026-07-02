import { currentUser, getUsers, json, normalizeIdentifier } from "../../../_lib/auth.js";
import { canCreateDriverPartRequest } from "../../../_lib/driver-part-requests-store.js";
import { listEmployeeCards } from "../../../_lib/employees-store.js";
import {
  fleetPayloadUsesMockData,
  fleetVehicleVoiceLabel,
  resolveFleetVehiclesForDriver
} from "../../../_lib/fleet-vehicles-store.js";
import { hasPermission } from "../../../../src/permissions.js";

const MODULE_ID = "hlaseni-ridicu";
const MODULE_KEY = "driver-reports";
const VEHICLE_CONTEXT_LOADING_MESSAGE = "Rozumím. Podívám se do Smart systému.";
const VEHICLE_PICKER_MESSAGE = "Otevřu ti výběr v aplikaci.";
const VEHICLE_PICKER_OR_MANUAL_QUESTION = "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
const NO_VERIFIED_VEHICLE_QUESTION = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const PICKER_FAILED_QUESTION = "Výběr se mi nepodařilo otevřít. Řekni mi prosím značku, typ nebo SPZ vozidla.";
const LOAD_FAILED_QUESTION = "Vozidlo se mi teď nepodařilo ověřit. Otevřu ti výběr v aplikaci.";

function cleanString(value) {
  return String(value ?? "").trim();
}

function fullEmployeeName(employee = {}) {
  return [employee.firstName, employee.lastName].map(cleanString).filter(Boolean).join(" ")
    || cleanString(employee.name)
    || cleanString(employee.fullName);
}

function sameValue(left, right) {
  const leftValue = cleanString(left).toLowerCase();
  const rightValue = cleanString(right).toLowerCase();
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function sameContact(left, right) {
  const leftValue = normalizeIdentifier(left);
  const rightValue = normalizeIdentifier(right);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function uniqueEmployeeMatch(employees = [], predicate) {
  const matches = employees.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

async function driverEmployeeFor(env, user) {
  try {
    const users = await getUsers(env);
    const employees = await listEmployeeCards(env, users, user);

    const exactIdMatch = employees.find((employee) => (
      sameValue(employee.userId, user.id) ||
      sameValue(employee.id, user.id)
    ));
    if (exactIdMatch) {
      return exactIdMatch;
    }

    const emailMatch = uniqueEmployeeMatch(employees, (employee) => sameContact(employee.email, user.email));
    if (emailMatch) {
      return emailMatch;
    }

    const phoneMatch = uniqueEmployeeMatch(employees, (employee) => sameContact(employee.phone, user.phone));
    if (phoneMatch) {
      return phoneMatch;
    }

    return uniqueEmployeeMatch(employees, (employee) => sameValue(fullEmployeeName(employee), user.name));
  } catch (error) {
    console.info("driver_reports.context_employee_lookup_skipped", { message: cleanString(error?.message) });
    return null;
  }
}

function vehicleTypeLabel(vehicle = {}) {
  return cleanString(vehicle.vehicleType || vehicle.bodyType || vehicle.vistosVehicleCategory || vehicle.type);
}

function maskedVin(value = "") {
  const vin = cleanString(value).replace(/\s+/g, "").toUpperCase();
  if (!vin) {
    return "";
  }

  if (vin.length <= 8) {
    return `${vin.slice(0, 2)}***${vin.slice(-2)}`;
  }

  return `${vin.slice(0, 3)}**********${vin.slice(-4)}`;
}

function vehicleContextItem(vehicle = {}, displayName = "") {
  const spz = cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate);
  const vin = cleanString(vehicle.vin);
  const sourcePayload = {
    provider: vehicle.provider,
    source: vehicle.source || vehicle.telemetrySource || vehicle.dataSource,
    message: vehicle.message
  };
  const safeSource = fleetPayloadUsesMockData(sourcePayload) ? cleanString(sourcePayload.source) : "fleet_db";

  return {
    id: cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId),
    vehicleId: cleanString(vehicle.vehicleId || vehicle.id || vehicle.tcarsVehicleId),
    displayName: cleanString(displayName) || fleetVehicleVoiceLabel(vehicle),
    spz,
    type: vehicleTypeLabel(vehicle),
    brand: cleanString(vehicle.brand),
    model: cleanString(vehicle.model || vehicle.internalNumber),
    internalName: cleanString(vehicle.internalNumber || vehicle.vehicleName || vehicle.name),
    licensePlate: spz,
    vinPresent: Boolean(vin),
    vinMasked: maskedVin(vin),
    assignmentHint: "přiřazené vozidlo",
    source: safeSource,
    assignedToCurrentDriver: true,
    existsInFleet: true,
    active: true
  };
}

function vehicleContextItems(match = {}) {
  const vehicles = match.vehicle
    ? [match.vehicle]
    : Array.isArray(match.candidates) ? match.candidates : [];
  const labels = Array.isArray(match.labels) && match.labels.length
    ? match.labels
    : vehicles.map((vehicle) => fleetVehicleVoiceLabel(vehicle));

  return vehicles.map((vehicle, index) => vehicleContextItem(vehicle, labels[index]));
}

function isSafeVoiceVehicle(vehicle = {}) {
  return Boolean(
    cleanString(vehicle.vehicleId) &&
    cleanString(vehicle.displayName) &&
    cleanString(vehicle.spz || vehicle.licensePlate) &&
    vehicle.assignedToCurrentDriver === true &&
    vehicle.existsInFleet === true &&
    vehicle.active === true &&
    cleanString(vehicle.source) === "fleet_db"
  );
}

function joinCzechList(items = []) {
  const values = items.map(cleanString).filter(Boolean);
  if (values.length <= 1) {
    return values[0] || "";
  }

  return `${values.slice(0, -1).join(", ")} a ${values[values.length - 1]}`;
}

function vehicleVoicePhrase(vehicle = {}) {
  const label = cleanString(vehicle.displayName);
  const plate = cleanString(vehicle.spz || vehicle.licensePlate);
  return [label, plate ? `SPZ ${plate}` : ""].filter(Boolean).join(" ");
}

function vehicleListMessage(vehicles = []) {
  const options = vehicles.map(vehicleVoicePhrase).filter(Boolean);
  if (!options.length) {
    return NO_VERIFIED_VEHICLE_QUESTION;
  }

  if (options.length === 1) {
    return `Mám bezpečně ověřené tvoje vozidlo ${options[0]}. Týká se závada tohohle vozidla?`;
  }

  return `Vidím u tebe ${joinCzechList(options)}. Kterého se závada týká?`;
}

function errorPayload(errorCode, message, status = 400, extra = {}) {
  return json({
    ok: false,
    module: MODULE_ID,
    userResolved: false,
    employeeResolved: false,
    driverResolved: false,
    vehiclesVerified: false,
    vehicles: [],
    vehiclesCount: 0,
    vehicleLookupMode: "picker_or_manual",
    errorCode,
    message,
    messageForAssistant: message,
    fallbackQuestion: LOAD_FAILED_QUESTION,
    apiStatus: status >= 500 ? "waiting" : "ready",
    ...extra
  }, status);
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);

  if (!user) {
    return errorPayload("UNAUTHENTICATED", "Nejsi přihlášený.", 401);
  }

  const permissions = {
    canViewDriverReports: hasPermission(user, MODULE_KEY, "view"),
    canCreateDriverReport: canCreateDriverPartRequest(user),
    canViewFleet: hasPermission(user, "fleet", "view")
  };

  if (!permissions.canViewDriverReports || !permissions.canCreateDriverReport || !permissions.canViewFleet) {
    return errorPayload("FORBIDDEN", "K tomu nemáš oprávnění.", 403, { permissions });
  }

  const url = new URL(request.url);
  const transcriptIntent = cleanString(url.searchParams.get("transcriptIntent") || url.searchParams.get("intent"));
  const sessionId = cleanString(url.searchParams.get("sessionId") || url.searchParams.get("conversationId"));
  const currentModule = cleanString(url.searchParams.get("currentModule")) || MODULE_ID;
  const employee = await driverEmployeeFor(env, user);
  const employeeId = cleanString(employee?.id || user.id);
  const driverUserId = cleanString(employee?.userId || user.id);
  const driverIds = [employee?.id, employee?.userId, user.id].map(cleanString).filter(Boolean);
  const driverName = fullEmployeeName(employee) || cleanString(user.name);

  let match;
  try {
    match = await resolveFleetVehiclesForDriver(env, user, {
      strictDriverAssignment: true,
      driverIds,
      driverEmployeeId: employeeId,
      driverUserId,
      driverName,
      driverPhone: cleanString(employee?.phone || user.phone),
      transcriptIntent,
      currentModule
    });
  } catch (error) {
    console.error("driver_reports.context_vehicle_lookup_failed", { message: cleanString(error?.message) });
    return errorPayload("VEHICLES_UNAVAILABLE", "Vozidla se mi teď nepodařilo načíst.", 500);
  }

  if (match?.status === "failed") {
    return errorPayload("VEHICLES_UNAVAILABLE", "Vozidla se mi teď nepodařilo načíst.", 500);
  }

  const rawVehicles = vehicleContextItems(match);
  const unsafeVoiceVehicleCount = rawVehicles.filter((vehicle) => !isSafeVoiceVehicle(vehicle)).length;
  const vehiclesAreSafelyVerified = Boolean(
    employee &&
    rawVehicles.length > 0 &&
    unsafeVoiceVehicleCount === 0 &&
    match?.fallbackUsed !== true &&
    match?.mockData !== true &&
    match?.status !== "failed" &&
    rawVehicles.every(isSafeVoiceVehicle)
  );

  if (rawVehicles.length && !vehiclesAreSafelyVerified) {
    console.error("driver_reports.context_unsafe_vehicle_list_blocked", {
      userId: cleanString(user.id),
      rawVehiclesCount: rawVehicles.length,
      unsafeVoiceVehicleCount,
      fallbackUsed: match?.fallbackUsed === true,
      mockData: match?.mockData === true,
      dataSource: cleanString(match?.dataSource)
    });
  }

  const vehicles = vehiclesAreSafelyVerified ? rawVehicles : [];
  const emptyReason = vehiclesAreSafelyVerified
    ? ""
    : employee ? "NO_DRIVER_VEHICLES" : "DRIVER_NOT_MAPPED";
  const fallbackQuestion = vehiclesAreSafelyVerified
    ? VEHICLE_PICKER_OR_MANUAL_QUESTION
    : NO_VERIFIED_VEHICLE_QUESTION;
  const vehicleLookupMode = vehiclesAreSafelyVerified
    ? "verified_vehicle_list"
    : "picker_or_manual";
  const messageForAssistant = vehiclesAreSafelyVerified
    ? vehicleListMessage(vehicles)
    : NO_VERIFIED_VEHICLE_QUESTION;
  const diagnostics = {
    userId: cleanString(user.id),
    userName: cleanString(user.name),
    employeeId,
    driverUserId,
    driverMapped: Boolean(employee),
    driverResolved: vehiclesAreSafelyVerified,
    identitySource: cleanString(match?.identity?.source || (employee ? "employees" : "auth_user")),
    dataSource: cleanString(match?.dataSource),
    vehiclesCountBeforeFilter: rawVehicles.length,
    vehiclesCountAfterFilter: vehicles.length,
    vehiclesVerified: vehiclesAreSafelyVerified,
    vehiclePickerAvailable: vehiclesAreSafelyVerified,
    vehicleLookupMode,
    vehicleListReturned: vehiclesAreSafelyVerified,
    unsafeVoiceVehicleCount,
    fallbackUsed: match?.fallbackUsed === true,
    mockData: match?.mockData === true,
    emptyReason
  };

  console.info("driver_reports.context_vehicle_lookup", diagnostics);

  return json({
    ok: true,
    module: MODULE_ID,
    currentModule,
    sessionId,
    status: match?.status || "none",
    errorCode: emptyReason,
    userName: cleanString(user.name),
    userResolved: true,
    employeeResolved: Boolean(employee),
    driverResolved: vehiclesAreSafelyVerified,
    vehiclesVerified: vehiclesAreSafelyVerified,
    vehiclePickerAvailable: vehiclesAreSafelyVerified,
    vehicleLookupMode,
    user: {
      id: cleanString(user.id),
      name: cleanString(user.name),
      employeeId
    },
    driver: {
      employeeId,
      displayName: driverName,
      source: diagnostics.identitySource
    },
    vehicles,
    vehiclesCount: vehicles.length,
    permissions,
    fallbackQuestion,
    loadingMessage: VEHICLE_CONTEXT_LOADING_MESSAGE,
    pickerFallbackQuestion: PICKER_FAILED_QUESTION,
    message: messageForAssistant,
    messageForAssistant,
    diagnostics,
    apiStatus: "ready"
  });
}
