export const VEHICLE_TRACKING_HISTORY_RETENTION_DAYS = 30;

const RANGE_VALUES = new Set(["today", "24h", "7d"]);

export function vehicleTrackingHistoryVehicleKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function vehicleTrackingHistoryRange(value) {
  return RANGE_VALUES.has(value) ? value : "24h";
}

function pragueDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  const offset = value("timeZoneName").match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/) || [];
  const sign = offset[1] === "-" ? -1 : 1;
  const offsetMinutes = offset[1]
    ? sign * ((Number(offset[2]) * 60) + Number(offset[3] || 0))
    : 0;
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    offsetMinutes
  };
}

export function vehicleTrackingHistorySince(range, now = new Date()) {
  const normalizedRange = vehicleTrackingHistoryRange(range);
  if (normalizedRange === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (normalizedRange === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const prague = pragueDateParts(now);
  return new Date(Date.UTC(prague.year, prague.month - 1, prague.day) - prague.offsetMinutes * 60 * 1000).toISOString();
}

export function vehicleTrackingHistoryRetentionBefore(now = new Date()) {
  return new Date(now.getTime() - VEHICLE_TRACKING_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function vehicleTrackingHistoryPoint(location = {}, receivedAt = new Date().toISOString()) {
  const vehicleKey = vehicleTrackingHistoryVehicleKey(
    location.externalVehicleId || location.tcarsVehicleId || location.vehicleId || location.licensePlate
  );
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const recordedDate = new Date(location.lastGpsAt || location.gpsAt || location.updatedAt || "");
  if (!vehicleKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude === 0 || longitude === 0 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || Number.isNaN(recordedDate.getTime())) {
    return null;
  }

  const speed = Number(location.speedKmh);
  const heading = Number(location.heading);
  return {
    id: `vehicle-point-${crypto.randomUUID()}`,
    vehicleKey,
    licensePlate: String(location.licensePlate || "").trim(),
    latitude,
    longitude,
    speedKmh: Number.isFinite(speed) ? Math.round(speed) : null,
    heading: Number.isFinite(heading) ? Math.round(heading) : null,
    address: String(location.address || "").trim(),
    recordedAt: recordedDate.toISOString(),
    receivedAt
  };
}

function pointFromRow(row = {}) {
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speedKmh: row.speed_kmh === null ? null : Number(row.speed_kmh),
    heading: row.heading === null ? null : Number(row.heading),
    address: row.address || "",
    recordedAt: row.recorded_at
  };
}

export async function loadVehicleTrackingHistory(db, { vehicleKey, range, now = new Date() } = {}) {
  const normalizedVehicleKey = vehicleTrackingHistoryVehicleKey(vehicleKey);
  const normalizedRange = vehicleTrackingHistoryRange(range);
  if (!normalizedVehicleKey) {
    return { range: normalizedRange, vehicleKey: "", points: [], pointCount: 0, firstRecordedAt: "", lastRecordedAt: "", lastSync: null };
  }
  const since = vehicleTrackingHistorySince(normalizedRange, now);
  const result = await db.prepare(`
    SELECT latitude, longitude, speed_kmh, heading, address, recorded_at
    FROM vehicle_tracking_gps_points
    WHERE vehicle_key = ? AND recorded_at >= ?
    ORDER BY recorded_at ASC
    LIMIT 6000
  `).bind(normalizedVehicleKey, since).all();
  const points = (result.results || []).map(pointFromRow)
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const lastSync = await db.prepare(`
    SELECT started_at, finished_at, status, points_written, message
    FROM vehicle_tracking_history_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).first();
  return {
    range: normalizedRange,
    vehicleKey: normalizedVehicleKey,
    since,
    points,
    pointCount: points.length,
    firstRecordedAt: points[0]?.recordedAt || "",
    lastRecordedAt: points.at(-1)?.recordedAt || "",
    lastSync: lastSync ? {
      startedAt: lastSync.started_at,
      finishedAt: lastSync.finished_at,
      status: lastSync.status,
      pointsWritten: Number(lastSync.points_written || 0),
      message: lastSync.message || ""
    } : null
  };
}
