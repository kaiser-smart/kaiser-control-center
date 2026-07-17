import { getUsers } from "./auth.js";
import { getLatestCollectionRoutesVistosSnapshot } from "./collection-routes-store.js";
import { getCollectionRoutesTestSnapshot } from "./collection-routes-test-store.js";
import { hasPermission, isUserActive, normalizeRole } from "../../src/permissions.js";
import { userDynamicVariablesForAi } from "./ai-people-summary.js";
import {
  calculateCollectionRoutesReadonlyPlan,
  COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION
} from "../../src/data/collectionRoutesReadonlyCalculator.js";
import {
  buildCollectionDailyRouteDriverMap,
  matchCollectionDailyRouteHereOptimization
} from "./collection-daily-route-map.js";

const DB_BINDING = "SMART_ODPADY_DB";
const TEST_DB_BINDING = "COLLECTION_ROUTES_TEST_DB";
export const COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION = "production";
export const COLLECTION_DAILY_ROUTE_SCOPE_TEST = "test";
export const COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD = "stationary-field-test";
export const COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID = "test-field-site-501";
export const COLLECTION_DAILY_ROUTE_FIELD_TEST_VEHICLE = Object.freeze({
  code: "FIELD",
  registration: "",
  label: "Stacionární TEST tabletu"
});
const ROUTE_STATUSES = new Set(["draft", "confirmed", "active", "completed"]);
const STOP_ACTIONS = new Set(["done", "problem", "dump", "break", "reset"]);
const D1_MAX_BOUND_PARAMETERS = 100;
const DAILY_ROUTE_STOP_BOUND_VALUES_BEFORE_STATUS = 19;
const DAILY_ROUTE_STOP_BOUND_VALUES_AFTER_STATUS = 3;
const DAILY_ROUTE_STOP_BOUND_PARAMETERS =
  DAILY_ROUTE_STOP_BOUND_VALUES_BEFORE_STATUS + DAILY_ROUTE_STOP_BOUND_VALUES_AFTER_STATUS;
const DAILY_ROUTE_STOPS_PER_INSERT = Math.max(
  1,
  Math.floor(D1_MAX_BOUND_PARAMETERS / DAILY_ROUTE_STOP_BOUND_PARAMETERS)
);
const DAY_CODES = ["NE", "PO", "ÚT", "ST", "ČT", "PÁ", "SO"];
const DAY_LABELS = {
  NE: "neděle",
  PO: "pondělí",
  "ÚT": "úterý",
  ST: "středa",
  "ČT": "čtvrtek",
  "PÁ": "pátek",
  SO: "sobota"
};
const PICKUP_DAY_ID_LABELS = {
  18330: "pondělí lichá",
  18331: "úterý lichá",
  18332: "středa lichá",
  18333: "čtvrtek lichá",
  18334: "pátek lichá",
  18335: "sobota lichá",
  18336: "neděle lichá",
  18337: "pondělí sudá",
  18338: "úterý sudá",
  18339: "středa sudá",
  18340: "čtvrtek sudá",
  18341: "pátek sudá",
  18342: "sobota sudá",
  18343: "neděle sudá"
};

export const COLLECTION_DAILY_ROUTE_VEHICLES = Object.freeze([
  Object.freeze({ code: "A", registration: "3BN 3558", label: "Vůz A · 3BN 3558" }),
  Object.freeze({ code: "B", registration: "1BP 8373", label: "Vůz B · 1BP 8373" }),
  Object.freeze({ code: "C", registration: "3BE 2831", label: "Vůz C · 3BE 2831" })
]);

