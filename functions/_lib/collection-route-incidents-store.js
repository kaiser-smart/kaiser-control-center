import { hasPermission, isUserActive, normalizeRole } from "../../src/permissions.js";
import {
  COLLECTION_DAILY_ROUTE_SCOPE_PRODUCTION,
  COLLECTION_DAILY_ROUTE_SCOPE_TEST,
  CollectionDailyRoutesError,
  collectionDailyRouteScope
} from "./collection-daily-routes-store.js";

const DB_BINDING = "SMART_ODPADY_DB";
const TEST_DB_BINDING = "COLLECTION_ROUTES_TEST_DB";
const INCIDENT_STATUSES = new Set(["new", "claimed", "in_progress", "resolved"]);
const RESOLUTION_CODES = new Set([
  "resolved_on_site",
  "customer_contacted",
  "replacement_pickup_agreed",
  "site_fixed",
  "container_replaced",
  "unjustified",
  "duplicate",
  "other"
]);
const CUSTOMER_INFORMED_VALUES = new Set(["yes", "no", "not_needed"]);
const COMMUNICATION_CHANNELS = new Set(["email", "sms", "email_sms", "phone"]);
const PHONE_OUTCOMES = new Set(["reached", "not_reached"]);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_NOTE_LENGTH = 1000;
const DEFAULT_LIMIT = 50;

