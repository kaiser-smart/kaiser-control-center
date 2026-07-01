import { getUsers } from "./auth.js";
import {
  loadFleetVehiclesWithAssignments,
  resolveFleetVehiclesForDriver,
  validateFleetLicensePlate
} from "./fleet-vehicles-store.js";
import {
  extractLicensePlate,
  identifyProbablePartFromDescription,
  driverPartRequestInitialStatus,
  licensePlateKey,
  normalizeLicensePlate,
  normalizePartVerificationStatus,
  normalizeVehicleBrand,
  partSideLabel,
  vehicleBrandLabel
} from "./driver-parts-catalog.js";
import { verifyMercedesPartForRequest } from "./mercedes-parts-provider.js";
import {
  canUsePartslink24VinSearch,
  latestPartslink24VinSearchForRequest,
  partslink24EligibilityForDriverPartRequest
} from "./partslink24-search-store.js";
import {
  sendDriverPartOrderNotification,
  sendDriverPartReadySms,
  sendDriverPartServiceTechSms
} from "./notification-service.js";
import { hasPermission, isFullAccessRole, normalizeRole } from "../../src/permissions.js";

const DB_BINDING = "SMART_ODPADY_DB";
const STATUSES = new Set([
  "new_report",
  "waiting_part_identification",
  "part_identified",
  "handed_to_ordering",
  "ordered",
  "part_arrived",
  "service_scheduled",
  "completed",
  "canceled"
]);
const NOTIFICATION_DONE_STATUSES = new Set(["sent"]);

export const DRIVER_PART_REQUEST_STATUS_LABELS = {
  new_report: "Nové hlášení",
  waiting_part_identification: "Čeká na identifikaci dílu",
  part_identified: "Díl identifikován",
  handed_to_ordering: "Předáno k objednání",
  ordered: "Objednáno",
  part_arrived: "Díl dorazil",
  service_scheduled: "Servis naplánován",
  completed: "Vyřízeno",
  canceled: "Zrušeno"
};

export class DriverPartRequestsStoreError extends Error {
  constructor(message, status = 400, code = "driver_part_requests_error", details = null) {
    super(message);
    this.name = "DriverPartRequestsStoreError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) {
    throw new DriverPartRequestsStoreError(
      "Databáze hlášení řidičů není nastavená. Přidejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "driver_part_requests_database_missing"
    );
  }
  return db;
}

