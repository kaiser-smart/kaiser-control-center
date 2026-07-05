import { getFleetVehicleWithAssignment } from "./fleet-vehicles-store.js";
import { hasPermission, isFullAccessRole, normalizeRole } from "../../src/permissions.js";

const DB_BINDING = "SMART_ODPADY_DB";
export const PARTSLINK24_WORKFLOW_URL = "https://github.com/kaiser-smart/kaiser-control-center/actions/workflows/partslink24-vin-pilot.yml";
const RECENT_REQUEST_WINDOW_MS = 3 * 60 * 1000;
const PASSENGER_VEHICLE_KINDS = new Set([
  "osobni",
  "osobni_auto",
  "osobni_automobil",
  "osobni_vozidlo",
  "osobak",
  "oa",
  "m1",
  "passenger",
  "passenger_car",
  "car"
]);
const PASSENGER_MODEL_MARKERS = [
  /\bmercedes\s+cls\b/i,
  /\bmercedes\s+eqs\b/i,
  /\bmercedes\s+eqe\b/i,
  /\bmercedes\s+eqa\b/i,
  /\bmercedes\s+eqb\b/i,
  /\bmercedes\s+eqc\b/i,
  /\bmercedes\s+glc\b/i,
  /\bmercedes\s+gle\b/i,
  /\bmercedes\s+cla\b/i,
  /\bmercedes\s+gla\b/i,
  /\bmercedes\s+glb\b/i
];

