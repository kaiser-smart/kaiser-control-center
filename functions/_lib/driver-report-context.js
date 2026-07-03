import { getUsers, normalizeIdentifier } from "./auth.js";
import { canCreateDriverPartRequest } from "./driver-part-requests-store.js";
import { listEmployeeCards } from "./employees-store.js";
import {
  fleetPayloadUsesMockData,
  fleetVehicleVoiceLabel,
  resolveFleetVehiclesForDriver
} from "./fleet-vehicles-store.js";
import { hasPermission } from "../../src/permissions.js";

export const DRIVER_REPORT_MODULE_ID = "hlaseni-ridicu";
export const DRIVER_REPORT_MODULE_KEY = "driver-reports";
export const DRIVER_REPORT_CONTEXT_LOADING_MESSAGE = "Rozumím. Podívám se do Smart systému.";
export const DRIVER_REPORT_PICKER_MESSAGE = "Otevřu ti výběr v aplikaci.";
export const DRIVER_REPORT_PICKER_OR_MANUAL_QUESTION = "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.";
export const DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
export const DRIVER_REPORT_NO_VERIFIED_ASSIGNED_VEHICLES_REASON = "NO_VERIFIED_ASSIGNED_VEHICLES";
export const DRIVER_REPORT_PICKER_FAILED_QUESTION = "Výběr se mi nepodařilo otevřít. Řekni mi prosím značku, typ nebo SPZ vozidla.";
export const DRIVER_REPORT_LOAD_FAILED_QUESTION = "Vozidlo se mi teď nepodařilo ověřit. Otevřu ti výběr v aplikaci.";

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

function compactRepeatedPhrase(value = "") {
  const text = cleanString(value).replace(/\s+/g, " ");
  const words = text.split(" ").filter(Boolean);
  if (!words.length || words.length % 2 !== 0) {
    return text;
  }

  const half = words.length / 2;
  const left = words.slice(0, half).join(" ");
  const right = words.slice(half).join(" ");
  return sameValue(left, right) ? left : text;
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
    displayName: compactRepeatedPhrase(cleanString(displayName) || fleetVehicleVoiceLabel(vehicle)),
    spz,
    type: vehicleTypeLabel(vehicle),
    brand: cleanString(vehicle.brand),
    model: cleanString(vehicle.model || vehicle.internalNumber),
    internalName: cleanString(vehicle.internalNumber || vehicle.vehicleName || vehicle.name),
    licensePlate: spz,
    vinPresent: Boolean(vin),
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
    return DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION;
  }

  if (options.length === 1) {
    return `Mám bezpečně ověřené tvoje vozidlo ${options[0]}. Týká se závada tohohle vozidla?`;
  }

  return `Vidím u tebe ${joinCzechList(options)}. Kterého se závada týká?`;
}

export function driverReportContextErrorPayload(errorCode, message, status = 400, extra = {}) {
  return {
    status,
    payload: {
      ok: false,
      module: DRIVER_REPORT_MODULE_ID,
      userResolved: false,
      employeeResolved: false,
      driverResolved: false,
      vehiclesVerified: false,
      vehicles: [],
      vehiclesCount: 0,
      vehicleLookupMode: "picker_or_manual",
      errorCode,
      reason: errorCode,
      message,
      assistantMessage: message,
      messageForAssistant: message,
      answerText: message,
      fallbackQuestion: DRIVER_REPORT_LOAD_FAILED_QUESTION,
      apiStatus: status >= 500 ? "waiting" : "ready",
      ...extra
    }
  };
}

export function driverReportNoVerifiedVehiclePayload(errorCode, extra = {}) {
  return {
    status: 200,
    payload: {
      ok: false,
      module: DRIVER_REPORT_MODULE_ID,
      currentModule: DRIVER_REPORT_MODULE_ID,
      userResolved: false,
      employeeResolved: false,
      driverResolved: false,
      vehiclesVerified: false,
      vehiclePickerAvailable: false,
      vehicles: [],
      vehiclesCount: 0,
      vehicleLookupMode: "picker_or_manual",
      errorCode,
      reason: DRIVER_REPORT_NO_VERIFIED_ASSIGNED_VEHICLES_REASON,
      message: DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION,
      assistantMessage: DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION,
      messageForAssistant: DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION,
      answerText: DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION,
      fallbackQuestion: DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION,
      loadingMessage: DRIVER_REPORT_CONTEXT_LOADING_MESSAGE,
      pickerFallbackQuestion: DRIVER_REPORT_PICKER_FAILED_QUESTION,
      apiStatus: "ready",
      ...extra
    }
  };
}