export function driverPartRequestsApiStatus(env) {
  return database(env) ? "ready" : "waiting";
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

function reportId(now = new Date()) {
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ND-${ymd}-${suffix}`;
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

function normalizeStatus(value, fallback = "new_report") {
  const status = cleanString(value);
  return STATUSES.has(status) ? status : fallback;
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (/no such table|driver_part_requests/i.test(message)) {
    return new DriverPartRequestsStoreError(
      "Tabulky workflow náhradních dílů nejsou v D1 připravené. Spusťte migraci 0023_create_driver_part_requests.sql.",
      503,
      "driver_part_requests_migration_missing"
    );
  }

  if (/no such column|oe_part_number|part_verification_status|parts_provider|price_boost/i.test(message)) {
    return new DriverPartRequestsStoreError(
      "Pole pro Mercedes ověření dílu nejsou v D1 připravená. Spusťte migraci 0025_add_mercedes_parts_lookup_fields.sql.",
      503,
      "driver_part_mercedes_migration_missing"
    );
  }

  console.error("driver_part_requests.store_failed", { message });
  return new DriverPartRequestsStoreError(
    "Hlášení řidičů se teď nepodařilo načíst nebo uložit.",
    500,
    "driver_part_requests_store_failed"
  );
}

function normalizePartVerificationSource(value, fallback = "") {
  const source = cleanString(value).toLowerCase();
  if (["daimler", "manual", "internal", "tecdoc"].includes(source)) {
    return source;
  }
  return fallback;
}

export function canManageDriverPartRequests(user) {
  return (
    isFullAccessRole(user) ||
    hasPermission(user, "driver-reports", "manage") ||
    hasPermission(user, "driver-reports", "edit")
  );
}

export function canCreateDriverPartRequest(user) {
  return hasPermission(user, "driver-reports", "create");
}

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function truthyFlag(value) {
  const normalized = cleanString(value).toLowerCase();
  return value === true || ["true", "1", "on", "yes", "ano"].includes(normalized);
}

function licensePlateValidationDetails(validation = null) {
  return {
    normalized: cleanString(validation?.normalized),
    suggestions: Array.isArray(validation?.suggestions) ? validation.suggestions.slice(0, 5) : []
  };
}

function normalizedSearch(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rowToEvent(row) {
  return {
    id: cleanString(row?.id),
    requestId: cleanString(row?.request_id),
    action: cleanString(row?.action),
    actorUserId: cleanString(row?.actor_user_id),
    actorName: cleanString(row?.actor_name),
    createdAt: cleanString(row?.created_at),
    before: parseJson(row?.before_json),
    after: parseJson(row?.after_json),
    note: cleanString(row?.note),
    notificationChannel: cleanString(row?.notification_channel),
    notificationRecipient: cleanString(row?.notification_recipient),
    notificationStatus: cleanString(row?.notification_status),
    notificationError: cleanString(row?.notification_error)
  };
}

function rowToRequest(row, events = []) {
  const status = normalizeStatus(row?.status);
  const source = cleanString(row?.source || "manual");
  const licensePlateVerified = !source.includes("unverified_plate");
  const manualVehicleReview = driverPartRequestSourceHasManualVehicleReview(source);
  return {
    id: cleanString(row?.id),
    reportId: cleanString(row?.report_id),
    reportedAt: cleanString(row?.reported_at),
    driverUserId: cleanString(row?.driver_user_id),
    driverName: cleanString(row?.driver_name),
    driverPhone: cleanString(row?.driver_phone),
    vehicleId: cleanString(row?.vehicle_id),
    vehicleName: cleanString(row?.vehicle_name),
    licensePlate: cleanString(row?.license_plate),
    vin: cleanString(row?.vin),
    vehicleBrand: cleanString(row?.vehicle_brand || "jiné"),
    vehicleBrandLabel: vehicleBrandLabel(row?.vehicle_brand),
    defectType: cleanString(row?.defect_type),
    defectDescription: cleanString(row?.defect_description),
    damagePhotoStatus: cleanString(row?.damage_photo_status || "requested"),
    damagePhotoRequestedAt: cleanString(row?.damage_photo_requested_at),
    damagePhotoDocumentId: cleanString(row?.damage_photo_document_id),
    damagePhotoNote: cleanString(row?.damage_photo_note),
    probablePart: cleanString(row?.probable_part),
    probablePartSide: cleanString(row?.probable_part_side || "unknown"),
    probablePartSideLabel: partSideLabel(row?.probable_part_side),
    partIdentificationStatus: cleanString(row?.part_identification_status),
    verifiedPart: cleanString(row?.verified_part),
    partOrderNumber: cleanString(row?.part_order_number),
    oePartNumber: cleanString(row?.oe_part_number),
    partName: cleanString(row?.part_name),
    partVerificationStatus: normalizePartVerificationStatus(row?.part_verification_status || row?.part_identification_status),
    partVerificationSource: cleanString(row?.part_verification_source),
    partsProviderId: cleanString(row?.parts_provider_id),
    partsProviderStatus: cleanString(row?.parts_provider_status),
    partsProviderMessage: cleanString(row?.parts_provider_message),
    partsProviderError: cleanString(row?.parts_provider_error),
    partLookupQuery: cleanString(row?.part_lookup_query),
    partLookupResultJson: cleanString(row?.part_lookup_result_json),
    mercedesManualPortalUrl: cleanString(row?.mercedes_manual_portal_url),
    mercedesMyPartsHubUrl: cleanString(row?.mercedes_mypartshub_url),
    priceBoostStatus: cleanString(row?.price_boost_status || "not_requested"),
    priceBoostNote: cleanString(row?.price_boost_note),
    priceBoostCheckedAt: cleanString(row?.price_boost_checked_at),
    priceBoostResultJson: cleanString(row?.price_boost_result_json),
    status,
    statusLabel: DRIVER_PART_REQUEST_STATUS_LABELS[status] || "Neznámý stav",
    assignedToName: cleanString(row?.assigned_to_name),
    assignedToEmail: cleanString(row?.assigned_to_email),
    handedOffToPatrikAt: cleanString(row?.handed_off_to_patrik_at),
    kamilSmsSentAt: cleanString(row?.kamil_sms_sent_at),
    orderedAt: cleanString(row?.ordered_at),
    orderedByUserId: cleanString(row?.ordered_by_user_id),
    deliveredAt: cleanString(row?.delivered_at),
    deliveredByUserId: cleanString(row?.delivered_by_user_id),
    serviceDate: cleanString(row?.service_date),
    serviceTime: cleanString(row?.service_time),
    serviceTechnician: cleanString(row?.service_technician),
    serviceNote: cleanString(row?.service_note),
    driverSmsSentAt: cleanString(row?.driver_sms_sent_at),
    completedAt: cleanString(row?.completed_at),
    completedByUserId: cleanString(row?.completed_by_user_id),
    canceledAt: cleanString(row?.canceled_at),
    canceledByUserId: cleanString(row?.canceled_by_user_id),
    note: cleanString(row?.note),
    patrikEmailStatus: cleanString(row?.patrik_email_status || "not_sent"),
    patrikEmailError: cleanString(row?.patrik_email_error),
    kamilSmsStatus: cleanString(row?.kamil_sms_status || "not_sent"),
    kamilSmsRecipient: cleanString(row?.kamil_sms_recipient),
    kamilSmsError: cleanString(row?.kamil_sms_error),
    driverSmsStatus: cleanString(row?.driver_sms_status || "not_sent"),
    driverSmsError: cleanString(row?.driver_sms_error),
    source,
    manualVehicleReview,
    licensePlateVerified,
    licensePlateValidationStatus: manualVehicleReview
      ? "SPZ ověřena, vozidlo vyžaduje ruční kontrolu"
      : licensePlateVerified ? "SPZ ověřena" : "SPZ neověřena",
    createdByUserId: cleanString(row?.created_by_user_id),
    createdAt: cleanString(row?.created_at),
    updatedByUserId: cleanString(row?.updated_by_user_id),
    updatedAt: cleanString(row?.updated_at),
    events
  };
}

function matchContainsLicensePlate(match = {}, licensePlate = "") {
  const key = licensePlateKey(licensePlate);
  if (!key) {
    return false;
  }

  const vehicles = [
    match.vehicle,
    ...(Array.isArray(match.candidates) ? match.candidates : [])
  ].filter(Boolean);

  return vehicles.some((vehicle) => licensePlateKey(vehicle.licensePlate || vehicle.tcarsLicensePlate) === key);
}

export function driverPartRequestNeedsManualVehicleReview(assignedDriverMatch = {}, licensePlate = "", plateValidation = null) {
  return Boolean(
    licensePlate &&
    plateValidation?.exact === true &&
    !matchContainsLicensePlate(assignedDriverMatch, licensePlate)
  );
}

export function driverPartRequestSourceHasManualVehicleReview(source = "") {
  return cleanString(source).includes("manual_vehicle_review");
}

function eventStatement(db, { requestId, action, user, before, after, note, notification = null }) {
  return db
    .prepare(`
      INSERT INTO driver_part_request_events (
        id,
        request_id,
        action,
        actor_user_id,
        actor_name,
        created_at,
        before_json,
        after_json,
        note,
        notification_channel,
        notification_recipient,
        notification_status,
        notification_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      randomId("driver-part-event"),
      requestId,
      action,
      nullableString(user?.id),
      nullableString(user?.name),
      new Date().toISOString(),
      before ? safeJson(before) : null,
      after ? safeJson(after) : null,
      nullableString(note),
      nullableString(notification?.channel),
      nullableString(notification?.recipient),
      nullableString(notification?.status),
      nullableString(notification?.errorMessage)
    );
}

async function eventsForRequest(db, requestId) {
  const result = await db
    .prepare(`
      SELECT *
      FROM driver_part_request_events
      WHERE request_id = ?
      ORDER BY created_at DESC
    `)
    .bind(requestId)
    .all();
  return (result.results || []).map(rowToEvent);
}

async function requestRow(db, id) {
  return db
    .prepare("SELECT * FROM driver_part_requests WHERE id = ? OR report_id = ? LIMIT 1")
    .bind(id, id)
    .first();
}

async function requestForUser(env, id, user) {
  const db = database(env, true);
  const row = await requestRow(db, cleanString(id));
  if (!row) {
    throw new DriverPartRequestsStoreError("Požadavek na náhradní díl nebyl nalezen.", 404, "driver_part_request_not_found");
  }

  const item = rowToRequest(row);
  if (!canManageDriverPartRequests(user) && !sameId(item.driverUserId, user?.id)) {
    throw new DriverPartRequestsStoreError("K tomuto hlášení nemáte oprávnění.", 403, "driver_part_request_forbidden");
  }

  return { db, row, item };
}

async function resolveVehicleFromFleet(env, licensePlate) {
  const key = licensePlateKey(licensePlate);
  if (!key) {
    return null;
  }

  try {
    const payload = await loadFleetVehiclesWithAssignments(env);
    const vehicles = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
    return vehicles.find((vehicle) => licensePlateKey(vehicle.licensePlate || vehicle.tcarsLicensePlate) === key) || null;
  } catch (error) {
    console.info("driver_part_requests.vehicle_lookup_skipped", { message: cleanString(error?.message) });
    return null;
  }
}

function normalizeCreatePayload(payload, user, vehicle, driverContact = null) {
  const rawDescription = cleanString(payload.defectDescription || payload.description || payload.speechText);
  if (!rawDescription) {
    throw new DriverPartRequestsStoreError("Vyplňte popis závady od řidiče.", 400, "driver_part_description_required");
  }

  const licensePlate = normalizeLicensePlate(
    payload.licensePlate ||
    payload.spz ||
    vehicle?.licensePlate ||
    vehicle?.tcarsLicensePlate ||
    extractLicensePlate(rawDescription)
  );
  if (!licensePlate) {
    throw new DriverPartRequestsStoreError("Chybí SPZ vozidla. Nejdřív doplňte vozidlo/SPZ.", 400, "driver_part_license_plate_required");
  }

  const partMatch = identifyProbablePartFromDescription(rawDescription);
  const driverName = cleanString(payload.driverName || payload.driver || user?.name);
  if (!driverName) {
    throw new DriverPartRequestsStoreError("Chybí řidič hlášení.", 400, "driver_part_driver_required");
  }

  const vehicleName = cleanString(payload.vehicleName || vehicle?.internalNumber || vehicle?.model || licensePlate);
  const brand = normalizeVehicleBrand(payload.vehicleBrand || payload.brand || vehicle?.brand || vehicle?.model);

  return {
    reportedAt: cleanString(payload.reportedAt) || new Date().toISOString(),
    driverUserId: cleanString(payload.driverUserId || user?.id),
    driverName,
    driverPhone: cleanString(payload.driverPhone || payload.phone || driverContact?.phone || user?.phone),
    vehicleId: cleanString(payload.vehicleId || vehicle?.id || vehicle?.vehicleId || vehicle?.tcarsVehicleId),
    vehicleName,
    licensePlate,
    vin: cleanString(payload.vin || vehicle?.vin),
    vehicleBrand: brand,
    defectType: cleanString(payload.defectType || partMatch.defectType),
    defectDescription: rawDescription,
    damagePhotoStatus: cleanString(payload.damagePhotoStatus || "requested"),
    damagePhotoRequestedAt: cleanString(payload.damagePhotoRequestedAt || new Date().toISOString()),
    damagePhotoDocumentId: cleanString(payload.damagePhotoDocumentId),
    damagePhotoNote: cleanString(payload.damagePhotoNote || "Šarlota / systém požádal řidiče o fotku poškození."),
    probablePart: cleanString(payload.probablePart || partMatch.probablePart),
    probablePartSide: cleanString(payload.probablePartSide || partMatch.probablePartSide || "unknown"),
    partIdentificationStatus: cleanString(payload.partIdentificationStatus || partMatch.partIdentificationStatus),
    verifiedPart: cleanString(payload.verifiedPart),
    partOrderNumber: cleanString(payload.partOrderNumber),
    status: normalizeStatus(payload.status, driverPartRequestInitialStatus(partMatch)),
    note: cleanString(payload.note || partMatch.note),
    source: cleanString(payload.source || "manual")
  };
}

export async function listDriverPartRequests(env, user, options = {}) {
  const db = database(env, true);
  const canManage = canManageDriverPartRequests(user);
  const status = cleanString(options.status);
  const search = cleanString(options.search);
  const where = [];
  const binds = [];

  if (!canManage) {
    where.push("driver_user_id = ?");
    binds.push(cleanString(user?.id));
  }

  if (STATUSES.has(status)) {
    where.push("status = ?");
    binds.push(status);
  }

  if (search) {
    where.push(`(
      lower(report_id) LIKE lower(?)
      OR lower(driver_name) LIKE lower(?)
      OR lower(license_plate) LIKE lower(?)
      OR lower(defect_description) LIKE lower(?)
      OR lower(probable_part) LIKE lower(?)
      OR lower(verified_part) LIKE lower(?)
    )`);
    const pattern = `%${search}%`;
    binds.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM driver_part_requests
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY reported_at DESC, created_at DESC
        LIMIT 200
      `)
      .bind(...binds)
      .all();

    return (result.results || []).map((row) => rowToRequest(row));
  } catch (error) {
    throw dbError(error);
  }
}

export async function getDriverPartRequest(env, user, id) {
  try {
    const { db, item } = await requestForUser(env, id, user);
    const partslink24Eligibility = await partslink24EligibilityForDriverPartRequest(env, user, item);
    const partslink24VinSearch = await latestPartslink24VinSearchForRequest(env, item.id);
    return {
      ...item,
      events: await eventsForRequest(db, item.id),
      partslink24Eligibility,
      partslink24VinSearch
    };
  } catch (error) {
    if (error instanceof DriverPartRequestsStoreError) throw error;
    throw dbError(error);
  }
}

export async function createDriverPartRequest(env, user, payload = {}) {
  if (!canCreateDriverPartRequest(user) && !canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění vytvořit hlášení řidiče.", 403, "driver_part_create_forbidden");
  }

  const db = database(env, true);
  const rawDescription = cleanString(payload.defectDescription || payload.description || payload.speechText);
  const payloadLicensePlate = normalizeLicensePlate(
    payload.licensePlate ||
    payload.spz ||
    extractLicensePlate(rawDescription)
  );
  const assignedDriverMatch = await resolveFleetVehiclesForDriver(env, user, {
    ...payload,
    strictDriverAssignment: true
  });
  if (!payloadLicensePlate && assignedDriverMatch.status === "multiple") {
    throw new DriverPartRequestsStoreError(
      assignedDriverMatch.question || "Máš přiřazených více vozidel. Nejdřív vyber typ nebo značku vozidla.",
      400,
      "driver_vehicle_ambiguous"
    );
  }

  const assignedDriverVehicle = assignedDriverMatch.vehicle || null;
  const licensePlate = normalizeLicensePlate(
    payload.licensePlate ||
    payload.spz ||
    assignedDriverVehicle?.licensePlate ||
    assignedDriverVehicle?.tcarsLicensePlate ||
    extractLicensePlate(payload.defectDescription || payload.description || payload.speechText)
  );
  const wantsUnverifiedPlate = truthyFlag(payload.licensePlateUnverified || payload.licensePlateOverride);
  const licensePlateOverrideNote = cleanString(payload.licensePlateOverrideNote || payload.licensePlateExceptionNote);
  const canUseUnverifiedPlate = wantsUnverifiedPlate && canManageDriverPartRequests(user);

  if (wantsUnverifiedPlate && !canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError(
      "SPZ bez ověření může uložit jen oprávněná role.",
      403,
      "driver_part_license_plate_override_forbidden"
    );
  }

  if (wantsUnverifiedPlate && !licensePlateOverrideNote) {
    throw new DriverPartRequestsStoreError(
      "Pro uložení neověřené SPZ doplňte povinnou poznámku.",
      400,
      "driver_part_license_plate_override_note_required"
    );
  }

  let vehicle = assignedDriverVehicle;
  let plateValidation = null;

  if (licensePlate) {
    try {
      plateValidation = await validateFleetLicensePlate(env, licensePlate, user);
    } catch (error) {
      if (!canUseUnverifiedPlate) {
        throw new DriverPartRequestsStoreError(
          "SPZ se teď nepodařilo ověřit proti Vozovému parku. Zkuste to prosím znovu.",
          error?.status || 503,
          "driver_part_license_plate_lookup_failed"
        );
      }
    }

    if (plateValidation && !plateValidation.validFormat) {
      throw new DriverPartRequestsStoreError(
        "SPZ nemá platný formát. Zkontrolujte ji prosím.",
        400,
        "driver_part_license_plate_invalid_format",
        licensePlateValidationDetails(plateValidation)
      );
    }

    if (plateValidation && !plateValidation.exact && !canUseUnverifiedPlate) {
      throw new DriverPartRequestsStoreError(
        "Tahle SPZ není ve Vozovém parku. Zkontrolujte ji prosím.",
        400,
        "driver_part_license_plate_not_found",
        licensePlateValidationDetails(plateValidation)
      );
    }

    vehicle = plateValidation?.vehicle || vehicle;
  }

  const manualVehicleReview = driverPartRequestNeedsManualVehicleReview(assignedDriverMatch, licensePlate, plateValidation);

  const driverContact = await resolvePersonContact(env, {
    userIds: [payload.driverUserId, user?.id],
    nameIncludes: [payload.driverName, payload.driver, user?.name],
    fallbackName: cleanString(user?.name),
    fallbackEmail: cleanString(user?.email),
    fallbackPhone: cleanString(user?.phone)
  });
  const createPayload = canUseUnverifiedPlate
    ? {
        ...payload,
        note: [
          cleanString(payload.note),
          `SPZ neověřena: ${licensePlateOverrideNote}`
        ].filter(Boolean).join(" "),
        source: cleanString(payload.source) === "voice" ? "voice_unverified_plate" : "manual_unverified_plate"
      }
    : manualVehicleReview
      ? {
          ...payload,
          manualVehicleReview: true,
          note: [
            cleanString(payload.note),
            "SPZ existuje ve Vozovém parku, ale není přiřazená aktuálnímu řidiči. Vyžaduje ruční kontrolu dispečera."
          ].filter(Boolean).join(" "),
          source: cleanString(payload.source) === "voice" ? "voice_manual_vehicle_review" : "manual_vehicle_review"
        }
    : payload;
  const item = normalizeCreatePayload(createPayload, user, vehicle, driverContact);
  const id = randomId("driver-part-request");
  const now = new Date();
  const createdAt = now.toISOString();
  const cleanReportId = cleanString(payload.reportId) || reportId(now);

  try {
    const after = { id, reportId: cleanReportId, ...item, createdAt, updatedAt: createdAt };
    await db.batch([
      db
        .prepare(`
          INSERT INTO driver_part_requests (
            id,
            report_id,
            reported_at,
            driver_user_id,
            driver_name,
            driver_phone,
            vehicle_id,
            vehicle_name,
            license_plate,
            vin,
            vehicle_brand,
            defect_type,
            defect_description,
            damage_photo_status,
            damage_photo_requested_at,
            damage_photo_document_id,
            damage_photo_note,
            probable_part,
            probable_part_side,
            part_identification_status,
            verified_part,
            part_order_number,
            status,
            note,
            source,
            created_by_user_id,
            created_at,
            updated_by_user_id,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          cleanReportId,
          item.reportedAt,
          nullableString(item.driverUserId),
          item.driverName,
          nullableString(item.driverPhone),
          nullableString(item.vehicleId),
          nullableString(item.vehicleName),
          item.licensePlate,
          nullableString(item.vin),
          item.vehicleBrand,
          item.defectType,
          item.defectDescription,
          item.damagePhotoStatus,
          nullableString(item.damagePhotoRequestedAt),
          nullableString(item.damagePhotoDocumentId),
          nullableString(item.damagePhotoNote),
          nullableString(item.probablePart),
          item.probablePartSide,
          item.partIdentificationStatus,
          nullableString(item.verifiedPart),
          nullableString(item.partOrderNumber),
          item.status,
          nullableString(item.note),
          item.source,
          nullableString(user?.id),
          createdAt,
          nullableString(user?.id),
          createdAt
        ),
      eventStatement(db, {
        requestId: id,
        action: "create",
        user,
        before: null,
        after,
        note: "Vytvořeno v modulu Hlášení řidičů."
          + (canUseUnverifiedPlate ? " SPZ nebyla ověřena ve Vozovém parku." : "")
      })
    ]);

    return getDriverPartRequest(env, user, id);
  } catch (error) {
    if (error instanceof DriverPartRequestsStoreError) throw error;
    throw dbError(error);
  }
}

