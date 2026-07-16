import { licensePlateKey, normalizeLicensePlate } from "../../src/data/licensePlate.js";

const TCARS_SYSTEM = "tcars";
const ORWII_VEHICLE_SYSTEM = "orwii_vehicle_id";
const ORWII_CHIP_SYSTEM = "orwii_fuel_chip";
const BATCH_SIZE = 50;

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizedChip(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function tcarsFleetAliasCandidate(location = {}) {
  return {
    vehicleKey: cleanString(
      location.externalVehicleId || location.tcarsVehicleId || location.vehicleId || location.licensePlate
    ).toLowerCase(),
    licensePlate: normalizeLicensePlate(location.licensePlate)
  };
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

async function runBatches(db, statements) {
  const results = [];
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    results.push(...await db.batch(statements.slice(index, index + BATCH_SIZE)));
  }
  return results;
}

function changesFromResults(results = []) {
  return results.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
}

function tcarsAliasStatement(db, point, updatedAt) {
  const vehicleKey = cleanString(point?.vehicleKey).toLowerCase();
  const plate = normalizeLicensePlate(point?.licensePlate);
  const plateKey = licensePlateKey(plate);
  if (!vehicleKey || !plateKey) return null;
  return db.prepare(`
    INSERT INTO fleet_vehicle_external_aliases (
      id, vehicle_id, external_system, external_key, normalized_license_plate,
      status, match_method, confidence, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 'tcars_readonly_master', 'high', ?, ?, ?)
    ON CONFLICT(external_system, external_key) DO UPDATE SET
      vehicle_id = excluded.vehicle_id,
      normalized_license_plate = excluded.normalized_license_plate,
      status = 'active',
      match_method = 'tcars_readonly_master',
      confidence = 'high',
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(
    randomId("fleet-alias-tcars"),
    vehicleKey,
    TCARS_SYSTEM,
    vehicleKey,
    plateKey,
    JSON.stringify({ source: "tcars", readOnly: true, licensePlate: plate }),
    updatedAt,
    updatedAt
  );
}

export async function upsertFleetVehicleAliasesFromTcars(db, points = [], options = {}) {
  const updatedAt = cleanString(options.updatedAt) || new Date().toISOString();
  const unique = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    const vehicleKey = cleanString(point?.vehicleKey).toLowerCase();
    const plateKey = licensePlateKey(normalizeLicensePlate(point?.licensePlate));
    if (vehicleKey && plateKey) unique.set(vehicleKey, point);
  }
  const statements = [...unique.values()].map((point) => tcarsAliasStatement(db, point, updatedAt)).filter(Boolean);
  const results = statements.length ? await runBatches(db, statements) : [];
  return { seen: unique.size, written: changesFromResults(results), updatedAt };
}

function aliasVehicle(row, existing = {}) {
  const system = cleanString(row?.external_system);
  const externalKey = cleanString(row?.external_key);
  const vehicle = {
    ...existing,
    id: cleanString(row?.vehicle_id),
    vehicleId: cleanString(row?.vehicle_id),
    tcarsVehicleId: existing.tcarsVehicleId || "",
    licensePlate: existing.licensePlate || normalizeLicensePlate(row?.normalized_license_plate),
    orwiiVehicleId: existing.orwiiVehicleId || "",
    fuelChipId: existing.fuelChipId || "",
    orwiiVehicleIds: Array.isArray(existing.orwiiVehicleIds) ? [...existing.orwiiVehicleIds] : [],
    fuelChipIds: Array.isArray(existing.fuelChipIds) ? [...existing.fuelChipIds] : []
  };
  if (system === TCARS_SYSTEM) vehicle.tcarsVehicleId = externalKey;
  if (system === ORWII_VEHICLE_SYSTEM) {
    vehicle.orwiiVehicleId = vehicle.orwiiVehicleId || externalKey;
    if (!vehicle.orwiiVehicleIds.includes(externalKey)) vehicle.orwiiVehicleIds.push(externalKey);
  }
  if (system === ORWII_CHIP_SYSTEM) {
    vehicle.fuelChipId = vehicle.fuelChipId || externalKey;
    if (!vehicle.fuelChipIds.includes(externalKey)) vehicle.fuelChipIds.push(externalKey);
  }
  return vehicle;
}

export async function loadFleetVehiclesFromAliases(db) {
  const result = await db.prepare(`
    SELECT vehicle_id, external_system, external_key, normalized_license_plate
    FROM fleet_vehicle_external_aliases
    WHERE status = 'active'
      AND external_system IN ('tcars', 'orwii_vehicle_id', 'orwii_fuel_chip')
    ORDER BY vehicle_id, external_system, external_key
  `).all();
  const vehicles = new Map();
  for (const row of result.results || []) {
    const vehicleId = cleanString(row?.vehicle_id);
    if (!vehicleId) continue;
    vehicles.set(vehicleId, aliasVehicle(row, vehicles.get(vehicleId) || {}));
  }
  return [...vehicles.values()].filter((vehicle) => vehicle.id && vehicle.tcarsVehicleId);
}

function orwiiAliasStatement(db, { vehicleId, system, externalKey, plateKey, learnedBy, updatedAt }) {
  return db.prepare(`
    INSERT INTO fleet_vehicle_external_aliases (
      id, vehicle_id, external_system, external_key, normalized_license_plate,
      status, match_method, confidence, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, 'high', ?, ?, ?)
    ON CONFLICT(external_system, external_key) DO UPDATE SET
      normalized_license_plate = CASE
        WHEN fleet_vehicle_external_aliases.vehicle_id = excluded.vehicle_id
          THEN excluded.normalized_license_plate
        ELSE fleet_vehicle_external_aliases.normalized_license_plate
      END,
      updated_at = excluded.updated_at
  `).bind(
    randomId("fleet-alias-orwii"),
    vehicleId,
    system,
    externalKey,
    plateKey || null,
    learnedBy,
    JSON.stringify({ source: "orwii", learnedBy, readOnlySource: true }),
    updatedAt,
    updatedAt
  );
}

export async function persistMatchedOrwiiAliases(db, transactions = [], options = {}) {
  const updatedAt = cleanString(options.updatedAt) || new Date().toISOString();
  const aliases = new Map();
  const conflicts = new Set();
  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    const vehicleId = cleanString(transaction?.match?.vehicleId);
    if (!vehicleId || cleanString(transaction?.match?.status) !== "matched") continue;
    const plateKey = licensePlateKey(normalizeLicensePlate(transaction?.licensePlate));
    const learnedBy = cleanString(transaction?.match?.method) || "verified_match";
    const vehicleExternalId = cleanString(transaction?.vehicleExternalId);
    if (vehicleExternalId) {
      const key = `${ORWII_VEHICLE_SYSTEM}:${vehicleExternalId}`;
      if (aliases.has(key) && aliases.get(key).vehicleId !== vehicleId) conflicts.add(key);
      aliases.set(key, {
        vehicleId, system: ORWII_VEHICLE_SYSTEM, externalKey: vehicleExternalId, plateKey, learnedBy, updatedAt
      });
    }
    const chipId = normalizedChip(transaction?.chipId);
    if (chipId) {
      const key = `${ORWII_CHIP_SYSTEM}:${chipId}`;
      if (aliases.has(key) && aliases.get(key).vehicleId !== vehicleId) conflicts.add(key);
      aliases.set(key, {
        vehicleId, system: ORWII_CHIP_SYSTEM, externalKey: chipId, plateKey, learnedBy, updatedAt
      });
    }
  }
  const statements = [...aliases.entries()]
    .filter(([key]) => !conflicts.has(key))
    .map(([, alias]) => orwiiAliasStatement(db, alias));
  const results = statements.length ? await runBatches(db, statements) : [];
  return { seen: aliases.size, conflicts: conflicts.size, written: changesFromResults(results), updatedAt };
}

export const FLEET_ALIAS_SYSTEMS = Object.freeze({
  tcars: TCARS_SYSTEM,
  orwiiVehicle: ORWII_VEHICLE_SYSTEM,
  orwiiChip: ORWII_CHIP_SYSTEM
});
