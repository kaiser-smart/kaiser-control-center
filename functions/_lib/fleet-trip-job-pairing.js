import { COLLECTION_DAILY_ROUTE_VEHICLES } from "./collection-daily-routes-store.js";
import { loadFleetVehiclesWithAssignments } from "./fleet-vehicles-store.js";
import { vehicleTrackingPragueDate } from "./vehicle-tracking-analytics.js";

const DB_BINDING = "SMART_ODPADY_DB";
const PAIRING_RULE_ID = "vehicle-tracking-trip-job-pairing-phase1a";
const PAIRING_MODULE_KEY = "vehicle-tracking";
const PAIRING_CRON = "*/15 * * * *";
const PAIRING_INTERVAL_MINUTES = 15;
const PAIRING_PERIOD_DAYS = 7;
const DASHBOARD_QUALITY_GATE_PERCENT = 90;
const JOB_PAIR_QUALITY_GATE_PERCENT = 95;
const MAX_PREVIEW_ROWS = 500;

export const FLEET_TRIP_JOB_PAIRING_PHASE = "read-only-pilot";

export class FleetTripJobPairingError extends Error {
  constructor(message, status = 400, code = "fleet_trip_job_pairing_error") {
    super(message);
    this.name = "FleetTripJobPairingError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizedPlate(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
}

function jsonString(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function normalizedDays(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(PAIRING_PERIOD_DAYS, number)) : PAIRING_PERIOD_DAYS;
}

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextRunAt(value) {
  const date = dateValue(value) || new Date();
  return new Date(date.getTime() + PAIRING_INTERVAL_MINUTES * 60 * 1000).toISOString();
}

function runChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function database(env) {
  const db = env?.[DB_BINDING] || null;
  if (!db) {
    throw new FleetTripJobPairingError(
      "Chybí D1 binding SMART_ODPADY_DB pro párování jízd.",
      503,
      "fleet_trip_job_pairing_database_missing"
    );
  }
  return db;
}

export function fleetTripJobPairingDedupeKey(value = new Date()) {
  const date = dateValue(value) || new Date();
  const bucketMinute = Math.floor(date.getUTCMinutes() / PAIRING_INTERVAL_MINUTES) * PAIRING_INTERVAL_MINUTES;
  const bucket = new Date(date);
  bucket.setUTCMinutes(bucketMinute, 0, 0);
  return `fleet-trip-job:${bucket.toISOString()}`;
}

function aliasKey(system, externalKey) {
  return `${cleanString(system).toLowerCase()}:${cleanString(externalKey).toLowerCase()}`;
}

function aliasId(system, externalKey) {
  return `fleet-alias:${cleanString(system).toLowerCase()}:${cleanString(externalKey)}`;
}

async function loadActiveAliases(db) {
  const result = await db.prepare(`SELECT id, vehicle_id, external_system, external_key,
    normalized_license_plate, route_vehicle_code, status, match_method, confidence,
    valid_from, valid_to, metadata_json, created_at, updated_at
    FROM fleet_vehicle_external_aliases
    WHERE status = 'active' AND (valid_to IS NULL OR valid_to = '')`).all();
  return result.results || [];
}

async function upsertAlias(db, input, nowIso) {
  const system = cleanString(input.externalSystem).toLowerCase();
  const externalKey = cleanString(input.externalKey);
  await db.prepare(`INSERT INTO fleet_vehicle_external_aliases (
    id, vehicle_id, external_system, external_key, normalized_license_plate,
    route_vehicle_code, status, match_method, confidence, valid_from, valid_to,
    metadata_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?, ?, ?)
  ON CONFLICT(external_system, external_key) DO UPDATE SET
    vehicle_id = excluded.vehicle_id,
    normalized_license_plate = excluded.normalized_license_plate,
    route_vehicle_code = excluded.route_vehicle_code,
    status = 'active',
    match_method = excluded.match_method,
    confidence = excluded.confidence,
    valid_to = NULL,
    metadata_json = excluded.metadata_json,
    updated_at = excluded.updated_at`)
    .bind(
      aliasId(system, externalKey),
      cleanString(input.vehicleId),
      system,
      externalKey,
      normalizedPlate(input.licensePlate),
      cleanString(input.routeVehicleCode).toUpperCase(),
      cleanString(input.matchMethod || "bootstrap_unique_plate"),
      cleanString(input.confidence || "high"),
      cleanString(input.validFrom || nowIso),
      jsonString(input.metadata),
      nowIso,
      nowIso
    ).run();
}

function fleetMasterMatches(fleetVehicles, registration) {
  const wantedPlate = normalizedPlate(registration);
  return (Array.isArray(fleetVehicles) ? fleetVehicles : []).filter((vehicle) =>
    normalizedPlate(vehicle?.licensePlate || vehicle?.tcarsLicensePlate) === wantedPlate
    && cleanString(vehicle?.id || vehicle?.vehicleId)
    && cleanString(vehicle?.vistosVehicleId)
  );
}

function gpsKeyMatches(trips, registration) {
  const wantedPlate = normalizedPlate(registration);
  const keys = new Map();
  (Array.isArray(trips) ? trips : []).forEach((trip) => {
    if (normalizedPlate(trip?.license_plate) !== wantedPlate) return;
    const key = cleanString(trip?.vehicle_key).toLowerCase();
    if (key) keys.set(key, key);
  });
  return Array.from(keys.values());
}

async function synchronizePilotAliases(db, fleetVehicles, trips, nowIso) {
  let storedAliases = await loadActiveAliases(db);
  const results = [];

  for (const pilot of COLLECTION_DAILY_ROUTE_VEHICLES) {
    const code = cleanString(pilot.code).toUpperCase();
    const routeAlias = storedAliases.find((alias) => aliasKey(alias.external_system, alias.external_key) === aliasKey("collection_routes", code));
    const storedTcarsAliases = routeAlias
      ? storedAliases.filter((alias) => alias.vehicle_id === routeAlias.vehicle_id && alias.external_system === "tcars")
      : [];
    if (routeAlias && storedTcarsAliases.length === 1) {
      results.push({
        routeVehicleCode: code,
        registration: pilot.registration,
        vehicleId: cleanString(routeAlias.vehicle_id),
        tcarsVehicleKey: cleanString(storedTcarsAliases[0].external_key).toLowerCase(),
        status: "ready",
        source: "stable_alias",
        reasonCode: "stable_alias_reused"
      });
      continue;
    }

    const masters = fleetMasterMatches(fleetVehicles, pilot.registration);
    const gpsKeys = gpsKeyMatches(trips, pilot.registration);
    if (masters.length !== 1 || gpsKeys.length !== 1) {
      results.push({
        routeVehicleCode: code,
        registration: pilot.registration,
        vehicleId: routeAlias?.vehicle_id || "",
        tcarsVehicleKey: "",
        status: "waiting",
        source: "bootstrap_unique_plate",
        reasonCode: masters.length !== 1
          ? (masters.length > 1 ? "ambiguous_fleet_master" : "fleet_master_missing")
          : (gpsKeys.length > 1 ? "ambiguous_tcars_vehicle" : "tcars_vehicle_missing")
      });
      continue;
    }

    const master = masters[0];
    const vehicleId = cleanString(master.id || master.vehicleId);
    const common = {
      vehicleId,
      licensePlate: pilot.registration,
      routeVehicleCode: code,
      matchMethod: "bootstrap_unique_plate",
      confidence: "high",
      validFrom: nowIso,
      metadata: {
        phase: FLEET_TRIP_JOB_PAIRING_PHASE,
        bootstrapPlate: normalizedPlate(pilot.registration),
        externalSystemsReadOnly: true
      }
    };
    await upsertAlias(db, { ...common, externalSystem: "collection_routes", externalKey: code }, nowIso);
    await upsertAlias(db, { ...common, externalSystem: "tcars", externalKey: gpsKeys[0] }, nowIso);
    await upsertAlias(db, {
      ...common,
      externalSystem: "vistos",
      externalKey: cleanString(master.vistosVehicleId)
    }, nowIso);
    results.push({
      routeVehicleCode: code,
      registration: pilot.registration,
      vehicleId,
      tcarsVehicleKey: gpsKeys[0],
      status: "ready",
      source: "bootstrap_unique_plate",
      reasonCode: "unique_plate_bootstrap_saved"
    });
    storedAliases = await loadActiveAliases(db);
  }

  return results;
}

function completedStopsForRun(stops, runId) {
  return stops.filter((stop) =>
    cleanString(stop.run_id) === cleanString(runId)
    && cleanString(stop.status).toLowerCase() === "done"
    && dateValue(stop.completed_at)
  ).sort((left, right) => new Date(left.completed_at) - new Date(right.completed_at));
}

function unclassified(reasonCode, extra = {}) {
  return {
    allocationStatus: "unclassified",
    classification: "unclassified",
    matchMethod: "none",
    confidence: "none",
    reasonCode,
    routeRunId: "",
    jobStopId: "",
    ...extra
  };
}

export function classifyFleetTripJobCandidate(trip = {}, routeRuns = [], routeStops = []) {
  const tripStartedAt = dateValue(trip.started_at || trip.startedAt);
  const tripFinishedAt = dateValue(trip.finished_at || trip.finishedAt);
  if (!tripStartedAt || !tripFinishedAt || tripFinishedAt <= tripStartedAt) {
    return unclassified("invalid_trip_window");
  }

  const completedRuns = routeRuns.filter((run) => cleanString(run.status).toLowerCase() === "completed");
  if (!completedRuns.length) return unclassified("no_completed_route_run");
  if (completedRuns.length > 1) return unclassified("ambiguous_completed_route_run");

  const run = completedRuns[0];
  const runStartedAt = dateValue(run.started_at);
  const runCompletedAt = dateValue(run.completed_at);
  if (!runStartedAt || !runCompletedAt || runCompletedAt <= runStartedAt) {
    return unclassified("invalid_route_run_window", { routeRunId: cleanString(run.id) });
  }
  if (tripStartedAt < runStartedAt || tripFinishedAt > runCompletedAt) {
    return unclassified("trip_outside_completed_route", { routeRunId: cleanString(run.id) });
  }

  const stops = completedStopsForRun(routeStops, run.id);
  if (stops.length < 2) {
    return unclassified("insufficient_completed_stops", { routeRunId: cleanString(run.id) });
  }
  const firstStopAt = dateValue(stops[0].completed_at);
  const lastStopAt = dateValue(stops.at(-1).completed_at);

  if (tripFinishedAt <= firstStopAt) {
    return {
      allocationStatus: "candidate",
      classification: "deadhead_candidate",
      matchMethod: "stable_vehicle_date_time_window",
      confidence: "medium",
      reasonCode: "before_first_completed_stop",
      routeRunId: cleanString(run.id),
      jobStopId: ""
    };
  }
  if (tripStartedAt >= lastStopAt) {
    return {
      allocationStatus: "candidate",
      classification: "deadhead_candidate",
      matchMethod: "stable_vehicle_date_time_window",
      confidence: "medium",
      reasonCode: "after_last_completed_stop",
      routeRunId: cleanString(run.id),
      jobStopId: ""
    };
  }
  if (tripStartedAt >= firstStopAt && tripFinishedAt <= lastStopAt) {
    const nextStop = stops.find((stop) => dateValue(stop.completed_at) >= tripFinishedAt) || null;
    if (!nextStop) {
      return unclassified("next_completed_job_stop_missing", { routeRunId: cleanString(run.id) });
    }
    return {
      allocationStatus: "candidate",
      classification: "productive_candidate",
      matchMethod: "stable_vehicle_date_time_window",
      confidence: "medium",
      reasonCode: "between_completed_stops",
      routeRunId: cleanString(run.id),
      jobStopId: cleanString(nextStop.id)
    };
  }

  return unclassified("trip_crosses_productive_boundary", { routeRunId: cleanString(run.id) });
}

async function batchRun(db, statements, chunkSize = 80) {
  for (let index = 0; index < statements.length; index += chunkSize) {
    await db.batch(statements.slice(index, index + chunkSize));
  }
}

function runRow(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    dedupeKey: cleanString(row.dedupe_key),
    startedAt: cleanString(row.started_at),
    scheduledAt: cleanString(row.scheduled_at),
    finishedAt: cleanString(row.finished_at),
    status: cleanString(row.status),
    triggeredBy: cleanString(row.triggered_by),
    periodFrom: cleanString(row.period_from),
    periodTo: cleanString(row.period_to),
    aliasesRequired: Number(row.aliases_required || 0),
    aliasesReady: Number(row.aliases_ready || 0),
    tripsSeen: Number(row.trips_seen || 0),
    candidateTrips: Number(row.candidate_trips || 0),
    unclassifiedTrips: Number(row.unclassified_trips || 0),
    actualRouteRuns: Number(row.actual_route_runs || 0),
    actualStops: Number(row.actual_stops || 0),
    candidateCoveragePercent: round(row.candidate_coverage_percent, 1),
    jobPairCoveragePercent: round(row.job_pair_coverage_percent, 1),
    totalDistanceKm: round(row.total_distance_km, 1),
    candidateDistanceKm: round(row.candidate_distance_km, 1),
    qualityReasons: parseJson(row.quality_reasons_json, []),
    gateStatus: cleanString(row.gate_status || "blocked"),
    dashboardActivationAllowed: Boolean(Number(row.dashboard_activation_allowed || 0)),
    message: cleanString(row.message),
    errorCode: cleanString(row.error_code)
  };
}