async function employeeContactRows(env) {
  const db = database(env);
  if (!db) {
    return [];
  }

  try {
    const result = await db
      .prepare(`
        SELECT id, user_id, first_name, last_name, email, phone
        FROM employee_cards
      `)
      .all();
    return result.results || [];
  } catch (error) {
    console.info("driver_part_requests.employee_contacts_skipped", { message: cleanString(error?.message) });
    return [];
  }
}

function contactFromSources(row, user) {
  const name = [row?.first_name, row?.last_name].map(cleanString).filter(Boolean).join(" ") || cleanString(user?.name);
  return {
    id: cleanString(row?.id || user?.id),
    userId: cleanString(row?.user_id || user?.id),
    name,
    email: cleanString(row?.email || user?.email),
    phone: cleanString(row?.phone || user?.phone),
    searchText: normalizedSearch([
      row?.id,
      row?.user_id,
      row?.first_name,
      row?.last_name,
      user?.id,
      user?.name,
      user?.email,
      row?.email
    ].map(cleanString).filter(Boolean).join(" "))
  };
}

async function resolvePersonContact(env, {
  userIds = [],
  nameIncludes = [],
  fallbackName = "",
  fallbackEmail = "",
  fallbackPhone = ""
} = {}) {
  const users = await getUsers(env);
  const rows = await employeeContactRows(env);
  const rowsByUserId = new Map(rows.map((row) => [cleanString(row.user_id || row.id).toLowerCase(), row]));
  const candidates = [];

  for (const user of users) {
    candidates.push(contactFromSources(rowsByUserId.get(cleanString(user.id).toLowerCase()), user));
  }

  const usedUserIds = new Set(candidates.map((contact) => cleanString(contact.userId || contact.id).toLowerCase()).filter(Boolean));
  for (const row of rows) {
    const key = cleanString(row.user_id || row.id).toLowerCase();
    if (key && !usedUserIds.has(key)) {
      candidates.push(contactFromSources(row, null));
    }
  }

  const wantedIds = userIds.map((id) => cleanString(id).toLowerCase()).filter(Boolean);
  const idMatch = wantedIds.length
    ? candidates.find((contact) => wantedIds.some((id) => sameId(contact.id, id) || sameId(contact.userId, id)))
    : null;
  const wantedNames = nameIncludes.map(normalizedSearch).filter(Boolean);
  const nameMatch = wantedNames.length
    ? candidates.find((contact) => wantedNames.some((name) => contact.searchText.includes(name)))
    : null;
  const match = idMatch || nameMatch || null;

  return {
    name: cleanString(match?.name) || fallbackName,
    email: cleanString(match?.email) || fallbackEmail,
    phone: cleanString(match?.phone) || fallbackPhone,
    userId: cleanString(match?.userId || match?.id)
  };
}