export async function driverReportContextForUser(env, user, options = {}) {
  if (!user) {
    return driverReportContextErrorPayload("UNAUTHENTICATED", "Nejsi přihlášený.", 401);
  }

  const permissions = {
    canViewDriverReports: hasPermission(user, DRIVER_REPORT_MODULE_KEY, "view"),
    canCreateDriverReport: canCreateDriverPartRequest(user),
    canViewFleet: hasPermission(user, "fleet", "view")
  };

  if (!permissions.canViewDriverReports || !permissions.canCreateDriverReport || !permissions.canViewFleet) {
    return driverReportContextErrorPayload("FORBIDDEN", "K tomu nemáš oprávnění.", 403, { permissions });
  }

  const transcriptIntent = cleanString(options.transcriptIntent || options.intent);
  const sessionId = cleanString(options.sessionId || options.conversationId);
  const currentModule = cleanString(options.currentModule) || DRIVER_REPORT_MODULE_ID;
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
      verifiedDriverNameAssignment: Boolean(employee),
      transcriptIntent,
      currentModule
    });
  } catch (error) {
    console.error("driver_reports.context_vehicle_lookup_failed", { message: cleanString(error?.message) });
    return driverReportContextErrorPayload("VEHICLES_UNAVAILABLE", "Vozidla se mi teď nepodařilo načíst.", 500);
  }

  if (match?.status === "failed") {
    return driverReportContextErrorPayload("VEHICLES_UNAVAILABLE", "Vozidla se mi teď nepodařilo načíst.", 500);
  }

  const rawVehicles = vehicleContextItems(match);
  const safeVoiceVehicles = rawVehicles.filter(isSafeVoiceVehicle);
  const unsafeVoiceVehicleCount = rawVehicles.length - safeVoiceVehicles.length;
  const vehiclesAreSafelyVerified = Boolean(
    employee &&
    safeVoiceVehicles.length > 0 &&
    match?.fallbackUsed !== true &&
    match?.mockData !== true &&
    match?.status !== "failed"
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

  const vehicles = vehiclesAreSafelyVerified ? safeVoiceVehicles : [];
  const emptyReason = vehiclesAreSafelyVerified
    ? ""
    : employee ? "NO_DRIVER_VEHICLES" : "DRIVER_NOT_MAPPED";
  const reason = vehiclesAreSafelyVerified
    ? ""
    : DRIVER_REPORT_NO_VERIFIED_ASSIGNED_VEHICLES_REASON;
  const fallbackQuestion = vehiclesAreSafelyVerified
    ? DRIVER_REPORT_PICKER_OR_MANUAL_QUESTION
    : DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION;
  const vehicleLookupMode = vehiclesAreSafelyVerified
    ? "verified_vehicle_list"
    : "picker_or_manual";
  const messageForAssistant = vehiclesAreSafelyVerified
    ? vehicleListMessage(vehicles)
    : DRIVER_REPORT_NO_VERIFIED_VEHICLE_QUESTION;
  const assistantMessage = messageForAssistant;
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

  return {
    status: 200,
    payload: {
      ok: true,
      module: DRIVER_REPORT_MODULE_ID,
      currentModule,
      sessionId,
      status: match?.status || "none",
      errorCode: emptyReason,
      reason,
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
      loadingMessage: DRIVER_REPORT_CONTEXT_LOADING_MESSAGE,
      pickerFallbackQuestion: DRIVER_REPORT_PICKER_FAILED_QUESTION,
      message: messageForAssistant,
      assistantMessage,
      messageForAssistant,
      answerText: assistantMessage,
      diagnostics,
      apiStatus: "ready"
    }
  };
}