async function beginRun(db, input) {
  const result = await db.prepare(`INSERT OR IGNORE INTO fleet_trip_job_pairing_runs (
    id, dedupe_key, started_at, scheduled_at, status, triggered_by, period_from, period_to,
    aliases_required, gate_status, dashboard_activation_allowed, message
  ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, 'blocked', 0, ?)`)
    .bind(
      input.runId,
      input.dedupeKey,
      input.startedAt,
      input.scheduledAt,
      input.triggeredBy,
      input.periodFrom,
      input.periodTo,
      COLLECTION_DAILY_ROUTE_VEHICLES.length,
      "Párovací read-only pilot byl spuštěn. Dashboardové hodnoty zůstávají vypnuté."
    ).run();

  if (runChanges(result) === 0) {
    const existing = await db.prepare("SELECT * FROM fleet_trip_job_pairing_runs WHERE dedupe_key = ? LIMIT 1")
      .bind(input.dedupeKey).first();
    return { acquired: false, run: runRow(existing) };
  }

  await db.prepare(`INSERT OR IGNORE INTO module_automation_runs (
    id, rule_id, module_key, started_at, status, message, triggered_by, dedupe_key
  ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`)
    .bind(
      `module-automation:${input.dedupeKey}`,
      PAIRING_RULE_ID,
      PAIRING_MODULE_KEY,
      input.startedAt,
      "Párovací read-only pilot byl spuštěn.",
      input.triggeredBy,
      input.dedupeKey
    ).run();
  return { acquired: true, run: null };
}