async function partsRecipient(env) {
  return resolvePersonContact(env, {
    userIds: ["patrik-istvanek"],
    nameIncludes: ["patrik istvanek"],
    fallbackName: "Patrik Ištvánek",
    fallbackEmail: cleanString(env.PATRICK_PARTS_EMAIL || env.PARTS_ORDER_EMAIL)
  });
}

async function serviceTechRecipient(env) {
  return resolvePersonContact(env, {
    nameIncludes: ["kamil"],
    fallbackName: "Kamil",
    fallbackPhone: cleanString(env.KAMIL_SERVICE_PHONE || env.SERVICE_TECH_PHONE)
  });
}

function notificationSent(result) {
  return NOTIFICATION_DONE_STATUSES.has(cleanString(result?.status));
}

export async function handoffDriverPartRequest(env, user, id, options = {}) {
  if (!canManageDriverPartRequests(user) && options.allowCreatorHandoff !== true) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění předat díl k objednání.", 403, "driver_part_handoff_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  if (!item.licensePlate || !item.vehicleName) {
    throw new DriverPartRequestsStoreError("Bez SPZ nebo vozidla nelze odeslat e-mail k objednání.", 400, "driver_part_vehicle_required");
  }
  if (!item.probablePart && !item.verifiedPart) {
    throw new DriverPartRequestsStoreError("Nejdřív doplňte pravděpodobný nebo ověřený díl.", 400, "driver_part_probable_part_required");
  }

  const patrik = await partsRecipient(env);
  const kamil = await serviceTechRecipient(env);
  const emailResult = item.patrikEmailStatus === "sent"
    ? { status: "sent", recipientName: patrik.name, reused: true }
    : await sendDriverPartOrderNotification(env, item, {
      recipientEmail: patrik.email,
      recipientName: patrik.name
    });
  const smsResult = item.kamilSmsStatus === "sent"
    ? { status: "sent", recipientName: kamil.name, reused: true }
    : await sendDriverPartServiceTechSms(env, item, {
      recipientPhone: kamil.phone,
      recipientName: kamil.name
    });

  const emailOk = notificationSent(emailResult);
  const smsOk = notificationSent(smsResult);
  const nextStatus = emailOk && smsOk ? "handed_to_ordering" : item.status;
  const now = new Date().toISOString();
  const after = {
    ...item,
    status: nextStatus,
    assignedToName: patrik.name,
    assignedToEmail: patrik.email,
    patrikEmailStatus: emailResult.status,
    patrikEmailError: emailResult.errorMessage || "",
    kamilSmsStatus: smsResult.status,
    kamilSmsRecipient: kamil.phone,
    kamilSmsError: smsResult.errorMessage || "",
    handedOffToPatrikAt: emailOk ? (item.handedOffToPatrikAt || now) : item.handedOffToPatrikAt,
    kamilSmsSentAt: smsOk ? (item.kamilSmsSentAt || now) : item.kamilSmsSentAt,
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            status = ?,
            assigned_to_name = ?,
            assigned_to_email = ?,
            handed_off_to_patrik_at = ?,
            kamil_sms_sent_at = ?,
            patrik_email_status = ?,
            patrik_email_error = ?,
            kamil_sms_status = ?,
            kamil_sms_recipient = ?,
            kamil_sms_error = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nextStatus,
          nullableString(patrik.name),
          nullableString(patrik.email),
          nullableString(after.handedOffToPatrikAt),
          nullableString(after.kamilSmsSentAt),
          cleanString(emailResult.status || "failed"),
          nullableString(emailResult.errorMessage),
          cleanString(smsResult.status || "failed"),
          nullableString(kamil.phone),
          nullableString(smsResult.errorMessage),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: nextStatus === "handed_to_ordering" ? "handoff_to_ordering" : "handoff_failed",
        user,
        before: item,
        after,
        note: nextStatus === "handed_to_ordering"
          ? "E-mail Patrikovi a SMS Kamilovi byly odeslány."
          : "Předání není hotové, některá notifikace neodešla.",
        notification: {
          channel: "email+sms",
          recipient: [patrik.email, kamil.phone].filter(Boolean).join(", "),
          status: nextStatus === "handed_to_ordering" ? "sent" : "failed",
          errorMessage: [emailResult.errorMessage, smsResult.errorMessage].filter(Boolean).join(" | ")
        }
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function markDriverPartOrdered(env, user, id, payload = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění označit díl jako objednaný.", 403, "driver_part_ordered_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const now = new Date().toISOString();
  const verifiedPart = cleanString(payload.verifiedPart || item.verifiedPart);
  const oePartNumber = cleanString(payload.oePartNumber || payload.oeNumber || item.oePartNumber);
  const partName = cleanString(payload.partName || item.partName);
  const partOrderNumber = cleanString(payload.partOrderNumber || item.partOrderNumber || oePartNumber);
  const partVerificationSource = normalizePartVerificationSource(
    payload.partVerificationSource || item.partVerificationSource,
    verifiedPart || partOrderNumber || oePartNumber || partName ? "manual" : ""
  );
  const partVerificationStatus = normalizePartVerificationStatus(
    payload.partVerificationStatus || item.partVerificationStatus,
    partVerificationSource === "daimler"
      ? "verified_daimler"
      : verifiedPart || partOrderNumber || oePartNumber || partName
        ? "verified_manual"
        : "waiting_manual_verification"
  );
  const after = {
    ...item,
    status: "ordered",
    verifiedPart,
    partOrderNumber,
    oePartNumber,
    partName,
    partVerificationStatus,
    partVerificationSource,
    partIdentificationStatus: verifiedPart || partOrderNumber || oePartNumber || partName ? partVerificationStatus : item.partIdentificationStatus,
    orderedAt: now,
    orderedByUserId: cleanString(user?.id),
    note: cleanString(payload.note || item.note),
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            status = 'ordered',
            verified_part = ?,
            part_order_number = ?,
            oe_part_number = ?,
            part_name = ?,
            part_verification_status = ?,
            part_verification_source = ?,
            part_identification_status = ?,
            ordered_at = ?,
            ordered_by_user_id = ?,
            note = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nullableString(verifiedPart),
          nullableString(partOrderNumber),
          nullableString(oePartNumber),
          nullableString(partName),
          partVerificationStatus,
          nullableString(partVerificationSource),
          after.partIdentificationStatus,
          now,
          nullableString(user?.id),
          nullableString(after.note),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: "mark_ordered",
        user,
        before: item,
        after,
        note: "Díl označen jako objednaný."
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function verifyMercedesDriverPartRequest(env, user, id) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění ověřit Mercedes díl.", 403, "driver_part_verify_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const now = new Date().toISOString();
  const isMercedes = normalizeVehicleBrand(item.vehicleBrand) === "mercedes";
  const providerResult = isMercedes
    ? await verifyMercedesPartForRequest(env, item)
    : {
      status: "not_applicable",
      partVerificationStatus: "not_applicable",
      partVerificationSource: "",
      partsProviderId: "",
      partsProviderStatus: "skipped_non_mercedes",
      partsProviderMessage: "Vozidlo není Mercedes-Benz Trucks. Díl se předává Patrikovi k ručnímu ověření podle běžného procesu.",
      partsProviderError: "",
      mercedesManualPortalUrl: "",
      mercedesMyPartsHubUrl: "",
      partLookupQuery: item.probablePart || item.defectDescription,
      resultJson: ""
    };

  const partVerificationStatus = normalizePartVerificationStatus(providerResult.partVerificationStatus);
  const verifiedPart = cleanString(providerResult.verifiedPart || item.verifiedPart);
  const oePartNumber = cleanString(providerResult.oePartNumber || item.oePartNumber);
  const partName = cleanString(providerResult.partName || item.partName);
  const partOrderNumber = cleanString(providerResult.partOrderNumber || item.partOrderNumber || oePartNumber);
  const partIdentificationStatus = partVerificationStatus === "verified_daimler"
    ? "verified_daimler"
    : partVerificationStatus === "not_applicable"
      ? item.partIdentificationStatus
      : "waiting_manual_verification";
  const after = {
    ...item,
    verifiedPart,
    partOrderNumber,
    oePartNumber,
    partName,
    partVerificationStatus,
    partVerificationSource: providerResult.partVerificationSource,
    partIdentificationStatus,
    partsProviderId: providerResult.partsProviderId,
    partsProviderStatus: providerResult.partsProviderStatus,
    partsProviderMessage: providerResult.partsProviderMessage,
    partsProviderError: providerResult.partsProviderError,
    partLookupQuery: providerResult.partLookupQuery,
    partLookupResultJson: providerResult.resultJson,
    mercedesManualPortalUrl: providerResult.mercedesManualPortalUrl,
    mercedesMyPartsHubUrl: providerResult.mercedesMyPartsHubUrl,
    priceBoostStatus: oePartNumber || partOrderNumber ? "waiting_verified_part" : "not_requested",
    priceBoostNote: oePartNumber || partOrderNumber
      ? "AI Boost cenový průzkum smí běžet až po potvrzení kompatibility člověkem."
      : "AI Boost cenový průzkum čeká na ověřené OE číslo.",
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            verified_part = ?,
            part_order_number = ?,
            oe_part_number = ?,
            part_name = ?,
            part_identification_status = ?,
            part_verification_status = ?,
            part_verification_source = ?,
            parts_provider_id = ?,
            parts_provider_status = ?,
            parts_provider_message = ?,
            parts_provider_error = ?,
            part_lookup_query = ?,
            part_lookup_result_json = ?,
            mercedes_manual_portal_url = ?,
            mercedes_mypartshub_url = ?,
            price_boost_status = ?,
            price_boost_note = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nullableString(verifiedPart),
          nullableString(partOrderNumber),
          nullableString(oePartNumber),
          nullableString(partName),
          partIdentificationStatus,
          partVerificationStatus,
          nullableString(providerResult.partVerificationSource),
          nullableString(providerResult.partsProviderId),
          nullableString(providerResult.partsProviderStatus),
          nullableString(providerResult.partsProviderMessage),
          nullableString(providerResult.partsProviderError),
          nullableString(providerResult.partLookupQuery),
          nullableString(providerResult.resultJson),
          nullableString(providerResult.mercedesManualPortalUrl),
          nullableString(providerResult.mercedesMyPartsHubUrl),
          after.priceBoostStatus,
          nullableString(after.priceBoostNote),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: isMercedes ? "verify_mercedes_part" : "skip_mercedes_part_verification",
        user,
        before: item,
        after,
        note: providerResult.partsProviderMessage || "Ověření dílu bylo zapsáno do historie."
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function updateDriverPartManualVerification(env, user, id, payload = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění ručně ověřit díl.", 403, "driver_part_manual_verify_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const now = new Date().toISOString();
  const verifiedPart = cleanString(payload.verifiedPart || item.verifiedPart);
  const oePartNumber = cleanString(payload.oePartNumber || payload.oeNumber || item.oePartNumber);
  const partName = cleanString(payload.partName || item.partName);
  const partOrderNumber = cleanString(payload.partOrderNumber || item.partOrderNumber || oePartNumber);
  const hasManualData = Boolean(verifiedPart || oePartNumber || partName || partOrderNumber);
  const partVerificationStatus = hasManualData ? "verified_manual" : "waiting_manual_verification";
  const note = cleanString(payload.note || item.note);
  const after = {
    ...item,
    verifiedPart,
    partOrderNumber,
    oePartNumber,
    partName,
    partVerificationStatus,
    partVerificationSource: hasManualData ? "manual" : item.partVerificationSource,
    partIdentificationStatus: hasManualData ? "verified_manual" : "waiting_manual_verification",
    note,
    priceBoostStatus: hasManualData ? "waiting_verified_part" : item.priceBoostStatus,
    priceBoostNote: hasManualData
      ? "AI Boost cenový průzkum smí běžet až po potvrzení kompatibility člověkem."
      : item.priceBoostNote,
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            verified_part = ?,
            part_order_number = ?,
            oe_part_number = ?,
            part_name = ?,
            part_identification_status = ?,
            part_verification_status = ?,
            part_verification_source = ?,
            note = ?,
            price_boost_status = ?,
            price_boost_note = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nullableString(verifiedPart),
          nullableString(partOrderNumber),
          nullableString(oePartNumber),
          nullableString(partName),
          after.partIdentificationStatus,
          partVerificationStatus,
          hasManualData ? "manual" : nullableString(item.partVerificationSource),
          nullableString(note),
          after.priceBoostStatus,
          nullableString(after.priceBoostNote),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: "manual_part_verification",
        user,
        before: item,
        after,
        note: hasManualData
          ? "Díl byl ručně ověřen nebo doplněn oprávněnou osobou."
          : "Díl zůstává k ručnímu ověření."
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function markDriverPartArrived(env, user, id, payload = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění označit doručení dílu.", 403, "driver_part_arrived_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const now = new Date().toISOString();
  const after = {
    ...item,
    status: "part_arrived",
    deliveredAt: now,
    deliveredByUserId: cleanString(user?.id),
    note: cleanString(payload.note || item.note),
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            status = 'part_arrived',
            delivered_at = ?,
            delivered_by_user_id = ?,
            note = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(now, nullableString(user?.id), nullableString(after.note), nullableString(user?.id), now, item.id),
      eventStatement(db, {
        requestId: item.id,
        action: "mark_part_arrived",
        user,
        before: item,
        after,
        note: "Díl dorazil."
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function scheduleDriverPartService(env, user, id, payload = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění plánovat servis.", 403, "driver_part_schedule_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  if (item.status !== "part_arrived" && item.status !== "service_scheduled") {
    throw new DriverPartRequestsStoreError("SMS řidiči lze poslat až po potvrzení doručení dílu.", 400, "driver_part_not_arrived");
  }

  const serviceDate = cleanString(payload.serviceDate || item.serviceDate);
  const serviceTime = cleanString(payload.serviceTime || item.serviceTime);
  if (!serviceDate || !serviceTime) {
    throw new DriverPartRequestsStoreError("Nejdřív zadejte datum i čas přistavení do dílny.", 400, "driver_part_service_time_required");
  }

  const technician = cleanString(payload.serviceTechnician || item.serviceTechnician || "Kamil");
  const serviceNote = cleanString(payload.serviceNote || item.serviceNote);
  const smsResult = item.driverSmsStatus === "sent" && item.serviceDate === serviceDate && item.serviceTime === serviceTime
    ? { status: "sent", reused: true }
    : await sendDriverPartReadySms(env, {
      ...item,
      serviceDate,
      serviceTime,
      serviceTechnician: technician,
      serviceNote
    });
  const smsOk = notificationSent(smsResult);
  const nextStatus = smsOk ? "service_scheduled" : "part_arrived";
  const now = new Date().toISOString();
  const after = {
    ...item,
    status: nextStatus,
    serviceDate,
    serviceTime,
    serviceTechnician: technician,
    serviceNote,
    driverSmsStatus: cleanString(smsResult.status || "failed"),
    driverSmsError: cleanString(smsResult.errorMessage),
    driverSmsSentAt: smsOk ? now : item.driverSmsSentAt,
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            status = ?,
            service_date = ?,
            service_time = ?,
            service_technician = ?,
            service_note = ?,
            driver_sms_status = ?,
            driver_sms_error = ?,
            driver_sms_sent_at = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nextStatus,
          serviceDate,
          serviceTime,
          nullableString(technician),
          nullableString(serviceNote),
          cleanString(smsResult.status || "failed"),
          nullableString(smsResult.errorMessage),
          smsOk ? now : nullableString(item.driverSmsSentAt),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: nextStatus === "service_scheduled" ? "schedule_service" : "driver_sms_failed",
        user,
        before: item,
        after,
        note: nextStatus === "service_scheduled"
          ? "Servis naplánován a SMS řidiči odeslána."
          : "Termín je zadaný, ale SMS řidiči neodešla.",
        notification: {
          channel: "sms",
          recipient: item.driverPhone,
          status: smsResult.status,
          errorMessage: smsResult.errorMessage
        }
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function closeDriverPartRequest(env, user, id, payload = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění uzavřít požadavek.", 403, "driver_part_close_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const cancel = Boolean(payload.cancel || payload.status === "canceled");
  const now = new Date().toISOString();
  const nextStatus = cancel ? "canceled" : "completed";
  const after = {
    ...item,
    status: nextStatus,
    completedAt: cancel ? item.completedAt : now,
    completedByUserId: cancel ? item.completedByUserId : cleanString(user?.id),
    canceledAt: cancel ? now : item.canceledAt,
    canceledByUserId: cancel ? cleanString(user?.id) : item.canceledByUserId,
    note: cleanString(payload.note || item.note),
    updatedAt: now
  };

  try {
    await db.batch([
      db
        .prepare(`
          UPDATE driver_part_requests
          SET
            status = ?,
            completed_at = ?,
            completed_by_user_id = ?,
            canceled_at = ?,
            canceled_by_user_id = ?,
            note = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nextStatus,
          nullableString(after.completedAt),
          nullableString(after.completedByUserId),
          nullableString(after.canceledAt),
          nullableString(after.canceledByUserId),
          nullableString(after.note),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: item.id,
        action: cancel ? "cancel" : "complete",
        user,
        before: item,
        after,
        note: cancel ? "Požadavek zrušen." : "Požadavek uzavřen jako vyřízený."
      })
    ]);

    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export function driverPartRequestPermissionSummary(user) {
  const role = normalizeRole(user?.role);
  return {
    role,
    canCreate: canCreateDriverPartRequest(user),
    canManage: canManageDriverPartRequests(user),
    canSearchPartslink24: canUsePartslink24VinSearch(user),
    limitation: role === "ridic"
      ? "Řidič může vytvořit hlášení a sledovat vlastní stav. Objednání, doručení a servis řeší oprávněná role."
      : ""
  };
}