export class CollectionRouteIncidentsError extends Error {
  constructor(message, status = 400, code = "collection_route_incidents_error") {
    super(message);
    this.name = "CollectionRouteIncidentsError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
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

function incidentDatabase(env, scopeValue, required = true) {
  const scope = collectionDailyRouteScope(scopeValue);
  const binding = scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST ? TEST_DB_BINDING : DB_BINDING;
  const db = env?.[binding] || null;
  if (!db && required) {
    throw new CollectionRouteIncidentsError(
      scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
        ? "Oddělené TEST úložiště hlášení není připojené."
        : "Provozní úložiště hlášení není připojené.",
      503,
      "collection_route_incidents_database_missing"
    );
  }
  return db;
}

function assertCanView(user, scopeValue) {
  const scope = collectionDailyRouteScope(scopeValue);
  const role = normalizeRole(user?.role);
  if (!isUserActive(user) || !hasPermission(user, "collection-routes", "view")) {
    throw new CollectionRouteIncidentsError("K hlášením nemáš oprávnění.", 403, "collection_route_incidents_forbidden");
  }
  if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST && !["admin", "management"].includes(role)) {
    throw new CollectionRouteIncidentsError(
      "TEST hlášení jsou dostupná pouze roli Admin a Management.",
      403,
      "collection_route_incidents_test_forbidden"
    );
  }
  if (!["admin", "management", "dispecer"].includes(role)) {
    throw new CollectionRouteIncidentsError("Pracovní fronta není této roli dostupná.", 403, "collection_route_incidents_role_forbidden");
  }
}

function assertCanManage(user, scopeValue) {
  assertCanView(user, scopeValue);
  if (!hasPermission(user, "collection-routes", "manage") || normalizeRole(user?.role) === "readonly") {
    throw new CollectionRouteIncidentsError("Hlášení může měnit pouze oprávněný dispečer.", 403, "collection_route_incidents_manage_forbidden");
  }
}

function assertCanSeeTechnicalDetails(user) {
  return ["admin", "management"].includes(normalizeRole(user?.role));
}

function storeError(error) {
  if (error instanceof CollectionRouteIncidentsError) return error;
  if (error instanceof CollectionDailyRoutesError) {
    return new CollectionRouteIncidentsError(error.message, error.status, error.code);
  }
  const message = cleanString(error?.message);
  if (/no such table[^\n]*(collection_route_incident_|collection_daily_route_)/i.test(message)) {
    return new CollectionRouteIncidentsError(
      "Pracovní fronta hlášení čeká na databázovou migraci.",
      503,
      "collection_route_incidents_migration_missing"
    );
  }
  console.error("collection_route_incidents.store_failed", { message });
  return new CollectionRouteIncidentsError(
    "Hlášení se teď nepodařilo načíst nebo uložit.",
    500,
    "collection_route_incidents_store_failed"
  );
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstCoordinate(source, keys, minimum, maximum) {
  for (const key of keys) {
    const number = numberOrNull(source?.[key]);
    if (number !== null && number >= minimum && number <= maximum) return number;
  }
  return null;
}

function mapCoordinates(row) {
  const source = parseJson(row?.source_summary_json, {});
  const latitude = firstCoordinate(source, ["latitude", "lat", "addressLatitude", "gpsLatitude"], -90, 90);
  const longitude = firstCoordinate(source, ["longitude", "lng", "lon", "addressLongitude", "gpsLongitude"], -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function publicWorkflow(row = {}) {
  return {
    status: INCIDENT_STATUSES.has(cleanString(row.workflow_status)) ? cleanString(row.workflow_status) : "new",
    assignedUserId: cleanString(row.assigned_user_id),
    assignedName: cleanString(row.assigned_name),
    assignedAt: cleanString(row.assigned_at),
    unresolvedReason: cleanString(row.unresolved_reason),
    nextStep: cleanString(row.next_step),
    responsibleUserId: cleanString(row.responsible_user_id),
    responsibleName: cleanString(row.responsible_name),
    followUpAt: cleanString(row.follow_up_at),
    resolutionCode: cleanString(row.resolution_code),
    customerInformed: cleanString(row.customer_informed),
    resolutionNote: cleanString(row.resolution_note),
    resolvedByName: cleanString(row.resolved_by_name),
    resolvedAt: cleanString(row.resolved_at),
    reopenedReason: cleanString(row.reopened_reason),
    updatedAt: cleanString(row.workflow_updated_at || row.created_at)
  };
}

function communicationSummary(communications, channel) {
  const value = communications.find((item) => item.channel === channel) || null;
  return value ? { status: value.status, updatedAt: value.updatedAt } : { status: "not_sent", updatedAt: "" };
}

function rowToIncident(row, scope, communications = [], audit = [], includeTechnical = false) {
  const payload = parseJson(row.payload_json, {});
  const workflow = publicWorkflow(row);
  const photos = Array.isArray(payload.photos) && payload.photos.length
    ? payload.photos.map((photo) => ({ url: cleanString(photo.url), contentType: cleanString(photo.contentType) })).filter((photo) => photo.url)
    : cleanString(row.photo_url || payload.photoUrl)
      ? [{ url: cleanString(row.photo_url || payload.photoUrl), contentType: cleanString(payload.photoContentType || row.photo_content_type) }]
      : [];
  const incident = {
    id: cleanString(row.incident_id),
    environment: scope,
    type: cleanString(row.incident_type || payload.reportType),
    typeLabel: cleanString(row.type_label || payload.reportTypeLabel || row.reason || "Jiný problém"),
    status: workflow.status,
    workflow,
    companyName: cleanString(row.customer_name) || "Firma neuvedena",
    stationName: cleanString(row.station_name) || "Stanoviště neuvedeno",
    address: cleanString(row.address_text),
    routeTitle: cleanString(row.route_title),
    routeDate: cleanString(row.route_date),
    driverName: cleanString(row.driver_name || row.actor_name),
    vehicleLabel: cleanString(row.vehicle_label),
    reportedAt: cleanString(row.created_at),
    note: cleanString(row.note),
    photos,
    map: mapCoordinates(row),
    email: communicationSummary(communications, "email"),
    sms: communicationSummary(communications, "sms"),
    communications,
    audit: [
      {
        id: `reported:${cleanString(row.incident_id)}`,
        eventType: "reported",
        actorName: cleanString(row.actor_name) || cleanString(row.driver_name) || "Řidič",
        summary: "vytvořil hlášení",
        createdAt: cleanString(row.created_at)
      },
      ...audit
    ],
    canManage: true,
    externalSendingEnabled: false,
    testAdapter: scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST ? "simulated-provider" : "none"
  };
  if (includeTechnical) {
    incident.technicalDetails = {
      incidentId: incident.id,
      runId: cleanString(row.run_id),
      stopId: cleanString(row.stop_id),
      source: cleanString(row.source_kind) || "daily-route-event",
      rawPayload: payload
    };
  }
  return incident;
}

function rowToCommunication(row) {
  return {
    id: cleanString(row.id),
    channel: cleanString(row.channel),
    recipient: cleanString(row.recipient),
    contentSnapshot: cleanString(row.content_snapshot),
    status: cleanString(row.status),
    provider: cleanString(row.provider),
    providerId: cleanString(row.provider_id),
    error: cleanString(row.error_message),
    confirmedByName: cleanString(row.confirmed_by_name),
    createdAt: cleanString(row.created_at),
    sentAt: cleanString(row.sent_at),
    deliveredAt: cleanString(row.delivered_at),
    updatedAt: cleanString(row.updated_at),
    environment: cleanString(row.environment),
    metadata: parseJson(row.metadata_json, {})
  };
}

function rowToAudit(row) {
  return {
    id: cleanString(row.id),
    eventType: cleanString(row.event_type),
    beforeStatus: cleanString(row.before_status),
    afterStatus: cleanString(row.after_status),
    actorName: cleanString(row.actor_name),
    summary: cleanString(row.summary),
    createdAt: cleanString(row.created_at),
    payload: parseJson(row.payload_json, {})
  };
}

async function queryIncidentRows(db, { incidentId = "", limit = DEFAULT_LIMIT } = {}) {
  const conditions = ["e.event_type = 'problem'", "json_extract(e.payload_json, '$.workflow') = 'driver-dispatch-report'"];
  const values = [];
  if (cleanString(incidentId)) {
    conditions.push("e.id = ?");
    values.push(cleanString(incidentId));
  }
  values.push(Math.min(100, Math.max(1, Number(limit) || DEFAULT_LIMIT)));
  const result = await db.prepare(`
    SELECT
      e.id AS incident_id,
      e.run_id,
      e.stop_id,
      e.reason,
      e.note,
      e.actor_name,
      e.created_at,
      e.payload_json,
      r.title AS route_title,
      r.route_date,
      r.driver_name,
      r.vehicle_label,
      s.customer_name,
      s.station_name,
      s.address_text,
      s.source_summary_json,
      w.status AS workflow_status,
      w.assigned_user_id,
      w.assigned_name,
      w.assigned_at,
      w.unresolved_reason,
      w.next_step,
      w.responsible_user_id,
      w.responsible_name,
      w.follow_up_at,
      w.resolution_code,
      w.customer_informed,
      w.resolution_note,
      w.resolved_by_name,
      w.resolved_at,
      w.reopened_reason,
      w.updated_at AS workflow_updated_at,
      'daily-route-event' AS source_kind
    FROM collection_daily_route_events e
    JOIN collection_daily_route_runs r ON r.id = e.run_id
    JOIN collection_daily_route_stops s ON s.id = e.stop_id AND s.run_id = e.run_id
    LEFT JOIN collection_route_incident_workflows w ON w.incident_id = e.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.created_at DESC
    LIMIT ?
  `).bind(...values).all();
  return result.results || [];
}

async function queryLegacyTestIncidentRows(db, { incidentId = "", limit = DEFAULT_LIMIT } = {}) {
  const conditions = [];
  const values = [];
  if (cleanString(incidentId)) {
    conditions.push("i.id = ?");
    values.push(cleanString(incidentId));
  }
  values.push(Math.min(100, Math.max(1, Number(limit) || DEFAULT_LIMIT)));
  try {
    const result = await db.prepare(`
      SELECT
        i.id AS incident_id,
        i.run_id,
        i.stop_id,
        i.incident_type,
        i.note,
        i.created_by_name AS actor_name,
        i.created_at,
        i.metadata_json AS payload_json,
        i.photo_content_type,
        '/api/collection-routes/test-incidents/' || i.id || '/photo' AS photo_url,
        r.title AS route_title,
        r.route_date,
        r.driver_name,
        r.vehicle_label,
        s.customer_name,
        s.station_name,
        s.address_text,
        s.source_summary_json,
        CASE i.incident_type
          WHEN 'overfilled_container' THEN 'Přeplněná nádoba'
          WHEN 'damaged_container' THEN 'Poškozená nádoba'
          WHEN 'site_inaccessible' THEN 'Nádoba nebo firma není přístupná'
          ELSE 'Jiný problém'
        END AS type_label,
        w.status AS workflow_status,
        w.assigned_user_id,
        w.assigned_name,
        w.assigned_at,
        w.unresolved_reason,
        w.next_step,
        w.responsible_user_id,
        w.responsible_name,
        w.follow_up_at,
        w.resolution_code,
        w.customer_informed,
        w.resolution_note,
        w.resolved_by_name,
        w.resolved_at,
        w.reopened_reason,
        w.updated_at AS workflow_updated_at,
        'stationary-test-incident' AS source_kind
      FROM collection_route_test_incidents i
      JOIN collection_daily_route_runs r ON r.id = i.run_id
      JOIN collection_daily_route_stops s ON s.id = i.stop_id AND s.run_id = i.run_id
      LEFT JOIN collection_route_incident_workflows w ON w.incident_id = i.id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY i.created_at DESC
      LIMIT ?
    `).bind(...values).all();
    return result.results || [];
  } catch (error) {
    if (/no such table[^\n]*collection_route_test_incidents/i.test(cleanString(error?.message))) return [];
    throw error;
  }
}

async function relatedRows(db, table, incidentIds) {
  if (!incidentIds.length) return [];
  const placeholders = incidentIds.map(() => "?").join(", ");
  const result = await db.prepare(`
    SELECT * FROM ${table}
    WHERE incident_id IN (${placeholders})
    ORDER BY created_at ASC
  `).bind(...incidentIds).all();
  return result.results || [];
}

function countsFor(incidents) {
  const counts = { new: 0, claimed: 0, inProgress: 0, resolved: 0, unresolved: 0 };
  for (const incident of incidents) {
    if (incident.status === "new") counts.new += 1;
    if (incident.status === "claimed") counts.claimed += 1;
    if (incident.status === "in_progress") counts.inProgress += 1;
    if (incident.status === "resolved") counts.resolved += 1;
    if (incident.status !== "resolved") counts.unresolved += 1;
  }
  return counts;
}

export async function listCollectionRouteIncidents(env, user, input = {}) {
  try {
    const scope = collectionDailyRouteScope(input.scope);
    assertCanView(user, scope);
    const db = incidentDatabase(env, scope);
    const rows = await queryIncidentRows(db, input);
    if (scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST) {
      rows.push(...await queryLegacyTestIncidentRows(db, input));
      rows.sort((left, right) => cleanString(right.created_at).localeCompare(cleanString(left.created_at)));
    }
    const uniqueRows = [...new Map(rows.map((row) => [cleanString(row.incident_id), row])).values()]
      .slice(0, Math.min(100, Math.max(1, Number(input.limit) || DEFAULT_LIMIT)));
    const ids = uniqueRows.map((row) => cleanString(row.incident_id)).filter(Boolean);
    const [communicationRows, auditRows] = await Promise.all([
      relatedRows(db, "collection_route_incident_communications", ids),
      relatedRows(db, "collection_route_incident_audit", ids)
    ]);
    const includeTechnical = assertCanSeeTechnicalDetails(user);
    const incidents = uniqueRows.map((row) => {
      const id = cleanString(row.incident_id);
      const communications = communicationRows.filter((item) => cleanString(item.incident_id) === id).map(rowToCommunication);
      const audit = auditRows.filter((item) => cleanString(item.incident_id) === id).map(rowToAudit);
      const incident = rowToIncident(row, scope, communications, audit, includeTechnical);
      incident.canManage = hasPermission(user, "collection-routes", "manage") && normalizeRole(user?.role) !== "readonly";
      return incident;
    });
    return {
      incidents,
      counts: countsFor(incidents),
      environment: scope,
      externalSendingEnabled: false,
      testAdapter: scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST ? "simulated-provider" : "none",
      apiStatus: "ready"
    };
  } catch (error) {
    throw storeError(error);
  }
}

export async function getCollectionRouteIncident(env, user, incidentId, input = {}) {
  const result = await listCollectionRouteIncidents(env, user, { ...input, incidentId, limit: 1 });
  const incident = result.incidents.find((item) => item.id === cleanString(incidentId)) || null;
  if (!incident) {
    throw new CollectionRouteIncidentsError("Hlášení nebylo nalezené.", 404, "collection_route_incident_not_found");
  }
  return { ...result, incident };
}

async function currentWorkflow(db, incidentId) {
  return db.prepare(`SELECT * FROM collection_route_incident_workflows WHERE incident_id = ? LIMIT 1`)
    .bind(cleanString(incidentId)).first();
}

function currentStatus(row) {
  const status = cleanString(row?.status);
  return INCIDENT_STATUSES.has(status) ? status : "new";
}

function requiredText(value, label, maximum = MAX_NOTE_LENGTH) {
  const text = cleanString(value);
  if (!text) throw new CollectionRouteIncidentsError(`${label} je povinný.`, 400, "collection_route_incident_required_field");
  if (text.length > maximum) {
    throw new CollectionRouteIncidentsError(`${label} může mít nejvýše ${maximum} znaků.`, 400, "collection_route_incident_field_too_long");
  }
  return text;
}

function assertAssignedToActor(workflow, user) {
  if (!cleanString(workflow?.assigned_user_id) || cleanString(workflow.assigned_user_id) !== cleanString(user?.id)) {
    throw new CollectionRouteIncidentsError(
      "Hlášení musí nejdřív převzít přihlášená dispečerka.",
      409,
      "collection_route_incident_not_assigned_to_actor"
    );
  }
}

function workflowInsertStatement(db, incidentId, createdAt) {
  return db.prepare(`
    INSERT OR IGNORE INTO collection_route_incident_workflows (incident_id, status, created_at, updated_at)
    VALUES (?, 'new', ?, ?)
  `).bind(incidentId, createdAt, createdAt);
}

function auditStatement(db, {
  incidentId,
  eventType,
  beforeStatus,
  afterStatus,
  user,
  summary,
  idempotencyKey,
  createdAt,
  payload = {}
}) {
  return db.prepare(`
    INSERT INTO collection_route_incident_audit (
      id, incident_id, event_type, before_status, after_status, actor_user_id, actor_name,
      summary, idempotency_key, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("collection-route-incident-audit"),
    incidentId,
    eventType,
    beforeStatus,
    afterStatus,
    cleanString(user?.id),
    cleanString(user?.name || user?.email),
    summary,
    idempotencyKey,
    createdAt,
    jsonString(payload)
  );
}

async function actionAlreadyApplied(db, idempotencyKey) {
  if (!idempotencyKey) return false;
  const row = await db.prepare(`SELECT id FROM collection_route_incident_audit WHERE idempotency_key = ? LIMIT 1`)
    .bind(idempotencyKey).first();
  return Boolean(row);
}

function communicationChannels(channel) {
  if (channel === "email_sms") return ["email", "sms"];
  return [channel];
}

function communicationStatement(db, { incidentId, channel, message, user, idempotencyKey, createdAt, input, scope }) {
  const isPhone = channel === "phone";
  const metadata = isPhone
    ? {
        phoneOutcome: cleanString(input.phoneOutcome),
        callResult: cleanString(input.callResult),
        nextStep: cleanString(input.nextStep),
        followUpAt: cleanString(input.followUpAt),
        simulated: scope === COLLECTION_DAILY_ROUTE_SCOPE_TEST
      }
    : { simulated: true, deliveredRequiresWebhook: true, actualCustomerContact: false };
  const status = isPhone ? "recorded" : "accepted";
  const provider = isPhone ? "manual-test-record" : "kso-test-simulator";
  const providerId = isPhone ? "" : randomId(`test-${channel}`);
  return db.prepare(`
    INSERT INTO collection_route_incident_communications (
      id, incident_id, channel, recipient, content_snapshot, status, provider, provider_id,
      idempotency_key, confirmed_by_user_id, confirmed_by_name, created_at, sent_at,
      updated_at, environment, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("collection-route-communication"),
    incidentId,
    channel,
    "Bezpečný interní TEST příjemce",
    message,
    status,
    provider,
    providerId,
    `${idempotencyKey}:${channel}`,
    cleanString(user?.id),
    cleanString(user?.name || user?.email),
    createdAt,
    createdAt,
    createdAt,
    scope,
    jsonString(metadata)
  );
}

export async function applyCollectionRouteIncidentAction(env, user, incidentIdValue, input = {}) {
  try {
    const scope = collectionDailyRouteScope(input.scope);
    assertCanManage(user, scope);
    const incidentId = cleanString(incidentIdValue);
    const action = cleanString(input.action);
    const idempotencyKey = cleanString(input.idempotencyKey);
    if (!incidentId || !action || !idempotencyKey) {
      throw new CollectionRouteIncidentsError(
        "Chybí hlášení, akce nebo ochrana proti duplicitě.",
        400,
        "collection_route_incident_action_input_required"
      );
    }
    await getCollectionRouteIncident(env, user, incidentId, { scope });
    const db = incidentDatabase(env, scope);
    if (await actionAlreadyApplied(db, idempotencyKey)) {
      return { ...(await getCollectionRouteIncident(env, user, incidentId, { scope })), reused: true };
    }
    const createdAt = nowIso();
    const existingWorkflow = await currentWorkflow(db, incidentId);
    const beforeStatus = currentStatus(existingWorkflow);
    const actorId = cleanString(user?.id);
    const actorName = cleanString(user?.name || user?.email || "Dispečer");
    const statements = [workflowInsertStatement(db, incidentId, createdAt)];
    let afterStatus = beforeStatus;
    let summary = "";
    let payload = {};

    if (action === "claim") {
      if (beforeStatus !== "new") {
        if (beforeStatus === "claimed" && cleanString(existingWorkflow?.assigned_user_id) === actorId) {
          return { ...(await getCollectionRouteIncident(env, user, incidentId, { scope })), reused: true };
        }
        throw new CollectionRouteIncidentsError("Převzít lze pouze nové hlášení.", 409, "collection_route_incident_claim_conflict");
      }
      afterStatus = "claimed";
      summary = "hlášení převzal/a";
      statements.push(db.prepare(`
        UPDATE collection_route_incident_workflows
        SET status = 'claimed', assigned_user_id = ?, assigned_name = ?, assigned_at = ?, updated_at = ?
        WHERE incident_id = ?
      `).bind(actorId, actorName, createdAt, createdAt, incidentId));
    } else if (action === "schedule_next") {
      if (!["claimed", "in_progress"].includes(beforeStatus)) {
        throw new CollectionRouteIncidentsError("Další krok lze naplánovat až po převzetí hlášení.", 409, "collection_route_incident_schedule_conflict");
      }
      assertAssignedToActor(existingWorkflow, user);
      const unresolvedReason = requiredText(input.unresolvedReason, "Důvod nevyřešení");
      const nextStep = requiredText(input.nextStep, "Další krok");
      const responsibleName = requiredText(input.responsibleName, "Odpovědná osoba");
      const followUpAt = requiredText(input.followUpAt, "Termín další kontroly", 100);
      afterStatus = "in_progress";
      summary = `naplánoval/a další krok: ${nextStep}`;
      payload = { unresolvedReason, nextStep, responsibleName, followUpAt };
      statements.push(db.prepare(`
        UPDATE collection_route_incident_workflows
        SET status = 'in_progress', unresolved_reason = ?, next_step = ?, responsible_user_id = ?,
            responsible_name = ?, follow_up_at = ?, updated_at = ?
        WHERE incident_id = ?
      `).bind(unresolvedReason, nextStep, actorId, responsibleName, followUpAt, createdAt, incidentId));
    } else if (action === "contact") {
      if (!["claimed", "in_progress"].includes(beforeStatus)) {
        throw new CollectionRouteIncidentsError("Kontakt lze zaznamenat až po převzetí hlášení.", 409, "collection_route_incident_contact_conflict");
      }
      assertAssignedToActor(existingWorkflow, user);
      const channel = cleanString(input.channel);
      if (!COMMUNICATION_CHANNELS.has(channel)) {
        throw new CollectionRouteIncidentsError("Vyber e-mail, SMS, kombinaci nebo telefon.", 400, "collection_route_incident_channel_invalid");
      }
      if (scope !== COLLECTION_DAILY_ROUTE_SCOPE_TEST) {
        throw new CollectionRouteIncidentsError(
          "Ostré kontaktování zatím není aktivní. Ověř nejdřív TEST provider a webhooky.",
          409,
          "collection_route_incident_production_contact_disabled"
        );
      }
      const message = requiredText(input.message || input.callResult, channel === "phone" ? "Výsledek hovoru" : "Zpráva", MAX_MESSAGE_LENGTH);
      if (channel === "phone") {
        if (!PHONE_OUTCOMES.has(cleanString(input.phoneOutcome))) {
          throw new CollectionRouteIncidentsError("U telefonu vyber Dovoláno nebo Nedovoláno.", 400, "collection_route_incident_phone_outcome_invalid");
        }
        requiredText(input.nextStep, "Domluvený další krok");
      }
      afterStatus = "in_progress";
      summary = channel === "phone" ? "zaznamenal/a TEST telefonát" : "fyzicky potvrdil/a TEST komunikaci";
      payload = { channel, simulated: true, actualCustomerContact: false };
      statements.push(...communicationChannels(channel).map((item) => communicationStatement(db, {
        incidentId,
        channel: item,
        message,
        user,
        idempotencyKey,
        createdAt,
        input,
        scope
      })));
      statements.push(db.prepare(`
        UPDATE collection_route_incident_workflows
        SET status = 'in_progress', updated_at = ?
        WHERE incident_id = ?
      `).bind(createdAt, incidentId));
    } else if (action === "resolve") {
      if (!["claimed", "in_progress"].includes(beforeStatus)) {
        throw new CollectionRouteIncidentsError("Uzavřít lze pouze převzaté nebo řešené hlášení.", 409, "collection_route_incident_resolve_conflict");
      }
      assertAssignedToActor(existingWorkflow, user);
      const resolutionCode = cleanString(input.resolutionCode);
      const customerInformed = cleanString(input.customerInformed);
      if (!RESOLUTION_CODES.has(resolutionCode)) {
        throw new CollectionRouteIncidentsError("Vyber výsledek řešení.", 400, "collection_route_incident_resolution_required");
      }
      if (!CUSTOMER_INFORMED_VALUES.has(customerInformed)) {
        throw new CollectionRouteIncidentsError("Uveď, zda byl zákazník informován.", 400, "collection_route_incident_customer_informed_required");
      }
      const resolutionNote = cleanString(input.note).slice(0, MAX_NOTE_LENGTH);
      afterStatus = "resolved";
      summary = "označil/a hlášení jako vyřešené";
      payload = { resolutionCode, customerInformed, resolutionNote };
      statements.push(db.prepare(`
        UPDATE collection_route_incident_workflows
        SET status = 'resolved', resolution_code = ?, customer_informed = ?, resolution_note = ?,
            resolved_by_user_id = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ?
        WHERE incident_id = ?
      `).bind(resolutionCode, customerInformed, resolutionNote, actorId, actorName, createdAt, createdAt, incidentId));
    } else if (action === "reopen") {
      if (beforeStatus !== "resolved") {
        throw new CollectionRouteIncidentsError("Znovu otevřít lze pouze vyřešené hlášení.", 409, "collection_route_incident_reopen_conflict");
      }
      if (!["admin", "management"].includes(normalizeRole(user?.role))) {
        throw new CollectionRouteIncidentsError("Znovu otevřít hlášení může pouze Admin nebo Management.", 403, "collection_route_incident_reopen_forbidden");
      }
      const reason = requiredText(input.reason, "Důvod znovuotevření");
      afterStatus = "in_progress";
      summary = `znovu otevřel/a hlášení: ${reason}`;
      payload = { reason };
      statements.push(db.prepare(`
        UPDATE collection_route_incident_workflows
        SET status = 'in_progress', reopened_reason = ?, resolution_code = '', customer_informed = '',
            resolution_note = '', resolved_by_user_id = '', resolved_by_name = '', resolved_at = NULL,
            assigned_user_id = ?, assigned_name = ?, assigned_at = ?, updated_at = ?
        WHERE incident_id = ?
      `).bind(reason, actorId, actorName, createdAt, createdAt, incidentId));
    } else {
      throw new CollectionRouteIncidentsError("Neznámá akce hlášení.", 400, "collection_route_incident_action_invalid");
    }

    statements.push(auditStatement(db, {
      incidentId,
      eventType: action,
      beforeStatus,
      afterStatus,
      user,
      summary,
      idempotencyKey,
      createdAt,
      payload
    }));
    await db.batch(statements);
    return { ...(await getCollectionRouteIncident(env, user, incidentId, { scope })), reused: false };
  } catch (error) {
    throw storeError(error);
  }
}

export const __test = {
  CUSTOMER_INFORMED_VALUES,
  INCIDENT_STATUSES,
  RESOLUTION_CODES,
  countsFor,
  rowToIncident
};
