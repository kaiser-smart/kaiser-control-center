const FLEET_DB_BINDING = "SMART_ODPADY_DB";

function cleanString(value) {
  return String(value ?? "").trim();
}

function plateKey(value) {
  return cleanString(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export const CONFIRMED_COLLECTION_ROUTE_VEHICLE_PROFILES = Object.freeze([
  Object.freeze({
    vehicleCode: "A",
    driverLabel: "Kouba",
    registration: "3BN 3558",
    emptyWeightKg: 13_500,
    grossWeightKg: 19_000,
    payloadCapacityKg: 5_500,
    lengthCm: 850,
    widthCm: 240,
    heightCm: 350
  }),
  Object.freeze({
    vehicleCode: "B",
    driverLabel: "Míra",
    registration: "1BP 8373",
    emptyWeightKg: 13_200,
    grossWeightKg: 19_000,
    payloadCapacityKg: 5_800,
    lengthCm: 850,
    widthCm: 240,
    heightCm: 350
  }),
  Object.freeze({
    vehicleCode: "C",
    driverLabel: "Florian",
    registration: "3BE 2831",
    emptyWeightKg: 15_400,
    grossWeightKg: 25_000,
    payloadCapacityKg: 9_600,
    lengthCm: 940,
    widthCm: 240,
    heightCm: 350
  })
]);

function normalizeProfile(profile = {}, source = "") {
  const normalized = {
    vehicleCode: cleanString(profile.vehicleCode || profile.vehicle_code).toUpperCase(),
    driverLabel: cleanString(profile.driverLabel || profile.driver_label),
    registration: cleanString(profile.registration || profile.license_plate).toUpperCase(),
    emptyWeightKg: positiveInteger(profile.emptyWeightKg || profile.empty_weight_kg),
    grossWeightKg: positiveInteger(profile.grossWeightKg || profile.gross_weight_kg),
    payloadCapacityKg: positiveInteger(profile.payloadCapacityKg || profile.payload_capacity_kg),
    lengthCm: positiveInteger(profile.lengthCm || profile.length_cm),
    widthCm: positiveInteger(profile.widthCm || profile.width_cm),
    heightCm: positiveInteger(profile.heightCm || profile.height_cm),
    dataQuality: cleanString(profile.dataQuality || profile.data_quality) || "owner-confirmed",
    source: cleanString(source || profile.source) || "fleet-vehicle-technical-profiles"
  };
  const complete = [
    normalized.registration,
    normalized.emptyWeightKg,
    normalized.grossWeightKg,
    normalized.payloadCapacityKg,
    normalized.lengthCm,
    normalized.widthCm,
    normalized.heightCm
  ].every(Boolean);
  if (!complete) return null;
  return {
    ...normalized,
    currentWeightKg: normalized.grossWeightKg,
    currentWeightStrategy: "conservative-gross-weight-until-live-load-is-known",
    weightPerAxleKg: null
  };
}

export function confirmedCollectionRouteVehicleProfile(input = {}) {
  const code = cleanString(input.vehicleCode || input.code).toUpperCase();
  const registration = plateKey(input.vehicleRegistration || input.registration || input.licensePlate);
  const profile = CONFIRMED_COLLECTION_ROUTE_VEHICLE_PROFILES.find((candidate) => (
    (registration && plateKey(candidate.registration) === registration)
    || (code && candidate.vehicleCode === code)
  ));
  return profile ? normalizeProfile(profile, "confirmed-repository-bootstrap") : null;
}

export async function loadCollectionRouteVehicleProfile(env = {}, input = {}) {
  const fallback = confirmedCollectionRouteVehicleProfile(input);
  const db = env?.[FLEET_DB_BINDING] || null;
  if (!db) return fallback;
  const code = cleanString(input.vehicleCode || input.code).toUpperCase();
  const registration = plateKey(input.vehicleRegistration || input.registration || input.licensePlate);
  try {
    const row = await db.prepare(`
      SELECT vehicle_code, driver_label, license_plate,
        empty_weight_kg, gross_weight_kg, payload_capacity_kg,
        length_cm, width_cm, height_cm, data_quality
      FROM fleet_vehicle_technical_profiles
      WHERE active = 1
        AND (normalized_license_plate = ? OR vehicle_code = ?)
      ORDER BY CASE WHEN normalized_license_plate = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).bind(registration, code, registration).first();
    return normalizeProfile(row, "fleet-vehicle-technical-profiles") || fallback;
  } catch (error) {
    const message = cleanString(error?.message);
    if (/no such table[^\n]*fleet_vehicle_technical_profiles/i.test(message)) return fallback;
    if (fallback) {
      console.warn("collection_route_vehicle_profile.cloud_read_failed", {
        vehicleCode: code,
        registration,
        message
      });
      return fallback;
    }
    throw error;
  }
}

export function appendHereRoutingTruckProfile(searchParams, profile = {}) {
  const normalized = normalizeProfile(profile, profile.source);
  if (!normalized) return false;
  searchParams.set("vehicle[height]", String(normalized.heightCm));
  searchParams.set("vehicle[width]", String(normalized.widthCm));
  searchParams.set("vehicle[length]", String(normalized.lengthCm));
  searchParams.set("vehicle[grossWeight]", String(normalized.grossWeightKg));
  searchParams.set("vehicle[currentWeight]", String(normalized.currentWeightKg));
  searchParams.set("vehicle[commercial]", "true");
  return true;
}

export function appendHereWaypointSequenceTruckProfile(searchParams, profile = {}) {
  const normalized = normalizeProfile(profile, profile.source);
  if (!normalized) return false;
  searchParams.set("height", `${normalized.heightCm}cm`);
  searchParams.set("width", `${normalized.widthCm}cm`);
  searchParams.set("length", `${normalized.lengthCm}cm`);
  searchParams.set("limitedWeight", `${normalized.currentWeightKg}kg`);
  searchParams.set("trailersCount", "0");
  return true;
}