async function fleetPayload(env, options) {
  if (Array.isArray(options.fleetVehicles)) {
    return { apiStatus: "ready", provider: "test-input", vehicles: options.fleetVehicles };
  }
  return loadFleetVehiclesWithAssignments(env, null);
}

function gateReasons(summary) {
  const reasons = ["phase_1a_preview_only", "missing_verified_stop_coordinates"];
  if (summary.aliasesReady < summary.aliasesRequired) reasons.push("stable_vehicle_aliases_incomplete");
  if (summary.actualRouteRuns < 1) reasons.push("actual_route_runs_missing");
  if (summary.actualStops < 2) reasons.push("completed_job_stops_missing");
  if (summary.candidateCoveragePercent < DASHBOARD_QUALITY_GATE_PERCENT) reasons.push("candidate_coverage_below_90_percent");
  if (summary.jobPairCoveragePercent < JOB_PAIR_QUALITY_GATE_PERCENT) reasons.push("job_pair_coverage_below_95_percent");
  return reasons;
}

export async function runFleetTripJobPairing(env, options = {}) {
  const db = database(env);
  const rule = await db.prepare("SELECT status FROM module_rules WHERE id = ? LIMIT 1")
    .bind(PAIRING_RULE_ID).first();
  if (cleanString(rule?.status).toLowerCase() !== "active") {
    return {
      status: "skipped",
      reason: "automation_inactive",
      phase: FLEET_TRIP_JOB_PAIRING_PHASE,
      dashboardActivationAllowed: false
    };
  }
  const scheduledDate = dateValue(options.scheduledAt || Date.now()) || new Date();
  const startedAt = new Date().toISOString();
  const scheduledAt = scheduledDate.toISOString();
  const days = normalizedDays(options.days);
  const periodFrom = vehicleTrackingPragueDate(new Date(scheduledDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const periodTo = vehicleTrackingPragueDate(scheduledDate);
  const dedupeKey = cleanString(options.dedupeKey) || fleetTripJobPairingDedupeKey(scheduledDate);
  const triggeredBy = cleanString(options.triggeredBy || "cloudflare-cron");
  const runId = randomId("fleet-trip-job-pairing");
  const lock = await beginRun(db, { runId, dedupeKey, startedAt, scheduledAt, triggeredBy, periodFrom, periodTo });
  if (!lock.acquired) {
    return { status: "skipped", reason: "duplicate_schedule_bucket", run: lock.run };
  }

  try {
    const tripResult = await db.prepare(`SELECT id, vehicle_key, license_plate, local_date, started_at,
      finished_at, distance_km, quality_status, calculated_at
      FROM vehicle_tracking_trip_summaries
      WHERE local_date >= ? AND local_date <= ?
      ORDER BY local_date ASC, started_at ASC`).bind(periodFrom, periodTo).all();
    const allTrips = tripResult.results || [];
    const fleet = await fleetPayload(env, options);
    const aliases = await synchronizePilotAliases(db, fleet.vehicles || [], allTrips, startedAt);
    const readyAliases = aliases.filter((alias) => alias.status === "ready");
    const aliasesByTcars = new Map(readyAliases.map((alias) => [alias.tcarsVehicleKey, alias]));
    const pilotsByPlate = new Map(COLLECTION_DAILY_ROUTE_VEHICLES.map((pilot) => [normalizedPlate(pilot.registration), pilot]));

    const pilotTrips = [];
    const seenTripIds = new Set();
    allTrips.forEach((trip) => {
      const tcarsKey = cleanString(trip.vehicle_key).toLowerCase();
      const alias = aliasesByTcars.get(tcarsKey) || null;
      const pilot = alias
        ? COLLECTION_DAILY_ROUTE_VEHICLES.find((item) => item.code === alias.routeVehicleCode)
        : pilotsByPlate.get(normalizedPlate(trip.license_plate));
      if (!pilot || seenTripIds.has(trip.id)) return;
      seenTripIds.add(trip.id);
      pilotTrips.push({ trip, pilot, alias });
    });

    const routeRunResult = await db.prepare(`SELECT id, route_date, vehicle_code, status, started_at, completed_at
      FROM collection_daily_route_runs
      WHERE route_date >= ? AND route_date <= ? AND vehicle_code IN ('A', 'B', 'C')
      ORDER BY route_date ASC, vehicle_code ASC, started_at ASC`).bind(periodFrom, periodTo).all();
    const routeStopResult = await db.prepare(`SELECT id, run_id, route_date, source_row_id, status,
      completed_at, contract_number, source_contract_id
      FROM collection_daily_route_stops
      WHERE route_date >= ? AND route_date <= ?
      ORDER BY run_id ASC, route_order ASC`).bind(periodFrom, periodTo).all();
    const routeRuns = routeRunResult.results || [];
    const routeStops = routeStopResult.results || [];
    const nowIso = new Date().toISOString();

    const allocations = pilotTrips.map(({ trip, pilot, alias }) => {
      const matchingRuns = routeRuns.filter((run) =>
        cleanString(run.vehicle_code).toUpperCase() === cleanString(pilot.code).toUpperCase()
        && cleanString(run.route_date) === cleanString(trip.local_date)
      );
      const pairing = alias
        ? classifyFleetTripJobCandidate(trip, matchingRuns, routeStops)
        : unclassified("stable_vehicle_alias_missing");
      return {
        tripId: cleanString(trip.id),
        vehicleId: cleanString(alias?.vehicleId),
        tcarsVehicleKey: cleanString(trip.vehicle_key).toLowerCase(),
        routeVehicleCode: cleanString(pilot.code).toUpperCase(),
        localDate: cleanString(trip.local_date),
        routeRunId: cleanString(pairing.routeRunId),
        jobStopId: cleanString(pairing.jobStopId),
        allocationStatus: pairing.allocationStatus,
        classification: pairing.classification,
        distanceKm: round(trip.distance_km, 3),
        matchMethod: pairing.matchMethod,
        confidence: pairing.confidence,
        reasonCode: pairing.reasonCode,
        evidence: {
          phase: FLEET_TRIP_JOB_PAIRING_PHASE,
          routeVehicleCode: cleanString(pilot.code).toUpperCase(),
          stableVehicleAlias: Boolean(alias),
          tripStartedAt: cleanString(trip.started_at),
          tripFinishedAt: cleanString(trip.finished_at),
          gpsQualityStatus: cleanString(trip.quality_status),
          routeRunId: cleanString(pairing.routeRunId),
          jobStopId: cleanString(pairing.jobStopId),
          externalSystemsReadOnly: true,
          dashboardActivationAllowed: false
        },
        sourceTripCalculatedAt: cleanString(trip.calculated_at)
      };
    });

    const statements = allocations.map((allocation) => db.prepare(`INSERT INTO fleet_trip_job_allocations (
      trip_id, pairing_run_id, vehicle_id, tcars_vehicle_key, route_vehicle_code, local_date,
      route_run_id, job_stop_id, allocation_status, classification, distance_km, match_method,
      confidence, reason_code, evidence_json, source_trip_calculated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trip_id) DO UPDATE SET
      pairing_run_id = excluded.pairing_run_id,
      vehicle_id = excluded.vehicle_id,
      tcars_vehicle_key = excluded.tcars_vehicle_key,
      route_vehicle_code = excluded.route_vehicle_code,
      local_date = excluded.local_date,
      route_run_id = excluded.route_run_id,
      job_stop_id = excluded.job_stop_id,
      allocation_status = excluded.allocation_status,
      classification = excluded.classification,
      distance_km = excluded.distance_km,
      match_method = excluded.match_method,
      confidence = excluded.confidence,
      reason_code = excluded.reason_code,
      evidence_json = excluded.evidence_json,
      source_trip_calculated_at = excluded.source_trip_calculated_at,
      updated_at = excluded.updated_at`)
      .bind(
        allocation.tripId,
        runId,
        allocation.vehicleId || null,
        allocation.tcarsVehicleKey,
        allocation.routeVehicleCode,
        allocation.localDate,
        allocation.routeRunId || null,
        allocation.jobStopId || null,
        allocation.allocationStatus,
        allocation.classification,
        allocation.distanceKm,
        allocation.matchMethod,
        allocation.confidence,
        allocation.reasonCode,
        jsonString(allocation.evidence),
        allocation.sourceTripCalculatedAt || null,
        nowIso,
        nowIso
      ));
    await batchRun(db, statements);

    const candidate = allocations.filter((item) => item.allocationStatus === "candidate");
    const jobCandidates = candidate.filter((item) => item.jobStopId);
    const totalDistanceKm = allocations.reduce((sum, item) => sum + item.distanceKm, 0);
    const candidateDistanceKm = candidate.reduce((sum, item) => sum + item.distanceKm, 0);
    const candidateCoveragePercent = totalDistanceKm > 0 ? candidateDistanceKm / totalDistanceKm * 100 : 0;
    const jobPairCoveragePercent = allocations.length > 0 ? jobCandidates.length / allocations.length * 100 : 0;
    const completedRuns = routeRuns.filter((run) => cleanString(run.status).toLowerCase() === "completed");
    const completedStops = routeStops.filter((stop) => cleanString(stop.status).toLowerCase() === "done" && dateValue(stop.completed_at));
    const summary = {
      aliasesRequired: COLLECTION_DAILY_ROUTE_VEHICLES.length,
      aliasesReady: readyAliases.length,
      tripsSeen: allocations.length,
      candidateTrips: candidate.length,
      unclassifiedTrips: allocations.length - candidate.length,
      actualRouteRuns: completedRuns.length,
      actualStops: completedStops.length,
      candidateCoveragePercent: round(candidateCoveragePercent, 1),
      jobPairCoveragePercent: round(jobPairCoveragePercent, 1),
      totalDistanceKm: round(totalDistanceKm, 1),
      candidateDistanceKm: round(candidateDistanceKm, 1)
    };
    const reasons = gateReasons(summary);
    const message = summary.tripsSeen
      ? `Read-only pilot vyhodnotil ${summary.tripsSeen} GPS jízd; ${summary.candidateTrips} je pouze kandidátně spárovaných a ${summary.unclassifiedTrips} zůstává nezařazených. Dashboard zůstává vypnutý.`
      : "Read-only pilot zatím nemá GPS jízdy pro bezpečně mapovaná pilotní vozidla. Dashboard zůstává vypnutý.";

    await db.prepare(`UPDATE fleet_trip_job_pairing_runs SET
      finished_at = ?, status = 'ok', aliases_ready = ?, trips_seen = ?, candidate_trips = ?,
      unclassified_trips = ?, actual_route_runs = ?, actual_stops = ?,
      candidate_coverage_percent = ?, job_pair_coverage_percent = ?, total_distance_km = ?,
      candidate_distance_km = ?, quality_reasons_json = ?, gate_status = 'blocked', dashboard_activation_allowed = 0,
      message = ?, error_code = NULL WHERE id = ?`)
      .bind(
        nowIso,
        summary.aliasesReady,
        summary.tripsSeen,
        summary.candidateTrips,
        summary.unclassifiedTrips,
        summary.actualRouteRuns,
        summary.actualStops,
        summary.candidateCoveragePercent,
        summary.jobPairCoveragePercent,
        summary.totalDistanceKm,
        summary.candidateDistanceKm,
        jsonString(reasons),
        message,
        runId
      ).run();
    await db.prepare(`UPDATE module_automation_runs SET finished_at = ?, status = 'ok', message = ?, error_code = NULL
      WHERE module_key = ? AND dedupe_key = ?`).bind(nowIso, message, PAIRING_MODULE_KEY, dedupeKey).run();
    await db.prepare(`UPDATE module_rules SET last_run_at = ?, next_run_at = ?, last_run_status = 'ok',
      last_run_message = ?, updated_by_user_id = 'cloudflare-cron', updated_at = ? WHERE id = ?`)
      .bind(nowIso, nextRunAt(scheduledDate), message, nowIso, PAIRING_RULE_ID).run();

    return {
      status: "ok",
      phase: FLEET_TRIP_JOB_PAIRING_PHASE,
      runId,
      periodFrom,
      periodTo,
      aliases,
      summary,
      qualityGate: {
        status: "blocked",
        dashboardActivationAllowed: false,
        requiredCandidateCoveragePercent: DASHBOARD_QUALITY_GATE_PERCENT,
        requiredJobPairCoveragePercent: JOB_PAIR_QUALITY_GATE_PERCENT,
        reasons
      },
      message
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorCode = cleanString(error?.code || error?.message || "fleet_trip_job_pairing_failed").slice(0, 180);
    await db.prepare(`UPDATE fleet_trip_job_pairing_runs SET finished_at = ?, status = 'error',
      gate_status = 'blocked', dashboard_activation_allowed = 0, message = ?, error_code = ? WHERE id = ?`)
      .bind(finishedAt, "Párovací read-only pilot selhal. Dashboard zůstává vypnutý.", errorCode, runId).run().catch(() => {});
    await db.prepare(`UPDATE module_automation_runs SET finished_at = ?, status = 'error', message = ?, error_code = ?
      WHERE module_key = ? AND dedupe_key = ?`)
      .bind(finishedAt, "Párovací read-only pilot selhal.", errorCode, PAIRING_MODULE_KEY, dedupeKey).run().catch(() => {});
    await db.prepare(`UPDATE module_rules SET last_run_at = ?, next_run_at = ?, last_run_status = 'error',
      last_run_message = ?, updated_by_user_id = 'cloudflare-cron', updated_at = ? WHERE id = ?`)
      .bind(
        finishedAt,
        nextRunAt(scheduledDate),
        "Párovací read-only pilot selhal. Dashboard zůstává vypnutý.",
        finishedAt,
        PAIRING_RULE_ID
      ).run().catch(() => {});
    throw error;
  }
}

function allocationRow(row) {
  return {
    tripId: cleanString(row.trip_id),
    vehicleId: cleanString(row.vehicle_id),
    tcarsVehicleKey: cleanString(row.tcars_vehicle_key),
    routeVehicleCode: cleanString(row.route_vehicle_code),
    localDate: cleanString(row.local_date),
    routeRunId: cleanString(row.route_run_id),
    jobStopId: cleanString(row.job_stop_id),
    allocationStatus: cleanString(row.allocation_status),
    classification: cleanString(row.classification),
    distanceKm: round(row.distance_km, 3),
    matchMethod: cleanString(row.match_method),
    confidence: cleanString(row.confidence),
    reasonCode: cleanString(row.reason_code),
    evidence: parseJson(row.evidence_json),
    sourceTripCalculatedAt: cleanString(row.source_trip_calculated_at),
    updatedAt: cleanString(row.updated_at)
  };
}

export async function loadFleetTripJobPairingPreview(env, options = {}) {
  const db = database(env);
  const limit = Math.max(1, Math.min(MAX_PREVIEW_ROWS, Math.round(Number(options.limit || 200))));
  const lastRunRaw = await db.prepare("SELECT * FROM fleet_trip_job_pairing_runs ORDER BY started_at DESC LIMIT 1").first();
  const dataRunRaw = await db.prepare("SELECT * FROM fleet_trip_job_pairing_runs WHERE status = 'ok' ORDER BY started_at DESC LIMIT 1").first();
  const lastRun = runRow(lastRunRaw);
  const dataRun = runRow(dataRunRaw);
  const aliasResult = await db.prepare(`SELECT vehicle_id, external_system, external_key,
    normalized_license_plate, route_vehicle_code, status, match_method, confidence, updated_at
    FROM fleet_vehicle_external_aliases WHERE status = 'active'
    ORDER BY route_vehicle_code ASC, external_system ASC`).all();
  let allocations = [];
  if (dataRun?.id) {
    const allocationResult = await db.prepare(`SELECT trip_id, vehicle_id, tcars_vehicle_key,
      route_vehicle_code, local_date, route_run_id, job_stop_id, allocation_status,
      classification, distance_km, match_method, confidence, reason_code, evidence_json,
      source_trip_calculated_at, updated_at
      FROM fleet_trip_job_allocations WHERE pairing_run_id = ?
      ORDER BY local_date DESC, route_vehicle_code ASC, updated_at DESC LIMIT ?`)
      .bind(dataRun.id, limit).all();
    allocations = (allocationResult.results || []).map(allocationRow);
  }

  const reasons = Array.isArray(dataRun?.qualityReasons) ? [...dataRun.qualityReasons] : [];
  if (!lastRun) reasons.push("first_cloud_run_pending");
  if (lastRun?.status === "error") reasons.push("last_cloud_run_failed");
  if (dataRun?.gateStatus !== "ready") reasons.push("quality_gate_blocked");
  if (!reasons.includes("phase_1a_preview_only")) reasons.push("phase_1a_preview_only");

  return {
    apiStatus: !lastRun ? "waiting" : (lastRun.status === "error" ? "stale" : "ready"),
    phase: FLEET_TRIP_JOB_PAIRING_PHASE,
    source: "T-Cars GPS + skutečné denní trasy a potvrzené zastávky",
    externalSystemsReadOnly: true,
    cloudAutomation: {
      status: "scheduled",
      cron: PAIRING_CRON,
      intervalMinutes: PAIRING_INTERVAL_MINUTES,
      runner: "kaiser-vehicle-tracking-history-runner",
      dependsOnOpenBrowser: false,
      dependsOnFleetModuleOpen: false,
      frontendTrigger: false
    },
    qualityGate: {
      status: dataRun?.gateStatus || "blocked",
      dashboardActivationAllowed: false,
      requiredCandidateCoveragePercent: DASHBOARD_QUALITY_GATE_PERCENT,
      requiredJobPairCoveragePercent: JOB_PAIR_QUALITY_GATE_PERCENT,
      reasons: Array.from(new Set(reasons))
    },
    lastRun,
    dataRun,
    aliases: (aliasResult.results || []).map((row) => ({
      vehicleId: cleanString(row.vehicle_id),
      externalSystem: cleanString(row.external_system),
      externalKey: cleanString(row.external_key),
      normalizedLicensePlate: cleanString(row.normalized_license_plate),
      routeVehicleCode: cleanString(row.route_vehicle_code),
      status: cleanString(row.status),
      matchMethod: cleanString(row.match_method),
      confidence: cleanString(row.confidence),
      updatedAt: cleanString(row.updated_at)
    })),
    allocations,
    message: lastRun?.message || "První cloudový párovací běh zatím neproběhl. Dashboard zůstává vypnutý."
  };
}
