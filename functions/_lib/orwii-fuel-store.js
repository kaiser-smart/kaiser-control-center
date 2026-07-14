import { loadFleetVehiclesWithAssignments } from "./fleet-vehicles-store.js";
import { licensePlateKey, normalizeLicensePlate, vehicleLicensePlateValue } from "../../src/data/licensePlate.js";

const DB_BINDING = "SMART_ODPADY_DB";
const DEFAULT_PATH = "/api/fuel-transactions";
const MAX_TRANSACTIONS = 2_000;

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
  const baseUrl = cleanString(env.ORWII_API_BASE_URL).replace(/\/+$/, "");
  const token = cleanString(env.ORWII_API_TOKEN);
  const path = cleanString(env.ORWII_API_TRANSACTIONS_PATH || DEFAULT_PATH);
  const authHeader = cleanString(env.ORWII_API_AUTH_HEADER || "Authorization");
  const authScheme = cleanString(env.ORWII_API_AUTH_SCHEME || "Bearer");
  return { baseUrl, token, path: path.startsWith("/") ? path : `/${path}`, authHeader, authScheme, configured: Boolean(baseUrl && token) };
}
export function orwiiFuelStatus(env = {}) {
  const config = apiConfig(env);
  return { apiStatus: config.configured ? "waiting" : "off", configured: config.configured, mode: "manual-read-only-preview", automation: "off", message: config.configured ? "ORWII přístup je nastavený. Před prvním ostrým importem je nutné ověřit endpoint a strukturu odpovědi." : "ORWII přístup není nastavený. Doplňte Cloudflare secrets ORWII_API_BASE_URL a ORWII_API_TOKEN; hodnoty nepatří do frontendu ani repozitáře." };
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
  const timestamp = cleanString(pick(row, ["timestamp", "dateTime", "datetime", "occurredAt", "occurred_at", "createdAt", "created_at", "date"]));
  const liters = numberValue(pick(row, ["liters", "volume", "quantity", "amountLiters", "amount_liters"]));
  const fuelType = cleanString(pick(row, ["fuelType", "fuel_type", "product", "productName", "fuel"]));
  const licensePlate = normalizeLicensePlate(pick(row, ["licensePlate", "license_plate", "plate", "vehiclePlate", "vehicle_plate"]));
  const vehicleExternalId = cleanString(pick(row, ["vehicleId", "vehicle_id", "vehicleExternalId", "vehicle_external_id"]));
  const chipId = cleanString(pick(row, ["chipId", "chip_id", "cardId", "card_id", "rfid", "tagId", "tag_id"]));
  const odometerKm = numberValue(pick(row, ["odometerKm", "odometer_km", "odometer", "mileage"]));
  const unitPrice = numberValue(pick(row, ["unitPrice", "unit_price", "pricePerLiter", "price_per_liter"]));
  const totalPrice = numberValue(pick(row, ["totalPrice", "total_price", "amount", "total"]));
  return { externalId, timestamp, liters, fuelType, licensePlate, vehicleExternalId, chipId, odometerKm, unitPrice, totalPrice, raw: row };
}
function vehicleId(vehicle = {}) { return cleanString(vehicle.id || vehicle.vehicleId || vehicle.tcarsVehicleId); }
function normalizedChip(value) { return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function matchFuelTransactionToVehicle(transaction, vehicles = []) {
  const byExternalId = transaction.vehicleExternalId ? vehicles.filter((vehicle) => cleanString(vehicle.orwiiVehicleId || vehicle.orwii_vehicle_id) === transaction.vehicleExternalId) : [];
  if (byExternalId.length === 1) return { status: "matched", method: "orwii_vehicle_id", vehicleId: vehicleId(byExternalId[0]) };
  const chip = normalizedChip(transaction.chipId);
  const byChip = chip ? vehicles.filter((vehicle) => normalizedChip(vehicle.fuelChipId || vehicle.fuel_chip_id) === chip) : [];
  if (byChip.length === 1) return { status: "matched", method: "fuel_chip_id", vehicleId: vehicleId(byChip[0]) };
  const plate = licensePlateKey(transaction.licensePlate);
  const byPlate = plate ? vehicles.filter((vehicle) => licensePlateKey(normalizeLicensePlate(vehicleLicensePlateValue(vehicle))) === plate) : [];
  if (byPlate.length === 1) return { status: "matched", method: "license_plate", vehicleId: vehicleId(byPlate[0]) };
  const candidates = [...byExternalId, ...byChip, ...byPlate].map(vehicleId).filter(Boolean);
  return { status: candidates.length > 1 ? "ambiguous" : "unmatched", method: "", vehicleId: "", candidates: [...new Set(candidates)] };
}
async function fetchTransactions(env, { from = "", to = "" } = {}) {
  const config = apiConfig(env);
  if (!config.configured) throw new OrwiiFuelStoreError(orwiiFuelStatus(env).message, 503, "orwii_not_configured");
  const url = new URL(`${config.baseUrl}${config.path}`);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  const authorization = config.authScheme ? `${config.authScheme} ${config.token}` : config.token;
  let response;
  try { response = await fetch(url, { headers: { Accept: "application/json", [config.authHeader]: authorization } }); } catch (error) { throw new OrwiiFuelStoreError(`ORWII API není dostupné: ${cleanString(error?.message) || "chyba sítě"}.`, 502, "orwii_unreachable"); }
  if (!response.ok) throw new OrwiiFuelStoreError(`ORWII API vrátilo HTTP ${response.status}.`, 502, "orwii_http_error");
  try { return transactionRows(await response.json()).slice(0, MAX_TRANSACTIONS); } catch (error) { if (error instanceof OrwiiFuelStoreError) throw error; throw new OrwiiFuelStoreError("ORWII API nevrátilo platný JSON.", 502, "orwii_json_invalid"); }
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
  return { apiStatus: "ready", mode: "manual-import", transactions: result.results || [] };
}
