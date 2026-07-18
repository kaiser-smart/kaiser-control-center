import { previewCollectionDailyRoute } from "./collection-daily-routes-store.js";
import { hereOAuthConfiguration, requestHereOAuthToken } from "./here-oauth.js";

const TEST_DB_BINDING = "COLLECTION_ROUTES_TEST_DB";
const HERE_PROVIDER = "here-tour-planning";
const HERE_BASE_URL = "https://tourplanning.hereapi.com/v3";
const HERE_SCOPE = "test";
const MAX_STOPS = 1000;
const START_CONFIRMATION = "start-here-test-readonly";
const WASTE_TYPES = new Set(["SKO", "PAPIR", "PLAST", "BIO", "SKLO"]);
const WASTE_LABELS = Object.freeze({ SKO: "SKO", PAPIR: "PAPÍR", PLAST: "PLAST", BIO: "BIO", SKLO: "SKLO" });
const WEIGHT_KG = Object.freeze({
  SKO: Object.freeze({ 120: 6, 240: 15, 1100: 60 }),
  PAPIR: Object.freeze({ 120: 2, 240: 4, 1100: 20 }),
  PLAST: Object.freeze({ 120: 2, 240: 4, 1100: 20 }),
  SKLO: Object.freeze({ 120: 2, 240: 3, 1100: 14 })
});
const SERVICE_SECONDS = Object.freeze({ 120: 180, 240: 180, 1100: 300 });
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export class CollectionRouteHereError extends Error {
  constructor(message, status = 400, code = "collection_route_here_error") {
    super(message);
    this.name = "CollectionRouteHereError";
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

function coordinateValue(value) {
  if (value === null || value === undefined || cleanString(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function validCoordinate(latitude, longitude) {
  const normalizedLatitude = coordinateValue(latitude);
  const normalizedLongitude = coordinateValue(longitude);
  return normalizedLatitude !== null && normalizedLatitude >= -90 && normalizedLatitude <= 90 &&
    normalizedLongitude !== null && normalizedLongitude >= -180 && normalizedLongitude <= 180;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function jsonString(value) {
  return JSON.stringify(value ?? {});
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function normalizeWasteType(value) {
  const normalized = cleanString(value).toLocaleUpperCase("cs")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/PAPIR|LEPENK|KARTON/.test(normalized)) return "PAPIR";
  if (/PLAST/.test(normalized)) return "PLAST";
  if (/\bBIO\b|BIOLOG/.test(normalized)) return "BIO";
  if (/SKLO/.test(normalized)) return "SKLO";
  if (/\bSKO\b|SMESN|KOMUNAL/.test(normalized)) return "SKO";
  return WASTE_TYPES.has(normalized) ? normalized : "";
}

function database(env, required = false) {
  const db = env?.[TEST_DB_BINDING] || null;
  if (!db && required) {
    throw new CollectionRouteHereError(
      "Oddělená TEST databáze pro HERE pilot není nastavená.",
      503,
      "collection_route_here_database_missing"
    );
  }
  return db;
}

function dbError(error) {
  if (error instanceof CollectionRouteHereError) return error;
  const message = cleanString(error?.message);
  if (/no such table[^\n]*collection_route_here_/i.test(message)) {
    return new CollectionRouteHereError(
      "HERE pilot čeká na testovací D1 migraci.",
      503,
      "collection_route_here_migration_missing"
    );
  }
  console.error("collection_route_here.store_failed", { message });
  return new CollectionRouteHereError(
    "HERE read-only pilot se teď nepodařilo zpracovat.",
    500,
    "collection_route_here_store_failed"
  );
}

function actor(user) {
  return {
    id: cleanString(user?.id || user?.email),
    name: cleanString(user?.name || user?.email || "Uživatel")
  };
}

async function loadSettings(db) {
  const row = await db.prepare(`
    SELECT scope, status, config_json, updated_at
    FROM collection_route_here_settings
    WHERE scope = 'test'
    LIMIT 1
  `).first();
  return {
    status: cleanString(row?.status) || "draft",
    config: parseJson(row?.config_json, {}),
    updatedAt: cleanString(row?.updated_at)
  };
}

function requiredVehicleCodes(config) {
  const values = Array.isArray(config?.requiredVehicleCodes) ? config.requiredVehicleCodes : ["A", "B", "C"];
  return [...new Set(values.map((value) => cleanString(value).toUpperCase()).filter(Boolean))];
}

function configuredVehicles(config) {
  return Array.isArray(config?.vehicles) ? config.vehicles : [];
}

function dumpSiteForWaste(config, wasteType) {
  return (Array.isArray(config?.dumpSites) ? config.dumpSites : []).find((site) => (
    (Array.isArray(site?.wasteTypes) ? site.wasteTypes : [])
      .map(normalizeWasteType)
      .includes(wasteType)
  )) || null;
}

function configurationBlockers(settings, wasteType) {
  const blockers = [];
  const config = settings.config || {};
  if (!["ready", "test-estimate"].includes(settings.status)) {
    blockers.push("Provozní konfigurace HERE v TEST D1 zatím není potvrzená.");
  }
  if (!validCoordinate(config?.depot?.latitude, config?.depot?.longitude)) {
    blockers.push("Chybí potvrzené souřadnice výjezdového depa.");
  }
  if (!/^\d{2}:\d{2}$/.test(cleanString(config?.shift?.start)) || !/^\d{2}:\d{2}$/.test(cleanString(config?.shift?.end))) {
    blockers.push("Chybí potvrzený začátek a konec směny.");
  }
  const dumpSite = dumpSiteForWaste(config, wasteType);
  if (!dumpSite || !validCoordinate(dumpSite.latitude, dumpSite.longitude)) {
    blockers.push(`${WASTE_LABELS[wasteType] || wasteType}: chybí potvrzené místo výsypu se souřadnicemi.`);
  } else if (!positiveNumber(dumpSite.serviceMinutes)) {
    blockers.push(`${WASTE_LABELS[wasteType] || wasteType}: chybí potvrzená průměrná doba výsypu.`);
  }
  const vehicles = configuredVehicles(config);
  for (const code of requiredVehicleCodes(config)) {
    const vehicle = vehicles.find((item) => cleanString(item?.code).toUpperCase() === code);
    if (!vehicle) {
      blockers.push(`Vůz ${code}: chybí provozní konfigurace.`);
      continue;
    }
    if (!positiveNumber(vehicle?.capacitiesTons?.[wasteType])) {
      blockers.push(`Vůz ${code}: chybí kapacita pro ${WASTE_LABELS[wasteType] || wasteType}.`);
    }
    const missingTruckFields = ["heightCm", "widthCm", "lengthCm", "grossWeightKg", "currentWeightKg"]
      .filter((field) => !positiveNumber(vehicle?.truck?.[field]));
    if (missingTruckFields.length) {
      blockers.push(`Vůz ${code}: chybí rozměry nebo hmotnosti pro bezpečný truck routing.`);
    }
  }
  return blockers;
}

function configurationWarnings(settings, wasteType) {
  const config = settings.config || {};
  const warnings = [];
  if (settings.status === "test-estimate") {
    warnings.push("Rozměry, hmotnosti, směna a doby výsypu jsou konzervativní TEST odhady; před ostrým použitím vyžadují technické ověření.");
  }
  if (cleanString(config?.depot?.routingPointStatus).startsWith("needs-")) {
    warnings.push("Depo zatím používá adresní bod; vjezd pro svozové vozidlo čeká na fyzické potvrzení.");
  }
  const dumpSite = dumpSiteForWaste(config, wasteType);
  if (cleanString(dumpSite?.routingPointStatus).startsWith("needs-")) {
    warnings.push(`${WASTE_LABELS[wasteType] || wasteType}: výsyp zatím používá adresní bod a čeká na ověření skutečného vjezdu.`);
  }
  return warnings;
}

function stopFacts(stop, wasteType) {
  const volume = Math.max(0, Math.floor(numberValue(stop?.containerVolume)));
  const count = Math.max(1, Math.floor(numberValue(stop?.containerCount, 1)));
  const unitWeightKg = WEIGHT_KG[wasteType]?.[volume] || 0;
  const unitServiceSeconds = SERVICE_SECONDS[volume] || 0;
  return {
    ...stop,
    wasteType,
    containerVolume: volume,
    containerCount: count,
    weightKg: unitWeightKg ? unitWeightKg * count : 0,
    serviceSeconds: unitServiceSeconds ? unitServiceSeconds * count : 0,
    latitude: coordinateValue(stop?.latitude),
    longitude: coordinateValue(stop?.longitude)
  };
}

function stopBlockers(stops, wasteType) {
  const blockers = [];
  if (!stops.length) blockers.push(`Pro zvolený den nejsou žádná stanoviště ${WASTE_LABELS[wasteType] || wasteType}.`);
  const missingCoordinates = stops.filter((stop) => !validCoordinate(stop.latitude, stop.longitude)).length;
  if (missingCoordinates) blockers.push(`${missingCoordinates} stanovišť nemá potvrzené souřadnice.`);
  const missingWeight = stops.filter((stop) => !positiveNumber(stop.weightKg)).length;
  if (missingWeight) blockers.push(`${missingWeight} stanovišť nemá potvrzený odhad hmotnosti odpadu.`);
  const missingService = stops.filter((stop) => !positiveNumber(stop.serviceSeconds)).length;
  if (missingService) blockers.push(`${missingService} stanovišť nemá potvrzený čas obsluhy.`);
  if (stops.length > MAX_STOPS) blockers.push(`Pilot přijme nejvýše ${MAX_STOPS} stanovišť v jednom výpočtu.`);
  return blockers;
}

function rowToRun(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    scope: cleanString(row.scope) || HERE_SCOPE,
    routeDate: cleanString(row.route_date),
    wasteType: cleanString(row.waste_type),
    wasteLabel: WASTE_LABELS[cleanString(row.waste_type)] || cleanString(row.waste_type),
    sourceBatchId: cleanString(row.source_batch_id),
    status: cleanString(row.status),
    provider: cleanString(row.provider) || HERE_PROVIDER,
    stopCount: numberValue(row.stop_count),
    vehicleCount: numberValue(row.vehicle_count),
    summary: parseJson(row.summary_json, {}),
    result: parseJson(row.result_json, {}),
    errorCode: cleanString(row.error_code),
    errorMessage: cleanString(row.error_message),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    completedAt: cleanString(row.completed_at),
    createsOperationalRoute: false,
    sendsNotifications: false
  };
}

async function latestRun(db, routeDate, wasteType) {
  const row = await db.prepare(`
    SELECT *
    FROM collection_route_here_runs
    WHERE scope = 'test' AND route_date = ? AND waste_type = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(routeDate, wasteType).first();
  return rowToRun(row);
}

export async function getCollectionRouteHereReadiness(env, user, input = {}) {
  const wasteType = normalizeWasteType(input.wasteType || "SKO");
  if (!wasteType) {
    throw new CollectionRouteHereError("Vyberte podporovaný druh odpadu.", 400, "collection_route_here_waste_invalid");
  }
  const db = database(env, true);
  try {
    const [settings, preview] = await Promise.all([
      loadSettings(db),
      previewCollectionDailyRoute(env, user, {
        scope: HERE_SCOPE,
        routeDate: input.routeDate,
        vehicleCode: "A",
        sourceBatchId: input.sourceBatchId
      })
    ]);
    const allWasteTypes = [...new Set((preview.eligibleRows || []).map((stop) => normalizeWasteType(stop.wasteType)).filter(Boolean))];
    const stops = (preview.eligibleRows || [])
      .filter((stop) => normalizeWasteType(stop.wasteType) === wasteType)
      .map((stop) => stopFacts(stop, wasteType));
    const oauth = hereOAuthConfiguration(env);
    const blockers = [
      ...configurationBlockers(settings, wasteType),
      ...stopBlockers(stops, wasteType)
    ];
    if (!oauth.configured) blockers.push("Chybí bezpečně uložené serverové HERE OAuth přístupy.");
    try {
      hereBaseUrl(env);
    } catch (error) {
      blockers.push(error instanceof CollectionRouteHereError
        ? error.message
        : "Serverová adresa HERE Tour Planning není bezpečně nastavená.");
    }
    return {
      scope: HERE_SCOPE,
      provider: HERE_PROVIDER,
      apiStatus: blockers.length ? "waiting" : "ready",
      ready: blockers.length === 0,
      routeDate: preview.dateInfo.routeDate,
      dateInfo: preview.dateInfo,
      wasteType,
      wasteLabel: WASTE_LABELS[wasteType] || wasteType,
      sourceBatchId: preview.sourceBatchId,
      eligibleCount: stops.length,
      availableWasteTypes: allWasteTypes,
      configurationStatus: settings.status,
      configurationUpdatedAt: settings.updatedAt,
      oauthConfigured: oauth.configured,
      blockers: [...new Set(blockers)],
      warnings: [...new Set(configurationWarnings(settings, wasteType))],
      latestRun: await latestRun(db, preview.dateInfo.routeDate, wasteType),
      limits: { maxStops: MAX_STOPS, oneWasteTypePerRun: true },
      writesOperationalRoute: false,
      sendsNotifications: false,
      _settings: settings,
      _stops: stops
    };
  } catch (error) {
    throw dbError(error);
  }
}

function publicReadiness(readiness) {
  const { _settings, _stops, ...result } = readiness;
  return result;
}

function timezoneOffset(routeDate, timezone) {
  const date = new Date(`${routeDate}T12:00:00.000Z`);
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset"
  }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value || "GMT";
  const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+00:00";
  return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] || "00").padStart(2, "0")}`;
}

function localDateTime(routeDate, time, timezone) {
  return `${routeDate}T${cleanString(time)}:00${timezoneOffset(routeDate, timezone)}`;
}

function hereProfile(vehicle) {
  const truck = vehicle.truck || {};
  const weightPerAxleKg = positiveNumber(truck.weightPerAxleKg);
  return {
    name: `kaiser_truck_${cleanString(vehicle.code).toLowerCase()}`,
    type: "truck",
    avoid: { features: ["uTurns"] },
    options: {
      height: Math.round(positiveNumber(truck.heightCm)),
      width: Math.round(positiveNumber(truck.widthCm)),
      length: Math.round(positiveNumber(truck.lengthCm)),
      grossWeight: Math.round(positiveNumber(truck.grossWeightKg)),
      currentWeight: Math.round(positiveNumber(truck.currentWeightKg)),
      ...(weightPerAxleKg ? { weightPerAxle: Math.round(weightPerAxleKg) } : {})
    }
  };
}

export function buildCollectionRouteHereProblem(readiness) {
  if (!readiness?.ready) {
    throw new CollectionRouteHereError(
      "HERE výpočet nelze sestavit, dokud nejsou doplněné všechny provozní podklady.",
      409,
      "collection_route_here_not_ready"
    );
  }
  const config = readiness._settings?.config || {};
  const dumpSite = dumpSiteForWaste(config, readiness.wasteType);
  const timezone = cleanString(config.timezone) || "Europe/Prague";
  const depotLocation = { lat: Number(config.depot.latitude), lng: Number(config.depot.longitude) };
  const dumpLocation = { lat: Number(dumpSite.latitude), lng: Number(dumpSite.longitude) };
  const shiftStart = localDateTime(readiness.routeDate, config.shift.start, timezone);
  const shiftEnd = localDateTime(readiness.routeDate, config.shift.end, timezone);
  const vehicles = configuredVehicles(config)
    .filter((vehicle) => requiredVehicleCodes(config).includes(cleanString(vehicle.code).toUpperCase()));
  return {
    fleet: {
      traffic: cleanString(config.trafficMode) || "liveOrHistorical",
      types: vehicles.map((vehicle) => {
        const code = cleanString(vehicle.code).toUpperCase();
        return {
          id: `kaiser_vehicle_${code.toLowerCase()}`,
          profile: `kaiser_truck_${code.toLowerCase()}`,
          costs: { fixed: 5, distance: 0.001, time: 0.005 },
          shifts: [{
            start: { time: shiftStart, location: depotLocation },
            end: { time: shiftEnd, location: dumpLocation },
            reloads: [{
              location: dumpLocation,
              duration: Math.round(positiveNumber(dumpSite.serviceMinutes) * 60),
              ...(Array.isArray(dumpSite.times) && dumpSite.times.length ? { times: dumpSite.times } : {})
            }],
            ...(config.break ? { breaks: [config.break] } : {})
          }],
          capacity: [Math.round(positiveNumber(vehicle.capacitiesTons?.[readiness.wasteType]) * 1000)],
          amount: 1
        };
      }),
      profiles: vehicles.map(hereProfile)
    },
    plan: {
      jobs: readiness._stops.map((stop) => ({
        id: `stop_${cleanString(stop.sourceRowId).replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
        tag: cleanString(stop.sourceRowId),
        category: readiness.wasteType,
        priority: 1,
        tasks: {
          pickups: [{
            places: [{
              location: { lat: Number(stop.latitude), lng: Number(stop.longitude) },
              duration: Math.round(stop.serviceSeconds)
            }],
            demand: [Math.round(stop.weightKg)]
          }]
        }
      }))
    },
    configuration: {
      termination: {
        maxTime: Math.max(10, Math.min(180, Math.ceil(readiness.eligibleCount / 5))),
        stagnationTime: Math.max(5, Math.min(60, Math.ceil(readiness.eligibleCount / 10)))
      }
    }
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) {
    throw new CollectionRouteHereError("Server nepodporuje bezpečný otisk HERE vstupu.", 503, "collection_route_here_crypto_missing");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hereBaseUrl(env) {
  const value = (cleanString(env?.HERE_TOUR_PLANNING_BASE_URL) || HERE_BASE_URL).replace(/\/$/, "");
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "tourplanning.hereapi.com" &&
        url.pathname === "/v3" && !url.username && !url.password && !url.search && !url.hash) {
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // The caller receives the same safe configuration error below.
  }
  throw new CollectionRouteHereError(
    "Serverová adresa HERE Tour Planning není bezpečně nastavená.",
    503,
    "collection_route_here_base_url_invalid"
  );
}

function assertHereUrl(value, env) {
  const url = new URL(value);
  const base = new URL(hereBaseUrl(env));
  if (url.protocol !== "https:" || url.hostname !== base.hostname || !url.pathname.startsWith("/v3/")) {
    throw new CollectionRouteHereError("HERE vrátil neočekávanou servisní adresu.", 502, "collection_route_here_url_invalid");
  }
  return url.toString();
}

async function jsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function hereFetch(env, url, token, options = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new CollectionRouteHereError("Server nemá dostupné HTTPS volání pro HERE.", 503, "collection_route_here_fetch_missing");
  }
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await jsonResponse(response);
  if (!response.ok) {
    throw new CollectionRouteHereError(
      cleanString(payload.cause || payload.title) || "HERE Tour Planning odmítl požadavek.",
      502,
      "collection_route_here_provider_failed"
    );
  }
  return { response, payload };
}

async function providerToken(env, options) {
  return requestHereOAuthToken(env, { fetchImpl: options.fetchImpl, nowMs: options.nowMs, nonce: options.nonce });
}

async function submitProblem(env, problem, options = {}) {
  const token = await providerToken(env, options);
  const { response, payload } = await hereFetch(
    env,
    `${hereBaseUrl(env)}/problems/async`,
    token.accessToken,
    { method: "POST", body: JSON.stringify(problem) },
    options.fetchImpl
  );
  const href = cleanString(payload.href || payload.status?.href || response.headers.get("location"));
  if (!href) {
    throw new CollectionRouteHereError("HERE nevrátil adresu pro kontrolu výpočtu.", 502, "collection_route_here_status_url_missing");
  }
  return { statusUrl: assertHereUrl(href, env) };
}

async function appendEvent(db, runId, eventType, status, message, user, payload = {}) {
  const person = actor(user);
  await db.prepare(`
    INSERT INTO collection_route_here_events (
      id, run_id, event_type, status, message, actor_user_id, actor_name, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("here-event"), runId, eventType, status, cleanString(message),
    person.id, person.name, jsonString(payload), nowIso()
  ).run();
}

async function runById(db, runId) {
  const row = await db.prepare("SELECT * FROM collection_route_here_runs WHERE id = ? LIMIT 1").bind(runId).first();
  if (!row) {
    throw new CollectionRouteHereError("HERE výpočet nebyl nalezen.", 404, "collection_route_here_run_not_found");
  }
  return row;
}

async function runByHash(db, inputHash) {
  return db.prepare(`
    SELECT * FROM collection_route_here_runs
    WHERE input_hash = ? AND status IN ('submitting', 'submitted', 'in_progress', 'completed')
    LIMIT 1
  `).bind(inputHash).first();
}

async function runByIdempotency(db, idempotencyKey) {
  return db.prepare("SELECT * FROM collection_route_here_runs WHERE idempotency_key = ? LIMIT 1").bind(idempotencyKey).first();
}

export async function startCollectionRouteHereRun(env, user, input = {}, options = {}) {
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new CollectionRouteHereError("Chybí ochrana proti dvojímu spuštění.", 400, "collection_route_here_idempotency_missing");
  }
  if (cleanString(input.confirmation) !== START_CONFIRMATION) {
    throw new CollectionRouteHereError("HERE výpočet nebyl výslovně potvrzen.", 409, "collection_route_here_confirmation_required");
  }
  const readiness = await getCollectionRouteHereReadiness(env, user, input);
  if (!readiness.ready) {
    throw new CollectionRouteHereError(readiness.blockers[0] || "HERE pilot čeká na konfiguraci.", 409, "collection_route_here_not_ready");
  }
  if (numberValue(input.expectedStopCount, -1) !== readiness.eligibleCount) {
    throw new CollectionRouteHereError("Počet stanovišť se změnil. Návrh znovu načtěte.", 409, "collection_route_here_stop_count_changed");
  }
  const problem = buildCollectionRouteHereProblem(readiness);
  const inputHash = await sha256(jsonString(stableValue({
    routeDate: readiness.routeDate,
    wasteType: readiness.wasteType,
    sourceBatchId: readiness.sourceBatchId,
    problem
  })));
  const db = database(env, true);
  try {
    const repeated = await runByIdempotency(db, idempotencyKey) || await runByHash(db, inputHash);
    if (repeated) return { run: rowToRun(repeated), reused: true, readiness: publicReadiness(readiness) };
    const runId = randomId("here-run");
    const person = actor(user);
    const timestamp = nowIso();
    await db.prepare(`
      INSERT INTO collection_route_here_runs (
        id, scope, route_date, waste_type, source_batch_id, status,
        idempotency_key, input_hash, provider, stop_count, vehicle_count,
        summary_json, created_by_user_id, created_by_name, created_at, updated_at
      ) VALUES (?, 'test', ?, ?, ?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId, readiness.routeDate, readiness.wasteType, readiness.sourceBatchId,
      idempotencyKey, inputHash, HERE_PROVIDER, readiness.eligibleCount,
      problem.fleet.types.length,
      jsonString({
        wasteLabel: readiness.wasteLabel,
        oneWasteTypePerRun: true,
        routeEndsAtDumpSite: true,
        providerCalls: 1
      }),
      person.id, person.name, timestamp, timestamp
    ).run();
    await appendEvent(db, runId, "run_created", "submitting", "Ruční TEST výpočet byl připraven.", user, {
      stopCount: readiness.eligibleCount,
      wasteType: readiness.wasteType
    });
    try {
      const submitted = await submitProblem(env, problem, options);
      await db.prepare(`
        UPDATE collection_route_here_runs
        SET status = 'submitted', provider_status_url = ?, updated_at = ?
        WHERE id = ?
      `).bind(submitted.statusUrl, nowIso(), runId).run();
      await appendEvent(db, runId, "provider_submitted", "submitted", "HERE převzal read-only výpočet.", user);
    } catch (error) {
      const providerError = error instanceof CollectionRouteHereError ? error : new CollectionRouteHereError(
        "HERE výpočet se nepodařilo odeslat.", 502, "collection_route_here_submit_failed"
      );
      await db.prepare(`
        UPDATE collection_route_here_runs
        SET status = 'failed', error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).bind(providerError.code, providerError.message, nowIso(), nowIso(), runId).run();
      await appendEvent(db, runId, "provider_failed", "failed", providerError.message, user, { code: providerError.code });
    }
    return { run: rowToRun(await runById(db, runId)), reused: false, readiness: publicReadiness(readiness) };
  } catch (error) {
    throw dbError(error);
  }
}

function normalizedSolution(solution, runRow) {
  const tours = Array.isArray(solution?.tours) ? solution.tours : [];
  const normalizedTours = tours.map((tour) => {
    const stops = Array.isArray(tour?.stops) ? tour.stops : [];
    const activities = stops.flatMap((stop) => (Array.isArray(stop?.activities) ? stop.activities : [])
      .filter((activity) => activity?.type === "pickup" && cleanString(activity?.jobId).startsWith("stop_"))
      .map((activity) => ({
        jobId: cleanString(activity.jobId),
        sourceRowId: cleanString(activity.jobTag || activity.tag || ""),
        arrivalAt: cleanString(activity?.time?.arrival || activity?.time?.start || stop?.time?.arrival),
        completedAt: cleanString(activity?.time?.end || stop?.time?.departure),
        latitude: coordinateValue(activity?.location?.lat ?? stop?.location?.lat),
        longitude: coordinateValue(activity?.location?.lng ?? stop?.location?.lng),
        distanceFromStartMeters: numberValue(stop?.distance)
      })));
    const statistic = tour?.statistic || {};
    return {
      vehicleId: cleanString(tour?.vehicleId || tour?.typeId),
      stopCount: activities.length,
      distanceMeters: numberValue(statistic.distance),
      durationSeconds: numberValue(statistic.duration),
      drivingSeconds: numberValue(statistic?.times?.driving),
      servingSeconds: numberValue(statistic?.times?.serving),
      waitingSeconds: numberValue(statistic?.times?.waiting),
      activities
    };
  });
  const statistic = solution?.statistic || {};
  const unassigned = Array.isArray(solution?.unassigned) ? solution.unassigned : [];
  return {
    provider: HERE_PROVIDER,
    routeDate: cleanString(runRow.route_date),
    wasteType: cleanString(runRow.waste_type),
    distanceMeters: numberValue(statistic.distance),
    durationSeconds: numberValue(statistic.duration),
    drivingSeconds: numberValue(statistic?.times?.driving),
    servingSeconds: numberValue(statistic?.times?.serving),
    waitingSeconds: numberValue(statistic?.times?.waiting),
    assignedStopCount: normalizedTours.reduce((sum, tour) => sum + tour.stopCount, 0),
    unassignedCount: unassigned.length,
    unassigned: unassigned.map((item) => ({
      jobId: cleanString(item?.jobId || item?.id),
      reasons: Array.isArray(item?.reasons) ? item.reasons.map((reason) => cleanString(reason?.code || reason)).filter(Boolean) : []
    })),
    tours: normalizedTours,
    limitations: [
      "Pilot počítá jednu komoditu v jednom HERE běhu.",
      "Trasa končí potvrzeným výsypem; návrat prázdného vozidla do depa zatím není součástí optimalizace.",
      "Výsledek nic nepřepisuje v uložených trasách a neposílá se řidiči ani zákazníkovi."
    ]
  };
}

async function pollProvider(env, row, options = {}) {
  const token = await providerToken(env, options);
  const statusUrl = assertHereUrl(row.provider_status_url, env);
  const { payload } = await hereFetch(env, statusUrl, token.accessToken, { method: "GET" }, options.fetchImpl);
  const status = cleanString(payload.status);
  if (["pending", "inProgress"].includes(status)) return { status: "in_progress" };
  if (status === "success") {
    const resourceHref = cleanString(payload?.resource?.href);
    if (!resourceHref) {
      throw new CollectionRouteHereError(
        "HERE nevrátil adresu dokončeného řešení.",
        502,
        "collection_route_here_resource_url_missing"
      );
    }
    const resourceUrl = assertHereUrl(resourceHref, env);
    const solutionResponse = await hereFetch(env, resourceUrl, token.accessToken, { method: "GET" }, options.fetchImpl);
    return { status: "completed", resourceUrl, solution: normalizedSolution(solutionResponse.payload, row) };
  }
  return {
    status: "failed",
    errorCode: status === "timeout" ? "collection_route_here_timeout" : "collection_route_here_provider_failure",
    errorMessage: cleanString(payload?.error?.message) || (status === "timeout" ? "HERE výpočet překročil časový limit." : "HERE výpočet selhal.")
  };
}

export async function getCollectionRouteHereRun(env, user, runId, options = {}) {
  const id = cleanString(runId);
  if (!id) throw new CollectionRouteHereError("Chybí identifikátor HERE výpočtu.", 400, "collection_route_here_run_required");
  const db = database(env, true);
  try {
    let row = await runById(db, id);
    if (cleanString(row.scope) !== HERE_SCOPE) {
      throw new CollectionRouteHereError("HERE pilot smí číst pouze TEST výpočty.", 403, "collection_route_here_scope_forbidden");
    }
    if (!TERMINAL_STATUSES.has(cleanString(row.status))) {
      try {
        const provider = await pollProvider(env, row, options);
        const timestamp = nowIso();
        if (provider.status === "completed") {
          await db.prepare(`
            UPDATE collection_route_here_runs
            SET status = 'completed', provider_resource_url = ?, result_json = ?, error_code = '', error_message = '', updated_at = ?, completed_at = ?
            WHERE id = ?
          `).bind(provider.resourceUrl, jsonString(provider.solution), timestamp, timestamp, id).run();
          await appendEvent(db, id, "provider_completed", "completed", "HERE dokončil read-only výpočet.", user, {
            assignedStopCount: provider.solution.assignedStopCount,
            unassignedCount: provider.solution.unassignedCount
          });
        } else if (provider.status === "failed") {
          await db.prepare(`
            UPDATE collection_route_here_runs
            SET status = 'failed', error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
          `).bind(provider.errorCode, provider.errorMessage, timestamp, timestamp, id).run();
          await appendEvent(db, id, "provider_failed", "failed", provider.errorMessage, user, { code: provider.errorCode });
        } else if (cleanString(row.status) !== "in_progress") {
          await db.prepare("UPDATE collection_route_here_runs SET status = 'in_progress', updated_at = ? WHERE id = ?")
            .bind(timestamp, id).run();
          await appendEvent(db, id, "provider_progress", "in_progress", "HERE stále počítá.", user);
        }
      } catch (error) {
        const providerError = error instanceof CollectionRouteHereError ? error : new CollectionRouteHereError(
          "Stav HERE výpočtu se nepodařilo načíst.", 502, "collection_route_here_poll_failed"
        );
        await appendEvent(db, id, "provider_check_failed", cleanString(row.status), providerError.message, user, { code: providerError.code });
        throw providerError;
      }
      row = await runById(db, id);
    }
    return { run: rowToRun(row), apiStatus: cleanString(row.status) === "completed" ? "ready" : "waiting" };
  } catch (error) {
    throw dbError(error);
  }
}

export function publicCollectionRouteHereReadiness(readiness) {
  return publicReadiness(readiness);
}

export const COLLECTION_ROUTE_HERE_START_CONFIRMATION = START_CONFIRMATION;
export const __test = {
  HERE_BASE_URL,
  MAX_STOPS,
  SERVICE_SECONDS,
  WEIGHT_KG,
  configurationBlockers,
  normalizedSolution,
  normalizeWasteType,
  timezoneOffset
};