export class Partslink24SearchStoreError extends Error {
  constructor(message, status = 400, code = "partslink24_search_error", details = null) {
    super(message);
    this.name = "Partslink24SearchStoreError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new Partslink24SearchStoreError(
      "Audit partslink24 není nastavený. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "partslink24_database_missing"
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

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (/no such table|driver_report_partslink24_searches/i.test(message)) {
    return new Partslink24SearchStoreError(
      "Audit partslink24 není v D1 připravený. Spusťte migraci 0026_create_partslink24_search_audit.sql.",
      503,
      "partslink24_search_audit_migration_missing"
    );
  }

  console.error("partslink24.search_store_failed", { message });
  return new Partslink24SearchStoreError(
    "Vyhledání přes partslink24 se teď nepodařilo připravit.",
    500,
    "partslink24_search_store_failed"
  );
}

export function maskPartslink24Vin(value) {
  const vin = cleanString(value).replace(/\s+/g, "").toUpperCase();
  if (!vin) {
    return "";
  }
  if (vin.length <= 7) {
    return "*".repeat(vin.length);
  }
  return `${vin.slice(0, 3)}${"*".repeat(Math.max(4, vin.length - 7))}${vin.slice(-4)}`;
}

export function normalizePartslink24VehicleKind(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isPartslink24PassengerVehicle(value) {
  return PASSENGER_VEHICLE_KINDS.has(normalizePartslink24VehicleKind(value));
}

function vehicleKindCandidates(vehicle = {}) {
  return [
    vehicle.vehicleKind,
    vehicle.vehicleType,
    vehicle.bodyType,
    vehicle.vistosVehicleCategory,
    vehicle.category,
    vehicle.type
  ].map(cleanString).filter(Boolean);
}

function inferredPassengerVehicleKind(vehicle = {}) {
  const text = [
    vehicle.internalNumber,
    vehicle.vehicleName,
    vehicle.name,
    vehicle.model,
    vehicle.description
  ].map(cleanString).filter(Boolean).join(" ");

  if (!text) {
    return "";
  }

  return PASSENGER_MODEL_MARKERS.some((pattern) => pattern.test(text)) ? "osobni" : "";
}

export function partslink24VehicleKind(vehicle = {}) {
  const direct = vehicleKindCandidates(vehicle).find(isPartslink24PassengerVehicle);
  if (direct) {
    return normalizePartslink24VehicleKind(direct);
  }

  const firstCandidate = vehicleKindCandidates(vehicle)[0];
  if (firstCandidate) {
    return normalizePartslink24VehicleKind(firstCandidate);
  }

  return inferredPassengerVehicleKind(vehicle);
}

export function canUsePartslink24VinSearch(user) {
  return Boolean(
    isFullAccessRole(user) ||
    hasPermission(user, "driver-reports", "parts-search") ||
    hasPermission(user, "driver-reports", "manage") ||
    hasPermission(user, "driver-reports", "edit")
  );
}

export function partslink24PermissionSummary(user) {
  return {
    role: normalizeRole(user?.role),
    canSearchPartslink24: canUsePartslink24VinSearch(user)
  };
}

export function partslink24SearchApiStatus(env) {
  return database(env) ? "ready" : "waiting";
}

function workflowInputs({ vin, vehicleId, requestId }) {
  return {
    vin: cleanString(vin).replace(/\s+/g, "").toUpperCase(),
    vehicle_id: cleanString(vehicleId),
    vehicle_kind: "osobni",
    request_id: cleanString(requestId),
    dry_run: false,
    allow_live_login: true
  };
}

function workflowInputsForAudit(inputs = {}) {
  return {
    ...inputs,
    vin: maskPartslink24Vin(inputs.vin)
  };
}

function rowToPartslink24Search(row = {}) {
  return {
    id: cleanString(row.id),
    requestId: cleanString(row.request_id),
    vehicleId: cleanString(row.vehicle_id),
    vehicleName: cleanString(row.vehicle_name),
    licensePlate: cleanString(row.license_plate),
    vinMasked: cleanString(row.vin_masked),
    vehicleKind: cleanString(row.vehicle_kind),
    status: cleanString(row.status),
    errorCode: cleanString(row.error_code),
    message: cleanString(row.message),
    workflowUrl: cleanString(row.workflow_url),
    workflowInputs: parseJson(row.workflow_inputs_json, {}),
    result: parseJson(row.result_json, null),
    runnerKind: cleanString(row.runner_kind || "github_actions_manual"),
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

export async function latestPartslink24VinSearchForRequest(env, requestId) {
  const db = database(env);
  const cleanRequestId = cleanString(requestId);
  if (!db || !cleanRequestId) {
    return null;
  }

  try {
    const row = await db
      .prepare(`
        SELECT *
        FROM driver_report_partslink24_searches
        WHERE request_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(cleanRequestId)
      .first();
    return row ? rowToPartslink24Search(row) : null;
  } catch (error) {
    if (/no such table|driver_report_partslink24_searches/i.test(cleanString(error?.message))) {
      return null;
    }
    throw dbError(error);
  }
}

export async function resolvePartslink24VehicleForRequest(env, requestItem = {}, user = null, payload = {}) {
  const vehicleRef = cleanString(
    payload.vehicleId ||
    payload.vehicle_id ||
    requestItem.vehicleId ||
    requestItem.licensePlate
  );

  if (!vehicleRef) {
    return { vehicle: null, errorCode: "PARTSLINK24_VEHICLE_REQUIRED" };
  }

  try {
    const result = await getFleetVehicleWithAssignment(env, vehicleRef, user);
    return { vehicle: result.vehicle || null, errorCode: "" };
  } catch (error) {
    console.info("partslink24.vehicle_lookup_failed", {
      requestId: cleanString(requestItem.id),
      vehicleRef,
      message: cleanString(error?.message)
    });
    return { vehicle: null, errorCode: cleanString(error?.code || "PARTSLINK24_VEHICLE_NOT_FOUND") };
  }
}

export function partslink24EligibilityForVehicle(user, vehicle = null) {
  const canSearch = canUsePartslink24VinSearch(user);
  const vin = cleanString(vehicle?.vin);
  const kind = partslink24VehicleKind(vehicle || {});
  const isPassenger = isPartslink24PassengerVehicle(kind);

  if (!canSearch) {
    return {
      canSearchPartslink24: false,
      allowed: false,
      vehicleKind: kind,
      vinMasked: maskPartslink24Vin(vin),
      errorCode: "PARTSLINK24_FORBIDDEN",
      message: "K vyhledání náhradních dílů nemáš oprávnění."
    };
  }

  if (!vehicle) {
    return {
      canSearchPartslink24: true,
      allowed: false,
      vehicleKind: "",
      vinMasked: "",
      errorCode: "PARTSLINK24_VEHICLE_NOT_FOUND",
      message: "Vozidlo se nepodařilo ověřit ve Vozovém parku."
    };
  }

  if (!vin) {
    return {
      canSearchPartslink24: true,
      allowed: false,
      vehicleKind: kind,
      vinMasked: "",
      errorCode: "PARTSLINK24_VIN_MISSING",
      message: "U vozidla není uložené VIN. Doplň VIN ve Vozovém parku."
    };
  }

  if (!isPassenger) {
    return {
      canSearchPartslink24: true,
      allowed: false,
      vehicleKind: kind || "neznamy",
      vinMasked: maskPartslink24Vin(vin),
      errorCode: "PARTSLINK24_ONLY_PASSENGER_VEHICLES",
      message: "partslink24 pilot je teď povolený jen pro osobní vozidla. Nákladní vozidla jsou mimo tento pilot."
    };
  }

  return {
    canSearchPartslink24: true,
    allowed: true,
    vehicleKind: "osobni",
    vinMasked: maskPartslink24Vin(vin),
    errorCode: "",
    message: "Osobní vozidlo má VIN a může jít do read-only pilotu partslink24."
  };
}

export async function partslink24EligibilityForDriverPartRequest(env, user, requestItem = {}) {
  const { vehicle } = await resolvePartslink24VehicleForRequest(env, requestItem, user);
  return partslink24EligibilityForVehicle(user, vehicle);
}

async function recentPartslink24Search(db, { requestId, vehicleId, vinMasked }) {
  const since = new Date(Date.now() - RECENT_REQUEST_WINDOW_MS).toISOString();
  const row = await db
    .prepare(`
      SELECT *
      FROM driver_report_partslink24_searches
      WHERE request_id = ?
        AND vehicle_id = ?
        AND vin_masked = ?
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(requestId, vehicleId, vinMasked, since)
    .first();
  return row ? rowToPartslink24Search(row) : null;
}

export async function createPartslink24VinSearchAudit(env, user, {
  requestItem = {},
  vehicle = null,
  eligibility = null
} = {}) {
  if (!canUsePartslink24VinSearch(user)) {
    throw new Partslink24SearchStoreError(
      "K vyhledání náhradních dílů nemáš oprávnění.",
      403,
      "partslink24_search_forbidden"
    );
  }

  const db = database(env, true);
  const resolvedEligibility = eligibility || partslink24EligibilityForVehicle(user, vehicle);
  if (!resolvedEligibility.allowed) {
    throw new Partslink24SearchStoreError(
      resolvedEligibility.message,
      resolvedEligibility.errorCode === "PARTSLINK24_ONLY_PASSENGER_VEHICLES" ? 400 : 409,
      resolvedEligibility.errorCode,
      resolvedEligibility
    );
  }

  const vin = cleanString(vehicle?.vin).replace(/\s+/g, "").toUpperCase();
  const vinMasked = maskPartslink24Vin(vin);
  const requestId = cleanString(requestItem.id || requestItem.reportId);
  const vehicleId = cleanString(vehicle?.id || vehicle?.vehicleId || requestItem.vehicleId);
  const inputs = workflowInputs({ vin, vehicleId, requestId });
  const message = "Read-only pilot je auditovaný v KSO. Pokračování probíhá ručním spuštěním GitHub Actions workflow partslink24 VIN pilot; nic se neobjednává.";
  const now = new Date().toISOString();

  try {
    const recent = await recentPartslink24Search(db, { requestId, vehicleId, vinMasked });
    if (recent) {
      return {
        audit: recent,
        reusedRecent: true,
        workflow: {
          url: PARTSLINK24_WORKFLOW_URL,
          inputs
        }
      };
    }

    const id = randomId("partslink24-search");
    await db
      .prepare(`
        INSERT INTO driver_report_partslink24_searches (
          id,
          request_id,
          vehicle_id,
          vehicle_name,
          license_plate,
          vin_masked,
          vehicle_kind,
          status,
          error_code,
          message,
          workflow_url,
          workflow_inputs_json,
          result_json,
          runner_kind,
          created_by_user_id,
          created_by_name,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        nullableString(requestId),
        nullableString(vehicleId),
        nullableString(vehicle?.internalNumber || vehicle?.model || requestItem.vehicleName),
        nullableString(vehicle?.licensePlate || vehicle?.tcarsLicensePlate || requestItem.licensePlate),
        vinMasked,
        "osobni",
        "manual_dispatch_required",
        null,
        message,
        PARTSLINK24_WORKFLOW_URL,
        safeJson(workflowInputsForAudit(inputs)),
        null,
        "github_actions_manual",
        nullableString(user?.id),
        nullableString(user?.name),
        now,
        now
      )
      .run();

    return {
      audit: await latestPartslink24VinSearchForRequest(env, requestId) || {
        id,
        requestId,
        vehicleId,
        vehicleName: cleanString(vehicle?.internalNumber || vehicle?.model || requestItem.vehicleName),
        licensePlate: cleanString(vehicle?.licensePlate || vehicle?.tcarsLicensePlate || requestItem.licensePlate),
        vinMasked,
        vehicleKind: "osobni",
        status: "manual_dispatch_required",
        errorCode: "",
        message,
        workflowUrl: PARTSLINK24_WORKFLOW_URL,
        workflowInputs: workflowInputsForAudit(inputs),
        result: null,
        runnerKind: "github_actions_manual",
        createdByUserId: cleanString(user?.id),
        createdByName: cleanString(user?.name),
        createdAt: now,
        updatedAt: now
      },
      reusedRecent: false,
      workflow: {
        url: PARTSLINK24_WORKFLOW_URL,
        inputs
      }
    };
  } catch (error) {
    if (error instanceof Partslink24SearchStoreError) {
      throw error;
    }
    throw dbError(error);
  }
}
