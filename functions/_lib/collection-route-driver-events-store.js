const COLLECTION_ROUTES_DB_BINDING = "SMART_ODPADY_DB";

const DRIVER_EVENT_ACTIONS = new Set(["done", "problem", "dump", "break"]);

export class CollectionRouteDriverEventsError extends Error {
  constructor(message, status = 400, code = "collection_route_driver_events_error") {
    super(message);
    this.name = "CollectionRouteDriverEventsError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
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

function nowIso() {
  return new Date().toISOString();
}

function database(env, required = false) {
  const db = env?.[COLLECTION_ROUTES_DB_BINDING] || null;
  if (!db && required) {
    throw new CollectionRouteDriverEventsError(
      "Databáze řidičských akcí Svozových tras není nastavená. Chybí D1 binding SMART_ODPADY_DB.",
      503,
      "collection_route_driver_events_database_missing"
    );
  }
  return db;
}

function dbError(error) {
  const message = cleanString(error?.message);
  if (/no such table|collection_route_driver_/i.test(message)) {
    return new CollectionRouteDriverEventsError(
      "Tabulky řidičských akcí Svozových tras nejsou v D1 připravené. Je potřeba migrace 0027.",
      503,
      "collection_route_driver_events_migration_missing"
    );
  }
  if (/collection_route_source_/i.test(message)) {
    return new CollectionRouteDriverEventsError(
      "Zdrojové tabulky 13 Excelů nejsou v D1 připravené. Nejdřív musí existovat import Svozových tras.",
      503,
      "collection_route_driver_sources_missing"
    );
  }
  console.error("collection_route_driver_events.store_failed", { message });
  return new CollectionRouteDriverEventsError(
    "Řidičskou akci Svozových tras se teď nepodařilo uložit.",
    500,
    "collection_route_driver_events_store_failed"
  );
}

function normalizeFilter(value, fallback = "all") {
  const normalized = cleanString(value);
  return normalized || fallback;
}

function routeKey({ sourceBatchId, day, week, vehicle, waste, mappingStatus, user }) {
  return [
    sourceBatchId,
    normalizeFilter(day),
    normalizeFilter(week),
    normalizeFilter(vehicle),
    normalizeFilter(waste),
    normalizeFilter(mappingStatus),
    cleanString(user?.id || "driver")
  ].join("|");
}

function rowToRun(row, summary = null) {
  if (!row) {
    return null;
  }
  return {
    id: cleanString(row.id),
    sourceBatchId: cleanString(row.source_batch_id),
    routeKey: cleanString(row.route_key),
    dayCode: cleanString(row.route_day_code),
    weekMode: cleanString(row.route_week_mode),
    vehicleCode: cleanString(row.vehicle_code),
    wasteFilter: cleanString(row.waste_filter),
    mappingStatusFilter: cleanString(row.mapping_status_filter),
    driverUserId: cleanString(row.driver_user_id),
    driverName: cleanString(row.driver_name),
    status: cleanString(row.status),
    startedAt: cleanString(row.started_at),
    finishedAt: cleanString(row.finished_at),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    metadata: parseJson(row.metadata_json, {}),
    summary
  };
}

function rowToEvent(row) {
  return {
    id: cleanString(row?.id),
    runId: cleanString(row?.run_id),
    sourceRowId: cleanString(row?.source_row_id),
    action: cleanString(row?.action),
    reason: cleanString(row?.reason),
    note: cleanString(row?.note),
    idempotencyKey: cleanString(row?.idempotency_key),
    createdByUserId: cleanString(row?.created_by_user_id),
    createdByName: cleanString(row?.created_by_name),
    createdAt: cleanString(row?.created_at),
    payload: parseJson(row?.payload_json, {})
  };
}

async function ensureSourceBatch(db, sourceBatchId) {
  const batch = await db.prepare(`
    SELECT id
    FROM collection_route_source_batches
    WHERE id = ?
    LIMIT 1
  `).bind(sourceBatchId).first();
  if (!batch) {
    throw new CollectionRouteDriverEventsError(
      "Vybraný import 13 Excelů pro řidičskou trasu neexistuje.",
      404,
      "collection_route_driver_batch_not_found"
    );
  }
}

async function loadRun(db, runId) {
  const run = await db.prepare(`
    SELECT *
    FROM collection_route_driver_runs
    WHERE id = ?
    LIMIT 1
  `).bind(runId).first();
  if (!run) {
    throw new CollectionRouteDriverEventsError(
      "Řidičská trasa neexistuje nebo už není dostupná.",
      404,
      "collection_route_driver_run_not_found"
    );
  }
  return run;
}

async function loadSourceRowForRun(db, run, sourceRowId) {
  const row = await db.prepare(`
    SELECT *
    FROM collection_route_source_rows
    WHERE id = ?
      AND batch_id = ?
    LIMIT 1
  `).bind(sourceRowId, run.source_batch_id).first();
  if (!row) {
    throw new CollectionRouteDriverEventsError(
      "Stanoviště nepatří do vybraného importu 13 Excelů.",
      400,
      "collection_route_driver_stop_not_in_run"
    );
  }
  return row;
}

async function runSummary(db, runId) {
  const [countsResult, doneResult] = await Promise.all([
    db.prepare(`
      SELECT action, COUNT(*) AS count
      FROM collection_route_driver_stop_events
      WHERE run_id = ?
      GROUP BY action
    `).bind(runId).all(),
    db.prepare(`
      SELECT DISTINCT source_row_id
      FROM collection_route_driver_stop_events
      WHERE run_id = ?
        AND action = 'done'
      ORDER BY created_at ASC
    `).bind(runId).all()
  ]);
  const counts = {};
  for (const row of countsResult.results || []) {
    counts[cleanString(row.action)] = Number(row.count) || 0;
  }
  return {
    eventCounts: counts,
    completedSourceRowIds: (doneResult.results || []).map((row) => cleanString(row.source_row_id)).filter(Boolean)
  };
}

export async function getCollectionRouteDriverRun(env, runId) {
  const db = database(env, true);
  try {
    const run = await loadRun(db, cleanString(runId));
    return rowToRun(run, await runSummary(db, run.id));
  } catch (error) {
    if (error instanceof CollectionRouteDriverEventsError) {
      throw error;
    }
    throw dbError(error);
  }
}

export async function createOrGetCollectionRouteDriverRun(env, user, input = {}) {
  const db = database(env, true);
  const sourceBatchId = cleanString(input.sourceBatchId || input.batchId);
  if (!sourceBatchId) {
    throw new CollectionRouteDriverEventsError(
      "Nejdřív vyber import 13 Excelů pro řidičskou trasu.",
      400,
      "collection_route_driver_batch_required"
    );
  }

  const filters = input.filters || {};
  const key = routeKey({
    sourceBatchId,
    day: filters.day || input.day,
    week: filters.week || input.week,
    vehicle: filters.vehicle || input.vehicle,
    waste: filters.waste || input.waste,
    mappingStatus: filters.mappingStatus || input.mappingStatus,
    user
  });
  const createdAt = nowIso();

  try {
    await ensureSourceBatch(db, sourceBatchId);
    const existing = await db.prepare(`
      SELECT *
      FROM collection_route_driver_runs
      WHERE route_key = ?
        AND status = 'active'
      LIMIT 1
    `).bind(key).first();
    if (existing) {
      return rowToRun(existing, await runSummary(db, existing.id));
    }

    const runId = randomId("collection-route-driver-run");
    await db.prepare(`
      INSERT INTO collection_route_driver_runs (
        id, source_batch_id, route_key, route_day_code, route_week_mode, vehicle_code,
        waste_filter, mapping_status_filter, driver_user_id, driver_name, status,
        started_at, created_at, updated_at, metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).bind(
      runId,
      sourceBatchId,
      key,
      normalizeFilter(filters.day || input.day),
      normalizeFilter(filters.week || input.week),
      normalizeFilter(filters.vehicle || input.vehicle),
      normalizeFilter(filters.waste || input.waste),
      normalizeFilter(filters.mappingStatus || input.mappingStatus),
      cleanString(user?.id),
      cleanString(user?.name || user?.email || "Řidič"),
      createdAt,
      createdAt,
      createdAt,
      jsonString({
        source: "driver-tablet",
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      })
    ).run();

    const run = await loadRun(db, runId);
    return rowToRun(run, await runSummary(db, run.id));
  } catch (error) {
    if (error instanceof CollectionRouteDriverEventsError) {
      throw error;
    }
    throw dbError(error);
  }
}

function eventIdempotencyKey({ runId, sourceRowId, action, clientEventId }) {
  if (action === "done") {
    return `collection-route-driver:${runId}:${sourceRowId}:done`;
  }
  const clientKey = cleanString(clientEventId);
  return clientKey || `collection-route-driver:${runId}:${sourceRowId}:${action}:${randomId("client")}`;
}

export async function recordCollectionRouteDriverStopEvent(env, user, {
  runId = "",
  sourceRowId = "",
  action = "",
  reason = "",
  note = "",
  clientEventId = "",
  payload = {}
} = {}) {
  const db = database(env, true);
  const safeRunId = cleanString(runId);
  const safeSourceRowId = cleanString(sourceRowId);
  const safeAction = cleanString(action).toLowerCase();

  if (!safeRunId || !safeSourceRowId) {
    throw new CollectionRouteDriverEventsError(
      "Chybí řidičská trasa nebo stanoviště pro uložení akce.",
      400,
      "collection_route_driver_event_target_missing"
    );
  }
  if (!DRIVER_EVENT_ACTIONS.has(safeAction)) {
    throw new CollectionRouteDriverEventsError(
      "Neznámá řidičská akce Svozových tras.",
      400,
      "collection_route_driver_event_action_invalid"
    );
  }

  try {
    const run = await loadRun(db, safeRunId);
    await loadSourceRowForRun(db, run, safeSourceRowId);

    const createdAt = nowIso();
    const idempotencyKey = eventIdempotencyKey({
      runId: safeRunId,
      sourceRowId: safeSourceRowId,
      action: safeAction,
      clientEventId
    });
    const eventId = randomId("collection-route-driver-event");
    await db.prepare(`
      INSERT OR IGNORE INTO collection_route_driver_stop_events (
        id, run_id, source_row_id, action, reason, note, idempotency_key,
        created_by_user_id, created_by_name, created_at, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      safeRunId,
      safeSourceRowId,
      safeAction,
      cleanString(reason),
      cleanString(note),
      idempotencyKey,
      cleanString(user?.id),
      cleanString(user?.name || user?.email || "Řidič"),
      createdAt,
      jsonString({
        ...payload,
        source: "driver-tablet",
        createsOperationalRoutes: false,
        sendsEmailOrSms: false,
        startsAutomation: false
      })
    ).run();

    const event = await db.prepare(`
      SELECT *
      FROM collection_route_driver_stop_events
      WHERE idempotency_key = ?
      LIMIT 1
    `).bind(idempotencyKey).first();

    if (safeAction === "problem" && event?.id === eventId) {
      await db.prepare(`
        INSERT INTO collection_route_driver_problem_reports (
          id, run_id, event_id, source_row_id, reason, note, status,
          created_by_user_id, created_by_name, created_at, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `).bind(
        randomId("collection-route-driver-problem"),
        safeRunId,
        event.id,
        safeSourceRowId,
        cleanString(reason),
        cleanString(note),
        cleanString(user?.id),
        cleanString(user?.name || user?.email || "Řidič"),
        createdAt,
        jsonString({ source: "driver-tablet" })
      ).run();
    }

    await db.prepare(`
      UPDATE collection_route_driver_runs
      SET updated_at = ?
      WHERE id = ?
    `).bind(createdAt, safeRunId).run();

    return {
      event: rowToEvent(event),
      duplicate: event?.id !== eventId,
      run: rowToRun(await loadRun(db, safeRunId), await runSummary(db, safeRunId))
    };
  } catch (error) {
    if (error instanceof CollectionRouteDriverEventsError) {
      throw error;
    }
    throw dbError(error);
  }
}
