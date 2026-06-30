import { getUsers, normalizeIdentifier } from "./auth.js";
import { loadFleetVehiclesPayload as loadTcarsFleetVehiclesPayload } from "./tcars-client.js";
import { createFleetVistosVehiclePreview } from "./fleet-vistos-vehicle-preview.js";
import { hasPermission, isUserActive, normalizeRole } from "../../src/permissions.js";

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

export async function loadFleetVehiclesWithAssignments(env = {}) {
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
  const vehicles = (Array.isArray(basePayload?.vehicles) ? basePayload.vehicles : [])
    .map((vehicle) => mergeAssignment(vehicle, assignmentForVehicle(vehicle, assignments)));

  return {
    ...basePayload,
    vehicles,
    summary: summaryWithAssignments(basePayload?.summary, vehicles),
    assignmentApiStatus,
    assignmentMessage,
    message: [
      cleanString(basePayload?.message),
      assignmentMessage
    ].filter(Boolean).join(" ")
  };
}

export async function getFleetVehicleWithAssignment(env = {}, vehicleId = "") {
  const payload = await loadFleetVehiclesWithAssignments(env);
  const vehicle = payload.vehicles.find((item) => vehicleMatchesId(item, vehicleId)) || null;

  if (!vehicle) {
    throw new FleetVehiclesStoreError("Vozidlo nebylo nalezeno.", 404, "fleet_vehicle_not_found");
  }

  return {
    ...payload,
    vehicle
  };
}

function driverCandidateFromPayload(payload, users = []) {
  const driverId = cleanString(payload.assignedDriverId || payload.driverUserId || payload.userId);
  const driverName = cleanString(payload.assignedDriverName || payload.driverName || payload.name);

  if (driverId) {
    const byId = users.find((user) => cleanString(user.id) === driverId);
    if (byId) {
      return byId;
    }
  }

  if (driverName) {
    const normalized = normalizedDriverName(driverName);
    return users.find((user) => normalizedDriverName(user.name) === normalized) || null;
  }

  return null;
}

function normalizeAssignmentInput(payload = {}, users = []) {
  const driver = driverCandidateFromPayload(payload, users);
  const assignedDriverId = cleanString(payload.assignedDriverId || payload.driverUserId || payload.userId || driver?.id);
  const assignedDriverName = cleanString(driver?.name || payload.assignedDriverName || payload.driverName || payload.name);
  const assignedDriverPhone = cleanString(driver?.phone || payload.assignedDriverPhone || payload.driverPhone || payload.phone);
  const assignedDriverEmail = cleanString(driver?.email || payload.assignedDriverEmail || payload.driverEmail || payload.email);

  return {
    assignedDriverId,
    assignedDriverName,
    assignedDriverPhone,
    assignedDriverEmail,
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
  const vehiclePayload = await getFleetVehicleWithAssignment(env, vehicleId);
  const vehicle = vehiclePayload.vehicle;
  const users = await getUsers(env);
  const assignment = normalizeAssignmentInput(payload, users);
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

    return getFleetVehicleWithAssignment(env, primaryVehicleId);
  } catch (error) {
    throw fleetStoreError(error);
  }
}

