const DB_BINDING = "SMART_ODPADY_DB";

export class VehicleWimStoreError extends Error {
  constructor(message, status = 400, code = "vehicle_wim_error") {
    super(message);
    this.name = "VehicleWimStoreError";
    this.status = status;
    this.code = code;
  }
}

function database(env, required = false) {
  const db = env?.[DB_BINDING] || null;

  if (!db && required) {
    throw new VehicleWimStoreError(
      "Databaze WIM vah neni nastavena. Pridejte Cloudflare D1 binding SMART_ODPADY_DB.",
      503,
      "vehicle_wim_database_missing"
    );
  }

  return db;
}

export function vehicleWimApiStatus(env) {
  return database(env) ? "ready" : "waiting";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rowToDevice(row = {}) {
  return {
    id: cleanString(row.id),
    siteId: cleanString(row.site_id),
    side: cleanString(row.side),
    kmValue: numberValue(row.km_value),
    status: cleanString(row.status),
    statusLabel: cleanString(row.status_label),
    note: cleanString(row.note),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToSite(row = {}, devices = []) {
  return {
    id: cleanString(row.id),
    road: cleanString(row.road),
    kmLabel: cleanString(row.km_label),
    locationLabel: cleanString(row.location_label),
    orp: cleanString(row.orp),
    sideLabel: cleanString(row.side_label),
    status: cleanString(row.status),
    statusLabel: cleanString(row.status_label),
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    deviceCount: numberValue(row.device_count, 0),
    sourceLabel: cleanString(row.source_label),
    sourceDate: cleanString(row.source_date),
    coordinateQuality: cleanString(row.coordinate_quality),
    note: cleanString(row.note),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    devices
  };
}

function rowToAlertEvent(row = {}) {
  return {
    id: cleanString(row.id),
    siteId: cleanString(row.site_id),
    vehicleId: cleanString(row.vehicle_id),
    driverId: cleanString(row.driver_id),
    licensePlate: cleanString(row.license_plate),
    driverPhoneMasked: cleanString(row.driver_phone_masked),
    distanceKm: numberValue(row.distance_km),
    headingDegrees: numberValue(row.heading_degrees),
    approachSide: cleanString(row.approach_side),
    alertType: cleanString(row.alert_type),
    channel: cleanString(row.channel),
    status: cleanString(row.status),
    message: cleanString(row.message),
    errorCode: cleanString(row.error_code),
    dedupeKey: cleanString(row.dedupe_key),
    triggeredAt: cleanString(row.triggered_at),
    createdAt: cleanString(row.created_at)
  };
}

function summarizeSites(sites = []) {
  const devicesTotal = sites.reduce((sum, site) => sum + Number(site.deviceCount || site.devices?.length || 0), 0);
  const byStatus = sites.reduce((acc, site) => {
    const key = site.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    sitesTotal: sites.length,
    devicesTotal,
    activeSites: byStatus.active || 0,
    plannedSites: byStatus.planned || 0,
    maintenanceSites: byStatus.maintenance || 0,
    upgradeSites: byStatus.upgrade || 0,
    preselectionSites: byStatus.preselection || 0,
    alertDistanceKm: 15,
    automationStatus: "draft",
    automationMode: "read-only-pilot"
  };
}

function handleStoreError(error) {
  if (error instanceof VehicleWimStoreError) {
    return error;
  }

  const message = cleanString(error?.message);
  if (/no such table|vehicle_wim_/i.test(message)) {
    return new VehicleWimStoreError(
      "WIM tabulky zatim nejsou v D1. Spustte migraci 0018_create_vehicle_wim_tables.sql.",
      503,
      "vehicle_wim_migration_missing"
    );
  }

  console.error("vehicle_wim.store_failed", { message });
  return new VehicleWimStoreError(
    "WIM mista se ted nepodarilo nacist.",
    500,
    "vehicle_wim_store_failed"
  );
}

export async function listVehicleWimSites(env) {
  const db = database(env, true);

  try {
    const [siteResult, deviceResult] = await Promise.all([
      db
        .prepare(`
          SELECT *
          FROM vehicle_wim_sites
          ORDER BY road, km_label, location_label
        `)
        .all(),
      db
        .prepare(`
          SELECT *
          FROM vehicle_wim_devices
          ORDER BY site_id, km_value, side
        `)
        .all()
    ]);

    const devicesBySite = new Map();
    for (const row of deviceResult.results || []) {
      const device = rowToDevice(row);
      const list = devicesBySite.get(device.siteId) || [];
      list.push(device);
      devicesBySite.set(device.siteId, list);
    }

    const sites = (siteResult.results || []).map((row) => (
      rowToSite(row, devicesBySite.get(cleanString(row.id)) || [])
    ));

    return {
      apiStatus: "ready",
      source: {
        label: sites[0]?.sourceLabel || "MD/RSD PDF mapa, stav k 30. 6. 2025",
        sourceDate: sites[0]?.sourceDate || "2025-06-30",
        coordinateQuality: sites[0]?.coordinateQuality || "approximate-needs-verification"
      },
      summary: summarizeSites(sites),
      sites
    };
  } catch (error) {
    throw handleStoreError(error);
  }
}

export async function listVehicleWimAlertEvents(env, limit = 50) {
  const db = database(env, true);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

  try {
    const result = await db
      .prepare(`
        SELECT *
        FROM vehicle_wim_alert_events
        ORDER BY triggered_at DESC
        LIMIT ?
      `)
      .bind(safeLimit)
      .all();

    return {
      apiStatus: "ready",
      mode: "read-only-pilot",
      message: "Ostre SMS ani app alerty se zatim neposilaji. Tabulka je pripravena pro budouci cloud runner.",
      events: (result.results || []).map(rowToAlertEvent)
    };
  } catch (error) {
    throw handleStoreError(error);
  }
}