export class CollectionDailyRoutesError extends Error {
  constructor(message, status = 400, code = "collection_daily_routes_error") {
    super(message);
    this.name = "CollectionDailyRoutesError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function jsonString(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function nowIso() {
  return new Date().toISOString();
}

function pragueDateValue(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function dateDaysAfter(routeDate, days) {
  const date = new Date(`${routeDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeAutomationMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    ruleId: cleanString(value.ruleId),
    runner: cleanString(value.runner),
    generatedAt: cleanString(value.generatedAt),
    planVersion: cleanString(value.planVersion),
    planStatus: cleanString(value.planStatus),
    blockers: (Array.isArray(value.blockers) ? value.blockers : []).map(cleanString).filter(Boolean).slice(0, 50),
    limitations: (Array.isArray(value.limitations) ? value.limitations : []).map(cleanString).filter(Boolean).slice(0, 50),
    autoConfirmed: false,
    sendsNotifications: false,
    writesExternalSystems: false
  };
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function normalizeText(value) {
  return cleanString(value)
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectionDailyRouteScope(value) {
  const scope = cleanString(value).toLowerCase();
  if (!scope || scope === COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION) {
    return COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION;
  }
  if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST) {
    return COLLECTION_DAILY_ROUTE_SCOPE_TEST;
  }
  throw new CollectionDailyRoutesError(
    "Neplatný datový režim denní trasy.",
    400,
    "collection_daily_route_scope_invalid"
  );
}

function isCollectionDailyRouteTestManager(user) {
  return Boolean(
    isUserActive(user) && ["admin", "management"].includes(normalizeRole(user?.role))
  );
}

function assertTestScopeManager(user, scope) {
  if (scope !== COLLECTION_DAILY_ROUTE_SCOPE_TEST) return;
  if (!isCollectionDailyRouteTestManager(user)) {
    throw new CollectionDailyRoutesError(
      "Testovací denní trasy jsou dostupné pouze roli Management a Admin.",
      403,
      "collection_daily_route_test_forbidden"
    );
  }
}

function assertTestScopeReader(user, scope) {
  if (scope !== COLLECTION_DAILY_ROUTE_SCOPE_TEST) return;
  if (
    isCollectionDailyRouteTestManager(user)
    || (isUserActive(user) && normalizeRole(user?.role) === "ridic")
  ) {
    return;
  }
  throw new CollectionDailyRoutesError(
    "Testovací denní trasa není tomuto uživateli dostupná.",
    403,
    "collection_daily_route_test_forbidden"
  );
}

function collectionDailyRouteTestMode(scope, value) {
  const testMode = cleanString(value).toLowerCase();
  if (!testMode) return "";
  if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST && testMode === COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD) {
    return testMode;
  }
  throw new CollectionDailyRoutesError(
    "Neplatný typ TEST denní trasy.",
    400,
    "collection_daily_route_test_mode_invalid"
  );
}

function database(env, required = false, scopeValue = COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION) {
  const scope = collectionDailyRouteScope(scopeValue);
  const binding = scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST ? TEST_DB_BINDING : DB_BINDING;
  const db = env?.[binding] || null;
  if (!db && required) {
    throw new CollectionDailyRoutesError(
      scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
        ? "Oddělené úložiště TEST Brno 501 není nastavené."
        : "Provozní úložiště denních Svozových tras není nastavené.",
      503,
      scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
        ? "collection_daily_routes_test_database_missing"
        : "collection_daily_routes_database_missing"
    );
  }
  return db;
}

async function snapshotForScope(env, user, scope) {
  if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST) {
    assertTestScopeManager(user, scope);
    return getCollectionRoutesTestSnapshot(env, user, { limit: 10000 });
  }
  return getLatestCollectionRoutesVistosSnapshot(env, { limit: 10000, svozKaiserOnly: true });
}

function dbError(error) {
  if (error instanceof CollectionDailyRoutesError) {
    return error;
  }
  const message = cleanString(error?.message);
  if (/no such table[^\n]*collection_daily_route_/i.test(message)) {
    return new CollectionDailyRoutesError(
      "Provozní úložiště denních Svozových tras ještě není připravené.",
      503,
      "collection_daily_routes_migration_missing"
    );
  }
  if (/unique constraint failed: collection_daily_route_runs\.route_key/i.test(message)) {
    return new CollectionDailyRoutesError(
      "Pro vybraný den a vůz už denní trasa existuje.",
      409,
      "collection_daily_route_already_exists"
    );
  }
  if (/unique constraint failed: collection_daily_route_stops\.route_date, collection_daily_route_stops\.source_row_id/i.test(message)) {
    return new CollectionDailyRoutesError(
      "Některé stanoviště už je pro vybraný den zařazené v jiné trase.",
      409,
      "collection_daily_route_stop_already_scheduled"
    );
  }
  console.error("collection_daily_routes.store_failed", { message });
  return new CollectionDailyRoutesError(
    "Denní Svozové trasy se teď nepodařilo načíst nebo uložit.",
    500,
    "collection_daily_routes_store_failed"
  );
}

function assertManage(user) {
  if (!hasPermission(user, "collection-routes", "manage")) {
    throw new CollectionDailyRoutesError("Nemáte oprávnění spravovat denní Svozové trasy.", 403, "collection_daily_routes_forbidden");
  }
}

function isAssignedDriver(user, run) {
  return Boolean(
    isUserActive(user) &&
    normalizeRole(user?.role) === "ridic" &&
    cleanString(user?.id) &&
    cleanString(user?.id) === cleanString(run?.driver_user_id || run?.driverUserId)
  );
}

function assertCanReadRun(user, run) {
  if (!user) {
    throw new CollectionDailyRoutesError("Nepřihlášeno.", 401, "collection_daily_routes_unauthenticated");
  }
  if (normalizeRole(user?.role) === "ridic") {
    if (isAssignedDriver(user, run)) return;
    throw new CollectionDailyRoutesError("Řidič může zobrazit pouze svoji přiřazenou trasu.", 403, "collection_daily_routes_forbidden");
  }
  if (hasPermission(user, "collection-routes", "view")) {
    return;
  }
  throw new CollectionDailyRoutesError("Nemáte oprávnění zobrazit tuto denní trasu.", 403, "collection_daily_routes_forbidden");
}

function assertCanOperateRun(user, run) {
  if (hasPermission(user, "collection-routes", "manage") || isAssignedDriver(user, run)) {
    return;
  }
  throw new CollectionDailyRoutesError("Tuto trasu může ovládat jen přiřazený řidič nebo dispečer.", 403, "collection_daily_routes_forbidden");
}

function runDataScope(run = {}) {
  const metadata = run?.metadata && typeof run.metadata === "object"
    ? run.metadata
    : parseJson(run?.metadata_json, {});
  const sourceMode = cleanString(run?.source_mode || run?.sourceMode);
  return metadata.dataScope === COLLECTION_DAILY_ROUTE_SCOPE_TEST || sourceMode === "synthetic-brno-test"
    ? COLLECTION_DAILY_ROUTE_SCOPE_TEST
    : COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION;
}

function assertRunMatchesScope(run, scope) {
  if (runDataScope(run) === scope) return;
  throw new CollectionDailyRoutesError(
    "Denní trasa nebyla nalezena.",
    404,
    "collection_daily_route_not_found"
  );
}

function assertTestRunAccess(user, run, scope) {
  if (
    scope !== COLLECTION_DAILY_ROUTE_SCOPE_TEST
    || isCollectionDailyRouteTestManager(user)
    || isAssignedDriver(user, run)
  ) {
    return;
  }
  throw new CollectionDailyRoutesError(
    "TEST trasa nebyla nalezena.",
    404,
    "collection_daily_route_not_found"
  );
}

export function isCollectionDailyRouteStationaryFieldTest(run = {}) {
  const metadata = run?.metadata && typeof run.metadata === "object"
    ? run.metadata
    : parseJson(run?.metadata_json, {});
  return cleanString(metadata.testMode) === COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD;
}

export function collectionDailyRouteExternalEffectsDisabled(run = {}) {
  const metadata = run?.metadata && typeof run.metadata === "object"
    ? run.metadata
    : parseJson(run?.metadata_json, {});
  return metadata.externalEffectsDisabled === true
    || metadata.notificationsDisabled === true;
}

function assertStationaryFieldTester(user, run) {
  if (!isCollectionDailyRouteStationaryFieldTest(run)) return;
  if (!isCollectionDailyRouteTestManager(user) && !isAssignedDriver(user, run)) {
    throw new CollectionDailyRoutesError(
      "Tento stacionární TEST může ovládat pouze přiřazený řidič nebo role Management a Admin.",
      403,
      "collection_daily_route_field_tester_mismatch"
    );
  }
}

function vehicleByCode(value) {
  const code = cleanString(value).toUpperCase();
  const vehicle = COLLECTION_DAILY_ROUTE_VEHICLES.find((item) => item.code === code) || null;
  if (!vehicle) {
    throw new CollectionDailyRoutesError("Vyberte platný svozový vůz A, B nebo C.", 400, "collection_daily_route_vehicle_invalid");
  }
  return vehicle;
}

function routeDateValue(value) {
  const routeDate = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
    throw new CollectionDailyRoutesError("Vyberte platné datum denní trasy.", 400, "collection_daily_route_date_invalid");
  }
  const date = new Date(`${routeDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== routeDate) {
    throw new CollectionDailyRoutesError("Vyberte platné datum denní trasy.", 400, "collection_daily_route_date_invalid");
  }
  return routeDate;
}

function isoWeekNumber(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

export function collectionDailyRouteDateInfo(value) {
  const routeDate = routeDateValue(value);
  const date = new Date(`${routeDate}T12:00:00.000Z`);
  const isoWeek = isoWeekNumber(date);
  const parity = isoWeek % 2 === 0 ? "even" : "odd";
  const dayCode = DAY_CODES[date.getUTCDay()];
  return {
    routeDate,
    dayCode,
    dayLabel: DAY_LABELS[dayCode],
    isoWeek,
    parity,
    weekMode: parity === "even" ? "sudý týden" : "lichý týden"
  };
}

function dayCodeFromText(value) {
  const text = normalizeText(value);
  if (/(^|[^a-z])po([^a-z]|$)|pondel|monday|montag/.test(text)) return "PO";
  if (/(^|[^a-z])ut([^a-z]|$)|uter|tuesday|dienstag/.test(text)) return "ÚT";
  if (/(^|[^a-z])st([^a-z]|$)|stred|wednesday|mittwoch/.test(text)) return "ST";
  if (/(^|[^a-z])ct([^a-z]|$)|ctvrt|thursday|donnerstag/.test(text)) return "ČT";
  if (/(^|[^a-z])pa([^a-z]|$)|patek|friday|freitag/.test(text)) return "PÁ";
  if (/(^|[^a-z])so([^a-z]|$)|sobot|saturday|samstag/.test(text)) return "SO";
  if (/(^|[^a-z])ne([^a-z]|$)|nedel|sunday|sonntag/.test(text)) return "NE";
  return "";
}

function parityFromText(value) {
  const text = normalizeText(value);
  if (/lich|odd|nepar|ungerade/.test(text)) return "odd";
  if (/sud|even|parn|gerade/.test(text.replaceAll("nepar", ""))) return "even";
  return "all";
}

function pickupScheduleEntries(value) {
  const expanded = cleanString(value).replace(/\b(1833[0-9]|1834[0-3])\b/g, (match) => PICKUP_DAY_ID_LABELS[match] || match);
  return expanded
    .split(/[,;|]+/)
    .map((part) => ({ dayCode: dayCodeFromText(part), parity: parityFromText(part), text: cleanString(part) }))
    .filter((entry) => entry.dayCode);
}

function isMonthlyFrequency(value) {
  return /1\s*x\s*30|mesic|monthly/.test(normalizeText(value));
}

function monthlyScheduleEligibility(summary, dateInfo) {
  const schedule = summary?.pickupSchedule;
  const dayCodes = Array.isArray(schedule?.dayCodes) ? schedule.dayCodes.map(cleanString).filter(Boolean) : [];
  const weekOfMonth = Number(schedule?.weekOfMonth);
  if (schedule?.mode !== "monthly-weekday" || dayCodes.length !== 1 || !Number.isInteger(weekOfMonth) || weekOfMonth < 1 || weekOfMonth > 5) {
    return { ok: false, reason: "Měsíční četnost nemá potvrzený pevný pracovní den v měsíci." };
  }
  if (dayCodes[0] !== dateInfo.dayCode) {
    return { ok: false, reason: `Položka není plánovaná na ${dateInfo.dayLabel}.` };
  }
  const dayOfMonth = Number(dateInfo.routeDate.slice(8, 10));
  const actualWeekOfMonth = Math.floor((dayOfMonth - 1) / 7) + 1;
  if (actualWeekOfMonth !== weekOfMonth) {
    return { ok: false, reason: `Položka je plánovaná na ${weekOfMonth}. ${dateInfo.dayLabel} v měsíci.` };
  }
  return { ok: true, reason: "" };
}

function routeAddress(summary = {}) {
  const addressPlace = cleanString(summary.addressPlaceRaw);
  const addressPlaceKey = normalizeText(addressPlace).replace(/[^a-z0-9]+/g, "");
  const genericAddressPlace = !addressPlace || /^\d+$/.test(addressPlace) ||
    ["branch", "company", "customer", "directory", "directorybranch", "firma", "pobocka", "zakaznik"].includes(addressPlaceKey) ||
    (/\s-\s*\d{6,12}$/.test(addressPlace) && /s\.?\s*r\.?\s*o|a\.?\s*s|spol|druzstvo/i.test(normalizeText(addressPlace)));
  return genericAddressPlace ? "" : addressPlace;
}

function withinDateRange(routeDate, summary) {
  const from = cleanString(summary.pickupFrom || summary.validFrom).slice(0, 10);
  const to = cleanString(summary.pickupTo || summary.validTo).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && routeDate < from) {
    return { ok: false, reason: `Svoz platí až od ${from}.` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to) && routeDate > to) {
    return { ok: false, reason: `Svoz platil jen do ${to}.` };
  }
  return { ok: true, reason: "" };
}

function eligibility(row, dateInfo, scheduledRunId = "", options = {}) {
  const summary = row?.summary || {};
  const issues = Array.isArray(row?.issues) ? row.issues : [];
  const issueCount = Math.max(numberValue(summary.issueCount), issues.length);
  const sourceRowId = cleanString(row?.id);
  const result = {
    sourceRowId,
    rowNumber: numberValue(row?.rowNumber),
    customerName: cleanString(summary.customerName),
    addressText: routeAddress(summary),
    stationName: cleanString(summary.stationName || summary.siteName),
    wasteType: cleanString(summary.wasteType),
    containerVolume: numberValue(summary.containerVolume),
    containerCount: Math.max(1, Math.floor(numberValue(summary.containerCount, 1))),
    latitude: summary.latitude !== null && cleanString(summary.latitude) && Number.isFinite(Number(summary.latitude))
      ? Number(summary.latitude)
      : null,
    longitude: summary.longitude !== null && cleanString(summary.longitude) && Number.isFinite(Number(summary.longitude))
      ? Number(summary.longitude)
      : null,
    frequency: cleanString(summary.frequency),
    pickupDaysText: cleanString(summary.pickupDaysText || summary.pickupDays),
    contractNumber: cleanString(summary.contractNumber || summary.sourceContractId),
    eligible: false,
    reason: ""
  };

  if (scheduledRunId) {
    return { ...result, reason: "Stanoviště už je pro tento den zařazené v jiné trase.", scheduledRunId };
  }
  if (summary.svozKaiserIncluded !== true) {
    return { ...result, reason: "Položka není potvrzená jako Svoz Kaiser ANO." };
  }
  if (issueCount > 0) {
    return { ...result, reason: `Položka má ${issueCount} neuzavřených datových kontrol.` };
  }
  if (summary.onDemand === true || cleanString(summary.serviceMode) === "on_demand") {
    return { ...result, reason: "Svoz na výzvu se do pravidelné denní trasy nezařazuje." };
  }
  if (!result.addressText) {
    return { ...result, reason: "Chybí potvrzené Adresní místo." };
  }
  if (!result.wasteType) {
    return { ...result, reason: "Chybí potvrzený druh odpadu." };
  }
  if (!result.containerVolume) {
    return { ...result, reason: "Chybí potvrzený objem nádoby." };
  }
  if (!result.frequency) {
    return { ...result, reason: "Chybí potvrzená četnost svozu." };
  }
  const dateRange = withinDateRange(dateInfo.routeDate, summary);
  if (!dateRange.ok) {
    return { ...result, reason: dateRange.reason };
  }
  if (options.bypassPickupSchedule === true) {
    return { ...result, eligible: true };
  }
  if (isMonthlyFrequency(result.frequency)) {
    const monthly = monthlyScheduleEligibility(summary, dateInfo);
    return monthly.ok ? { ...result, eligible: true } : { ...result, reason: monthly.reason };
  }
  const schedule = pickupScheduleEntries(result.pickupDaysText);
  if (!schedule.length) {
    return { ...result, reason: "Chybí jednoznačný den svozu." };
  }
  const dayEntries = schedule.filter((entry) => entry.dayCode === dateInfo.dayCode);
  if (!dayEntries.length) {
    return { ...result, reason: `Položka není plánovaná na ${dateInfo.dayLabel}.` };
  }
  if (!dayEntries.some((entry) => entry.parity === "all" || entry.parity === dateInfo.parity)) {
    return { ...result, reason: `Položka není plánovaná na ${dateInfo.weekMode}.` };
  }
  return { ...result, eligible: true };
}

function selectedIds(input = {}) {
  const values = Array.isArray(input.sourceRowIds) ? input.sourceRowIds : [];
  return [...new Set(values.map(cleanString).filter(Boolean))].slice(0, 1000);
}

async function scheduledStopsForDate(db, routeDate) {
  const result = await db.prepare(`
    SELECT source_row_id, run_id
    FROM collection_daily_route_stops
    WHERE route_date = ?
  `).bind(routeDate).all();
  return new Map((result.results || []).map((row) => [cleanString(row.source_row_id), cleanString(row.run_id)]));
}

export async function previewCollectionDailyRoute(env, userOrInput = {}, maybeInput) {
  const user = maybeInput === undefined ? null : userOrInput;
  const input = maybeInput === undefined ? userOrInput : maybeInput;
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeManager(user, scope);
  const testMode = collectionDailyRouteTestMode(scope, input.testMode);
  const stationaryFieldTest = testMode === COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD;
  const db = database(env, true, scope);
  const dateInfo = collectionDailyRouteDateInfo(input.routeDate);
  const vehicle = stationaryFieldTest ? COLLECTION_DAILY_ROUTE_FIELD_TEST_VEHICLE : vehicleByCode(input.vehicleCode);
  try {
    const snapshot = await snapshotForScope(env, user, scope);
    if (!snapshot.batch?.id) {
      throw new CollectionDailyRoutesError(
        scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
          ? "Není dostupná připravená sada TEST Brno 501."
          : "Není dostupný žádný připravený Vistos Komunál snapshot.",
        409,
        "collection_daily_route_snapshot_missing"
      );
    }
    const expectedBatchId = cleanString(input.sourceBatchId);
    if (expectedBatchId && expectedBatchId !== snapshot.batch.id) {
      throw new CollectionDailyRoutesError(
        "Mezitím vznikl novější snapshot. Návrh znovu ověřte, aby trasa použila aktuální potvrzená data.",
        409,
        "collection_daily_route_snapshot_changed"
      );
    }
    const fieldTestRows = stationaryFieldTest
      ? snapshot.rows.filter((row) => cleanString(row?.summary?.sourceId || row?.sourceId) === COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID)
      : [];
    if (stationaryFieldTest && fieldTestRows.length !== 1) {
      throw new CollectionDailyRoutesError(
        "V TEST datech chybí jednoznačné stanoviště Firma test 501 na Trnkově.",
        409,
        "collection_daily_route_field_test_site_missing"
      );
    }
    const requestedIds = stationaryFieldTest ? [] : selectedIds(input);
    const requestedSet = new Set(requestedIds);
    const rows = stationaryFieldTest
      ? fieldTestRows
      : requestedIds.length
        ? snapshot.rows.filter((row) => requestedSet.has(cleanString(row.id)))
        : snapshot.rows;
    const scheduled = await scheduledStopsForDate(db, dateInfo.routeDate);
    const evaluated = rows.map((row) => eligibility(
      row,
      dateInfo,
      scheduled.get(cleanString(row.id)) || "",
      { bypassPickupSchedule: stationaryFieldTest }
    ));
    const foundIds = new Set(rows.map((row) => cleanString(row.id)));
    for (const sourceRowId of requestedIds) {
      if (!foundIds.has(sourceRowId)) {
        evaluated.push({
          sourceRowId,
          eligible: false,
          reason: "Vybraná položka už není v aktuálním potvrzeném snapshotu.",
          customerName: "",
          addressText: "",
          stationName: "",
          wasteType: "",
          containerVolume: 0,
          frequency: "",
          pickupDaysText: "",
          contractNumber: ""
        });
      }
    }
    const eligibleRows = evaluated.filter((row) => row.eligible);
    const excludedRows = evaluated.filter((row) => !row.eligible);
    return {
      scope,
      testMode,
      sourceBatchId: snapshot.batch.id,
      sourceBatchCreatedAt: snapshot.batch.createdAt,
      sourceMode: snapshot.sourceMode,
      dateInfo,
      vehicle,
      selectedCount: evaluated.length,
      eligibleCount: eligibleRows.length,
      excludedCount: excludedRows.length,
      eligibleRows,
      excludedRows,
      fieldTestSourceId: stationaryFieldTest ? COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID : "",
      scheduleBypassed: stationaryFieldTest,
      createsOperationalRoute: false
    };
  } catch (error) {
    throw dbError(error);
  }
}

function rowToRun(row, summary = null) {
  if (!row) return null;
  const status = cleanString(row.status);
  const metadata = parseJson(row.metadata_json, {});
  const sourceMode = cleanString(row.source_mode);
  return {
    id: cleanString(row.id),
    routeKey: cleanString(row.route_key),
    sourceBatchId: cleanString(row.source_batch_id),
    sourceMode,
    scope: runDataScope({ ...row, metadata }),
    routeDate: cleanString(row.route_date),
    dayCode: cleanString(row.route_day_code),
    weekMode: cleanString(row.route_week_mode),
    vehicleCode: cleanString(row.vehicle_code),
    vehicleRegistration: cleanString(row.vehicle_registration),
    vehicleLabel: cleanString(row.vehicle_label),
    driverUserId: cleanString(row.driver_user_id),
    driverName: cleanString(row.driver_name),
    title: cleanString(row.title),
    status: ROUTE_STATUSES.has(status) ? status : "draft",
    stopCount: numberValue(row.stop_count),
    excludedCount: numberValue(row.excluded_count),
    metadata,
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    confirmedByUserId: cleanString(row.confirmed_by_user_id),
    confirmedByName: cleanString(row.confirmed_by_name),
    confirmedAt: cleanString(row.confirmed_at),
    startedByUserId: cleanString(row.started_by_user_id),
    startedByName: cleanString(row.started_by_name),
    startedAt: cleanString(row.started_at),
    completedByUserId: cleanString(row.completed_by_user_id),
    completedByName: cleanString(row.completed_by_name),
    completedAt: cleanString(row.completed_at),
    reopenedByUserId: cleanString(row.reopened_by_user_id),
    reopenedByName: cleanString(row.reopened_by_name),
    reopenedAt: cleanString(row.reopened_at),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    summary: summary || {
      plannedCount: numberValue(row.planned_count),
      doneCount: numberValue(row.done_count),
      problemCount: numberValue(row.problem_count),
      eventCount: numberValue(row.event_count)
    }
  };
}

function rowToStop(row) {
  return {
    id: cleanString(row.id),
    runId: cleanString(row.run_id),
    routeDate: cleanString(row.route_date),
    sourceBatchId: cleanString(row.source_batch_id),
    sourceRowId: cleanString(row.source_row_id),
    routeOrder: numberValue(row.route_order),
    customerName: cleanString(row.customer_name),
    addressText: cleanString(row.address_text),
    stationName: cleanString(row.station_name),
    wasteType: cleanString(row.waste_type),
    wasteCode: cleanString(row.waste_code),
    containerVolume: numberValue(row.container_volume),
    containerCount: numberValue(row.container_count),
    containerType: cleanString(row.container_type),
    frequency: cleanString(row.frequency),
    pickupDaysText: cleanString(row.pickup_days_text),
    contractNumber: cleanString(row.contract_number),
    sourceContractId: cleanString(row.source_contract_id),
    note: cleanString(row.note),
    status: cleanString(row.status),
    problemReason: cleanString(row.problem_reason),
    problemNote: cleanString(row.problem_note),
    completedAt: cleanString(row.completed_at),
    lastEventAt: cleanString(row.last_event_at),
    sourceSummary: parseJson(row.source_summary_json, {}),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToEvent(row) {
  return {
    id: cleanString(row.id),
    runId: cleanString(row.run_id),
    stopId: cleanString(row.stop_id),
    eventType: cleanString(row.event_type),
    beforeStatus: cleanString(row.before_status),
    afterStatus: cleanString(row.after_status),
    reason: cleanString(row.reason),
    note: cleanString(row.note),
    idempotencyKey: cleanString(row.idempotency_key),
    actorUserId: cleanString(row.actor_user_id),
    actorName: cleanString(row.actor_name),
    createdAt: cleanString(row.created_at),
    payload: parseJson(row.payload_json, {})
  };
}

async function loadRunRow(db, runId) {
  const row = await db.prepare("SELECT * FROM collection_daily_route_runs WHERE id = ? LIMIT 1").bind(cleanString(runId)).first();
  if (!row) {
    throw new CollectionDailyRoutesError("Denní trasa nebyla nalezena.", 404, "collection_daily_route_not_found");
  }
  return row;
}

async function loadStopRow(db, runId, stopId) {
  const row = await db.prepare(`
    SELECT *
    FROM collection_daily_route_stops
    WHERE id = ? AND run_id = ?
    LIMIT 1
  `).bind(cleanString(stopId), cleanString(runId)).first();
  if (!row) {
    throw new CollectionDailyRoutesError("Zastávka do vybrané denní trasy nepatří.", 404, "collection_daily_route_stop_not_found");
  }
  return row;
}

async function collectionDailyRouteHereCandidates(db, runRow) {
  if (runDataScope(runRow) !== COLLECTION_DAILY_ROUTE_SCOPE_TEST) return [];
  try {
    const result = await db.prepare(`
      SELECT id, status, provider, result_json, completed_at
      FROM collection_route_here_runs
      WHERE scope = 'test'
        AND status = 'completed'
        AND route_date = ?
        AND source_batch_id = ?
      ORDER BY completed_at DESC, updated_at DESC
      LIMIT 20
    `).bind(cleanString(runRow.route_date), cleanString(runRow.source_batch_id)).all();
    return (result.results || []).map((row) => ({
      id: cleanString(row.id),
      status: cleanString(row.status),
      provider: cleanString(row.provider),
      result: parseJson(row.result_json, {}),
      completedAt: cleanString(row.completed_at)
    }));
  } catch (error) {
    if (/no such table[^\n]*collection_route_here_runs/i.test(cleanString(error?.message))) return [];
    throw error;
  }
}

async function detailFromRow(db, runRow) {
  const [stopsResult, eventsResult, hereCandidates] = await Promise.all([
    db.prepare(`SELECT * FROM collection_daily_route_stops WHERE run_id = ? ORDER BY route_order ASC`).bind(runRow.id).all(),
    db.prepare(`SELECT * FROM collection_daily_route_events WHERE run_id = ? ORDER BY created_at DESC LIMIT 500`).bind(runRow.id).all(),
    collectionDailyRouteHereCandidates(db, runRow)
  ]);
  const stops = (stopsResult.results || []).map(rowToStop);
  const events = (eventsResult.results || []).map(rowToEvent);
  const summary = {
    plannedCount: stops.filter((stop) => stop.status === "planned").length,
    doneCount: stops.filter((stop) => stop.status === "done").length,
    problemCount: stops.filter((stop) => stop.status === "problem").length,
    eventCount: events.length
  };
  const run = rowToRun(runRow, summary);
  const routeOptimization = matchCollectionDailyRouteHereOptimization(run, stops, hereCandidates);
  return {
    run,
    stops,
    events,
    driverMap: buildCollectionDailyRouteDriverMap(run, stops, { routeOptimization })
  };
}

function collectionDailyRouteStopInsertStatements(db, {
  preview,
  sourceRows,
  runId,
  createdAt
}) {
  const valueRows = preview.eligibleRows.map((eligibleRow, index) => {
    const sourceRow = sourceRows.get(eligibleRow.sourceRowId);
    const summary = sourceRow?.summary || {};
    return [
      randomId("collection-daily-stop"),
      runId,
      preview.dateInfo.routeDate,
      preview.sourceBatchId,
      eligibleRow.sourceRowId,
      index + 1,
      cleanString(summary.customerName),
      routeAddress(summary),
      cleanString(summary.stationName || summary.siteName),
      cleanString(summary.wasteType),
      cleanString(summary.wasteCode),
      numberValue(summary.containerVolume),
      Math.max(1, numberValue(summary.containerCount, 1)),
      cleanString(summary.containerType),
      cleanString(summary.frequency),
      cleanString(summary.pickupDaysText || summary.pickupDays),
      cleanString(summary.contractNumber || summary.sourceContractId),
      cleanString(summary.sourceContractId || summary.contractId),
      cleanString(summary.note),
      jsonString(summary),
      createdAt,
      createdAt
    ];
  });
  const placeholderRow = `(${new Array(DAILY_ROUTE_STOP_BOUND_VALUES_BEFORE_STATUS).fill("?").join(", ")}, 'planned', ${new Array(DAILY_ROUTE_STOP_BOUND_VALUES_AFTER_STATUS).fill("?").join(", ")})`;
  return chunkValues(valueRows, DAILY_ROUTE_STOPS_PER_INSERT).map((valueChunk) => db.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, station_name, waste_type, waste_code,
      container_volume, container_count, container_type, frequency, pickup_days_text,
      contract_number, source_contract_id, note, status, source_summary_json, created_at, updated_at
    ) VALUES ${valueChunk.map(() => placeholderRow).join(", ")}
  `).bind(...valueChunk.flat()));
}

export async function createCollectionDailyRouteDraft(env, user, input = {}) {
  assertManage(user);
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeManager(user, scope);
  const testMode = collectionDailyRouteTestMode(scope, input.testMode);
  const stationaryFieldTest = testMode === COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD;
  const db = database(env, true, scope);
  try {
    const requestedDate = collectionDailyRouteDateInfo(input.routeDate);
    const requestedVehicle = stationaryFieldTest ? COLLECTION_DAILY_ROUTE_FIELD_TEST_VEHICLE : vehicleByCode(input.vehicleCode);
    const requestedRouteKey = stationaryFieldTest
      ? `${requestedDate.routeDate}|${requestedVehicle.code}|${testMode}`
      : `${requestedDate.routeDate}|${requestedVehicle.code}`;
    const alreadyStored = await db.prepare("SELECT id FROM collection_daily_route_runs WHERE route_key = ? LIMIT 1").bind(requestedRouteKey).first();
    if (alreadyStored) {
      throw new CollectionDailyRoutesError("Pro vybraný den a vůz už denní trasa existuje.", 409, "collection_daily_route_already_exists");
    }
    const preview = await previewCollectionDailyRoute(env, user, input);
    if (!preview.eligibleRows.length) {
      throw new CollectionDailyRoutesError(
        "Návrh neobsahuje žádné ověřené stanoviště pro vybraný den.",
        409,
        "collection_daily_route_empty"
      );
    }
    const routeKey = requestedRouteKey;
    const snapshot = await snapshotForScope(env, user, scope);
    if (snapshot.batch?.id !== preview.sourceBatchId) {
      throw new CollectionDailyRoutesError("Zdrojový snapshot se během uložení změnil. Návrh znovu ověřte.", 409, "collection_daily_route_snapshot_changed");
    }
    const sourceRows = new Map(snapshot.rows.map((row) => [cleanString(row.id), row]));
    const runId = randomId("collection-daily-route");
    const createdAt = nowIso();
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || user?.phone);
    if (stationaryFieldTest && !actorId) {
      throw new CollectionDailyRoutesError(
        "Přihlášenému terénnímu testerovi chybí jednoznačné uživatelské ID.",
        409,
        "collection_daily_route_field_tester_id_missing"
      );
    }
    const testerAddressingName = stationaryFieldTest
      ? cleanString(userDynamicVariablesForAi(user).user_first_name_friendly_vocative)
      : "";
    const title = cleanString(input.title) || (stationaryFieldTest
      ? `Stacionární TEST GPS · ${preview.dateInfo.routeDate} · Firma test 501`
      : `${preview.dateInfo.dayLabel} ${preview.dateInfo.routeDate} · ${preview.vehicle.label}`);
    const runInsert = db.prepare(`
      INSERT INTO collection_daily_route_runs (
        id, route_key, source_batch_id, source_mode, route_date, route_day_code, route_week_mode,
        vehicle_code, vehicle_registration, vehicle_label, title, status, stop_count, excluded_count,
        metadata_json, created_by_user_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId,
      routeKey,
      preview.sourceBatchId,
      preview.sourceMode,
      preview.dateInfo.routeDate,
      preview.dateInfo.dayCode,
      preview.dateInfo.weekMode,
      preview.vehicle.code,
      preview.vehicle.registration,
      preview.vehicle.label,
      title,
      preview.eligibleCount,
      preview.excludedCount,
      jsonString({
        dataScope: scope,
        testMode,
        sourceBatchCreatedAt: preview.sourceBatchCreatedAt,
        selectedCount: preview.selectedCount,
        excludedRows: preview.excludedRows.map((row) => ({ sourceRowId: row.sourceRowId, reason: row.reason })),
        automation: safeAutomationMetadata(input.automationMetadata),
        ...(stationaryFieldTest ? {
          fieldTestSourceId: COLLECTION_DAILY_ROUTE_FIELD_TEST_SOURCE_ID,
          fieldTesterUserId: actorId,
          fieldTesterName: actorName,
          fieldTesterRole: normalizeRole(user?.role),
          fieldTesterAddressingName: testerAddressingName,
          scheduleBypassedForPhysicalTest: true,
          scheduleBypassReason: "Fyzický GPS test tabletu; uložený svozový den stanoviště se nemění.",
          createsOperationalRoute: false,
          sendsNotifications: false
        } : {})
      }),
      actorId,
      actorName,
      createdAt,
      createdAt
    );
    const stopInserts = collectionDailyRouteStopInsertStatements(db, {
      preview,
      sourceRows,
      runId,
      createdAt
    });
    const eventInsert = db.prepare(`
      INSERT INTO collection_daily_route_events (
        id, run_id, event_type, before_status, after_status, idempotency_key,
        actor_user_id, actor_name, created_at, payload_json
      ) VALUES (?, ?, 'route_created', '', 'draft', ?, ?, ?, ?, ?)
    `).bind(
      randomId("collection-daily-event"),
      runId,
      `route-created:${runId}`,
      actorId,
      actorName,
      createdAt,
      jsonString({
        sourceBatchId: preview.sourceBatchId,
        stopCount: preview.eligibleCount,
        excludedCount: preview.excludedCount,
        testMode
      })
    );
    await db.batch([runInsert, ...stopInserts, eventInsert]);
    return detailFromRow(db, await loadRunRow(db, runId));
  } catch (error) {
    throw dbError(error);
  }
}

export async function prepareCollectionDailyRouteDraftsAutomation(env, options = {}) {
  const db = database(env, true, COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION);
  const now = options.now instanceof Date
    ? options.now
    : new Date(Number(options.scheduledTime || Date.now()));
  const generatedAt = new Date().toISOString();
  const today = pragueDateValue(now);
  const routeDates = [...new Set(
    (Array.isArray(options.routeDates) && options.routeDates.length
      ? options.routeDates
      : [today, dateDaysAfter(today, 1)])
      .map(routeDateValue)
  )].slice(0, 2);
  const snapshot = await snapshotForScope(env, null, COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION);
  if (!snapshot.batch?.id) {
    return {
      status: "skipped",
      reason: "snapshot_missing",
      message: "Denní návrhy nebyly připravené: chybí platný Vistos snapshot.",
      routeDates,
      createdRuns: 0,
      createdStops: 0
    };
  }
  const snapshotCreatedAt = new Date(snapshot.batch.createdAt || "");
  const maxSnapshotAgeMs = Math.max(15 * 60 * 1000, Number(options.maxSnapshotAgeMs || 60 * 60 * 1000));
  if (Number.isNaN(snapshotCreatedAt.getTime()) || now.getTime() - snapshotCreatedAt.getTime() > maxSnapshotAgeMs) {
    return {
      status: "skipped",
      reason: "snapshot_stale",
      message: "Denní návrhy nebyly připravené: poslední Vistos snapshot je starší než povolená hodina.",
      sourceBatchId: snapshot.batch.id,
      routeDates,
      createdRuns: 0,
      createdStops: 0
    };
  }

  const systemUser = {
    id: "system:collection-routes-draft-preparation",
    name: "Cloudová příprava denních tras",
    role: "admin",
    status: "active",
    active: true
  };
  const dateResults = [];
  let createdRuns = 0;
  let createdStops = 0;

  for (const routeDate of routeDates) {
    const existingResult = await db.prepare(`
      SELECT vehicle_code, id, status
      FROM collection_daily_route_runs
      WHERE route_date = ? AND vehicle_code IN ('A', 'B', 'C')
    `).bind(routeDate).all();
    const existingCodes = new Set((existingResult.results || []).map((row) => cleanString(row.vehicle_code)));
    if (existingCodes.size) {
      dateResults.push({
        routeDate,
        status: "skipped",
        reason: "date_already_prepared",
        message: "Pro tento den už existuje denní trasa. Cloud ji kvůli bezpečnosti nepřepisuje ani nedoplňuje z novějšího snapshotu.",
        createdRuns: 0,
        createdStops: 0
      });
      continue;
    }
    const availableVehicleCodes = COLLECTION_DAILY_ROUTE_VEHICLES.map((vehicle) => vehicle.code);

    const preview = await previewCollectionDailyRoute(env, systemUser, {
      scope: COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION,
      routeDate,
      vehicleCode: availableVehicleCodes[0],
      sourceBatchId: snapshot.batch.id
    });
    if (!preview.eligibleRows.length) {
      dateResults.push({ routeDate, status: "empty", reason: "no_eligible_stops", createdRuns: 0, createdStops: 0 });
      continue;
    }
    const plan = calculateCollectionRoutesReadonlyPlan({
      routeDate,
      dateInfo: preview.dateInfo,
      eligibleRows: preview.eligibleRows,
      sourceRows: snapshot.rows,
      vehicleCodes: availableVehicleCodes
    });
    if (!plan.vehicles.length) {
      dateResults.push({ routeDate, status: "skipped", reason: "no_available_vehicle", createdRuns: 0, createdStops: 0 });
      continue;
    }
    if (plan.vehicles.some((vehicle) => vehicle.stops.length > 1000)) {
      dateResults.push({
        routeDate,
        status: "skipped",
        reason: "vehicle_stop_limit_exceeded",
        message: "Návrh překročil bezpečný limit 1000 zastávek na vozidlo.",
        createdRuns: 0,
        createdStops: 0
      });
      continue;
    }

    let dateCreatedRuns = 0;
    let dateCreatedStops = 0;
    for (const vehicle of plan.vehicles.filter((item) => item.stops.length)) {
      try {
        const route = await createCollectionDailyRouteDraft(env, systemUser, {
          scope: COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION,
          routeDate,
          vehicleCode: vehicle.code,
          sourceBatchId: snapshot.batch.id,
          sourceRowIds: vehicle.stops.map((stop) => stop.sourceRowId),
          title: `Automatický návrh · ${preview.dateInfo.dayLabel} ${routeDate} · ${vehicle.label}`,
          automationMetadata: {
            ruleId: "collection-routes-daily-draft-preparation-phase1b",
            runner: "collection-routes-daily-draft-preparation-15m",
            generatedAt,
            planVersion: COLLECTION_ROUTES_READONLY_CALCULATOR_VERSION,
            planStatus: plan.status,
            blockers: plan.blockers,
            limitations: plan.limitations
          }
        });
        dateCreatedRuns += 1;
        dateCreatedStops += Number(route.run?.stopCount || route.stops?.length || 0);
      } catch (error) {
        if (error?.code !== "collection_daily_route_already_exists") throw error;
      }
    }
    createdRuns += dateCreatedRuns;
    createdStops += dateCreatedStops;
    dateResults.push({
      routeDate,
      status: dateCreatedRuns ? "prepared" : "skipped",
      reason: dateCreatedRuns ? "drafts_created" : "no_new_drafts",
      createdRuns: dateCreatedRuns,
      createdStops: dateCreatedStops,
      planStatus: plan.status,
      blockerCount: plan.blockers.length
    });
  }

  return {
    status: "completed",
    sourceBatchId: snapshot.batch.id,
    sourceBatchCreatedAt: snapshot.batch.createdAt,
    routeDates,
    createdRuns,
    createdStops,
    autoConfirmed: false,
    autoStarted: false,
    autoCompleted: false,
    notificationsSent: false,
    dateResults,
    message: createdRuns
      ? `Cloud připravil ${createdRuns} návrhů denních tras se ${createdStops} zastávkami. Návrhy nejsou potvrzené ani spuštěné.`
      : "Cloudový běh nenašel nový bezpečný návrh denní trasy; existující trasy ani zastávky nezměnil."
  };
}

export async function listCollectionDailyRoutes(env, input = {}, user = null) {
  assertManage(user);
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeManager(user, scope);
  const db = database(env, true, scope);
  const status = cleanString(input.status);
  const routeDate = cleanString(input.routeDate);
  const limit = Math.max(1, Math.min(numberValue(input.limit, 60), 200));
  const conditions = [];
  const bindings = [];
  if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST) {
    conditions.push("(r.source_mode = 'synthetic-brno-test' OR COALESCE(CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json, '$.dataScope') ELSE '' END, '') = 'test')");
  } else {
    conditions.push("r.source_mode <> 'synthetic-brno-test'");
    conditions.push("COALESCE(CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json, '$.dataScope') ELSE '' END, '') <> 'test'");
  }
  if (status && status !== "all") {
    conditions.push("r.status = ?");
    bindings.push(status);
  }
  if (routeDate) {
    conditions.push("r.route_date = ?");
    bindings.push(routeDateValue(routeDate));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const result = await db.prepare(`
      SELECT r.*,
        SUM(CASE WHEN s.status = 'planned' THEN 1 ELSE 0 END) AS planned_count,
        SUM(CASE WHEN s.status = 'done' THEN 1 ELSE 0 END) AS done_count,
        SUM(CASE WHEN s.status = 'problem' THEN 1 ELSE 0 END) AS problem_count,
        (SELECT COUNT(*) FROM collection_daily_route_events e WHERE e.run_id = r.id) AS event_count
      FROM collection_daily_route_runs r
      LEFT JOIN collection_daily_route_stops s ON s.run_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.route_date DESC, r.vehicle_code ASC, r.created_at DESC
      LIMIT ?
    `).bind(...bindings, limit).all();
    return (result.results || []).map((row) => rowToRun(row));
  } catch (error) {
    throw dbError(error);
  }
}

export async function getCollectionDailyRoute(env, user, runId, input = {}) {
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeReader(user, scope);
  const db = database(env, true, scope);
  try {
    const runRow = await loadRunRow(db, runId);
    assertRunMatchesScope(runRow, scope);
    assertTestRunAccess(user, runRow, scope);
    assertCanReadRun(user, runRow);
    return detailFromRow(db, runRow);
  } catch (error) {
    throw dbError(error);
  }
}

export async function listCollectionDailyRouteDrivers(env) {
  try {
    const users = await getUsers(env);
    return users
      .filter((user) => isUserActive(user) && normalizeRole(user.role) === "ridic")
      .map((user) => ({
        id: cleanString(user.id),
        name: cleanString(user.name || user.email || user.phone),
        addressingName: cleanString(userDynamicVariablesForAi(user).user_first_name_friendly_vocative),
        role: "ridic"
      }))
      .filter((user) => user.id && user.name)
      .sort((left, right) => left.name.localeCompare(right.name, "cs"));
  } catch (error) {
    throw dbError(error);
  }
}

async function driverById(env, driverUserId) {
  const id = cleanString(driverUserId);
  if (!id) return null;
  const users = await getUsers(env);
  const driver = users.find((user) => cleanString(user.id) === id) || null;
  if (!driver || !isUserActive(driver) || normalizeRole(driver.role) !== "ridic") {
    throw new CollectionDailyRoutesError("Vybraný řidič není aktivní uživatel s rolí Řidič.", 400, "collection_daily_route_driver_invalid");
  }
  return driver;
}

export async function assignCollectionDailyRouteDriver(env, user, runId, input = {}) {
  assertManage(user);
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeManager(user, scope);
  const db = database(env, true, scope);
  try {
    const run = await loadRunRow(db, runId);
    assertRunMatchesScope(run, scope);
    if (isCollectionDailyRouteStationaryFieldTest(run)) {
      throw new CollectionDailyRoutesError(
        "Stacionární terénní TEST nemá řidiče ani svozové vozidlo.",
        409,
        "collection_daily_route_field_test_driver_forbidden"
      );
    }
    if (!["draft", "confirmed"].includes(cleanString(run.status))) {
      throw new CollectionDailyRoutesError("Řidiče lze změnit jen u návrhu nebo potvrzené trasy.", 409, "collection_daily_route_driver_locked");
    }
    const driver = await driverById(env, input.driverUserId);
    if (!driver && cleanString(run.status) !== "draft") {
      throw new CollectionDailyRoutesError("Potvrzená trasa musí mít přiřazeného řidiče.", 409, "collection_daily_route_driver_required");
    }
    const updatedAt = nowIso();
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || user?.phone);
    const driverId = cleanString(driver?.id);
    const driverName = cleanString(driver?.name || driver?.email || driver?.phone);
    const driverAddressingName = driver ? cleanString(userDynamicVariablesForAi(driver).user_first_name_friendly_vocative) : "";
    const metadata = {
      ...parseJson(run.metadata_json, {}),
      driverAddressingName
    };
    const idempotencyKey = cleanString(input.idempotencyKey) || `driver-assigned:${run.id}:${driverId || "none"}:${updatedAt}`;
    if (await eventByIdempotency(db, idempotencyKey)) {
      return detailFromRow(db, await loadRunRow(db, run.id));
    }
    await db.batch([
      db.prepare(`
        UPDATE collection_daily_route_runs
        SET driver_user_id = ?, driver_name = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).bind(driverId, driverName, jsonString(metadata), updatedAt, run.id),
      db.prepare(`
        INSERT INTO collection_daily_route_events (
          id, run_id, event_type, before_status, after_status, note, idempotency_key,
          actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, 'driver_assigned', ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-daily-event"),
        run.id,
        cleanString(run.status),
        cleanString(run.status),
        driverName ? `Přiřazen řidič ${driverName}.` : "Řidič byl odebrán.",
        idempotencyKey,
        actorId,
        actorName,
        updatedAt,
        jsonString({ previousDriverUserId: cleanString(run.driver_user_id), driverUserId: driverId, driverName })
      )
    ]);
    return detailFromRow(db, await loadRunRow(db, run.id));
  } catch (error) {
    throw dbError(error);
  }
}

async function eventByIdempotency(db, key) {
  if (!key) return null;
  return db.prepare("SELECT * FROM collection_daily_route_events WHERE idempotency_key = ? LIMIT 1").bind(key).first();
}

export async function transitionCollectionDailyRoute(env, user, runId, input = {}) {
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeReader(user, scope);
  const db = database(env, true, scope);
  const action = cleanString(input.action).toLowerCase();
  if (!new Set(["confirm", "start", "complete", "reopen"]).has(action)) {
    throw new CollectionDailyRoutesError("Neplatná změna stavu denní trasy.", 400, "collection_daily_route_transition_invalid");
  }
  try {
    const run = await loadRunRow(db, runId);
    assertRunMatchesScope(run, scope);
    assertTestRunAccess(user, run, scope);
    const stationaryFieldTest = isCollectionDailyRouteStationaryFieldTest(run);
    if (stationaryFieldTest) {
      assertStationaryFieldTester(user, run);
    }
    if (["confirm", "reopen"].includes(action)) {
      assertManage(user);
    } else {
      assertCanOperateRun(user, run);
    }
    const idempotencyKey = cleanString(input.idempotencyKey);
    const existingEvent = await eventByIdempotency(db, idempotencyKey);
    if (existingEvent) {
      return detailFromRow(db, await loadRunRow(db, run.id));
    }
    const transitions = {
      confirm: { from: "draft", to: "confirmed", eventType: "route_confirmed" },
      start: { from: "confirmed", to: "active", eventType: "route_started" },
      complete: { from: "active", to: "completed", eventType: "route_completed" },
      reopen: { from: "completed", to: "active", eventType: "route_reopened" }
    };
    const transition = transitions[action];
    if (cleanString(run.status) !== transition.from) {
      throw new CollectionDailyRoutesError(
        `Trasu ve stavu ${cleanString(run.status) || "neurčeno"} nelze změnit akcí ${action}.`,
        409,
        "collection_daily_route_transition_conflict"
      );
    }
    if (action === "confirm" && !stationaryFieldTest && !cleanString(run.driver_user_id)) {
      throw new CollectionDailyRoutesError("Před potvrzením přiřaďte trase řidiče.", 409, "collection_daily_route_driver_required");
    }
    let stationaryStopsCompletedFromGps = [];
    let stationaryStopsReopened = [];
    if (action === "complete") {
      const plannedResult = await db.prepare(`
        SELECT id
        FROM collection_daily_route_stops
        WHERE run_id = ? AND status = 'planned'
        ORDER BY route_order ASC
      `).bind(run.id).all();
      const plannedStops = plannedResult.results || [];
      if (plannedStops.length > 0 && stationaryFieldTest) {
        const gpsResult = await db.prepare(`
          SELECT stop.id
          FROM collection_daily_route_stops AS stop
          WHERE stop.run_id = ?
            AND stop.status = 'planned'
            AND EXISTS (
              SELECT 1
              FROM collection_route_test_gps_confirmations AS gps
              WHERE gps.run_id = stop.run_id AND gps.stop_id = stop.id
            )
          ORDER BY stop.route_order ASC
        `).bind(run.id).all();
        const gpsStopIds = new Set((gpsResult.results || []).map((row) => cleanString(row.id)));
        const missingGpsCount = plannedStops.filter((stop) => !gpsStopIds.has(cleanString(stop.id))).length;
        if (missingGpsCount > 0) {
          throw new CollectionDailyRoutesError(
            "TEST tabletu nelze dokončit, dokud není uložené fyzické GPS měření stanoviště.",
            409,
            "collection_daily_route_test_gps_required"
          );
        }
        stationaryStopsCompletedFromGps = plannedStops;
      } else if (plannedStops.length > 0) {
        throw new CollectionDailyRoutesError(
          `Trasu nelze dokončit: ${plannedStops.length} zastávek ještě čeká.`,
          409,
          "collection_daily_route_stops_pending"
        );
      }
    }
    if (action === "reopen" && stationaryFieldTest) {
      const stopsResult = await db.prepare(`
        SELECT id, status
        FROM collection_daily_route_stops
        WHERE run_id = ?
          AND status IN ('done', 'problem')
        ORDER BY route_order ASC
      `).bind(run.id).all();
      stationaryStopsReopened = stopsResult.results || [];
    }
    const changedAt = nowIso();
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || user?.phone);
    const updates = ["status = ?", "updated_at = ?"];
    const bindings = [transition.to, changedAt];
    if (action === "confirm") {
      updates.push("confirmed_by_user_id = ?", "confirmed_by_name = ?", "confirmed_at = ?");
      bindings.push(actorId, actorName, changedAt);
    } else if (action === "start") {
      updates.push("started_by_user_id = ?", "started_by_name = ?", "started_at = ?");
      bindings.push(actorId, actorName, changedAt);
    } else if (action === "complete") {
      updates.push("completed_by_user_id = ?", "completed_by_name = ?", "completed_at = ?");
      bindings.push(actorId, actorName, changedAt);
    } else if (action === "reopen") {
      updates.push("reopened_by_user_id = ?", "reopened_by_name = ?", "reopened_at = ?", "completed_at = NULL");
      bindings.push(actorId, actorName, changedAt);
    }
    bindings.push(run.id);
    const statements = [];
    if (action === "complete" && stationaryStopsCompletedFromGps.length) {
      statements.push(db.prepare(`
        UPDATE collection_daily_route_stops
        SET status = 'done',
            problem_reason = '',
            problem_note = '',
            completed_at = ?,
            last_event_at = ?,
            updated_at = ?
        WHERE run_id = ?
          AND status = 'planned'
          AND EXISTS (
            SELECT 1
            FROM collection_route_test_gps_confirmations AS gps
            WHERE gps.run_id = collection_daily_route_stops.run_id
              AND gps.stop_id = collection_daily_route_stops.id
          )
      `).bind(changedAt, changedAt, changedAt, run.id));
      stationaryStopsCompletedFromGps.forEach((stop) => {
        statements.push(db.prepare(`
          INSERT INTO collection_daily_route_events (
            id, run_id, stop_id, event_type, before_status, after_status, reason, note,
            idempotency_key, actor_user_id, actor_name, created_at, payload_json
          ) VALUES (?, ?, ?, 'done', 'planned', 'done', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          randomId("collection-daily-event"),
          run.id,
          cleanString(stop.id),
          "gps-test-completed",
          "Fyzické GPS měření je uložené; stanoviště bylo dokončeno společně s TESTEM tabletu.",
          `stationary-test-stop-done:${run.id}:${cleanString(stop.id)}:${idempotencyKey || changedAt}`,
          actorId,
          actorName,
          changedAt,
          jsonString({ action, source: "stationary-field-test-gps" })
        ));
      });
    }
    if (action === "reopen" && stationaryStopsReopened.length) {
      statements.push(db.prepare(`
        UPDATE collection_daily_route_stops
        SET status = 'planned',
            problem_reason = '',
            problem_note = '',
            completed_at = NULL,
            last_event_at = ?,
            updated_at = ?
        WHERE run_id = ?
          AND status IN ('done', 'problem')
      `).bind(changedAt, changedAt, run.id));
      stationaryStopsReopened.forEach((stop) => {
        statements.push(db.prepare(`
          INSERT INTO collection_daily_route_events (
            id, run_id, stop_id, event_type, before_status, after_status, reason, note,
            idempotency_key, actor_user_id, actor_name, created_at, payload_json
          ) VALUES (?, ?, ?, 'stop_reopened', ?, 'planned', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          randomId("collection-daily-event"),
          run.id,
          cleanString(stop.id),
          cleanString(stop.status),
          "Stacionární TEST byl znovu otevřen pro další fyzickou zkoušku.",
          "Jediný TEST bod se bezpečně vrátil do stavu čeká; uložené GPS měření zůstalo v auditu.",
          `stationary-reopen-stop:${run.id}:${cleanString(stop.id)}:${idempotencyKey || changedAt}`,
          actorId,
          actorName,
          changedAt,
          jsonString({ action, source: "stationary-field-test-reopen" })
        ));
      });
    }
    statements.push(
      db.prepare(`UPDATE collection_daily_route_runs SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings),
      db.prepare(`
        INSERT INTO collection_daily_route_events (
          id, run_id, event_type, before_status, after_status, note, idempotency_key,
          actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-daily-event"),
        run.id,
        transition.eventType,
        transition.from,
        transition.to,
        cleanString(input.note) || (stationaryStopsCompletedFromGps.length
          ? "Stacionární TEST tabletu byl dokončen po uloženém fyzickém GPS měření."
          : ""),
        idempotencyKey || `${transition.eventType}:${run.id}:${changedAt}`,
        actorId,
        actorName,
        changedAt,
        jsonString({
          action,
          completedStopIds: stationaryStopsCompletedFromGps.map((stop) => cleanString(stop.id)),
          reopenedStopIds: stationaryStopsReopened.map((stop) => cleanString(stop.id))
        })
      )
    );
    await db.batch(statements);
    return detailFromRow(db, await loadRunRow(db, run.id));
  } catch (error) {
    throw dbError(error);
  }
}

export async function recordCollectionDailyRouteStopEvent(env, user, runId, stopId, input = {}) {
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeReader(user, scope);
  const db = database(env, true, scope);
  const action = cleanString(input.action).toLowerCase();
  if (!STOP_ACTIONS.has(action)) {
    throw new CollectionDailyRoutesError("Neplatná akce řidiče.", 400, "collection_daily_route_stop_action_invalid");
  }
  try {
    const run = await loadRunRow(db, runId);
    assertRunMatchesScope(run, scope);
    assertTestRunAccess(user, run, scope);
    if (isCollectionDailyRouteStationaryFieldTest(run)) {
      assertStationaryFieldTester(user, run);
    }
    assertCanOperateRun(user, run);
    if (action === "reset") {
      assertManage(user);
    }
    if (cleanString(run.status) !== "active") {
      throw new CollectionDailyRoutesError("Akce lze zapisovat jen do zahájené trasy.", 409, "collection_daily_route_not_active");
    }
    const idempotencyKey = cleanString(input.idempotencyKey);
    const existingEvent = await eventByIdempotency(db, idempotencyKey);
    if (existingEvent) {
      return detailFromRow(db, await loadRunRow(db, run.id));
    }
    const needsStop = ["done", "problem", "reset"].includes(action);
    const stop = needsStop || cleanString(stopId) ? await loadStopRow(db, run.id, stopId) : null;
    if (needsStop && !stop) {
      throw new CollectionDailyRoutesError("Vyberte zastávku pro řidičskou akci.", 400, "collection_daily_route_stop_required");
    }
    const beforeStatus = cleanString(stop?.status);
    let afterStatus = beforeStatus;
    if (action === "done") {
      if (!["planned", "problem"].includes(beforeStatus)) {
        throw new CollectionDailyRoutesError("Hotovou zastávku už nelze znovu potvrdit.", 409, "collection_daily_route_stop_conflict");
      }
      afterStatus = "done";
    } else if (action === "problem") {
      if (beforeStatus !== "planned") {
        throw new CollectionDailyRoutesError("Problém lze zapsat jen u čekající zastávky.", 409, "collection_daily_route_stop_conflict");
      }
      if (!cleanString(input.reason)) {
        throw new CollectionDailyRoutesError("U problému vyberte nebo napište důvod.", 400, "collection_daily_route_problem_reason_required");
      }
      afterStatus = "problem";
    } else if (action === "reset") {
      if (!["done", "problem"].includes(beforeStatus)) {
        throw new CollectionDailyRoutesError("Do plánu lze vrátit jen hotovou nebo problémovou zastávku.", 409, "collection_daily_route_stop_conflict");
      }
      afterStatus = "planned";
    }
    const createdAt = nowIso();
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || user?.phone);
    const statements = [];
    if (stop && ["done", "problem", "reset"].includes(action)) {
      statements.push(db.prepare(`
        UPDATE collection_daily_route_stops
        SET status = ?,
            problem_reason = ?,
            problem_note = ?,
            completed_at = ?,
            last_event_at = ?,
            updated_at = ?
        WHERE id = ? AND run_id = ?
      `).bind(
        afterStatus,
        action === "problem" ? cleanString(input.reason) : "",
        action === "problem" ? cleanString(input.note) : "",
        action === "done" ? createdAt : null,
        createdAt,
        createdAt,
        stop.id,
        run.id
      ));
    }
    statements.push(db.prepare(`
      INSERT INTO collection_daily_route_events (
        id, run_id, stop_id, event_type, before_status, after_status, reason, note,
        idempotency_key, actor_user_id, actor_name, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("collection-daily-event"),
      run.id,
      cleanString(stop?.id) || null,
      action === "reset" ? "stop_reopened" : action,
      beforeStatus,
      afterStatus,
      cleanString(input.reason),
      cleanString(input.note),
      idempotencyKey || `${action}:${run.id}:${cleanString(stop?.id) || "route"}:${createdAt}`,
      actorId,
      actorName,
      createdAt,
      jsonString(input.payload || {})
    ));
    statements.push(db.prepare("UPDATE collection_daily_route_runs SET updated_at = ? WHERE id = ?").bind(createdAt, run.id));
    await db.batch(statements);
    return detailFromRow(db, await loadRunRow(db, run.id));
  } catch (error) {
    throw dbError(error);
  }
}

function pragueDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getMyCollectionDailyRoute(env, user, input = {}) {
  if (!user) {
    throw new CollectionDailyRoutesError("Nepřihlášeno.", 401, "collection_daily_routes_unauthenticated");
  }
  if (!isUserActive(user) || normalizeRole(user?.role) !== "ridic" || !cleanString(user?.id)) {
    throw new CollectionDailyRoutesError(
      "Vlastní řidičská trasa je dostupná pouze aktivní roli Řidič.",
      403,
      "collection_daily_routes_forbidden"
    );
  }
  const scope = collectionDailyRouteScope(input.scope);
  assertTestScopeReader(user, scope);
  const db = database(env, true, scope);
  const scopeCondition = scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
    ? "(source_mode = 'synthetic-brno-test' OR COALESCE(CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.dataScope') ELSE '' END, '') = 'test')"
    : "source_mode <> 'synthetic-brno-test' AND COALESCE(CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.dataScope') ELSE '' END, '') <> 'test'";
  try {
    const row = await db.prepare(`
      SELECT *
      FROM collection_daily_route_runs
      WHERE driver_user_id = ?
        AND status IN ('confirmed', 'active', 'completed')
        AND ${scopeCondition}
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
        CASE WHEN route_date >= ? THEN 0 ELSE 1 END,
        route_date DESC,
        updated_at DESC
      LIMIT 1
    `).bind(cleanString(user.id), pragueDate()).first();
    if (!row) {
      return null;
    }
    assertRunMatchesScope(row, scope);
    assertTestRunAccess(user, row, scope);
    assertCanReadRun(user, row);
    return detailFromRow(db, row);
  } catch (error) {
    throw dbError(error);
  }
}

export function __collectionDailyRouteEligibilityForTest(row, routeDate, scheduledRunId = "") {
  return eligibility(row, collectionDailyRouteDateInfo(routeDate), scheduledRunId);
}

export const __collectionDailyRoutePickupScheduleForTest = pickupScheduleEntries;