function vehicleTypeForHumanTouch(vehicle = {}) {
  const source = normalizeKey([
    vehicle.vehicleType,
    vehicle.bodyType,
    vehicle.model,
    vehicle.internalNumber,
    vehicle.source
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

function canUseFleetForVoice(user) {
  return isUserActive(user)
    && hasPermission(user, "fleet", "view");
}

export async function resolveFleetVehicleForDriver(env, user, payload = {}) {
  if (!canUseFleetForVoice(user)) {
    return null;
  }

  const driverUserId = cleanString(payload.driverUserId || payload.userId || user?.id);
  const driverPhone = normalizeIdentifier(payload.driverPhone || payload.phone || user?.phone);
  const driverName = normalizedDriverName(payload.driverName || payload.name || user?.name);

  try {
    const fleet = await loadFleetVehiclesWithAssignments(env);
    const vehicles = Array.isArray(fleet.vehicles) ? fleet.vehicles : [];

    if (driverUserId) {
      const byUserId = vehicles.find((vehicle) => cleanString(vehicle.assignedDriverId) === driverUserId);
      if (byUserId) {
        return {
          ...byUserId,
          driverVehicleMatchConfidence: "assigned_driver_id",
          driverVehicleSource: "fleet_vehicle_assignments"
        };
      }
    }

    if (driverPhone) {
      const phoneMatches = vehicles.filter((vehicle) => normalizeIdentifier(vehicle.assignedDriverPhone) === driverPhone);
      if (phoneMatches.length === 1) {
        return {
          ...phoneMatches[0],
          driverVehicleMatchConfidence: "assigned_driver_phone",
          driverVehicleSource: "fleet_vehicle_assignments"
        };
      }
    }

    if (driverName) {
      const nameMatches = vehicles.filter((vehicle) => normalizedDriverName(vehicle.assignedDriverName) === driverName);
      if (nameMatches.length === 1) {
        return {
          ...nameMatches[0],
          driverVehicleMatchConfidence: "assigned_driver_name",
          driverVehicleSource: "fleet_vehicle_assignments"
        };
      }
    }
  } catch (error) {
    console.info("fleet_vehicles.driver_vehicle_lookup_skipped", { message: safeErrorMessage(error) });
  }

  return null;
}

function truncateDynamicVariable(value, max = 260) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

export async function driverReportVehicleDynamicVariables(env, user) {
  const vehicle = await resolveFleetVehicleForDriver(env, user);
  const vehicleName = cleanString(vehicle?.internalNumber || vehicle?.model || vehicle?.vehicleName || vehicle?.licensePlate);
  const licensePlate = cleanString(vehicle?.licensePlate || vehicle?.tcarsLicensePlate);
  const vin = cleanString(vehicle?.vin);
  const vehicleType = vehicleTypeForHumanTouch(vehicle);
  const firstName = cleanString(user?.name).split(/\s+/).filter(Boolean)[0] || "řidiči";

  if (!vehicle || !licensePlate) {
    return {
      driver_report_vehicle_status: "nenalezeno",
      driver_report_vehicle_id: "",
      driver_report_vehicle_name: "",
      driver_report_vehicle_license_plate: "",
      driver_report_vehicle_vin: "",
      driver_report_vehicle_type: "",
      driver_report_vehicle_context: "V Hlášení řidičů není vozidlo podle volajícího jistě identifikované. Neodlehčuj a zeptej se: Řekni mi prosím SPZ vozidla."
    };
  }

  return {
    driver_report_vehicle_status: "nalezeno",
    driver_report_vehicle_id: truncateDynamicVariable(vehicle.id || vehicle.vehicleId, 140),
    driver_report_vehicle_name: truncateDynamicVariable(vehicleName, 160),
    driver_report_vehicle_license_plate: truncateDynamicVariable(licensePlate, 80),
    driver_report_vehicle_vin: truncateDynamicVariable(vin, 120),
    driver_report_vehicle_type: truncateDynamicVariable(vehicleType, 80),
    driver_report_vehicle_context: truncateDynamicVariable(
      `${firstName}: při hovoru v Hlášení řidičů máš ověřené přiřazené ${vehicleType}, SPZ ${licensePlate}${vin ? `, VIN ${vin}` : ""}. Můžeš říct krátce, že auto máš načtené. Firemní odlehčení použij jen u klidného neurgentního hlášení a maximálně jednou.`,
      420
    )
  };
}

export function fleetVehicleCanEditDriver(user) {
  return hasPermission(user, "fleet", "edit") || ["admin", "management", "garazmistr"].includes(normalizeRole(user?.role));
}
