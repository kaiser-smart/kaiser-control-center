import {
  assertCollectionRoutesTestManager,
  collectionRoutesTestDatabase
} from "./collection-routes-test-store.js";
import {
  COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  isCollectionDailyRouteStationaryFieldTest
} from "./collection-daily-routes-store.js";

const MAX_ACCURACY_METERS = 30;
const ROUTING_CANDIDATE_ACCURACY_METERS = 15;
const STATIONARY_SPEED_MPS = 1.5;
const REVIEW_DISTANCE_METERS = 150;
const MINIMUM_SAMPLES = 3;
const CAPTURE_MAX_AGE_MS = 10 * 60 * 1000;

export class CollectionRoutesTestGpsError extends Error {
  constructor(message, status = 400, code = "collection_routes_test_gps_error") {
    super(message);
    this.name = "CollectionRoutesTestGpsError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJson(value, fallback = {}) {
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

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function radians(value) {
  return value * (Math.PI / 180);
}

export function collectionRoutesGpsDistanceMeters(left = {}, right = {}) {
  const latitude1 = numberValue(left.latitude);
  const longitude1 = numberValue(left.longitude);
  const latitude2 = numberValue(right.latitude);
  const longitude2 = numberValue(right.longitude);
  if ([latitude1, longitude1, latitude2, longitude2].some((value) => value === null)) return null;
  const earthRadius = 6371000;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round((earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

function validCoordinate(latitude, longitude) {
  return latitude !== null && latitude >= -90 && latitude <= 90 &&
    longitude !== null && longitude >= -180 && longitude <= 180;
}

function rowToConfirmation(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    runId: cleanString(row.run_id),
    stopId: cleanString(row.stop_id),
    sourceRowId: cleanString(row.source_row_id),
    vehicleCode: cleanString(row.vehicle_code),
    driverUserId: cleanString(row.driver_user_id),
    driverName: cleanString(row.driver_name),
    addressLatitude: numberValue(row.address_latitude),
    addressLongitude: numberValue(row.address_longitude),
    latitude: numberValue(row.measured_latitude),
    longitude: numberValue(row.measured_longitude),
    accuracyMeters: numberValue(row.accuracy_m),
    sampleCount: Number(row.sample_count) || 0,
    speedMps: numberValue(row.speed_mps),
    distanceFromAddressMeters: numberValue(row.distance_from_address_m),
    status: cleanString(row.status),
    routingCandidate: Number(row.routing_candidate) === 1,
    source: cleanString(row.source),
    fieldTesterUserId: cleanString(row.source) === "field-tester-tablet-gps" ? cleanString(row.created_by_user_id) : "",
    fieldTesterName: cleanString(row.source) === "field-tester-tablet-gps" ? cleanString(row.created_by_name) : "",
    capturedAt: cleanString(row.captured_at),
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    reviewedByName: cleanString(row.reviewed_by_name),
    reviewedAt: cleanString(row.reviewed_at),
    reviewNote: cleanString(row.review_note),
    createdAt: cleanString(row.created_at)
  };
}

function dbError(error) {
  if (error instanceof CollectionRoutesTestGpsError) return error;
  const message = cleanString(error?.message);
  if (/no such table[^\n]*(collection_route_test_gps|collection_route_here_settings)/i.test(message)) {
    return new CollectionRoutesTestGpsError(
      "GPS potvrzení čeká na TEST D1 migraci 0003.",
      503,
      "collection_routes_test_gps_migration_missing"
    );
  }
  console.error("collection_routes_test_gps.store_failed", { message });
  return new CollectionRoutesTestGpsError(
    "GPS potvrzení stanoviště se teď nepodařilo zpracovat.",
    500,
    "collection_routes_test_gps_store_failed"
  );
}

async function loadActiveRun(db, runId) {
  const run = await db.prepare(`
    SELECT * FROM collection_daily_route_runs WHERE id = ? LIMIT 1
  `).bind(runId).first();
  if (!run) {
    throw new CollectionRoutesTestGpsError("TEST trasa nebyla nalezena.", 404, "collection_routes_test_gps_run_not_found");
  }
  if (cleanString(run.status) !== "active") {
    throw new CollectionRoutesTestGpsError(
      "GPS stanoviště lze potvrdit až po zahájení TEST trasy.",
      409,
      "collection_routes_test_gps_route_not_active"
    );
  }
  return run;
}

async function loadPlannedStop(db, runId, stopId) {
  const stop = await db.prepare(`
    SELECT * FROM collection_daily_route_stops WHERE id = ? AND run_id = ? LIMIT 1
  `).bind(stopId, runId).first();
  if (!stop) {
    throw new CollectionRoutesTestGpsError(
      "Stanoviště nepatří do vybrané TEST trasy.",
      404,
      "collection_routes_test_gps_stop_not_found"
    );
  }
  if (cleanString(stop.status) !== "planned") {
    throw new CollectionRoutesTestGpsError(
      "GPS lze potvrdit pouze u čekajícího stanoviště.",
      409,
      "collection_routes_test_gps_stop_not_planned"
    );
  }
  return stop;
}

function capturePoint(input = {}) {
  const latitude = numberValue(input.latitude);
  const longitude = numberValue(input.longitude);
  const accuracyMeters = numberValue(input.accuracyMeters ?? input.accuracy);
  const speedMps = numberValue(input.speedMps ?? input.speed);
  const sampleCount = Math.floor(Number(input.sampleCount) || 0);
  const capturedAt = cleanString(input.capturedAt);
  if (!validCoordinate(latitude, longitude)) {
    throw new CollectionRoutesTestGpsError("Tablet neposlal platnou GPS polohu.", 400, "collection_routes_test_gps_coordinate_invalid");
  }
  if (accuracyMeters === null || accuracyMeters <= 0 || accuracyMeters > MAX_ACCURACY_METERS) {
    throw new CollectionRoutesTestGpsError(
      `GPS musí mít přesnost nejvýše ${MAX_ACCURACY_METERS} metrů.`,
      400,
      "collection_routes_test_gps_accuracy_invalid"
    );
  }
  if (sampleCount < MINIMUM_SAMPLES || sampleCount > 30) {
    throw new CollectionRoutesTestGpsError(
      `GPS potvrzení vyžaduje nejméně ${MINIMUM_SAMPLES} měření.`,
      400,
      "collection_routes_test_gps_samples_invalid"
    );
  }
  if (speedMps !== null && speedMps > STATIONARY_SPEED_MPS) {
    throw new CollectionRoutesTestGpsError(
      "Tablet se podle GPS ještě pohybuje. Polohu potvrď až po zastavení.",
      409,
      "collection_routes_test_gps_vehicle_moving"
    );
  }
  const capturedTime = Date.parse(capturedAt);
  if (!capturedAt || !Number.isFinite(capturedTime) || Math.abs(Date.now() - capturedTime) > CAPTURE_MAX_AGE_MS) {
    throw new CollectionRoutesTestGpsError(
      "GPS měření je neplatné nebo příliš staré. Změř polohu znovu.",
      400,
      "collection_routes_test_gps_capture_stale"
    );
  }
  return { latitude, longitude, accuracyMeters, speedMps, sampleCount, capturedAt };
}

async function existingByIdempotency(db, idempotencyKey) {
  if (!idempotencyKey) return null;
  return db.prepare(`
    SELECT * FROM collection_route_test_gps_confirmations WHERE idempotency_key = ? LIMIT 1
  `).bind(idempotencyKey).first();
}

export async function getCollectionRoutesTestOperationalConfig(env, user) {
  assertCollectionRoutesTestManager(user);
  const db = collectionRoutesTestDatabase(env, true);
  try {
    const [settings, summary] = await Promise.all([
      db.prepare(`SELECT status, config_json, updated_at FROM collection_route_here_settings WHERE scope = 'test' LIMIT 1`).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN status IN ('driver-measured', 'field-tester-measured') THEN 1 ELSE 0 END) AS measured_count,
          SUM(CASE WHEN status = 'needs-review' THEN 1 ELSE 0 END) AS review_count,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_count
        FROM collection_route_test_gps_confirmations
      `).first()
    ]);
    const config = parseJson(settings?.config_json, {});
    return {
      status: cleanString(settings?.status) || "draft",
      config,
      updatedAt: cleanString(settings?.updated_at),
      gpsSummary: {
        totalCount: Number(summary?.total_count) || 0,
        measuredCount: Number(summary?.measured_count) || 0,
        reviewCount: Number(summary?.review_count) || 0,
        verifiedCount: Number(summary?.verified_count) || 0
      },
      dataScope: "test",
      usesProductionSites: false,
      sendsNotifications: false
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function listCollectionRoutesTestGpsConfirmations(env, user, { runId } = {}) {
  assertCollectionRoutesTestManager(user);
  const normalizedRunId = cleanString(runId);
  if (!normalizedRunId) {
    throw new CollectionRoutesTestGpsError("Chybí TEST trasa pro načtení GPS.", 400, "collection_routes_test_gps_run_required");
  }
  const db = collectionRoutesTestDatabase(env, true);
  try {
    const run = await db.prepare(`SELECT id FROM collection_daily_route_runs WHERE id = ? LIMIT 1`).bind(normalizedRunId).first();
    if (!run) {
      throw new CollectionRoutesTestGpsError("TEST trasa nebyla nalezena.", 404, "collection_routes_test_gps_run_not_found");
    }
    const result = await db.prepare(`
      SELECT * FROM collection_route_test_gps_confirmations
      WHERE run_id = ?
      ORDER BY captured_at DESC
      LIMIT 1000
    `).bind(normalizedRunId).all();
    return {
      confirmations: (result.results || []).map(rowToConfirmation),
      dataScope: "test"
    };
  } catch (error) {
    throw dbError(error);
  }
}

export async function confirmCollectionRoutesTestGps(env, user, input = {}) {
  assertCollectionRoutesTestManager(user);
  const db = collectionRoutesTestDatabase(env, true);
  const runId = cleanString(input.runId);
  const stopId = cleanString(input.stopId);
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!runId || !stopId || !idempotencyKey) {
    throw new CollectionRoutesTestGpsError(
      "Chybí trasa, stanoviště nebo ochrana proti duplicitnímu GPS zápisu.",
      400,
      "collection_routes_test_gps_input_required"
    );
  }
  try {
    const run = await loadActiveRun(db, runId);
    const stationaryFieldTest = isCollectionDailyRouteStationaryFieldTest(run);
    const runMetadata = parseJson(run.metadata_json, {});
    if (stationaryFieldTest && (
      cleanString(runMetadata.testMode) !== COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD ||
      !cleanString(runMetadata.fieldTesterUserId) ||
      cleanString(user?.id) !== cleanString(runMetadata.fieldTesterUserId)
    )) {
      throw new CollectionRoutesTestGpsError(
        "GPS tohoto stacionárního TESTU může uložit pouze terénní tester, který jej založil.",
        403,
        "collection_routes_test_gps_field_tester_mismatch"
      );
    }
    const existing = await existingByIdempotency(db, idempotencyKey);
    if (existing) {
      if (cleanString(existing.run_id) !== runId || cleanString(existing.stop_id) !== stopId) {
        throw new CollectionRoutesTestGpsError(
          "Ochrana proti duplicitě už patří jinému GPS měření.",
          409,
          "collection_routes_test_gps_idempotency_conflict"
        );
      }
      return { confirmation: rowToConfirmation(existing), reused: true };
    }
    const point = capturePoint(input);
    const stop = await loadPlannedStop(db, runId, stopId);
    const sourceSummary = parseJson(stop.source_summary_json, {});
    const addressLatitude = numberValue(sourceSummary.latitude);
    const addressLongitude = numberValue(sourceSummary.longitude);
    const distance = validCoordinate(addressLatitude, addressLongitude)
      ? collectionRoutesGpsDistanceMeters(
          { latitude: addressLatitude, longitude: addressLongitude },
          { latitude: point.latitude, longitude: point.longitude }
        )
      : null;
    const needsReview = point.accuracyMeters > ROUTING_CANDIDATE_ACCURACY_METERS ||
      distance === null || distance > REVIEW_DISTANCE_METERS;
    const status = needsReview ? "needs-review" : stationaryFieldTest ? "field-tester-measured" : "driver-measured";
    const source = stationaryFieldTest ? "field-tester-tablet-gps" : "driver-tablet-gps";
    const routingCandidate = needsReview ? 0 : 1;
    const createdAt = nowIso();
    const id = randomId("collection-route-test-gps");
    const actorId = cleanString(user?.id || user?.email);
    const actorName = cleanString(user?.name || user?.email || "Uživatel");
    const note = needsReview
      ? "GPS bod byl fyzicky změřen a čeká na kontrolu odchylky nebo přesnosti."
      : "GPS bod byl fyzicky změřen a je použitelný jako TEST navigační kandidát.";
    await db.batch([
      db.prepare(`
        INSERT INTO collection_route_test_gps_confirmations (
          id, run_id, stop_id, source_row_id, vehicle_code, driver_user_id, driver_name,
          address_latitude, address_longitude, measured_latitude, measured_longitude,
          accuracy_m, sample_count, speed_mps, distance_from_address_m, status,
          routing_candidate, source, idempotency_key, captured_at,
          created_by_user_id, created_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        run.id,
        stop.id,
        stop.source_row_id,
        cleanString(run.vehicle_code),
        cleanString(run.driver_user_id),
        cleanString(run.driver_name),
        addressLatitude,
        addressLongitude,
        point.latitude,
        point.longitude,
        point.accuracyMeters,
        point.sampleCount,
        point.speedMps,
        distance,
        status,
        routingCandidate,
        source,
        idempotencyKey,
        point.capturedAt,
        actorId,
        actorName,
        createdAt,
        createdAt
      ),
      db.prepare(`
        INSERT INTO collection_daily_route_events (
          id, run_id, stop_id, event_type, before_status, after_status, reason, note,
          idempotency_key, actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, ?, 'gps_position_confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-daily-event"),
        run.id,
        stop.id,
        cleanString(stop.status),
        cleanString(stop.status),
        status,
        note,
        `gps-event:${idempotencyKey}`,
        actorId,
        actorName,
        createdAt,
        jsonString({
          gpsConfirmationId: id,
          accuracyMeters: point.accuracyMeters,
          sampleCount: point.sampleCount,
          distanceFromAddressMeters: distance,
          routingCandidate: Boolean(routingCandidate),
          dataScope: "test",
          testMode: stationaryFieldTest ? COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD : "",
          fieldTesterUserId: stationaryFieldTest ? actorId : ""
        })
      ),
      db.prepare(`UPDATE collection_daily_route_runs SET updated_at = ? WHERE id = ?`).bind(createdAt, run.id)
    ]);
    return {
      confirmation: rowToConfirmation(await db.prepare(`SELECT * FROM collection_route_test_gps_confirmations WHERE id = ?`).bind(id).first()),
      reused: false
    };
  } catch (error) {
    if (/unique constraint[\s\S]*idempotency/i.test(cleanString(error?.message))) {
      const existing = await existingByIdempotency(db, idempotencyKey);
      if (existing && cleanString(existing.run_id) === runId && cleanString(existing.stop_id) === stopId) {
        return { confirmation: rowToConfirmation(existing), reused: true };
      }
    }
    throw dbError(error);
  }
}
