import { getUsers } from "./auth.js";
import {
  loadFleetVehiclesWithAssignments,
  resolveFleetVehiclesForDriver,
  validateFleetLicensePlate
} from "./fleet-vehicles-store.js";
import {
  extractLicensePlate,
  driverPartAiCandidateFromMatch,
  driverPartAiSkipReasonLabel,
  identifyProbablePartFromDescription,
  driverPartRequestInitialStatus,
  licensePlateKey,
  normalizeLicensePlate,
  normalizePartAiStatus,
  normalizePartVerificationStatus,
  normalizeVehicleBrand,
  partSideLabel,
  partLookupQueryFromRequest,
  vehicleBrandLabel
} from "./driver-parts-catalog.js";
import { verifyMercedesPartForRequest } from "./mercedes-parts-provider.js";
import {
  canUsePartslink24VinSearch,
  latestPartslink24VinSearchForRequest,
  partslink24EligibilityForDriverPartRequest
} from "./partslink24-search-store.js";
import {
  isDriverPartPriceSearchConfigured,
  runDriverPartPriceSearch
} from "./driver-part-price-search.js";
import {
  buildDriverPartOrderEmailPreview,
  sendDriverPartOrderNotification,
  sendDriverPartReadySms
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
  handed_to_ordering: "Předáno Patrikovi k ověření",
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

function driverPartVehicleNameLooksLikePlate(value, licensePlate = "") {
  const valueKey = licensePlateKey(value);
  const plateKey = licensePlateKey(licensePlate);
  return Boolean(valueKey && plateKey && valueKey === plateKey);
}

function driverPartVehicleNameCandidate(value, licensePlate = "") {
  const cleaned = cleanString(value);
  if (!cleaned || driverPartVehicleNameLooksLikePlate(cleaned, licensePlate)) {
    return "";
  }
  return cleaned;
}

function driverPartVehicleDisplayName(payload = {}, vehicle = null, licensePlate = "") {
  const brandModel = [vehicle?.brand, vehicle?.model].map(cleanString).filter(Boolean).join(" ");
  return [
    vehicle?.internalNumber,
    vehicle?.vehicleName,
    vehicle?.name,
    brandModel,
    vehicle?.model,
    payload.vehicleName,
    payload.vehicle,
    payload.vehicleLabel,
    payload.vehicleDisplayName,
    payload.vehicleInternalNumber,
    payload.vehicleType
  ].map((value) => driverPartVehicleNameCandidate(value, licensePlate)).find(Boolean)
    || cleanString(payload.vehicleName || payload.vehicle || vehicle?.internalNumber || vehicle?.model || licensePlate);
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
  const partMatch = identifyProbablePartFromDescription(row?.defect_description);
  const storedProbablePart = cleanString(row?.probable_part);
  const partAiCandidate = Boolean(storedProbablePart || driverPartAiCandidateFromMatch(partMatch));
  const partAiSkipReason = partAiCandidate
    ? ""
    : cleanString(partMatch.aiSkipReason || "part_not_clear");
  const partAiStatus = partAiCandidate
    ? "manual_verification_required"
    : normalizePartAiStatus(partMatch.aiPilotStatus || partAiSkipReason, "manual_verification_required");
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
    partAiStatus,
    partAiCandidate,
    partAiSkipReason,
    partAiSkipReasonLabel: driverPartAiSkipReasonLabel(partAiSkipReason),
    partAiDetectedName: storedProbablePart || cleanString(partMatch.probablePart),
    partAiDetectedSide: cleanString(row?.probable_part_side || partMatch.probablePartSide || "unknown"),
    partAiConfidence: partAiCandidate ? cleanString(partMatch.confidence || "medium") : "none",
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

function driverPartVinPilotState(item = {}, eligibility = null, latestSearch = null) {
  const hasVerifiedPart = Boolean(item.oePartNumber || item.partName || item.verifiedPart || item.partOrderNumber);
  const hasProviderResult = Boolean(item.partsProviderStatus || latestSearch?.status);
  const emailSent = item.patrikEmailStatus === "sent";
  const handedToPatrik = Boolean(item.handedOffToPatrikAt || emailSent);

  if (!item.partAiCandidate) {
    return {
      status: normalizePartAiStatus(item.partAiStatus || item.partAiSkipReason, "manual_verification_required"),
      candidate: false,
      skipReason: item.partAiSkipReason,
      message: "AI Boost nespustil hledání, protože hlášení není jednoznačný požadavek na konkrétní díl."
    };
  }

  if (item.manualVehicleReview || !item.licensePlateVerified) {
    return {
      status: "manual_verification_required",
      candidate: true,
      skipReason: "vehicle_not_verified",
      message: "SPZ nebo přiřazení vozidla vyžaduje ruční kontrolu."
    };
  }

  if (eligibility?.errorCode === "PARTSLINK24_ONLY_PASSENGER_VEHICLES") {
    return {
      status: "out_of_pilot",
      candidate: true,
      skipReason: "out_of_pilot",
      message: "Pilot náhradních dílů podle VIN je zatím povolený jen pro osobní vozidla."
    };
  }

  if (eligibility?.errorCode === "PARTSLINK24_VIN_MISSING") {
    return {
      status: "waiting_vin",
      candidate: true,
      skipReason: "missing_vin",
      message: "U vozidla není uložené VIN. Doplň VIN ve Vozovém parku."
    };
  }

  if (eligibility && eligibility.allowed !== true) {
    return {
      status: "manual_verification_required",
      candidate: true,
      skipReason: eligibility.errorCode === "PARTSLINK24_VEHICLE_NOT_FOUND" ? "vehicle_not_verified" : "part_not_clear",
      message: eligibility.message || "Pilot čeká na ruční ověření."
    };
  }

  if (emailSent) {
    return {
      status: "email_sent",
      candidate: true,
      skipReason: "",
      message: "E-mail Patrikovi byl odeslaný. Nic nebylo automaticky objednáno."
    };
  }

  if (handedToPatrik) {
    return {
      status: "handed_to_patrik",
      candidate: true,
      skipReason: "",
      message: "Hlášení je předané Patrikovi k ručnímu ověření a nákupu."
    };
  }

  if (hasVerifiedPart) {
    if (!driverPartRequestHasRequiredPriceOffers(item, 3)) {
      return {
        status: "waiting_price_links",
        candidate: true,
        skipReason: "",
        message: "Díl je ověřený, ale e-mail Patrikovi čeká na 3 cenové nabídky s odkazy."
      };
    }

    return {
      status: "email_ready",
      candidate: true,
      skipReason: "",
      message: "Díl má ověření a AI Boost dodal 3 cenové nabídky s odkazy. Nákup zůstává ruční pilot."
    };
  }

  if (item.partsProviderStatus === "not_configured" || item.partsProviderStatus === "api_not_available" || latestSearch?.status === "configuration_missing") {
    return {
      status: "provider_not_configured",
      candidate: true,
      skipReason: "",
      message: "Partslink24 není nastaven. Ověření zatím probíhá ručně."
    };
  }

  if (hasProviderResult) {
    return {
      status: "manual_verification_required",
      candidate: true,
      skipReason: "",
      message: item.partsProviderMessage || latestSearch?.message || "Výsledek provideru vyžaduje ruční ověření."
    };
  }

  return {
    status: "ready_for_vin_verification",
    candidate: true,
    skipReason: "",
    message: "Konkrétní díl je rozpoznaný. Pokud jde o osobní vozidlo s VIN, lze spustit read-only ověření podle VIN."
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

function driverPartRequestHasTrustedKsoVehicleSelection(payload = {}, explicitVehicleId = "") {
  const source = cleanString(payload.source);
  const selectionSource = cleanString(payload.vehicleSelectionSource || payload.vehicle_selection_source);
  return source.startsWith("voice") &&
    Boolean(cleanString(explicitVehicleId || payload.vehicleId || payload.vehicle_id)) &&
    selectionSource === "backend_ui_picker";
}

function driverPartRequestConfirmVehicleSource(source = "") {
  const current = cleanString(source) || "manual";
  const confirmed = current.includes("manual_vehicle_review")
    ? current.replaceAll("manual_vehicle_review", "vehicle_confirmed")
    : `${current}_vehicle_confirmed`;
  return confirmed === "vehicle_confirmed" ? "manual_vehicle_confirmed" : confirmed;
}

function appendUniqueNote(note = "", addition = "") {
  const current = cleanString(note);
  const next = cleanString(addition);
  if (!next || current.includes(next)) return current;
  return [current, next].filter(Boolean).join(" ");
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

async function enrichDriverPartRequestVehicleNames(env, items = []) {
  const list = Array.isArray(items) ? items : [];
  const needsFleet = list.some((item) => !item.vehicleName || driverPartVehicleNameLooksLikePlate(item.vehicleName, item.licensePlate));
  if (!needsFleet) {
    return list;
  }

  try {
    const payload = await loadFleetVehiclesWithAssignments(env);
    const vehicles = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
    return list.map((item) => {
      if (!item || (item.vehicleName && !driverPartVehicleNameLooksLikePlate(item.vehicleName, item.licensePlate))) {
        return item;
      }

      const vehicle = vehicles.find((candidate) => {
        const candidateIds = [
          candidate.id,
          candidate.vehicleId,
          candidate.tcarsVehicleId,
          candidate.externalVehicleId
        ].map(cleanString).filter(Boolean);
        return (item.vehicleId && candidateIds.includes(item.vehicleId))
          || licensePlateKey(candidate.licensePlate || candidate.tcarsLicensePlate) === licensePlateKey(item.licensePlate);
      });

      const vehicleName = driverPartVehicleDisplayName({}, vehicle, item.licensePlate);
      return vehicleName && !driverPartVehicleNameLooksLikePlate(vehicleName, item.licensePlate)
        ? { ...item, vehicleName }
        : item;
    });
  } catch (error) {
    console.info("driver_part_requests.vehicle_name_enrichment_skipped", { message: cleanString(error?.message) });
    return list;
  }
}

function normalizeCreatePayload(payload, user, vehicle, driverContact = null) {
  const rawDescription = cleanString(payload.defectDescription || payload.description || payload.speechText);
  if (!rawDescription) {
    throw new DriverPartRequestsStoreError("Vyplňte popis závady od řidiče.", 400, "driver_part_description_required");
  }

  const licensePlate = normalizeLicensePlate(
    payload.spzManual ||
    payload.manualSpz ||
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

  const vehicleName = driverPartVehicleDisplayName(payload, vehicle, licensePlate);
  const brand = normalizeVehicleBrand(payload.vehicleBrand || payload.brand || vehicle?.brand || vehicle?.model);
  const probablePart = cleanString(payload.probablePart || partMatch.probablePart);
  const partAiCandidate = Boolean(probablePart && driverPartAiCandidateFromMatch(partMatch));
  const partLookupQuery = cleanString(payload.partLookupQuery || partLookupQueryFromRequest({
    probablePart,
    defectType: cleanString(payload.defectType || partMatch.defectType),
    defectDescription: rawDescription,
    probablePartSide: partMatch.probablePartSide
  }));
  const partVerificationStatus = normalizePartVerificationStatus(
    payload.partVerificationStatus || (partAiCandidate ? "probable_part" : partMatch.partIdentificationStatus)
  );
  const partsProviderStatus = cleanString(payload.partsProviderStatus || (
    partAiCandidate ? "waiting_vin_pilot" : "not_applicable"
  ));
  const partsProviderMessage = cleanString(payload.partsProviderMessage || (
    partAiCandidate
      ? "AI Boost rozpoznal konkrétní díl. Ověření podle VIN je read-only pilot a čeká na ruční spuštění."
      : partMatch.note
  ));
  const priceBoostStatus = cleanString(payload.priceBoostStatus || (
    partAiCandidate ? "waiting_verified_part" : "not_requested"
  ));
  const priceBoostNote = cleanString(payload.priceBoostNote || (
    partAiCandidate
      ? "Cenový průzkum čeká na ověřené OE číslo. Nic se automaticky neobjedná."
      : "Cenový průzkum se nespustil, protože hlášení není jednoznačný požadavek na konkrétní díl."
  ));

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
    probablePart,
    probablePartSide: cleanString(payload.probablePartSide || partMatch.probablePartSide || "unknown"),
    partIdentificationStatus: cleanString(payload.partIdentificationStatus || partMatch.partIdentificationStatus),
    verifiedPart: cleanString(payload.verifiedPart),
    partOrderNumber: cleanString(payload.partOrderNumber),
    oePartNumber: cleanString(payload.oePartNumber || payload.oeNumber),
    partName: cleanString(payload.partName),
    partVerificationStatus,
    partVerificationSource: cleanString(payload.partVerificationSource),
    partsProviderId: cleanString(payload.partsProviderId || (partAiCandidate ? "partslink24" : "")),
    partsProviderStatus,
    partsProviderMessage,
    partsProviderError: cleanString(payload.partsProviderError),
    partLookupQuery,
    partLookupResultJson: cleanString(payload.partLookupResultJson),
    mercedesManualPortalUrl: cleanString(payload.mercedesManualPortalUrl),
    mercedesMyPartsHubUrl: cleanString(payload.mercedesMyPartsHubUrl),
    priceBoostStatus,
    priceBoostNote,
    priceBoostCheckedAt: cleanString(payload.priceBoostCheckedAt),
    priceBoostResultJson: cleanString(payload.priceBoostResultJson),
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

    const items = (result.results || []).map((row) => rowToRequest(row));
    return enrichDriverPartRequestVehicleNames(env, items);
  } catch (error) {
    throw dbError(error);
  }
}

export async function getDriverPartRequest(env, user, id) {
  try {
    const { db, item: rawItem } = await requestForUser(env, id, user);
    const [item] = await enrichDriverPartRequestVehicleNames(env, [rawItem]);
    const partslink24Eligibility = await partslink24EligibilityForDriverPartRequest(env, user, item);
    const partslink24VinSearch = await latestPartslink24VinSearchForRequest(env, item.id);
    const partVinPilot = driverPartVinPilotState(item, partslink24Eligibility, partslink24VinSearch);
    return {
      ...item,
      events: await eventsForRequest(db, item.id),
      partslink24Eligibility,
      partslink24VinSearch,
      partVinPilot: {
        ...partVinPilot,
        detectedName: item.partAiDetectedName || item.probablePart,
        detectedSide: item.partAiDetectedSide || item.probablePartSide,
        confidence: item.partAiConfidence || "none",
        vehicleInPilot: partslink24Eligibility?.allowed === true,
        vehicleKind: partslink24Eligibility?.vehicleKind || "",
        vinMasked: partslink24Eligibility?.vinMasked || "",
        providerStatus: item.partsProviderStatus || partslink24VinSearch?.status || "",
        providerName: item.partsProviderId || "partslink24",
        providerCheckedAt: partslink24VinSearch?.createdAt || "",
        internetOffers: [],
        patrikEmailStatus: item.patrikEmailStatus || "not_sent",
        pilotCcStatus: pilotCcStatus(env, item),
        resolutionStatus: item.status
      }
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
  const voiceSource = cleanString(payload.source).startsWith("voice");
  const explicitVehicleId = cleanString(payload.vehicleId || payload.vehicle_id);
  const explicitManualPlate = normalizeLicensePlate(
    payload.spzManual ||
    payload.manualSpz ||
    (truthyFlag(payload.spzValidated || payload.spz_validated) ? (payload.licensePlate || payload.spz) : "")
  );
  if (voiceSource && !explicitVehicleId && !explicitManualPlate) {
    throw new DriverPartRequestsStoreError(
      "Vyberte vozidlo v aplikaci, nebo doplňte značku, typ či SPZ vozidla.",
      400,
      "VEHICLE_SPZ_REQUIRED"
    );
  }
  const payloadLicensePlate = normalizeLicensePlate(
    payload.spzManual ||
    payload.manualSpz ||
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
    payload.spzManual ||
    payload.manualSpz ||
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

  const trustedKsoVehicleSelection = driverPartRequestHasTrustedKsoVehicleSelection(payload, explicitVehicleId);
  const manualVehicleReview = trustedKsoVehicleSelection
    ? false
    : driverPartRequestNeedsManualVehicleReview(assignedDriverMatch, licensePlate, plateValidation);

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
    : trustedKsoVehicleSelection
      ? {
          ...payload,
          note: [
            cleanString(payload.note),
            "Vozidlo potvrzeno výběrem v KSO aplikaci."
          ].filter(Boolean).join(" "),
          source: driverPartRequestConfirmVehicleSource(payload.source || "voice")
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
            oe_part_number,
            part_name,
            part_verification_status,
            part_verification_source,
            parts_provider_id,
            parts_provider_status,
            parts_provider_message,
            parts_provider_error,
            part_lookup_query,
            part_lookup_result_json,
            mercedes_manual_portal_url,
            mercedes_mypartshub_url,
            price_boost_status,
            price_boost_note,
            price_boost_checked_at,
            price_boost_result_json,
            status,
            note,
            source,
            created_by_user_id,
            created_at,
            updated_by_user_id,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          nullableString(item.oePartNumber),
          nullableString(item.partName),
          item.partVerificationStatus,
          nullableString(item.partVerificationSource),
          nullableString(item.partsProviderId),
          nullableString(item.partsProviderStatus),
          nullableString(item.partsProviderMessage),
          nullableString(item.partsProviderError),
          nullableString(item.partLookupQuery),
          nullableString(item.partLookupResultJson),
          nullableString(item.mercedesManualPortalUrl),
          nullableString(item.mercedesMyPartsHubUrl),
          item.priceBoostStatus,
          nullableString(item.priceBoostNote),
          nullableString(item.priceBoostCheckedAt),
          nullableString(item.priceBoostResultJson),
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
    fallbackEmail: cleanString(env.PARTS_PATRIK_EMAIL || env.PARTS_PATRICK_EMAIL || env.PATRICK_PARTS_EMAIL || env.PARTS_ORDER_EMAIL)
  });
}

function notificationSent(result) {
  return NOTIFICATION_DONE_STATUSES.has(cleanString(result?.status));
}

function pilotCcEmail(env) {
  return cleanString(env.PARTS_PILOT_CC_EMAIL || "oplustil@kaiserservis.cz");
}

function pilotCcStatus(env, item = {}) {
  const configured = Boolean(pilotCcEmail(env));
  if (item.patrikEmailStatus === "sent") {
    return configured ? "sent_or_included_by_backend" : "not_configured";
  }
  return configured ? "not_sent" : "not_configured";
}

function driverPartRequestHasVerifiedPartForHandoff(item = {}) {
  return Boolean(item.oePartNumber || item.partName || item.verifiedPart || item.partOrderNumber);
}

function driverPartRequestHasPilotPartCandidateForHandoff(item = {}, options = {}) {
  return options.allowProbablePartHandoff === true &&
    item.partAiCandidate === true &&
    Boolean(cleanString(item.probablePart || item.partAiDetectedName));
}

function driverPartRequestPriceOffers(item = {}) {
  const parsed = parseJson(item.priceBoostResultJson, {});
  const offers = Array.isArray(parsed?.offers)
    ? parsed.offers
    : Array.isArray(parsed?.candidates) ? parsed.candidates : [];

  return offers
    .filter((offer) => cleanString(offer?.url) && (cleanString(offer?.title) || cleanString(offer?.seller)))
    .slice(0, 3);
}

function driverPartRequestHasRequiredPriceOffers(item = {}, requiredCount = 3) {
  return driverPartRequestPriceOffers(item).length >= requiredCount;
}

function driverPartRequestPatrikHandoffEligibility(item = {}, options = {}) {
  if (!item.licensePlate || !item.vehicleName) {
    return {
      allowed: false,
      code: "driver_part_vehicle_required",
      message: "Bez SPZ nebo vozidla nelze odeslat e-mail Patrikovi."
    };
  }
  if (item.licensePlateVerified !== true || item.manualVehicleReview === true) {
    return {
      allowed: false,
      code: "driver_part_vehicle_not_verified",
      message: "Vozidlo není bezpečně ověřené proti Vozovému parku. Nejdřív proveď ruční kontrolu."
    };
  }
  if (!item.vin) {
    return {
      allowed: false,
      code: "driver_part_vin_required",
      message: "Bez VIN nelze předat díl Patrikovi v pilotu podle VIN."
    };
  }
  if (!driverPartRequestHasVerifiedPartForHandoff(item) && !driverPartRequestHasPilotPartCandidateForHandoff(item, options)) {
    return {
      allowed: false,
      code: "driver_part_verified_part_required",
      message: "Nejdřív ověř díl nebo OE číslo. Pravděpodobný díl nestačí pro e-mail Patrikovi."
    };
  }
  return {
    allowed: true,
    code: "",
    message: ""
  };
}

function driverPartRequestPatrikPriceHandoffEligibility(item = {}, options = {}) {
  if (options.requirePriceOffersForHandoff !== true) {
    return {
      allowed: true,
      code: "",
      message: ""
    };
  }

  if (driverPartRequestHasRequiredPriceOffers(item, 3)) {
    return {
      allowed: true,
      code: "",
      message: ""
    };
  }

  return {
    allowed: false,
    code: "driver_part_price_offers_required",
    message: "AI Boost zatím nedodal 3 bezpečně relevantní nabídky s odkazy. E-mail Patrikovi neposílám bez odkazů."
  };
}

function readinessBlocker(code, message) {
  return { code: cleanString(code), message: cleanString(message) };
}

async function driverPartRequestHandoffReadinessForItem(env, user, item = {}, options = {}) {
  const allowProbablePartHandoff = options.allowProbablePartHandoff !== false;
  const baseEligibility = driverPartRequestPatrikHandoffEligibility(item, { allowProbablePartHandoff });
  const priceEligibility = driverPartRequestPatrikPriceHandoffEligibility(item, {
    requirePriceOffersForHandoff: true
  });
  const priceOffers = driverPartRequestPriceOffers(item);
  const priceSearchConfigured = isDriverPartPriceSearchConfigured(env);
  const patrik = await partsRecipient(env);
  const recipientConfigured = Boolean(cleanString(patrik.email));
  const ccConfigured = Boolean(pilotCcEmail(env));
  const blockers = [];

  if (!baseEligibility.allowed) {
    blockers.push(readinessBlocker(baseEligibility.code, baseEligibility.message));
  }
  if (baseEligibility.allowed && !priceSearchConfigured && !priceEligibility.allowed) {
    blockers.push(readinessBlocker(
      "driver_part_price_search_not_configured",
      "AI Boost web-search není nastavený. Chybí OPENAI_API_KEY nebo PARTS_PRICE_SEARCH_ENDPOINT."
    ));
  }
  if (baseEligibility.allowed && !priceEligibility.allowed) {
    blockers.push(readinessBlocker(priceEligibility.code, priceEligibility.message));
  }
  if (baseEligibility.allowed && priceEligibility.allowed && !recipientConfigured) {
    blockers.push(readinessBlocker(
      "driver_part_patrik_email_missing",
      "Chybí e-mail Patrika nebo cílový e-mail pro náhradní díly."
    ));
  }

  const canRunPriceBoost = canManageDriverPartRequests(user)
    && baseEligibility.allowed
    && priceSearchConfigured
    && !driverPartRequestHasRequiredPriceOffers(item, 3);
  const canSendEmail = canManageDriverPartRequests(user)
    && baseEligibility.allowed
    && priceEligibility.allowed
    && recipientConfigured;
  const emailPreview = canSendEmail
    ? buildDriverPartOrderEmailPreview(env, item, {
      recipientEmail: patrik.email,
      recipientName: patrik.name,
      ccEmail: pilotCcEmail(env)
    })
    : null;

  return {
    ok: canSendEmail,
    status: canSendEmail ? "email_ready" : canRunPriceBoost ? "price_search_ready" : "waiting",
    canRunPriceBoost,
    canSendEmail,
    priceSearchConfigured,
    recipientConfigured,
    ccConfigured,
    vehicleVerified: item.licensePlateVerified === true && item.manualVehicleReview !== true,
    vinPresent: Boolean(cleanString(item.vin)),
    partVerified: driverPartRequestHasVerifiedPartForHandoff(item),
    probablePartAllowed: allowProbablePartHandoff && driverPartRequestHasPilotPartCandidateForHandoff(item, { allowProbablePartHandoff: true }),
    priceOfferCount: priceOffers.length,
    requiredPriceOfferCount: 3,
    missingPriceOfferCount: Math.max(0, 3 - priceOffers.length),
    priceOffers,
    emailPreview,
    blockers,
    message: canSendEmail
      ? "E-mail Patrikovi je připravený: vozidlo, VIN, díl i 3 odkazy jsou splněné."
      : blockers[0]?.message || "Předání Patrikovi zatím čeká na doplnění podmínek."
  };
}

async function driverPartRequestPriceSearchPreviewForItem(env, user, item = {}, options = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění spustit kontrolní cenový průzkum.", 403, "driver_part_price_preview_forbidden");
  }

  const result = await runDriverPartPriceSearch(env, item, {
    allowProbablePartSeed: options.allowProbablePartSeed === true,
    fetchImpl: options.fetchImpl
  });
  const itemWithPreview = {
    ...item,
    priceBoostStatus: cleanString(result.status || "failed"),
    priceBoostNote: cleanString(result.message),
    priceBoostCheckedAt: cleanString(result.checkedAt),
    priceBoostResultJson: cleanString(result.resultJson)
  };
  const readiness = await driverPartRequestHandoffReadinessForItem(env, user, itemWithPreview, {
    allowProbablePartHandoff: true
  });

  return {
    ok: result.ok === true,
    status: cleanString(result.status),
    provider: cleanString(result.provider),
    query: cleanString(result.query),
    checkedAt: cleanString(result.checkedAt),
    message: cleanString(result.message),
    offers: Array.isArray(result.offers) ? result.offers : [],
    readiness,
    persisted: false,
    emailSent: false
  };
}

export async function getDriverPartHandoffReadiness(env, user, id, options = {}) {
  const { item } = await requestForUser(env, id, user);
  return driverPartRequestHandoffReadinessForItem(env, user, item, options);
}

export async function previewDriverPartPriceBoost(env, user, id, options = {}) {
  const { item } = await requestForUser(env, id, user);
  return driverPartRequestPriceSearchPreviewForItem(env, user, item, {
    allowProbablePartSeed: options.allowProbablePartSeed === true
  });
}

async function saveDriverPartPriceBoostResult(db, user, item, result) {
  const after = {
    ...item,
    priceBoostStatus: cleanString(result.status || "failed"),
    priceBoostNote: cleanString(result.message),
    priceBoostCheckedAt: cleanString(result.checkedAt || new Date().toISOString()),
    priceBoostResultJson: cleanString(result.resultJson),
    updatedAt: new Date().toISOString()
  };

  await db.batch([
    db
      .prepare(`
        UPDATE driver_part_requests
        SET
          price_boost_status = ?,
          price_boost_note = ?,
          price_boost_checked_at = ?,
          price_boost_result_json = ?,
          updated_by_user_id = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        after.priceBoostStatus,
        nullableString(after.priceBoostNote),
        nullableString(after.priceBoostCheckedAt),
        nullableString(after.priceBoostResultJson),
        nullableString(user?.id),
        after.updatedAt,
        item.id
      ),
    eventStatement(db, {
      requestId: item.id,
      action: "price_boost_search",
      user,
      before: item,
      after,
      note: after.priceBoostNote || "Cenový průzkum byl zapsaný do hlášení."
    })
  ]);

  return after;
}

export async function runDriverPartPriceBoost(env, user, id, options = {}) {
  if (!canManageDriverPartRequests(user)) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění spustit cenový průzkum.", 403, "driver_part_price_boost_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const result = await runDriverPartPriceSearch(env, item, {
    allowProbablePartSeed: options.allowProbablePartSeed === true
  });

  try {
    await saveDriverPartPriceBoostResult(db, user, item, result);
    return getDriverPartRequest(env, user, item.id);
  } catch (error) {
    throw dbError(error);
  }
}

export async function handoffDriverPartRequest(env, user, id, options = {}) {
  if (!canManageDriverPartRequests(user) && options.allowCreatorHandoff !== true) {
    throw new DriverPartRequestsStoreError("Nemáte oprávnění předat díl Patrikovi k ověření.", 403, "driver_part_handoff_forbidden");
  }

  const { db, item } = await requestForUser(env, id, user);
  const eligibility = driverPartRequestPatrikHandoffEligibility(item, options);
  if (!eligibility.allowed) {
    throw new DriverPartRequestsStoreError(eligibility.message, 400, eligibility.code);
  }

  let itemForEmail = item;
  const missingRequiredPriceOffers = options.requirePriceOffersForHandoff === true
    && !driverPartRequestHasRequiredPriceOffers(item, 3);
  const shouldRunPriceBoost = options.skipPriceBoost !== true
    && (
      missingRequiredPriceOffers ||
      (
        item.priceBoostStatus !== "candidates_found"
        && item.priceBoostStatus !== "no_results"
        && item.priceBoostStatus !== "provider_not_configured"
        && item.priceBoostStatus !== "failed"
      )
    );
  if (shouldRunPriceBoost || (options.runPriceBoost === true && (item.priceBoostStatus !== "candidates_found" || missingRequiredPriceOffers))) {
    const priceResult = await runDriverPartPriceSearch(env, item, {
      allowProbablePartSeed: options.allowProbablePartHandoff === true
    });
    try {
      itemForEmail = await saveDriverPartPriceBoostResult(db, user, item, priceResult);
    } catch (error) {
      throw dbError(error);
    }
  } else if (!isDriverPartPriceSearchConfigured(env) && !item.priceBoostStatus) {
    itemForEmail = {
      ...item,
      priceBoostStatus: "provider_not_configured",
      priceBoostNote: "Cenový průzkum není nastavený. E-mail Patrikovi obsahuje ruční postup."
    };
  }

  const priceEligibility = driverPartRequestPatrikPriceHandoffEligibility(itemForEmail, options);
  if (!priceEligibility.allowed) {
    throw new DriverPartRequestsStoreError(priceEligibility.message, 400, priceEligibility.code);
  }

  const patrik = await partsRecipient(env);
  const ccEmail = pilotCcEmail(env);
  const emailResult = itemForEmail.patrikEmailStatus === "sent"
    ? { status: "sent", recipientName: patrik.name, cc: ccEmail ? [ccEmail] : [], reused: true }
    : await sendDriverPartOrderNotification(env, itemForEmail, {
      recipientEmail: patrik.email,
      recipientName: patrik.name,
      ccEmail
    });

  const emailOk = notificationSent(emailResult);
  const nextStatus = emailOk ? "handed_to_ordering" : item.status;
  const now = new Date().toISOString();
  const after = {
    ...itemForEmail,
    status: nextStatus,
    assignedToName: patrik.name,
    assignedToEmail: patrik.email,
    patrikEmailStatus: emailResult.status,
    patrikEmailError: emailResult.errorMessage || "",
    handedOffToPatrikAt: emailOk ? (item.handedOffToPatrikAt || now) : item.handedOffToPatrikAt,
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
            patrik_email_status = ?,
            patrik_email_error = ?,
            updated_by_user_id = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nextStatus,
          nullableString(patrik.name),
          nullableString(patrik.email),
          nullableString(after.handedOffToPatrikAt),
          cleanString(emailResult.status || "failed"),
          nullableString(emailResult.errorMessage),
          nullableString(user?.id),
          now,
          item.id
        ),
      eventStatement(db, {
        requestId: itemForEmail.id,
        action: nextStatus === "handed_to_ordering" ? "handoff_to_ordering" : "handoff_failed",
        user,
        before: itemForEmail,
        after,
        note: nextStatus === "handed_to_ordering"
          ? "E-mail Patrikovi byl odeslán. Pilotní CC je zahrnuté, pokud je nastavené. SMS Kamilovi se v tomto kroku neposílá."
          : "Předání není hotové, e-mail Patrikovi neodešel.",
        notification: {
          channel: "email",
          recipient: [patrik.email, ccEmail ? `cc: ${ccEmail}` : ""].filter(Boolean).join(", "),
          status: nextStatus === "handed_to_ordering" ? "sent" : "failed",
          errorMessage: cleanString(emailResult.errorMessage)
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
  const confirmVehicle = truthyFlag(payload.vehicleManuallyConfirmed || payload.vehicleConfirmed || payload.confirmVehicle);
  if (confirmVehicle) {
    if (!item.licensePlate || !item.vehicleName) {
      throw new DriverPartRequestsStoreError(
        "Bez SPZ nebo názvu vozidla nejde vozidlo ručně potvrdit.",
        400,
        "driver_part_manual_vehicle_required"
      );
    }
    if (item.licensePlateVerified !== true) {
      throw new DriverPartRequestsStoreError(
        "SPZ není ověřená ve Vozovém parku. Nejdřív oprav SPZ nebo vozidlo.",
        400,
        "driver_part_manual_vehicle_plate_not_verified"
      );
    }
  }
  const verifiedPart = cleanString(payload.verifiedPart || item.verifiedPart);
  const oePartNumber = cleanString(payload.oePartNumber || payload.oeNumber || item.oePartNumber);
  const partName = cleanString(payload.partName || item.partName);
  const partOrderNumber = cleanString(payload.partOrderNumber || item.partOrderNumber || oePartNumber);
  const hasManualData = Boolean(verifiedPart || oePartNumber || partName || partOrderNumber);
  const partVerificationStatus = hasManualData ? "verified_manual" : "waiting_manual_verification";
  const source = confirmVehicle ? driverPartRequestConfirmVehicleSource(item.source) : item.source;
  const note = appendUniqueNote(
    payload.note || item.note,
    confirmVehicle ? "Vozidlo ručně potvrzeno dispečerem proti Vozovému parku." : ""
  );
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
    source,
    manualVehicleReview: driverPartRequestSourceHasManualVehicleReview(source),
    licensePlateVerified: !source.includes("unverified_plate"),
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
            source = ?,
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
          after.source,
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
        note: [
          confirmVehicle ? "Vozidlo bylo ručně potvrzeno proti Vozovému parku." : "",
          hasManualData
            ? "Díl byl ručně ověřen nebo doplněn oprávněnou osobou."
            : "Díl zůstává k ručnímu ověření."
        ].filter(Boolean).join(" ")
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

export const __test = {
  driverPartVinPilotState,
  driverPartRequestConfirmVehicleSource,
  driverPartRequestHasVerifiedPartForHandoff,
  driverPartRequestHasRequiredPriceOffers,
  driverPartRequestHasTrustedKsoVehicleSelection,
  driverPartRequestHandoffReadinessForItem,
  driverPartRequestPatrikHandoffEligibility,
  driverPartRequestPatrikPriceHandoffEligibility,
  driverPartRequestPriceSearchPreviewForItem,
  driverPartRequestSourceHasManualVehicleReview,
  driverPartRequestPriceOffers,
  pilotCcStatus,
  driverPartVehicleDisplayName,
  driverPartVehicleNameLooksLikePlate,
  normalizeCreatePayload
};
