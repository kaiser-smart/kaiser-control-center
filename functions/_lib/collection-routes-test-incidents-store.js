import {
  assertCollectionRoutesTestManager,
  collectionRoutesTestDatabase
} from "./collection-routes-test-store.js";
import {
  COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  isCollectionDailyRouteStationaryFieldTest
} from "./collection-daily-routes-store.js";

const INCIDENT_BUCKET_BINDING = "SMART_ODPADY_DOCUMENTS";
const MAX_NOTE_LENGTH = 500;
const INCIDENT_TYPES = new Map([
  ["overfilled_container", "Přeplněná nádoba"],
  ["damaged_container", "Poškozená nádoba"],
  ["site_inaccessible", "Nelze se dostat do firmy"]
]);

export class CollectionRoutesTestIncidentError extends Error {
  constructor(message, status = 400, code = "collection_routes_test_incident_error") {
    super(message);
    this.name = "CollectionRoutesTestIncidentError";
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

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function incidentBucket(env, required = false) {
  const bucket = env?.[INCIDENT_BUCKET_BINDING] || null;
  if (!bucket && required) {
    throw new CollectionRoutesTestIncidentError(
      "Cloudové úložiště TEST fotografií není připojené.",
      503,
      "collection_routes_test_incident_bucket_missing"
    );
  }
  return bucket;
}

function incidentType(value) {
  const type = cleanString(value);
  if (!INCIDENT_TYPES.has(type)) {
    throw new CollectionRoutesTestIncidentError(
      "Vyber přeplněnou nádobu, poškozenou nádobu nebo nepřístupnou firmu.",
      400,
      "collection_routes_test_incident_type_invalid"
    );
  }
  return type;
}

function incidentNote(value) {
  const note = cleanString(value);
  if (note.length > MAX_NOTE_LENGTH) {
    throw new CollectionRoutesTestIncidentError(
      `Poznámka může mít nejvýše ${MAX_NOTE_LENGTH} znaků.`,
      400,
      "collection_routes_test_incident_note_too_long"
    );
  }
  return note;
}

function photoInput(value = {}) {
  const body = value.body;
  const contentType = cleanString(value.contentType).toLowerCase();
  const sizeBytes = Number(value.sizeBytes) || 0;
  if (!body || !["image/jpeg", "image/png", "image/webp"].includes(contentType) || sizeBytes <= 0) {
    throw new CollectionRoutesTestIncidentError(
      "Hlášení vyžaduje platnou fotografii JPEG, PNG nebo WebP.",
      400,
      "collection_routes_test_incident_photo_invalid"
    );
  }
  return { body, contentType, sizeBytes };
}

function extensionForContentType(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function rowToIncident(row) {
  if (!row) return null;
  const id = cleanString(row.id);
  return {
    id,
    runId: cleanString(row.run_id),
    stopId: cleanString(row.stop_id),
    sourceRowId: cleanString(row.source_row_id),
    type: cleanString(row.incident_type),
    typeLabel: INCIDENT_TYPES.get(cleanString(row.incident_type)) || cleanString(row.incident_type),
    status: cleanString(row.status),
    note: cleanString(row.note),
    photoContentType: cleanString(row.photo_content_type),
    photoSizeBytes: Number(row.photo_size_bytes) || 0,
    photoUrl: `/api/collection-routes/test-incidents/${encodeURIComponent(id)}/photo`,
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    metadata: parseJson(row.metadata_json, {})
  };
}

function storeError(error) {
  if (error instanceof CollectionRoutesTestIncidentError) return error;
  const message = cleanString(error?.message);
  if (Number.isFinite(Number(error?.status)) && cleanString(error?.code).startsWith("collection_routes_test_")) {
    return new CollectionRoutesTestIncidentError(message, Number(error.status), cleanString(error.code));
  }
  if (/no such table[^\n]*collection_route_test_incident/i.test(message)) {
    return new CollectionRoutesTestIncidentError(
      "TEST hlášení čeká na databázovou migraci 0005.",
      503,
      "collection_routes_test_incident_migration_missing"
    );
  }
  console.error("collection_routes_test_incident.store_failed", { message });
  return new CollectionRoutesTestIncidentError(
    "TEST hlášení se teď nepodařilo uložit.",
    500,
    "collection_routes_test_incident_store_failed"
  );
}

async function loadRun(db, runId) {
  const run = await db.prepare(`SELECT * FROM collection_daily_route_runs WHERE id = ? LIMIT 1`).bind(runId).first();
  if (!run) {
    throw new CollectionRoutesTestIncidentError("TEST trasa nebyla nalezena.", 404, "collection_routes_test_incident_run_not_found");
  }
  if (!isCollectionDailyRouteStationaryFieldTest(run)) {
    throw new CollectionRoutesTestIncidentError(
      "Toto hlášení je zatím povolené pouze ve stacionárním TESTU na Trnkově.",
      409,
      "collection_routes_test_incident_stationary_test_required"
    );
  }
  return run;
}

async function loadStop(db, runId, stopId) {
  const stop = await db.prepare(`
    SELECT * FROM collection_daily_route_stops WHERE id = ? AND run_id = ? LIMIT 1
  `).bind(stopId, runId).first();
  if (!stop) {
    throw new CollectionRoutesTestIncidentError(
      "Stanoviště nepatří do vybraného TESTU.",
      404,
      "collection_routes_test_incident_stop_not_found"
    );
  }
  return stop;
}

function assertFieldTester(run, user) {
  const metadata = parseJson(run?.metadata_json, {});
  if (
    cleanString(run?.status) !== "active" ||
    cleanString(metadata.testMode) !== COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD ||
    !cleanString(metadata.fieldTesterUserId) ||
    cleanString(user?.id) !== cleanString(metadata.fieldTesterUserId)
  ) {
    throw new CollectionRoutesTestIncidentError(
      cleanString(run?.status) === "active"
        ? "TEST hlášení může uložit pouze přihlášený terénní tester, který TEST založil."
        : "Nejdřív spusť stacionární TEST tabletu.",
      cleanString(run?.status) === "active" ? 403 : 409,
      cleanString(run?.status) === "active"
        ? "collection_routes_test_incident_field_tester_mismatch"
        : "collection_routes_test_incident_route_not_active"
    );
  }
}

function fieldTesterActor(run, user) {
  const metadata = parseJson(run?.metadata_json, {});
  return {
    id: cleanString(metadata.fieldTesterUserId || user?.id || user?.email),
    name: cleanString(metadata.fieldTesterName || user?.name || user?.email || "Terénní tester")
  };
}

async function existingIncident(db, idempotencyKey) {
  if (!idempotencyKey) return null;
  return db.prepare(`
    SELECT * FROM collection_route_test_incidents WHERE idempotency_key = ? LIMIT 1
  `).bind(idempotencyKey).first();
}

export async function listCollectionRoutesTestIncidents(env, user, { runId } = {}) {
  try {
    assertCollectionRoutesTestManager(user);
    const normalizedRunId = cleanString(runId);
    if (!normalizedRunId) {
      throw new CollectionRoutesTestIncidentError("Chybí TEST trasa.", 400, "collection_routes_test_incident_run_required");
    }
    const db = collectionRoutesTestDatabase(env, true);
    await loadRun(db, normalizedRunId);
    const result = await db.prepare(`
      SELECT * FROM collection_route_test_incidents
      WHERE run_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(normalizedRunId).all();
    return {
      incidents: (result.results || []).map(rowToIncident),
      dataScope: "test",
      sendsNotifications: false,
      changesRoute: false
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function reportCollectionRoutesTestIncident(env, user, input = {}, photoValue = {}) {
  let bucket = null;
  let storageKey = "";
  try {
    assertCollectionRoutesTestManager(user);
    const db = collectionRoutesTestDatabase(env, true);
    bucket = incidentBucket(env, true);
    const runId = cleanString(input.runId);
    const stopId = cleanString(input.stopId);
    const type = incidentType(input.type);
    const note = incidentNote(input.note);
    const idempotencyKey = cleanString(input.idempotencyKey);
    if (!runId || !stopId || !idempotencyKey) {
      throw new CollectionRoutesTestIncidentError(
        "Chybí trasa, stanoviště nebo ochrana proti duplicitnímu hlášení.",
        400,
        "collection_routes_test_incident_input_required"
      );
    }
    const run = await loadRun(db, runId);
    assertFieldTester(run, user);
    const stop = await loadStop(db, runId, stopId);
    const existing = await existingIncident(db, idempotencyKey);
    if (existing) {
      if (
        cleanString(existing.run_id) !== runId ||
        cleanString(existing.stop_id) !== stopId ||
        cleanString(existing.incident_type) !== type
      ) {
        throw new CollectionRoutesTestIncidentError(
          "Ochrana proti duplicitě už patří jinému TEST hlášení.",
          409,
          "collection_routes_test_incident_idempotency_conflict"
        );
      }
      return { incident: rowToIncident(existing), reused: true };
    }

    const photo = photoInput(photoValue);
    const id = randomId("collection-route-test-incident");
    storageKey = `collection-routes/test-incidents/${encodeURIComponent(runId)}/${id}.${extensionForContentType(photo.contentType)}`;
    const createdAt = nowIso();
    const reporter = fieldTesterActor(run, user);
    const actorId = reporter.id;
    const actorName = reporter.name;
    const metadata = {
      dataScope: "test",
      testMode: COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
      siteSourceId: cleanString(stop.source_row_id),
      reporterSource: "stationary-field-test-run",
      noNotifications: true,
      noCustomerContact: true,
      noRouteChange: true
    };

    await bucket.put(storageKey, photo.body, {
      httpMetadata: { contentType: photo.contentType },
      customMetadata: {
        dataScope: "test",
        incidentId: id,
        runId,
        stopId,
        uploadedByUserId: actorId
      }
    });

    await db.batch([
      db.prepare(`
        INSERT INTO collection_route_test_incidents (
          id, run_id, stop_id, source_row_id, incident_type, status, note,
          photo_storage_key, photo_content_type, photo_size_bytes, idempotency_key,
          created_by_user_id, created_by_name, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, 'recorded-test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        runId,
        stopId,
        cleanString(stop.source_row_id),
        type,
        note,
        storageKey,
        photo.contentType,
        photo.sizeBytes,
        idempotencyKey,
        actorId,
        actorName,
        createdAt,
        createdAt,
        jsonString(metadata)
      ),
      db.prepare(`
        INSERT INTO collection_route_test_incident_events (
          id, incident_id, run_id, stop_id, event_type, actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, ?, ?, 'reported-test', ?, ?, ?, ?)
      `).bind(
        randomId("collection-route-test-incident-event"),
        id,
        runId,
        stopId,
        actorId,
        actorName,
        createdAt,
        jsonString({ ...metadata, incidentType: type, photoContentType: photo.contentType, photoSizeBytes: photo.sizeBytes })
      ),
      db.prepare(`
        INSERT INTO collection_daily_route_events (
          id, run_id, stop_id, event_type, before_status, after_status, reason, note,
          idempotency_key, actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, ?, 'test_incident_reported', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-daily-event"),
        runId,
        stopId,
        cleanString(stop.status),
        cleanString(stop.status),
        type,
        note,
        `test-incident-event:${idempotencyKey}`,
        actorId,
        actorName,
        createdAt,
        jsonString({ incidentId: id, ...metadata })
      ),
      db.prepare(`UPDATE collection_daily_route_runs SET updated_at = ? WHERE id = ?`).bind(createdAt, runId)
    ]);

    return {
      incident: rowToIncident({
        id,
        run_id: runId,
        stop_id: stopId,
        source_row_id: cleanString(stop.source_row_id),
        incident_type: type,
        status: "recorded-test",
        note,
        photo_content_type: photo.contentType,
        photo_size_bytes: photo.sizeBytes,
        created_by_user_id: actorId,
        created_by_name: actorName,
        created_at: createdAt,
        metadata_json: jsonString(metadata)
      }),
      reused: false
    };
  } catch (error) {
    if (storageKey && bucket) {
      await bucket.delete(storageKey).catch(() => {});
    }
    throw storeError(error);
  }
}

export async function getCollectionRoutesTestIncidentPhoto(env, user, incidentId) {
  try {
    assertCollectionRoutesTestManager(user);
    const id = cleanString(incidentId);
    if (!id) {
      throw new CollectionRoutesTestIncidentError("Chybí TEST hlášení.", 400, "collection_routes_test_incident_id_required");
    }
    const db = collectionRoutesTestDatabase(env, true);
    const row = await db.prepare(`SELECT * FROM collection_route_test_incidents WHERE id = ? LIMIT 1`).bind(id).first();
    if (!row) {
      throw new CollectionRoutesTestIncidentError("TEST hlášení nebylo nalezené.", 404, "collection_routes_test_incident_not_found");
    }
    await loadRun(db, cleanString(row.run_id));
    const object = await incidentBucket(env, true).get(cleanString(row.photo_storage_key));
    if (!object) {
      throw new CollectionRoutesTestIncidentError("Fotografie TEST hlášení nebyla nalezená.", 404, "collection_routes_test_incident_photo_not_found");
    }
    return {
      body: object.body,
      contentType: cleanString(row.photo_content_type) || cleanString(object.httpMetadata?.contentType) || "image/jpeg"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export const __test = {
  INCIDENT_TYPES,
  MAX_NOTE_LENGTH,
  rowToIncident
};
