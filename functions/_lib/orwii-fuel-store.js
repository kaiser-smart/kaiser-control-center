import { loadFleetVehiclesWithAssignments } from "./fleet-vehicles-store.js";
import {
  loadFleetVehiclesFromAliases,
  persistMatchedOrwiiAliases
} from "./fleet-vehicle-aliases.js";
import { licensePlateKey, normalizeLicensePlate, vehicleLicensePlateValue } from "../../src/data/licensePlate.js";

const DB_BINDING = "SMART_ODPADY_DB";
const ORWII_API_BASE_URL = "https://api007.orwii.com:7080";
const MAX_TRANSACTIONS = 2_000;
const SYNC_LOOKBACK_DAYS = 3;
const INITIAL_SYNC_LOOKBACK_DAYS = 31;
const SYNC_RUNNER_NAME = "orwii-fuel-cloud-sync";
const SYNC_RULE_ID = "fleet-orwii-automatic-matching-phase1b";

export class OrwiiFuelStoreError extends Error {
  constructor(message, status = 400, code = "orwii_fuel_error") { super(message); this.status = status; this.code = code; }
}

function cleanString(value) { return String(value ?? "").trim(); }
function numberValue(value) {
  if (value === null || value === undefined || cleanString(value) === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;
  if (!db && required) throw new OrwiiFuelStoreError("D1 databáze není nastavená. Přidejte binding SMART_ODPADY_DB a spusťte migraci 0033_create_orwii_fuel_sync.sql.", 503, "orwii_database_missing");
  return db;
}
function apiConfig(env = {}) {
  const baseUrl = cleanString(env.ORWII_API_BASE_URL || ORWII_API_BASE_URL).replace(/\/+$/, "");
  const username = cleanString(env.ORWII_API_USERNAME);
  const password = cleanString(env.ORWII_API_PASSWORD);
  return { baseUrl, username, password, configured: Boolean(baseUrl && username && password) };
}
export function orwiiFuelStatus(env = {}) {
  const config = apiConfig(env);
  return {
    apiStatus: config.configured ? "ready" : "off",
    configured: config.configured,
    mode: "cloud-scheduled-sync",
    automation: config.configured ? "scheduled" : "off",
    runner: SYNC_RUNNER_NAME,
    schedule: "17 * * * *",
    message: config.configured
      ? "ORWII přístup je nastavený pro cloudovou hodinovou synchronizaci přes krátkodobý Bearer token. Náhled zůstává read-only."
      : "ORWII přístup není nastavený. Doplňte Cloudflare secrets ORWII_API_USERNAME a ORWII_API_PASSWORD; hodnoty nepatří do frontendu ani repozitáře."
  };
}
function dateValue(value, label) {
  const result = cleanString(value);
  if (!result) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new OrwiiFuelStoreError(`${label} musí být ve formátu RRRR-MM-DD.`, 400, "orwii_date_invalid");
  return result;
}
function transactionRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["transactions", "items", "data", "results", "rows"]) if (Array.isArray(payload?.[key])) return payload[key];
  throw new OrwiiFuelStoreError("Odpověď ORWII neobsahuje rozpoznatelný seznam tankování. Nastavte kontrakt endpointu podle dokumentace ORWII.", 422, "orwii_response_shape_unknown");
}
function pick(row, keys) { for (const key of keys) { const value = row?.[key]; if (value !== undefined && value !== null && cleanString(value)) return value; } return ""; }
export function normalizeOrwiiFuelTransaction(row = {}, index = 0) {
  const externalId = cleanString(pick(row, ["id", "transactionId", "transaction_id", "uuid", "receiptId", "receipt_id"]));
  if (!externalId) throw new OrwiiFuelStoreError(`Řádek ${index + 1} z ORWII nemá unikátní ID transakce.`, 422, "orwii_transaction_id_missing");
  const fromMilliseconds = numberValue(row.from);
  const timestamp = fromMilliseconds ? new Date(fromMilliseconds).toISOString() : cleanString(pick(row, ["timestamp", "dateTime", "datetime", "occurredAt", "occurred_at", "createdAt", "created_at", "date"]));
  const liters = numberValue(row.volumeInLitres ?? pick(row, ["liters", "volume", "quantity", "amountLiters", "amount_liters"]));
  const fuelType = cleanString(row.productType?.name || row.productType?.productType || pick(row, ["fuelType", "fuel_type", "product", "productName", "fuel"]));
  const licensePlate = normalizeLicensePlate(row.vehicle?.registrationNumber || pick(row, ["licensePlate", "license_plate", "plate", "vehiclePlate", "vehicle_plate"]));
  const vehicleExternalId = cleanString(row.vehicle?.id || pick(row, ["vehicleId", "vehicle_id", "vehicleExternalId", "vehicle_external_id"]));
  const chipId = cleanString(row.vehicleIdentifierValue || pick(row, ["chipId", "chip_id", "cardId", "card_id", "rfid", "tagId", "tag_id"]));
  const rawOdometer = numberValue(row.vehicle?.currentCounterState ?? pick(row, ["odometerKm", "odometer_km", "odometer", "mileage"]));
  const odometerKm = row.vehicle?.counterType === "OdometerInMeters" && rawOdometer !== null ? rawOdometer / 1000 : rawOdometer;
  const unitPrice = numberValue(row.pricePerUnit?.value ?? pick(row, ["unitPrice", "unit_price", "pricePerLiter", "price_per_liter"]));
  const totalPrice = numberValue(row.price?.value ?? pick(row, ["totalPrice", "total_price", "amount", "total"]));
  return { externalId, timestamp, liters, fuelType, licensePlate, vehicleExternalId, chipId, odometerKm, unitPrice, totalPrice, raw: row };
}
function vehicleId(vehicle = {}) { return cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId); }
function normalizedChip(value) { return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function uniqueVehicles(vehicles = []) {
  const result = new Map();
  for (const vehicle of vehicles) {
    const id = vehicleId(vehicle);
    if (id && !result.has(id)) result.set(id, vehicle);
  }
  return [...result.values()];
}
export function matchFuelTransactionToVehicle(transaction, vehicles = []) {
  const byExternalId = transaction.vehicleExternalId ? uniqueVehicles(vehicles.filter((vehicle) => {
    const aliases = [vehicle.orwiiVehicleId, vehicle.orwii_vehicle_id, ...(Array.isArray(vehicle.orwiiVehicleIds) ? vehicle.orwiiVehicleIds : [])]
      .map(cleanString)
      .filter(Boolean);
    return aliases.includes(transaction.vehicleExternalId);
  })) : [];
  const chip = normalizedChip(transaction.chipId);
  const byChip = chip ? uniqueVehicles(vehicles.filter((vehicle) => {
    const aliases = [vehicle.fuelChipId, vehicle.fuel_chip_id, ...(Array.isArray(vehicle.fuelChipIds) ? vehicle.fuelChipIds : [])]
      .map(normalizedChip)
      .filter(Boolean);
    return aliases.includes(chip);
  })) : [];
  const plate = licensePlateKey(transaction.licensePlate);
  const byPlate = plate ? uniqueVehicles(vehicles.filter((vehicle) => licensePlateKey(normalizeLicensePlate(vehicleLicensePlateValue(vehicle))) === plate)) : [];
  const candidates = [...new Set([...byExternalId, ...byChip, ...byPlate].map(vehicleId).filter(Boolean))];
  const anyAmbiguousSignal = [byExternalId, byChip, byPlate].some((matches) => matches.length > 1);
  if (candidates.length !== 1 || anyAmbiguousSignal) {
    return { status: candidates.length || anyAmbiguousSignal ? "ambiguous" : "unmatched", method: "", vehicleId: "", candidates };
  }
  const matchedVehicleId = candidates[0];
  if (byExternalId.some((vehicle) => vehicleId(vehicle) === matchedVehicleId)) {
    return { status: "matched", method: "orwii_vehicle_id", vehicleId: matchedVehicleId };
  }
  if (byChip.some((vehicle) => vehicleId(vehicle) === matchedVehicleId)) {
    return { status: "matched", method: "fuel_chip_id", vehicleId: matchedVehicleId };
  }
  return { status: "matched", method: "license_plate", vehicleId: matchedVehicleId };
}
function asUnixMilliseconds(date, endOfDay = false) {
  const value = new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).getTime();
  if (!Number.isFinite(value)) throw new OrwiiFuelStoreError("Datum se nepodařilo převést pro ORWII.", 400, "orwii_date_invalid");
  return String(value);
}
async function fetchOrwiiBearerToken(config) {
  let response;
  try {
    response = await fetch(`${config.baseUrl}/getShortLivedToken`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: config.username, password: config.password }).toString()
    });
  } catch (error) {
    throw new OrwiiFuelStoreError(`ORWII token API není dostupné: ${cleanString(error?.message) || "chyba sítě"}.`, 502, "orwii_token_unreachable");
  }
  if (!response.ok) throw new OrwiiFuelStoreError(`ORWII token API vrátilo HTTP ${response.status}.`, 502, "orwii_token_http_error");
  let payload;
  try { payload = await response.json(); } catch { throw new OrwiiFuelStoreError("ORWII token API nevrátilo platný JSON.", 502, "orwii_token_json_invalid"); }
  const token = cleanString(payload?.token);
  if (!token) throw new OrwiiFuelStoreError("ORWII token API nevrátilo přístupový token.", 502, "orwii_token_missing");
  return token;
}
async function fetchOrwiiJson(config, token, path, params = {}) {
  const url = new URL(`${config.baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  let response;
  try { response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }); } catch (error) { throw new OrwiiFuelStoreError(`ORWII API není dostupné: ${cleanString(error?.message) || "chyba sítě"}.`, 502, "orwii_unreachable"); }
  if (!response.ok) throw new OrwiiFuelStoreError(`ORWII API vrátilo HTTP ${response.status}.`, 502, "orwii_http_error");
  try { return await response.json(); } catch { throw new OrwiiFuelStoreError("ORWII API nevrátilo platný JSON.", 502, "orwii_json_invalid"); }
}
async function fetchTransactions(env, { from = "", to = "" } = {}) {
  const config = apiConfig(env);
  if (!config.configured) throw new OrwiiFuelStoreError(orwiiFuelStatus(env).message, 503, "orwii_not_configured");
  if (!from || !to) throw new OrwiiFuelStoreError("Pro ORWII vyplňte datum od i do.", 400, "orwii_date_range_required");
  const token = await fetchOrwiiBearerToken(config);
  const stations = transactionRows(await fetchOrwiiJson(config, token, "/getFillingStations"));
  const results = await Promise.all(stations.map((station) => fetchOrwiiJson(config, token, "/getRefuellings", { fillingStationId: station.id, from: asUnixMilliseconds(from), to: asUnixMilliseconds(to, true) })));
  return results.flatMap(transactionRows).slice(0, MAX_TRANSACTIONS);
}
export async function previewOrwiiFuelTransactions(env, user, input = {}) {
  const from = dateValue(input.from, "Datum od"); const to = dateValue(input.to, "Datum do");
  if (from && to && from > to) throw new OrwiiFuelStoreError("Datum od nesmí být po datu do.", 400, "orwii_date_range_invalid");
  const [rows, fleet] = await Promise.all([fetchTransactions(env, { from, to }), loadFleetVehiclesWithAssignments(env, user)]);
  const transactions = rows.map((row, index) => { const transaction = normalizeOrwiiFuelTransaction(row, index); return { ...transaction, match: matchFuelTransactionToVehicle(transaction, fleet.vehicles || []) }; });
  const summary = transactions.reduce((result, item) => { result.total += 1; result[item.match.status] = (result[item.match.status] || 0) + 1; return result; }, { total: 0, matched: 0, unmatched: 0, ambiguous: 0 });
  return { apiStatus: "ready", mode: "manual-read-only-preview", from, to, summary, transactions };
}
export async function listOrwiiFuelTransactions(env, limit = 100) {
  const db = database(env, true); const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = await db.prepare(`SELECT * FROM fleet_orwii_fuel_transactions ORDER BY occurred_at DESC, updated_at DESC LIMIT ?`).bind(safeLimit).all();
  return { apiStatus: "ready", mode: "cloud-scheduled-sync", transactions: result.results || [] };
}

const ORWII_FUEL_ANALYTICS_PERIODS = new Set(["today", "7d", "30d", "12m", "all"]);

function analyticsPeriod(value) {
  const period = cleanString(value || "30d").toLowerCase();
  if (!ORWII_FUEL_ANALYTICS_PERIODS.has(period)) {
    throw new OrwiiFuelStoreError("Neplatné období statistik PHM.", 400, "orwii_analytics_period_invalid");
  }
  return period;
}

function utcDateDaysAgo(days, now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)).toISOString().slice(0, 10);
}

function analyticsRange(period, now = new Date()) {
  const to = utcDateDaysAgo(0, now);
  if (period === "all") return { from: "", to };
  const days = period === "today" ? 0 : period === "7d" ? 6 : period === "12m" ? 364 : 29;
  return { from: utcDateDaysAgo(days, now), to };
}

function finiteNumber(value) {
  if (value === null || value === undefined || cleanString(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function transactionCost(row = {}) {
  const total = finiteNumber(row.total_price);
  if (total !== null && total >= 0) return total;
  const liters = finiteNumber(row.liters);
  const unitPrice = finiteNumber(row.unit_price);
  return liters !== null && liters >= 0 && unitPrice !== null && unitPrice >= 0 ? liters * unitPrice : null;
}

function rounded(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function fuelAggregate(rows = []) {
  const result = {
    transactionCount: 0,
    liters: 0,
    totalCost: 0,
    pricedCount: 0,
    pricedLiters: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    ambiguousCount: 0
  };
  for (const row of rows) {
    result.transactionCount += 1;
    const liters = finiteNumber(row.liters);
    if (liters !== null && liters >= 0) result.liters += liters;
    const cost = transactionCost(row);
    if (cost !== null) {
      result.totalCost += cost;
      result.pricedCount += 1;
      if (liters !== null && liters >= 0) result.pricedLiters += liters;
    }
    const status = cleanString(row.match_status || "unmatched").toLowerCase();
    if (status === "matched") result.matchedCount += 1;
    else if (status === "ambiguous") result.ambiguousCount += 1;
    else result.unmatchedCount += 1;
  }
  return {
    ...result,
    liters: rounded(result.liters),
    totalCost: result.pricedCount > 0 ? rounded(result.totalCost) : null,
    averageUnitPrice: result.pricedLiters > 0 ? rounded(result.totalCost / result.pricedLiters, 3) : null,
    priceCoverage: result.transactionCount > 0 ? rounded(result.pricedCount / result.transactionCount, 4) : 0,
    matchCoverage: result.transactionCount > 0 ? rounded(result.matchedCount / result.transactionCount, 4) : 0
  };
}

function groupFuelRows(rows, keyForRow, labelForRow = keyForRow) {
  const groups = new Map();
  for (const row of rows) {
    const key = cleanString(keyForRow(row));
    if (!key) continue;
    const current = groups.get(key) || { key, label: cleanString(labelForRow(row)) || key, rows: [] };
    current.rows.push(row);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({ key: group.key, label: group.label, ...fuelAggregate(group.rows) }));
}

export function buildOrwiiFuelAnalytics(rows = [], options = {}) {
  const transactions = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === "object");
  const summary = fuelAggregate(transactions);
  const matchedRows = transactions.filter((row) => cleanString(row.match_status).toLowerCase() === "matched" && cleanString(row.matched_vehicle_id));
  const byVehicle = groupFuelRows(
    matchedRows,
    (row) => row.matched_vehicle_id,
    (row) => row.license_plate || row.matched_vehicle_id
  ).sort((left, right) => Number(right.totalCost || 0) - Number(left.totalCost || 0) || right.liters - left.liters);
  const byDay = groupFuelRows(
    transactions,
    (row) => cleanString(row.occurred_at).slice(0, 10)
  ).sort((left, right) => left.key.localeCompare(right.key));
  const byFuelType = groupFuelRows(
    transactions,
    (row) => row.fuel_type || "Neuvedeno"
  ).sort((left, right) => right.liters - left.liters);
  const recentTransactions = transactions.slice(0, 200).map((row) => ({
    externalId: cleanString(row.external_id),
    occurredAt: cleanString(row.occurred_at),
    fuelType: cleanString(row.fuel_type),
    liters: finiteNumber(row.liters),
    unitPrice: finiteNumber(row.unit_price),
    totalPrice: transactionCost(row),
    odometerKm: finiteNumber(row.odometer_km),
    licensePlate: cleanString(row.license_plate),
    vehicleName: cleanString(row.vehicle_name),
    orwiiVehicleId: cleanString(row.orwii_vehicle_id),
    fuelChipId: cleanString(row.fuel_chip_id),
    matchedVehicleId: cleanString(row.matched_vehicle_id),
    matchStatus: cleanString(row.match_status || "unmatched"),
    matchMethod: cleanString(row.match_method)
  }));
  return {
    apiStatus: "ready",
    mode: "cloud-scheduled-sync",
    period: cleanString(options.period || "30d"),
    range: options.range || null,
    summary,
    byVehicle,
    byDay,
    byFuelType,
    recentTransactions,
    generatedAt: new Date().toISOString(),
    dataRules: {
      companyTotals: "all_valid_transactions",
      vehicleTotals: "matched_only",
      costPerKm: "requires_verified_same_period_mileage",
      priceSemantics: "orwii_transaction_value_not_verified_accounting_cost",
      currency: "CZK"
    }
  };
}

export async function getOrwiiFuelAnalytics(env, options = {}) {
  const db = database(env, true);
  const period = analyticsPeriod(options.period);
  const range = analyticsRange(period, options.now instanceof Date ? options.now : new Date());
  const columns = `external_id, occurred_at, fuel_type, liters, unit_price, total_price, odometer_km,
    license_plate, json_extract(source_payload_json, '$.vehicle.name') AS vehicle_name,
    orwii_vehicle_id, fuel_chip_id, matched_vehicle_id, match_status, match_method`;
  const statement = range.from
    ? db.prepare(`SELECT ${columns} FROM fleet_orwii_fuel_transactions WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC, updated_at DESC`).bind(`${range.from}T00:00:00.000Z`, `${utcDateDaysAgo(-1, new Date(`${range.to}T00:00:00.000Z`))}T00:00:00.000Z`)
    : db.prepare(`SELECT ${columns} FROM fleet_orwii_fuel_transactions ORDER BY occurred_at DESC, updated_at DESC`);
  const result = await statement.all();
  return buildOrwiiFuelAnalytics(result.results || [], { period, range });
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function isoDateDaysAgo(days, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return date.toISOString().slice(0, 10);
}

function isUniqueRunningSyncError(error) {
  const message = cleanString(error?.message);
  return message.includes("UNIQUE constraint failed") || message.includes("idx_fleet_orwii_fuel_single_running");
}

async function lastSuccessfulSync(db) {
  return db.prepare(`
    SELECT requested_to
    FROM fleet_orwii_fuel_sync_runs
    WHERE status = 'completed'
    ORDER BY finished_at DESC
    LIMIT 1
  `).first();
}

async function updateOrwiiRuleState(db, { finishedAt, status, message }) {
  await db.prepare(`
    UPDATE module_rules
    SET last_run_at = ?, last_run_status = ?, last_run_message = ?, updated_at = ?
    WHERE id = ?
  `).bind(finishedAt, status, message, finishedAt, SYNC_RULE_ID).run();
}

function transactionStatements(db, transaction) {
  const match = transaction.match || {};
  return db.prepare(`
    INSERT INTO fleet_orwii_fuel_transactions (
      external_id, occurred_at, fuel_type, liters, unit_price, total_price, odometer_km,
      license_plate, orwii_vehicle_id, fuel_chip_id, matched_vehicle_id, match_status,
      match_method, source_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      occurred_at = excluded.occurred_at,
      fuel_type = excluded.fuel_type,
      liters = excluded.liters,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      odometer_km = excluded.odometer_km,
      license_plate = excluded.license_plate,
      orwii_vehicle_id = excluded.orwii_vehicle_id,
      fuel_chip_id = excluded.fuel_chip_id,
      matched_vehicle_id = excluded.matched_vehicle_id,
      match_status = excluded.match_status,
      match_method = excluded.match_method,
      source_payload_json = excluded.source_payload_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    transaction.externalId, transaction.timestamp || null, transaction.fuelType || null,
    transaction.liters, transaction.unitPrice, transaction.totalPrice, transaction.odometerKm,
    transaction.licensePlate || null, transaction.vehicleExternalId || null, transaction.chipId || null,
    match.vehicleId || null, match.status || "unmatched", match.method || null,
    JSON.stringify(transaction.raw || {})
  );
}

async function upsertTransactions(db, transactions) {
  for (let index = 0; index < transactions.length; index += 50) {
    await db.batch(transactions.slice(index, index + 50).map((transaction) => transactionStatements(db, transaction)));
  }
}

function storedTransaction(row = {}) {
  return {
    externalId: cleanString(row.external_id),
    timestamp: cleanString(row.occurred_at),
    fuelType: cleanString(row.fuel_type),
    liters: finiteNumber(row.liters),
    unitPrice: finiteNumber(row.unit_price),
    totalPrice: finiteNumber(row.total_price),
    odometerKm: finiteNumber(row.odometer_km),
    licensePlate: normalizeLicensePlate(row.license_plate),
    vehicleExternalId: cleanString(row.orwii_vehicle_id),
    chipId: cleanString(row.fuel_chip_id),
    previousMatch: {
      vehicleId: cleanString(row.matched_vehicle_id),
      status: cleanString(row.match_status || "unmatched"),
      method: cleanString(row.match_method)
    },
    raw: {}
  };
}

async function loadStoredTransactions(db) {
  const result = await db.prepare(`
    SELECT external_id, occurred_at, fuel_type, liters, unit_price, total_price, odometer_km,
           license_plate, orwii_vehicle_id, fuel_chip_id, matched_vehicle_id, match_status, match_method
    FROM fleet_orwii_fuel_transactions
    ORDER BY occurred_at DESC, external_id
  `).all();
  return (result.results || []).map(storedTransaction);
}

function matchTransactions(transactions, vehicles) {
  return transactions.map((transaction) => ({
    ...transaction,
    match: matchFuelTransactionToVehicle(transaction, vehicles)
  }));
}

function reconciliationStatement(db, transaction, updatedAt) {
  const match = transaction.match || {};
  return db.prepare(`
    UPDATE fleet_orwii_fuel_transactions
    SET matched_vehicle_id = ?, match_status = ?, match_method = ?, updated_at = ?
    WHERE external_id = ?
      AND (
        COALESCE(matched_vehicle_id, '') <> ?
        OR COALESCE(match_status, '') <> ?
        OR COALESCE(match_method, '') <> ?
      )
  `).bind(
    match.vehicleId || null,
    match.status || "unmatched",
    match.method || null,
    updatedAt,
    transaction.externalId,
    match.vehicleId || "",
    match.status || "unmatched",
    match.method || ""
  );
}

function matchSummary(transactions = []) {
  return transactions.reduce((result, transaction) => {
    const status = cleanString(transaction?.match?.status || "unmatched");
    result[status] = (result[status] || 0) + 1;
    return result;
  }, { matched: 0, unmatched: 0, ambiguous: 0 });
}

export async function reconcileStoredOrwiiFuelTransactions(db, options = {}) {
  const updatedAt = cleanString(options.updatedAt) || new Date().toISOString();
  const stored = await loadStoredTransactions(db);
  let vehicles = await loadFleetVehiclesFromAliases(db);
  const firstPass = matchTransactions(stored, vehicles);
  await persistMatchedOrwiiAliases(db, firstPass, { updatedAt });
  vehicles = await loadFleetVehiclesFromAliases(db);
  const reconciled = matchTransactions(stored, vehicles);
  const statements = reconciled.map((transaction) => reconciliationStatement(db, transaction, updatedAt));
  const results = [];
  for (let index = 0; index < statements.length; index += 50) {
    results.push(...await db.batch(statements.slice(index, index + 50)));
  }
  await persistMatchedOrwiiAliases(db, reconciled, { updatedAt });
  const updated = results.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
  return {
    total: reconciled.length,
    updated,
    vehicles: vehicles.length,
    summary: matchSummary(reconciled),
    transactions: reconciled
  };
}

/**
 * Cloudflare Worker entry point. It only reads ORWII and upserts an auditable
 * D1 mirror; it never creates fuel transactions in an external system.
 */
export async function runOrwiiFuelSyncAutomation(env, options = {}) {
  const db = database(env, true);
  const now = new Date(Number(options.scheduledTime || Date.now()));
  const startedAt = new Date().toISOString();
  const previous = await lastSuccessfulSync(db);
  const from = isoDateDaysAgo(previous?.requested_to ? SYNC_LOOKBACK_DAYS : INITIAL_SYNC_LOOKBACK_DAYS, now);
  const to = isoDateDaysAgo(0, now);
  const run = {
    id: randomId("orwii-fuel-sync-run"),
    startedAt,
    from,
    to,
    triggeredBy: cleanString(options.triggeredBy) || "cloudflare-cron"
  };

  try {
    await db.prepare(`
      INSERT INTO fleet_orwii_fuel_sync_runs (
        id, status, started_at, requested_from, requested_to, started_by_user_id, started_by_name
      ) VALUES (?, 'running', ?, ?, ?, ?, ?)
    `).bind(run.id, run.startedAt, run.from, run.to, "system", SYNC_RUNNER_NAME).run();
  } catch (error) {
    if (isUniqueRunningSyncError(error)) {
      return { mode: "cloud-scheduled-sync", status: "skipped", reason: "another_run_active", runner: SYNC_RUNNER_NAME, from, to };
    }
    throw error;
  }

  try {
    const [rows, fleetVehicles] = await Promise.all([
      fetchTransactions(env, { from, to }),
      loadFleetVehiclesFromAliases(db)
    ]);
    const transactions = rows.map((row, index) => {
      const transaction = normalizeOrwiiFuelTransaction(row, index);
      return { ...transaction, match: matchFuelTransactionToVehicle(transaction, fleetVehicles) };
    });
    await upsertTransactions(db, transactions);
    const reconciliation = await reconcileStoredOrwiiFuelTransactions(db);
    const fetchedIds = new Set(transactions.map((transaction) => transaction.externalId));
    const fetchedTransactions = reconciliation.transactions.filter((transaction) => fetchedIds.has(transaction.externalId));
    const summary = matchSummary(fetchedTransactions);
    const finishedAt = new Date().toISOString();
    await db.prepare(`
      UPDATE fleet_orwii_fuel_sync_runs
      SET status = 'completed', finished_at = ?, transaction_count = ?, matched_count = ?,
          unmatched_count = ?, ambiguous_count = ?, reprocessed_count = ?,
          stored_transaction_count = ?, stored_matched_count = ?
      WHERE id = ?
    `).bind(
      finishedAt,
      transactions.length,
      summary.matched,
      summary.unmatched,
      summary.ambiguous,
      reconciliation.updated,
      reconciliation.total,
      reconciliation.summary.matched,
      run.id
    ).run();
    const ruleMessage = `ORWII načteno ${transactions.length}; v D1 spárováno ${reconciliation.summary.matched} z ${reconciliation.total}; změněno ${reconciliation.updated}.`;
    await updateOrwiiRuleState(db, { finishedAt, status: "completed", message: ruleMessage });
    return {
      mode: "cloud-scheduled-sync",
      status: "completed",
      runner: SYNC_RUNNER_NAME,
      runId: run.id,
      from,
      to,
      transactionCount: transactions.length,
      ...summary,
      reprocessedCount: reconciliation.updated,
      storedTransactionCount: reconciliation.total,
      storedMatchedCount: reconciliation.summary.matched,
      fleetVehicleCount: reconciliation.vehicles
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const code = cleanString(error?.code) || "orwii_sync_failed";
    const message = cleanString(error?.message) || "Cloudová synchronizace ORWII selhala.";
    await db.prepare(`
      UPDATE fleet_orwii_fuel_sync_runs
      SET status = 'error', finished_at = ?, error_code = ?, error_message = ?
      WHERE id = ?
    `).bind(finishedAt, code, message, run.id).run();
    await updateOrwiiRuleState(db, { finishedAt, status: "error", message: "Cloudová synchronizace nebo párování ORWII selhalo." });
    throw error;
  }
}
