const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEGMENT_GAP_MINUTES = 15;
const MAX_IMPLIED_SPEED_KMH = 160;
const MIN_MOVING_DISTANCE_KM = 0.05;
const ANALYTICS_RETENTION_MONTHS = 24;

const PERIOD_DAYS = Object.freeze({ today: 1, "7d": 7, "30d": 30 });

function cleanString(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function vehicleTrackingAnalyticsPeriod(value) {
  const normalized = cleanString(value);
  return Object.hasOwn(PERIOD_DAYS, normalized) ? normalized : "30d";
}

export function vehicleTrackingPragueDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function vehicleTrackingAnalyticsFromDate(period = "30d", now = new Date()) {
  const days = PERIOD_DAYS[vehicleTrackingAnalyticsPeriod(period)];
  return vehicleTrackingPragueDate(new Date(now.getTime() - Math.max(0, days - 1) * DAY_MS));
}

export function vehicleTrackingHaversineKm(left = {}, right = {}) {
  const lat1 = finiteNumber(left.latitude);
  const lon1 = finiteNumber(left.longitude);
  const lat2 = finiteNumber(right.latitude);
  const lon2 = finiteNumber(right.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizedPoint(point = {}) {
  const recordedAt = cleanString(point.recordedAt || point.recorded_at);
  const timestamp = new Date(recordedAt).getTime();
  const latitude = finiteNumber(point.latitude);
  const longitude = finiteNumber(point.longitude);
  if (!Number.isFinite(timestamp) || latitude === null || longitude === null
    || latitude === 0 || longitude === 0 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return {
    vehicleKey: cleanString(point.vehicleKey || point.vehicle_key).toLowerCase(),
    licensePlate: cleanString(point.licensePlate || point.license_plate),
    latitude,
    longitude,
    speedKmh: finiteNumber(point.speedKmh ?? point.speed_kmh),
    recordedAt: new Date(timestamp).toISOString(),
    timestamp
  };
}

function qualityStatus(coveragePercent, validSegments) {
  if (validSegments <= 0) return "insufficient";
  if (coveragePercent >= 90) return "ready";
  if (coveragePercent >= 70) return "partial";
  return "insufficient";
}

function tripId(vehicleKey, localDate, startedAt) {
  return `gps-trip:${vehicleKey}:${localDate}:${startedAt}`;
}

export function analyzeVehicleTrackingPoints(inputPoints = [], options = {}) {
  const calculatedAt = cleanString(options.calculatedAt) || new Date().toISOString();
  const points = inputPoints.map(normalizedPoint).filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
  const unique = [];
  const seen = new Set();
  points.forEach((point) => {
    const key = `${point.recordedAt}:${point.latitude}:${point.longitude}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(point);
    }
  });

  const dayMap = new Map();
  const trips = [];
  let activeTrip = null;

  const dayFor = (point) => {
    const localDate = vehicleTrackingPragueDate(point.recordedAt);
    if (!dayMap.has(localDate)) {
      dayMap.set(localDate, {
        vehicleKey: point.vehicleKey,
        licensePlate: point.licensePlate,
        localDate,
        totalKm: 0,
        tripCount: 0,
        movingMinutes: 0,
        pointCount: 0,
        validSegmentCount: 0,
        rejectedSegmentCount: 0,
        firstRecordedAt: point.recordedAt,
        lastRecordedAt: point.recordedAt
      });
    }
    const day = dayMap.get(localDate);
    day.licensePlate = point.licensePlate || day.licensePlate;
    day.pointCount += 1;
    day.firstRecordedAt = day.firstRecordedAt < point.recordedAt ? day.firstRecordedAt : point.recordedAt;
    day.lastRecordedAt = day.lastRecordedAt > point.recordedAt ? day.lastRecordedAt : point.recordedAt;
    return day;
  };

  const closeTrip = () => {
    if (!activeTrip) return;
    if (activeTrip.distanceKm >= MIN_MOVING_DISTANCE_KM && activeTrip.segmentCount > 0) {
      const day = dayMap.get(activeTrip.localDate);
      const coverage = activeTrip.segmentCount > 0
        ? activeTrip.validSegmentCount / activeTrip.segmentCount * 100
        : 0;
      trips.push({
        ...activeTrip,
        id: tripId(activeTrip.vehicleKey, activeTrip.localDate, activeTrip.startedAt),
        distanceKm: round(activeTrip.distanceKm),
        durationMinutes: round((new Date(activeTrip.finishedAt) - new Date(activeTrip.startedAt)) / 60000, 1),
        movingMinutes: round(activeTrip.movingMinutes, 1),
        qualityScore: round(coverage, 1),
        qualityStatus: qualityStatus(coverage, activeTrip.validSegmentCount),
        distanceSource: "gps_geometry",
        calculatedAt
      });
      if (day) day.tripCount += 1;
    }
    activeTrip = null;
  };

  unique.forEach(dayFor);
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const current = unique[index];
    if (!current.vehicleKey || current.vehicleKey !== previous.vehicleKey) {
      closeTrip();
      continue;
    }
    const currentDay = dayMap.get(vehicleTrackingPragueDate(current.recordedAt));
    const previousDay = vehicleTrackingPragueDate(previous.recordedAt);
    const gapMinutes = (current.timestamp - previous.timestamp) / 60000;
    const distanceKm = vehicleTrackingHaversineKm(previous, current);
    const impliedSpeedKmh = distanceKm !== null && gapMinutes > 0 ? distanceKm / (gapMinutes / 60) : null;
    const sameDay = previousDay === currentDay.localDate;
    const validSegment = sameDay && gapMinutes > 0 && gapMinutes <= MAX_SEGMENT_GAP_MINUTES
      && distanceKm !== null && impliedSpeedKmh !== null && impliedSpeedKmh <= MAX_IMPLIED_SPEED_KMH;

    if (!validSegment) {
      if (sameDay) currentDay.rejectedSegmentCount += 1;
      closeTrip();
      continue;
    }

    currentDay.validSegmentCount += 1;
    const moving = distanceKm >= MIN_MOVING_DISTANCE_KM
      || (previous.speedKmh !== null && previous.speedKmh > 2)
      || (current.speedKmh !== null && current.speedKmh > 2);
    if (!moving) {
      closeTrip();
      continue;
    }

    currentDay.totalKm += distanceKm;

    if (!activeTrip || activeTrip.localDate !== currentDay.localDate) {
      closeTrip();
      activeTrip = {
        vehicleKey: current.vehicleKey,
        licensePlate: current.licensePlate || previous.licensePlate,
        localDate: currentDay.localDate,
        startedAt: previous.recordedAt,
        finishedAt: current.recordedAt,
        distanceKm: 0,
        movingMinutes: 0,
        pointCount: 1,
        segmentCount: 0,
        validSegmentCount: 0
      };
    }
    activeTrip.finishedAt = current.recordedAt;
    activeTrip.distanceKm += distanceKm;
    activeTrip.movingMinutes += gapMinutes;
    activeTrip.pointCount += 1;
    activeTrip.segmentCount += 1;
    activeTrip.validSegmentCount += 1;
    currentDay.movingMinutes += gapMinutes;
  }
  closeTrip();

  const daily = Array.from(dayMap.values()).map((day) => {
    const segmentTotal = day.validSegmentCount + day.rejectedSegmentCount;
    const coveragePercent = segmentTotal > 0 ? day.validSegmentCount / segmentTotal * 100 : 0;
    return {
      ...day,
      totalKm: round(day.totalKm),
      movingMinutes: round(day.movingMinutes, 1),
      coveragePercent: round(coveragePercent, 1),
      qualityStatus: qualityStatus(coveragePercent, day.validSegmentCount),
      distanceSource: "gps_geometry",
      calculatedAt
    };
  });

  return { points: unique, daily, trips };
}

function rowPoint(row = {}) {
  return {
    vehicleKey: row.vehicle_key,
    licensePlate: row.license_plate,
    latitude: row.latitude,
    longitude: row.longitude,
    speedKmh: row.speed_kmh,
    recordedAt: row.recorded_at
  };
}

function normalizedDays(value, fallback = 2) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(30, number)) : fallback;
}

function retentionDate(now) {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - ANALYTICS_RETENTION_MONTHS);
  return vehicleTrackingPragueDate(date);
}

export async function rebuildVehicleTrackingAnalytics(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  let days = normalizedDays(options.days);
  if (days < 30) {
    const existing = await db.prepare(
      "SELECT COUNT(*) AS count FROM vehicle_tracking_daily_metrics"
    ).first();
    if (Number(existing?.count || 0) === 0) days = 30;
  }
  const startedAt = now.toISOString();
  const runId = `vehicle-analytics-${crypto.randomUUID()}`;
  const periodFrom = vehicleTrackingPragueDate(new Date(now.getTime() - Math.max(0, days - 1) * DAY_MS));
  const bufferSince = new Date(now.getTime() - (days + 1) * DAY_MS).toISOString();
  const calculatedAt = new Date().toISOString();

  await db.prepare(`INSERT INTO vehicle_tracking_analytics_runs (
    id, started_at, status, period_from, period_to, message
  ) VALUES (?, ?, 'running', ?, ?, ?)`)
    .bind(runId, startedAt, periodFrom, vehicleTrackingPragueDate(now), "Přepočet GPS jízd byl spuštěn.").run();

  try {
    const result = await db.prepare(`
      SELECT vehicle_key, license_plate, latitude, longitude, speed_kmh, recorded_at
      FROM vehicle_tracking_gps_points
      WHERE recorded_at >= ?
      ORDER BY vehicle_key ASC, recorded_at ASC
    `).bind(bufferSince).all();
    const byVehicle = new Map();
    (result.results || []).forEach((row) => {
      const key = cleanString(row.vehicle_key).toLowerCase();
      if (!key) return;
      if (!byVehicle.has(key)) byVehicle.set(key, []);
      byVehicle.get(key).push(rowPoint(row));
    });

    const daily = [];
    const trips = [];
    byVehicle.forEach((points) => {
      const analysis = analyzeVehicleTrackingPoints(points, { calculatedAt });
      daily.push(...analysis.daily.filter((item) => item.localDate >= periodFrom));
      trips.push(...analysis.trips.filter((item) => item.localDate >= periodFrom));
    });

    const statements = [
      db.prepare("DELETE FROM vehicle_tracking_trip_summaries WHERE local_date >= ?").bind(periodFrom),
      db.prepare("DELETE FROM vehicle_tracking_daily_metrics WHERE local_date >= ?").bind(periodFrom)
    ];
    trips.forEach((trip) => statements.push(db.prepare(`INSERT INTO vehicle_tracking_trip_summaries (
      id, vehicle_key, license_plate, local_date, started_at, finished_at, distance_km,
      duration_minutes, moving_minutes, point_count, segment_count, quality_score,
      quality_status, distance_source, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        trip.id, trip.vehicleKey, trip.licensePlate, trip.localDate, trip.startedAt, trip.finishedAt,
        trip.distanceKm, trip.durationMinutes, trip.movingMinutes, trip.pointCount, trip.segmentCount,
        trip.qualityScore, trip.qualityStatus, trip.distanceSource, trip.calculatedAt
      )));
    daily.forEach((day) => statements.push(db.prepare(`INSERT INTO vehicle_tracking_daily_metrics (
      vehicle_key, local_date, license_plate, total_km, trip_count, moving_minutes, point_count,
      valid_segment_count, rejected_segment_count, coverage_percent, quality_status,
      first_recorded_at, last_recorded_at, distance_source, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        day.vehicleKey, day.localDate, day.licensePlate, day.totalKm, day.tripCount, day.movingMinutes,
        day.pointCount, day.validSegmentCount, day.rejectedSegmentCount, day.coveragePercent,
        day.qualityStatus, day.firstRecordedAt, day.lastRecordedAt, day.distanceSource, day.calculatedAt
      )));
    statements.push(
      db.prepare("DELETE FROM vehicle_tracking_trip_summaries WHERE local_date < ?").bind(retentionDate(now)),
      db.prepare("DELETE FROM vehicle_tracking_daily_metrics WHERE local_date < ?").bind(retentionDate(now))
    );

    const chunkSize = 350;
    for (let index = 0; index < statements.length; index += chunkSize) {
      await db.batch(statements.slice(index, index + chunkSize));
    }
    await db.prepare(`UPDATE vehicle_tracking_analytics_runs SET
      finished_at = ?, status = 'ok', vehicles_processed = ?, points_processed = ?,
      trips_written = ?, daily_rows_written = ?, message = ? WHERE id = ?`)
      .bind(
        new Date().toISOString(), byVehicle.size, Number(result.results?.length || 0), trips.length, daily.length,
        "GPS body byly převedeny na bezpečné jízdy a denní souhrny.", runId
      ).run();
    return {
      status: "ok",
      runId,
      periodFrom,
      periodTo: vehicleTrackingPragueDate(now),
      vehiclesProcessed: byVehicle.size,
      pointsProcessed: Number(result.results?.length || 0),
      tripsWritten: trips.length,
      dailyRowsWritten: daily.length
    };
  } catch (error) {
    await db.prepare(`UPDATE vehicle_tracking_analytics_runs SET
      finished_at = ?, status = 'error', message = ?, error_code = ? WHERE id = ?`)
      .bind(
        new Date().toISOString(), "Přepočet GPS jízd selhal.", cleanString(error?.message || "unknown").slice(0, 180), runId
      ).run().catch(() => {});
    throw error;
  }
}

function analyticsVehicle(row = {}) {
  const valid = Number(row.valid_segment_count || 0);
  const rejected = Number(row.rejected_segment_count || 0);
  const segmentTotal = valid + rejected;
  const coveragePercent = segmentTotal > 0 ? valid / segmentTotal * 100 : 0;
  return {
    vehicleKey: cleanString(row.vehicle_key),
    licensePlate: cleanString(row.license_plate),
    totalKm: round(row.total_km),
    tripCount: Number(row.trip_count || 0),
    movingMinutes: round(row.moving_minutes, 1),
    pointCount: Number(row.point_count || 0),
    validSegmentCount: valid,
    rejectedSegmentCount: rejected,
    coveragePercent: round(coveragePercent, 1),
    qualityStatus: qualityStatus(coveragePercent, valid),
    firstRecordedAt: cleanString(row.first_recorded_at),
    lastRecordedAt: cleanString(row.last_recorded_at)
  };
}

export async function loadVehicleTrackingAnalytics(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const period = vehicleTrackingAnalyticsPeriod(options.period);
  const fromDate = vehicleTrackingAnalyticsFromDate(period, now);
  const result = await db.prepare(`
    SELECT vehicle_key, MAX(license_plate) AS license_plate, SUM(total_km) AS total_km,
      SUM(trip_count) AS trip_count, SUM(moving_minutes) AS moving_minutes,
      SUM(point_count) AS point_count, SUM(valid_segment_count) AS valid_segment_count,
      SUM(rejected_segment_count) AS rejected_segment_count,
      MIN(first_recorded_at) AS first_recorded_at, MAX(last_recorded_at) AS last_recorded_at
    FROM vehicle_tracking_daily_metrics
    WHERE local_date >= ?
    GROUP BY vehicle_key
    ORDER BY total_km DESC
  `).bind(fromDate).all();
  const vehicles = (result.results || []).map(analyticsVehicle);
  const totals = vehicles.reduce((summary, vehicle) => ({
    totalKm: summary.totalKm + vehicle.totalKm,
    tripCount: summary.tripCount + vehicle.tripCount,
    movingMinutes: summary.movingMinutes + vehicle.movingMinutes,
    pointCount: summary.pointCount + vehicle.pointCount,
    validSegmentCount: summary.validSegmentCount + vehicle.validSegmentCount,
    rejectedSegmentCount: summary.rejectedSegmentCount + vehicle.rejectedSegmentCount
  }), { totalKm: 0, tripCount: 0, movingMinutes: 0, pointCount: 0, validSegmentCount: 0, rejectedSegmentCount: 0 });
  const segmentTotal = totals.validSegmentCount + totals.rejectedSegmentCount;
  const coveragePercent = segmentTotal > 0 ? totals.validSegmentCount / segmentTotal * 100 : 0;
  const lastRun = await db.prepare(`SELECT started_at, finished_at, status, period_from, period_to,
    vehicles_processed, points_processed, trips_written, daily_rows_written, message
    FROM vehicle_tracking_analytics_runs ORDER BY started_at DESC LIMIT 1`).first();
  const lastGps = await db.prepare("SELECT MAX(recorded_at) AS last_recorded_at FROM vehicle_tracking_gps_points").first();
  const finishedAt = cleanString(lastRun?.finished_at);
  const freshnessMinutes = finishedAt ? (now.getTime() - new Date(finishedAt).getTime()) / 60000 : null;
  const fresh = lastRun?.status === "ok" && freshnessMinutes !== null && freshnessMinutes <= 20;

  let trips = [];
  const vehicleKey = cleanString(options.vehicleKey).toLowerCase();
  if (vehicleKey) {
    const tripResult = await db.prepare(`SELECT id, vehicle_key, license_plate, local_date, started_at,
      finished_at, distance_km, duration_minutes, moving_minutes, point_count, segment_count,
      quality_score, quality_status, distance_source
      FROM vehicle_tracking_trip_summaries
      WHERE vehicle_key = ? AND local_date >= ? ORDER BY started_at DESC LIMIT 500`)
      .bind(vehicleKey, fromDate).all();
    trips = tripResult.results || [];
  }

  return {
    period,
    fromDate,
    apiStatus: vehicles.length ? (fresh ? "ready" : "stale") : "waiting",
    source: "GPS vzdálenost z uložených bodů T-Cars",
    distanceSource: "gps_geometry",
    summary: {
      vehicleCount: vehicles.length,
      totalKm: round(totals.totalKm),
      tripCount: totals.tripCount,
      movingMinutes: round(totals.movingMinutes, 1),
      pointCount: totals.pointCount,
      coveragePercent: round(coveragePercent, 1),
      qualityStatus: qualityStatus(coveragePercent, totals.validSegmentCount),
      lastCalculatedAt: finishedAt,
      lastGpsAt: cleanString(lastGps?.last_recorded_at),
      freshnessMinutes: freshnessMinutes === null ? null : round(freshnessMinutes, 1)
    },
    vehicles,
    trips,
    lastRun: lastRun ? {
      startedAt: lastRun.started_at,
      finishedAt: lastRun.finished_at,
      status: lastRun.status,
      periodFrom: lastRun.period_from,
      periodTo: lastRun.period_to,
      vehiclesProcessed: Number(lastRun.vehicles_processed || 0),
      pointsProcessed: Number(lastRun.points_processed || 0),
      tripsWritten: Number(lastRun.trips_written || 0),
      dailyRowsWritten: Number(lastRun.daily_rows_written || 0),
      message: cleanString(lastRun.message)
    } : null
  };
}
