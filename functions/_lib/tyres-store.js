import { normalizeLicensePlate } from "../../src/data/licensePlate.js";

const DB_BINDING = "SMART_ODPADY_DB";
const TREAD_ALERT_MM = 3.5;

export class TyresStoreError extends Error {
  constructor(message, status = 400, code = "tyres_store_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function database(env) {
  const db = env?.[DB_BINDING];
  if (!db) {
    throw new TyresStoreError("Databáze Pneumatik není nastavená. Chybí binding SMART_ODPADY_DB.", 503, "tyres_database_missing");
  }
  return db;
}

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function nullableNumber(value, options = {}) {
  if (value === "" || value === null || value === undefined) return null;
  return cleanNumber(value, 0, options);
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function jsonValue(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try {
    return JSON.parse(cleanString(value, 200000));
  } catch {
    return fallback;
  }
}

function jsonText(value) {
  return JSON.stringify(value ?? {});
}

function normalizedPlate(value) {
  return normalizeLicensePlate(cleanString(value, 32));
}

function plateKey(value) {
  return normalizedPlate(value).replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function requirePlate(value) {
  const plate = normalizedPlate(value);
  if (!plate) {
    throw new TyresStoreError("Vyberte platnou SPZ z evidence vozidel.", 400, "tyres_license_plate_required");
  }
  return plate;
}

function legacyPlate(value) {
  const raw = cleanString(value, 32);
  if (!raw || ["NEZJISTENO", "BEZSPZ"].includes(plateKey(raw))) return "";
  return requirePlate(raw);
}

function requireText(value, label, maxLength = 180) {
  const cleaned = cleanString(value, maxLength);
  if (!cleaned) {
    throw new TyresStoreError(`${label} je povinný údaj.`, 400, "tyres_required_field");
  }
  return cleaned;
}

function safeDate(value, fallback = "") {
  const cleaned = cleanString(value, 40);
  if (!cleaned) return fallback;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString();
}

function dateOnly(value, fallback = "") {
  const cleaned = cleanString(value, 40);
  if (!cleaned) return fallback;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString().slice(0, 10);
}

function actor(user = {}) {
  return {
    id: cleanString(user.id, 120),
    name: cleanString(user.name, 180)
  };
}

function storeError(error) {
  if (error instanceof TyresStoreError) return error;
  const message = cleanString(error?.message, 800);
  if (/no such table/i.test(message)) {
    return new TyresStoreError("Datový model Pneumatik není v D1 připravený. Spusťte migraci 0050_create_tyres_module.sql.", 503, "tyres_migration_missing");
  }
  console.error("tyres.store_failed", { message });
  return new TyresStoreError("Pneumatiky se teď nepodařilo načíst nebo uložit.", 500, "tyres_store_failed");
}

async function audit(db, { entityType, entityId, action, user, payload = {} }) {
  const event = actor(user);
  await db.prepare(`
    INSERT INTO tyre_audit_log (
      id, entity_type, entity_id, action, actor_user_id, actor_name, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id("tyre-audit"),
    cleanString(entityType, 80),
    cleanString(entityId, 160),
    cleanString(action, 120),
    event.id,
    event.name,
    jsonText(payload),
    nowIso()
  ).run();
}

function rowToTyre(row = {}) {
  return {
    id: cleanString(row.id),
    legacyId: cleanString(row.legacy_id),
    manufacturer: cleanString(row.manufacturer),
    model: cleanString(row.model),
    size: cleanString(row.tyre_size),
    loadIndex: cleanString(row.load_index),
    dot: cleanString(row.dot_code),
    type: cleanString(row.tyre_type),
    priceEx: cleanNumber(row.purchase_price_ex),
    supplier: cleanString(row.supplier),
    purchaseDate: cleanString(row.purchase_date),
    invoice: cleanString(row.invoice_number),
    state: cleanString(row.lifecycle_state),
    vehicle: cleanString(row.vehicle_license_plate),
    position: cleanString(row.wheel_position),
    mounted: cleanString(row.mounted_at),
    mountedOdo: cleanNumber(row.mounted_odometer_km),
    currentTread: row.current_tread_mm == null ? null : cleanNumber(row.current_tread_mm),
    pressure: row.pressure_bar == null ? null : cleanNumber(row.pressure_bar),
    mileage: cleanNumber(row.mileage_km),
    defects: cleanNumber(row.defect_count),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToVehicle(row = {}) {
  return {
    id: cleanString(row.id),
    licensePlate: cleanString(row.license_plate),
    type: cleanString(row.vehicle_type),
    driver: cleanString(row.driver_label),
    odometer: cleanNumber(row.odometer_km),
    depot: cleanString(row.depot),
    configuration: jsonValue(row.wheel_positions_json, []),
    updatedAt: cleanString(row.updated_at)
  };
}

function rowToMeasurement(row = {}) {
  return {
    id: cleanString(row.id),
    tyreId: cleanString(row.tyre_id),
    vehicle: cleanString(row.vehicle_license_plate),
    position: cleanString(row.wheel_position),
    tread: cleanNumber(row.tread_mm),
    pressure: row.pressure_bar == null ? null : cleanNumber(row.pressure_bar),
    odometer: cleanNumber(row.odometer_km),
    measuredAt: cleanString(row.measured_at),
    note: cleanString(row.note, 2000),
    actor: cleanString(row.created_by_name)
  };
}

function rowToService(row = {}) {
  return {
    id: cleanString(row.id),
    legacyId: cleanString(row.legacy_id),
    date: cleanString(row.service_date),
    vehicle: cleanString(row.vehicle_license_plate),
    person: cleanString(row.technician_name),
    type: cleanString(row.service_type),
    supplier: cleanString(row.supplier),
    labor: cleanNumber(row.labor_cost),
    material: cleanNumber(row.material_cost),
    tireCost: cleanNumber(row.tyre_cost),
    invoice: cleanString(row.invoice_number),
    tireTypes: jsonValue(row.tyre_types_json, []),
    note: cleanString(row.note, 4000),
    createdAt: cleanString(row.created_at)
  };
}

function rowToAudit(row = {}) {
  return {
    id: cleanString(row.id),
    entityType: cleanString(row.entity_type),
    entityId: cleanString(row.entity_id),
    action: cleanString(row.action),
    actor: cleanString(row.actor_name),
    createdAt: cleanString(row.created_at)
  };
}

function tyrePayload(value = {}, { partial = false } = {}) {
  const vehicle = cleanString(value.vehicle, 32);
  const state = cleanString(value.state || "sklad", 80) || "sklad";
  const payload = {
    manufacturer: cleanString(value.manufacturer, 120),
    model: cleanString(value.model, 160),
    tyreSize: cleanString(value.size, 120),
    loadIndex: cleanString(value.loadIndex ?? value.index, 80),
    dotCode: cleanString(value.dot, 40),
    tyreType: cleanString(value.type, 80),
    purchasePriceEx: cleanNumber(value.priceEx, 0, { max: 1000000 }),
    supplier: cleanString(value.supplier, 180),
    purchaseDate: dateOnly(value.purchaseDate),
    invoiceNumber: cleanString(value.invoice, 120),
    lifecycleState: state,
    vehicleLicensePlate: vehicle ? requirePlate(vehicle) : "",
    wheelPosition: cleanString(value.position, 80),
    mountedAt: dateOnly(value.mounted),
    mountedOdometerKm: cleanNumber(value.mountedOdo, 0, { max: 10000000 }),
    currentTreadMm: nullableNumber(value.currentTread, { max: 100 }),
    pressureBar: nullableNumber(value.pressure, { max: 30 }),
    mileageKm: cleanNumber(value.mileage, 0, { max: 10000000 }),
    defectCount: cleanNumber(value.defects, 0, { max: 999 })
  };

  if (!partial) {
    payload.manufacturer = requireText(payload.manufacturer, "Výrobce");
    payload.tyreSize = requireText(payload.tyreSize, "Rozměr pneumatiky");
  }

  return payload;
}

async function requireTyreVehicle(db, licensePlate) {
  const existing = await db.prepare(`
    SELECT id FROM tyre_vehicle_profiles WHERE normalized_license_plate = ?
  `).bind(plateKey(licensePlate)).first();
  if (!existing) {
    throw new TyresStoreError("Toto vozidlo zatím není v evidenci Pneumatik. Nejdřív ho načtěte z Vozového parku nebo proveďte převod dat.", 400, "tyres_vehicle_unknown");
  }
}

async function requireMeasurementTyre(db, tyreId, vehicle) {
  const normalizedTyreId = cleanString(tyreId, 160);
  if (!normalizedTyreId) return;

  const tyre = await db.prepare(`
    SELECT id, vehicle_license_plate FROM tyre_inventory WHERE id = ?
  `).bind(normalizedTyreId).first();

  if (!tyre) {
    throw new TyresStoreError("Vybraná pneumatika nebyla nalezena.", 404, "tyre_not_found");
  }

  if (!cleanString(tyre.vehicle_license_plate) || plateKey(tyre.vehicle_license_plate) !== plateKey(vehicle)) {
    throw new TyresStoreError("Měření lze zapsat jen k pneumatice osazené na zvoleném vozidle.", 400, "tyres_measurement_vehicle_mismatch");
  }
}

export async function getTyresDashboard(env) {
  try {
    const db = database(env);
    const [tyresResult, vehiclesResult, measurementsResult, servicesResult, auditResult, summaryRow, latestImportRow] = await Promise.all([
      db.prepare(`SELECT * FROM tyre_inventory ORDER BY updated_at DESC, manufacturer ASC LIMIT 500`).all(),
      db.prepare(`SELECT * FROM tyre_vehicle_profiles ORDER BY license_plate ASC LIMIT 500`).all(),
      db.prepare(`SELECT * FROM tyre_measurements ORDER BY measured_at DESC, created_at DESC LIMIT 80`).all(),
      db.prepare(`SELECT * FROM tyre_service_records ORDER BY service_date DESC, created_at DESC LIMIT 160`).all(),
      db.prepare(`SELECT * FROM tyre_audit_log ORDER BY created_at DESC LIMIT 12`).all(),
      db.prepare(`
        SELECT
          COUNT(*) AS total_tyres,
          SUM(CASE WHEN lifecycle_state = 'na vozidle' THEN 1 ELSE 0 END) AS mounted_tyres,
          SUM(CASE WHEN current_tread_mm IS NOT NULL AND current_tread_mm <= ? THEN 1 ELSE 0 END) AS low_tread_tyres
        FROM tyre_inventory
      `).bind(TREAD_ALERT_MM).first(),
      db.prepare(`
        SELECT id, source, status, summary_json, source_updated_at, actor_name, created_at
        FROM tyre_import_runs
        ORDER BY created_at DESC
        LIMIT 1
      `).first()
    ]);

    const services = (servicesResult.results || []).map(rowToService);
    const monthKey = new Date().toISOString().slice(0, 7);
    const summary = {
      totalTyres: cleanNumber(summaryRow?.total_tyres),
      mountedTyres: cleanNumber(summaryRow?.mounted_tyres),
      lowTreadTyres: cleanNumber(summaryRow?.low_tread_tyres),
      vehicles: (vehiclesResult.results || []).length,
      serviceCostYtd: services
        .filter((item) => String(item.date).slice(0, 4) === String(new Date().getUTCFullYear()))
        .reduce((sum, item) => sum + item.labor + item.material + item.tireCost, 0),
      serviceCostMonth: services
        .filter((item) => String(item.date).startsWith(monthKey))
        .reduce((sum, item) => sum + item.labor + item.material + item.tireCost, 0),
      treadAlertMm: TREAD_ALERT_MM
    };

    return {
      apiStatus: "ready",
      summary,
      tyres: (tyresResult.results || []).map(rowToTyre),
      vehicles: (vehiclesResult.results || []).map(rowToVehicle),
      measurements: (measurementsResult.results || []).map(rowToMeasurement),
      services,
      audit: (auditResult.results || []).map(rowToAudit),
      latestImport: latestImportRow ? {
        id: latestImportRow.id,
        source: latestImportRow.source,
        status: latestImportRow.status,
        summary: jsonValue(latestImportRow.summary_json, {}),
        sourceUpdatedAt: latestImportRow.source_updated_at,
        actor: latestImportRow.actor_name,
        createdAt: latestImportRow.created_at
      } : null
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function createTyre(env, user, value) {
  try {
    const db = database(env);
    const payload = tyrePayload(value);
    if (payload.vehicleLicensePlate) await requireTyreVehicle(db, payload.vehicleLicensePlate);
    const recordId = id("tyre");
    const createdAt = nowIso();
    const event = actor(user);
    await db.prepare(`
      INSERT INTO tyre_inventory (
        id, manufacturer, model, tyre_size, load_index, dot_code, tyre_type,
        purchase_price_ex, supplier, purchase_date, invoice_number, lifecycle_state,
        vehicle_license_plate, wheel_position, mounted_at, mounted_odometer_km,
        current_tread_mm, pressure_bar, mileage_km, defect_count,
        created_by_user_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      recordId, payload.manufacturer, payload.model, payload.tyreSize, payload.loadIndex, payload.dotCode, payload.tyreType,
      payload.purchasePriceEx, payload.supplier, payload.purchaseDate, payload.invoiceNumber, payload.lifecycleState,
      payload.vehicleLicensePlate, payload.wheelPosition, payload.mountedAt, payload.mountedOdometerKm,
      payload.currentTreadMm, payload.pressureBar, payload.mileageKm, payload.defectCount,
      event.id, event.name, createdAt, createdAt
    ).run();
    await audit(db, { entityType: "tyre", entityId: recordId, action: "created", user, payload });
    const row = await db.prepare(`SELECT * FROM tyre_inventory WHERE id = ?`).bind(recordId).first();
    return rowToTyre(row);
  } catch (error) {
    throw storeError(error);
  }
}

export async function updateTyre(env, user, tyreId, value) {
  try {
    const db = database(env);
    const recordId = requireText(tyreId, "ID pneumatiky", 160);
    const existing = await db.prepare(`SELECT * FROM tyre_inventory WHERE id = ?`).bind(recordId).first();
    if (!existing) throw new TyresStoreError("Pneumatika nebyla nalezena.", 404, "tyre_not_found");
    const payload = tyrePayload({ ...rowToTyre(existing), ...value });
    if (payload.vehicleLicensePlate) await requireTyreVehicle(db, payload.vehicleLicensePlate);
    await db.prepare(`
      UPDATE tyre_inventory SET
        manufacturer = ?, model = ?, tyre_size = ?, load_index = ?, dot_code = ?, tyre_type = ?,
        purchase_price_ex = ?, supplier = ?, purchase_date = ?, invoice_number = ?, lifecycle_state = ?,
        vehicle_license_plate = ?, wheel_position = ?, mounted_at = ?, mounted_odometer_km = ?,
        current_tread_mm = ?, pressure_bar = ?, mileage_km = ?, defect_count = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      payload.manufacturer, payload.model, payload.tyreSize, payload.loadIndex, payload.dotCode, payload.tyreType,
      payload.purchasePriceEx, payload.supplier, payload.purchaseDate, payload.invoiceNumber, payload.lifecycleState,
      payload.vehicleLicensePlate, payload.wheelPosition, payload.mountedAt, payload.mountedOdometerKm,
      payload.currentTreadMm, payload.pressureBar, payload.mileageKm, payload.defectCount, nowIso(), recordId
    ).run();
    await audit(db, { entityType: "tyre", entityId: recordId, action: "updated", user, payload });
    return rowToTyre(await db.prepare(`SELECT * FROM tyre_inventory WHERE id = ?`).bind(recordId).first());
  } catch (error) {
    throw storeError(error);
  }
}

export async function createTyreMeasurement(env, user, value) {
  try {
    const db = database(env);
    const vehicle = requirePlate(value.vehicle);
    await requireTyreVehicle(db, vehicle);
    const position = requireText(value.position, "Pozice kola", 80);
    const tread = Number(value.tread);
    if (!Number.isFinite(tread) || tread < 0 || tread > 100) {
      throw new TyresStoreError("Hloubka dezénu musí být číslo od 0 do 100 mm.", 400, "tyres_tread_invalid");
    }
    const recordId = id("tyre-measurement");
    const createdAt = nowIso();
    const event = actor(user);
    const payload = {
      tyreId: cleanString(value.tyreId, 160),
      vehicle,
      position,
      tread,
      pressure: nullableNumber(value.pressure, { max: 30 }),
      odometer: cleanNumber(value.odometer, 0, { max: 10000000 }),
      measuredAt: safeDate(value.measuredAt, createdAt),
      note: cleanString(value.note, 2000)
    };
    await requireMeasurementTyre(db, payload.tyreId, payload.vehicle);
    await db.prepare(`
      INSERT INTO tyre_measurements (
        id, tyre_id, vehicle_license_plate, wheel_position, tread_mm, pressure_bar,
        odometer_km, measured_at, note, created_by_user_id, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      recordId, payload.tyreId, payload.vehicle, payload.position, payload.tread, payload.pressure,
      payload.odometer, payload.measuredAt, payload.note, event.id, event.name, createdAt
    ).run();
    if (payload.tyreId) {
      await db.prepare(`
        UPDATE tyre_inventory SET current_tread_mm = ?, pressure_bar = ?, mileage_km = ?, updated_at = ? WHERE id = ?
      `).bind(payload.tread, payload.pressure, payload.odometer, createdAt, payload.tyreId).run();
    }
    await audit(db, { entityType: "measurement", entityId: recordId, action: "created", user, payload });
    return rowToMeasurement(await db.prepare(`SELECT * FROM tyre_measurements WHERE id = ?`).bind(recordId).first());
  } catch (error) {
    throw storeError(error);
  }
}

export async function createTyreServiceRecord(env, user, value) {
  try {
    const db = database(env);
    const vehicleValue = cleanString(value.vehicle, 32);
    const vehicle = vehicleValue ? requirePlate(vehicleValue) : "";
    if (vehicle) await requireTyreVehicle(db, vehicle);
    const payload = {
      date: dateOnly(value.date, nowIso().slice(0, 10)),
      vehicle,
      person: cleanString(value.person, 180),
      type: requireText(value.type, "Typ servisního zásahu", 120),
      supplier: cleanString(value.supplier, 180),
      labor: cleanNumber(value.labor, 0, { max: 10000000 }),
      material: cleanNumber(value.material, 0, { max: 10000000 }),
      tireCost: cleanNumber(value.tireCost, 0, { max: 10000000 }),
      invoice: cleanString(value.invoice, 120),
      tireTypes: Array.isArray(value.tireTypes) ? value.tireTypes.map((item) => cleanString(item, 400)).filter(Boolean).slice(0, 50) : [],
      note: cleanString(value.note, 4000)
    };
    const recordId = id("tyre-service");
    const createdAt = nowIso();
    const event = actor(user);
    await db.prepare(`
      INSERT INTO tyre_service_records (
        id, service_date, vehicle_license_plate, technician_name, service_type, supplier,
        labor_cost, material_cost, tyre_cost, invoice_number, tyre_types_json, note,
        created_by_user_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      recordId, payload.date, payload.vehicle, payload.person, payload.type, payload.supplier,
      payload.labor, payload.material, payload.tireCost, payload.invoice, jsonText(payload.tireTypes), payload.note,
      event.id, event.name, createdAt, createdAt
    ).run();
    await audit(db, { entityType: "service", entityId: recordId, action: "created", user, payload });
    return rowToService(await db.prepare(`SELECT * FROM tyre_service_records WHERE id = ?`).bind(recordId).first());
  } catch (error) {
    throw storeError(error);
  }
}

function legacyArray(value) {
  return Array.isArray(value) ? value : [];
}

function legacyState(value) {
  const state = value?.state && typeof value.state === "object" ? value.state : value;
  if (!state || typeof state !== "object") {
    throw new TyresStoreError("Převod vyžaduje kompletní export původní evidence Pneumatik.", 400, "tyres_legacy_state_invalid");
  }
  return state;
}

async function upsertLegacyVehicle(db, vehicle, importId, now) {
  const plate = legacyPlate(vehicle?.spz || vehicle?.licensePlate || vehicle?.license_plate);
  if (!plate) return;
  const recordId = `tyre-vehicle-${plateKey(plate).toLowerCase()}`;
  await db.prepare(`
    INSERT INTO tyre_vehicle_profiles (
      id, license_plate, normalized_license_plate, vehicle_type, driver_label, odometer_km,
      depot, wheel_positions_json, source_import_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_license_plate) DO UPDATE SET
      license_plate = excluded.license_plate,
      vehicle_type = excluded.vehicle_type,
      driver_label = excluded.driver_label,
      odometer_km = excluded.odometer_km,
      depot = excluded.depot,
      wheel_positions_json = excluded.wheel_positions_json,
      source_import_id = excluded.source_import_id,
      updated_at = excluded.updated_at
  `).bind(
    recordId, plate, plateKey(plate), cleanString(vehicle?.type, 180), cleanString(vehicle?.driver, 180),
    cleanNumber(vehicle?.odometer, 0, { max: 10000000 }), cleanString(vehicle?.depot, 160),
    jsonText(legacyArray(vehicle?.configuration).map((item) => cleanString(item, 80)).filter(Boolean)), importId, now, now
  ).run();
}

async function ensureLegacyVehicleProfile(db, value, importId, now) {
  const plate = legacyPlate(value);
  if (!plate) return;
  const recordId = `tyre-vehicle-${plateKey(plate).toLowerCase()}`;
  await db.prepare(`
    INSERT INTO tyre_vehicle_profiles (
      id, license_plate, normalized_license_plate, source_import_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_license_plate) DO NOTHING
  `).bind(recordId, plate, plateKey(plate), importId, now, now).run();
}

function legacyIdentifier(value, prefix, fields) {
  const existing = cleanString(value?.id, 160);
  if (existing) return existing;
  const fallback = fields.map((field) => cleanString(field, 80).replaceAll("|", " ")).join("|");
  return `${prefix}:${fallback}`.slice(0, 160);
}

async function upsertLegacyTyre(db, tyre, importId, user, now) {
  const legacyId = legacyIdentifier(tyre, "tyre", [
    tyre?.manufacturer, tyre?.model, tyre?.size, tyre?.vehicle, tyre?.position, tyre?.purchaseDate, tyre?.invoice
  ]);
  const recordId = `legacy-tyre-${legacyId}`;
  const payload = tyrePayload({ ...tyre, vehicle: legacyPlate(tyre?.vehicle) });
  const event = actor(user);
  await db.prepare(`
    INSERT INTO tyre_inventory (
      id, legacy_id, manufacturer, model, tyre_size, load_index, dot_code, tyre_type,
      purchase_price_ex, supplier, purchase_date, invoice_number, lifecycle_state,
      vehicle_license_plate, wheel_position, mounted_at, mounted_odometer_km,
      current_tread_mm, pressure_bar, mileage_km, defect_count, source_import_id,
      created_by_user_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(legacy_id) DO UPDATE SET
      manufacturer = excluded.manufacturer, model = excluded.model, tyre_size = excluded.tyre_size,
      load_index = excluded.load_index, dot_code = excluded.dot_code, tyre_type = excluded.tyre_type,
      purchase_price_ex = excluded.purchase_price_ex, supplier = excluded.supplier, purchase_date = excluded.purchase_date,
      invoice_number = excluded.invoice_number, lifecycle_state = excluded.lifecycle_state,
      vehicle_license_plate = excluded.vehicle_license_plate, wheel_position = excluded.wheel_position,
      mounted_at = excluded.mounted_at, mounted_odometer_km = excluded.mounted_odometer_km,
      current_tread_mm = excluded.current_tread_mm, pressure_bar = excluded.pressure_bar,
      mileage_km = excluded.mileage_km, defect_count = excluded.defect_count,
      source_import_id = excluded.source_import_id, updated_at = excluded.updated_at
  `).bind(
    recordId, legacyId || null, payload.manufacturer, payload.model, payload.tyreSize, payload.loadIndex, payload.dotCode, payload.tyreType,
    payload.purchasePriceEx, payload.supplier, payload.purchaseDate, payload.invoiceNumber, payload.lifecycleState,
    payload.vehicleLicensePlate, payload.wheelPosition, payload.mountedAt, payload.mountedOdometerKm,
    payload.currentTreadMm, payload.pressureBar, payload.mileageKm, payload.defectCount, importId,
    event.id, event.name, now, now
  ).run();
}

async function insertLegacyMeasurement(db, measurement, importId, user, index, now) {
  const event = actor(user);
  const vehicle = requirePlate(measurement?.vehicle);
  const measuredAt = safeDate(measurement?.date, now);
  const legacyKey = `legacy-${index}-${plateKey(vehicle)}-${measuredAt.slice(0, 10)}`;
  const recordId = `legacy-measurement-${legacyKey}`;
  await db.prepare(`
    INSERT INTO tyre_measurements (
      id, legacy_key, vehicle_license_plate, wheel_position, tread_mm, pressure_bar, odometer_km,
      measured_at, note, source_import_id, created_by_user_id, created_by_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(legacy_key) DO UPDATE SET
      vehicle_license_plate = excluded.vehicle_license_plate,
      wheel_position = excluded.wheel_position,
      tread_mm = excluded.tread_mm,
      pressure_bar = excluded.pressure_bar,
      odometer_km = excluded.odometer_km,
      measured_at = excluded.measured_at,
      note = excluded.note,
      source_import_id = excluded.source_import_id
  `).bind(
    recordId, legacyKey, vehicle, requireText(measurement?.position, "Pozice kola", 80),
    cleanNumber(measurement?.tread, 0, { max: 100 }), nullableNumber(measurement?.pressure, { max: 30 }),
    cleanNumber(measurement?.odometer, 0, { max: 10000000 }), measuredAt, cleanString(measurement?.note, 2000),
    importId, event.id, event.name, now
  ).run();
}

async function upsertLegacyService(db, service, importId, user, now) {
  const legacyId = legacyIdentifier(service, "service", [
    service?.date, service?.vehicle, service?.type, service?.invoice, service?.supplier, service?.note
  ]);
  const recordId = `legacy-service-${legacyId}`;
  const event = actor(user);
  const vehicle = legacyPlate(service?.vehicle);
  await db.prepare(`
    INSERT INTO tyre_service_records (
      id, legacy_id, service_date, vehicle_license_plate, technician_name, service_type, supplier,
      labor_cost, material_cost, tyre_cost, invoice_number, tyre_types_json, note, source_import_id,
      created_by_user_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(legacy_id) DO UPDATE SET
      service_date = excluded.service_date, vehicle_license_plate = excluded.vehicle_license_plate,
      technician_name = excluded.technician_name, service_type = excluded.service_type, supplier = excluded.supplier,
      labor_cost = excluded.labor_cost, material_cost = excluded.material_cost, tyre_cost = excluded.tyre_cost,
      invoice_number = excluded.invoice_number, tyre_types_json = excluded.tyre_types_json, note = excluded.note,
      source_import_id = excluded.source_import_id, updated_at = excluded.updated_at
  `).bind(
    recordId, legacyId || null, dateOnly(service?.date, now.slice(0, 10)), vehicle, cleanString(service?.person, 180),
    cleanString(service?.type, 120) || "servis", cleanString(service?.supplier, 180),
    cleanNumber(service?.labor, 0, { max: 10000000 }), cleanNumber(service?.material, 0, { max: 10000000 }),
    cleanNumber(service?.tireCost, 0, { max: 10000000 }), cleanString(service?.invoice, 120),
    jsonText(legacyArray(service?.tireTypes).map((item) => cleanString(item, 400)).filter(Boolean)), cleanString(service?.note, 4000),
    importId, event.id, event.name, now, now
  ).run();
}

export async function importLegacyTyres(env, user, value) {
  try {
    const db = database(env);
    const state = legacyState(value);
    const vehicles = legacyArray(state.vehicles).filter((vehicle) => legacyPlate(vehicle?.spz || vehicle?.licensePlate || vehicle?.license_plate));
    const tyres = legacyArray(state.tires);
    const measurements = legacyArray(state.measurements).filter((measurement) => legacyPlate(measurement?.vehicle));
    const services = legacyArray(state.services);
    if (!vehicles.length && !tyres.length && !measurements.length && !services.length) {
      throw new TyresStoreError("Původní evidence neobsahuje žádná data k převodu.", 400, "tyres_legacy_state_empty");
    }
    const importId = id("tyre-import");
    const createdAt = nowIso();
    const summary = { vehicles: vehicles.length, tyres: tyres.length, measurements: measurements.length, services: services.length };
    const event = actor(user);
    await db.prepare(`
      INSERT INTO tyre_import_runs (id, source, status, summary_json, source_updated_at, actor_user_id, actor_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      importId, cleanString(value?.source || "legacy-kaiser-pneu-evidence", 180), "running", jsonText(summary),
      cleanString(value?.sourceUpdatedAt, 40), event.id, event.name, createdAt
    ).run();
    for (const vehicle of vehicles) await upsertLegacyVehicle(db, vehicle, importId, createdAt);
    for (const tyre of tyres) {
      if (legacyPlate(tyre?.vehicle)) await ensureLegacyVehicleProfile(db, tyre.vehicle, importId, createdAt);
    }
    for (const measurement of measurements) {
      if (legacyPlate(measurement?.vehicle)) await ensureLegacyVehicleProfile(db, measurement.vehicle, importId, createdAt);
    }
    for (const service of services) {
      if (legacyPlate(service?.vehicle)) await ensureLegacyVehicleProfile(db, service.vehicle, importId, createdAt);
    }
    for (const tyre of tyres) await upsertLegacyTyre(db, tyre, importId, user, createdAt);
    for (const [index, measurement] of measurements.entries()) await insertLegacyMeasurement(db, measurement, importId, user, index, createdAt);
    for (const service of services) await upsertLegacyService(db, service, importId, user, createdAt);
    await db.prepare(`UPDATE tyre_import_runs SET status = ?, summary_json = ? WHERE id = ?`).bind("completed", jsonText(summary), importId).run();
    await audit(db, { entityType: "migration", entityId: importId, action: "legacy_import_completed", user, payload: summary });
    return { importId, summary };
  } catch (error) {
    throw storeError(error);
  }
}
