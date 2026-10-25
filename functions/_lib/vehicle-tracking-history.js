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

  const speed = location.speedKmh === null || location.speedKmh === undefined || location.speedKmh === '' ? NaN : Number(location.speedKmh);
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
    recordedAt: /(?:Z|[+-]\d{2}:\d{2})$/.test(location.lastGpsAt || location.gpsAt || '') ? recordedDate.toISOString() : String(location.lastGpsAt || location.gpsAt || location.updatedAt || ''),
    providerPointId: location.providerPointId || location.id || null,
    sourceTimestamp: location.lastGpsAt || location.gpsAt || null,
    gpsValid: typeof location.gpsValid === 'boolean' ? location.gpsValid : null,
    ignition: typeof location.ignition === 'boolean' ? location.ignition : null,
    providerScope: location.externalProvider || null,
    receivedAt
  };
}

export async function loadJobTrackingInterval(db,{vehicleKey,from,to,cursor=null,limit=1000,now=new Date()}) {
  const qualified=value=>typeof value==='string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if(!qualified(from)||!qualified(to)||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>7*86400000)throw new RangeError('tracking_interval_invalid');
  limit=Math.max(1,Math.min(1000,Math.trunc(limit)||1000));
  const after=cursor?JSON.parse(cursor):{at:from,id:''};
  if(!qualified(after.at)||after.at<from||after.at>to||typeof after.id!=='string')throw new RangeError('tracking_cursor_invalid');
  const result=await db.prepare(`SELECT id,vehicle_key,latitude,longitude,speed_kmh,recorded_at,provider_point_id,source_timestamp,gps_valid,ignition,provider_scope
    FROM vehicle_tracking_gps_points WHERE vehicle_key=? AND recorded_at>=? AND recorded_at<?
    AND (recorded_at>? OR (recorded_at=? AND id>?)) ORDER BY recorded_at,id LIMIT ?`).bind(vehicleTrackingHistoryVehicleKey(vehicleKey),from,to,after.at,after.at,after.id,limit+1).all();
  const rows=result.results||[],more=rows.length>limit,selected=rows.slice(0,limit),last=selected.at(-1);
  const retentionMissing=Date.parse(from)<Date.parse(vehicleTrackingHistoryRetentionBefore(now));
  return {points:selected.map(r=>({id:r.provider_point_id||r.id,providerId:String(vehicleKey),recordedAt:r.source_timestamp||r.recorded_at,
    latitude:r.latitude,longitude:r.longitude,speedKmh:r.speed_kmh,gpsValid:r.gps_valid===1?true:r.gps_valid===0?false:null,ignition:r.ignition===1?true:r.ignition===0?false:null})),
    nextCursor:more?JSON.stringify({at:last.recorded_at,id:last.id}):null,range:{from,to},retentionMissing,
    complete:!more&&!cursor&&!retentionMissing&&selected.length>0,coverage:retentionMissing?'unavailable':more?'partial':'observed'};
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
