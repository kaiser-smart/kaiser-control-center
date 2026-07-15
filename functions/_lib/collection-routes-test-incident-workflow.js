import {
  assertCollectionRoutesTestManager,
  collectionRoutesTestDatabase
} from "./collection-routes-test-store.js";
import {
  COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
  isCollectionDailyRouteStationaryFieldTest
} from "./collection-daily-routes-store.js";
import {
  composeCollectionRouteIncidentMessage,
  collectionRouteIncidentFallbackMessage
} from "./collection-route-incident-ai.js";
import {
  sendCollectionRouteIncidentCustomerTestEmail,
  sendCollectionRouteIncidentDispatcherTestEmail
} from "./notification-service.js";

const PRODUCTION_DB_BINDING = "SMART_ODPADY_DB";
const INCIDENT_BUCKET_BINDING = "SMART_ODPADY_DOCUMENTS";
const EMAIL_GUARD_KEY = "physical-tablet-test-20260715";
const CONFIRMATION = "confirm-test-incident-workflow";
const REPLY_CONFIRMATION = "confirm-test-customer-reply";
const ALLOWED_SCENARIOS = new Set(["route_within_24h", "next_standard_pickup"]);
const DISPATCHER_ORDER = ["Lenka Kouřilová", "Ulyana Bartošová", "Simona Šefčíková"];

export class CollectionRoutesTestIncidentWorkflowError extends Error {
  constructor(message, status = 400, code = "collection_routes_test_incident_workflow_error") {
    super(message);
    this.name = "CollectionRoutesTestIncidentWorkflowError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function normalizeText(value) {
  return cleanString(value)
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function incidentTypeLabel(value) {
  const type = cleanString(value);
  if (type === "overfilled_container") return "Přeplněná nádoba";
  if (type === "damaged_container") return "Poškozená nádoba";
  if (type === "site_inaccessible") return "Nelze se dostat do firmy";
  return "Hlášení ze stanoviště";
}

function pragueDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addMinutes(value, minutes) {
  return new Date(new Date(value).getTime() + numberValue(minutes) * 60_000).toISOString();
}

function addDaysAtPragueTime(value, days, hour, minute) {
  const source = new Date(value);
  const localDate = pragueDate(new Date(source.getTime() + numberValue(days) * 86_400_000));
  const offsetPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    timeZoneName: "longOffset"
  }).formatToParts(new Date(`${localDate}T12:00:00.000Z`)).find((part) => part.type === "timeZoneName")?.value || "GMT+01:00";
  const offset = offsetPart.replace("GMT", "") || "+01:00";
  return new Date(`${localDate}T${String(numberValue(hour)).padStart(2, "0")}:${String(numberValue(minute)).padStart(2, "0")}:00${offset}`).toISOString();
}

function pickupWeekdays(value) {
  const text = normalizeText(value);
  const days = new Set();
  if (/pondel|\bpo\b/.test(text)) days.add(1);
  if (/uter|\but\b/.test(text)) days.add(2);
  if (/stred|\bst\b/.test(text)) days.add(3);
  if (/ctvrt|\bct\b/.test(text)) days.add(4);
  if (/patek|\bpa\b/.test(text)) days.add(5);
  if (/sobot|\bso\b/.test(text)) days.add(6);
  if (/nedel|\bne\b/.test(text)) days.add(0);
  return days;
}

function nextStandardPickupAt(incident, now, config) {
  const scheduledDays = pickupWeekdays(incident.pickup_days_text);
  const hour = numberValue(config.nextStandardHour, 8);
  const minute = numberValue(config.nextStandardMinute, 30);
  if (scheduledDays.size) {
    for (let offset = 1; offset <= 7; offset += 1) {
      const localDate = pragueDate(new Date(new Date(now).getTime() + offset * 86_400_000));
      const weekday = new Date(`${localDate}T12:00:00.000Z`).getUTCDay();
      if (scheduledDays.has(weekday)) return addDaysAtPragueTime(now, offset, hour, minute);
    }
  }
  return addDaysAtPragueTime(now, numberValue(config.nextStandardOffsetDays, 7), hour, minute);
}

function protectedRecipient(env, required = false) {
  const value = cleanString(env?.COLLECTION_ROUTES_TEST_EMAIL_TO);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!valid && required) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Chráněný TEST příjemce e-mailu není nastavený.",
      503,
      "collection_routes_test_incident_protected_recipient_missing"
    );
  }
  return valid ? value : "";
}

function productionDatabase(env, required = false) {
  const db = env?.[PRODUCTION_DB_BINDING] || null;
  if (!db && required) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Nelze ověřit dostupnou dispečerku v Kartách zaměstnanců.",
      503,
      "collection_routes_test_incident_dispatcher_database_missing"
    );
  }
  return db;
}

function incidentBucket(env, required = false) {
  const bucket = env?.[INCIDENT_BUCKET_BINDING] || null;
  if (!bucket && required) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Fotografie TEST incidentu není dostupná.",
      503,
      "collection_routes_test_incident_photo_bucket_missing"
    );
  }
  return bucket;
}

function workflowError(error) {
  if (error instanceof CollectionRoutesTestIncidentWorkflowError) return error;
  const message = cleanString(error?.message);
  if (/no such table[^\n]*collection_route_test_incident_(workflow|scenario|action|email_guard|conversation)/i.test(message)) {
    return new CollectionRoutesTestIncidentWorkflowError(
      "Incidentní TEST workflow čeká na databázovou migraci 0006.",
      503,
      "collection_routes_test_incident_workflow_migration_missing"
    );
  }
  console.error("collection_routes_test_incident_workflow.failed", { message });
  return new CollectionRoutesTestIncidentWorkflowError(
    "Incidentní TEST workflow se teď nepodařilo zpracovat.",
    500,
    "collection_routes_test_incident_workflow_failed"
  );
}

function actor(user = {}) {
  return {
    id: cleanString(user.id || user.email),
    name: cleanString(user.name || user.email || "Uživatel")
  };
}

function assertFieldTester(row, user) {
  const metadata = parseJson(row?.run_metadata_json, {});
  if (
    cleanString(row?.run_status) !== "active" ||
    cleanString(metadata.testMode) !== COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD ||
    !cleanString(metadata.fieldTesterUserId) ||
    cleanString(user?.id) !== cleanString(metadata.fieldTesterUserId)
  ) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      cleanString(row?.run_status) === "active"
        ? "Incidentní TEST může potvrdit pouze terénní tester, který stacionární TEST založil."
        : "Nejdřív spusť stacionární TEST tabletu.",
      cleanString(row?.run_status) === "active" ? 403 : 409,
      cleanString(row?.run_status) === "active"
        ? "collection_routes_test_incident_workflow_tester_mismatch"
        : "collection_routes_test_incident_workflow_route_not_active"
    );
  }
}

async function loadIncidentContext(db, incidentId, user = null, { requireActiveTester = true } = {}) {
  const row = await db.prepare(`
    SELECT
      i.*,
      r.status AS run_status,
      r.route_date AS run_route_date,
      r.metadata_json AS run_metadata_json,
      s.customer_name,
      s.station_name,
      s.address_text,
      s.waste_type,
      s.waste_code,
      s.container_volume,
      s.container_count,
      s.frequency,
      s.pickup_days_text,
      s.source_summary_json
    FROM collection_route_test_incidents i
    JOIN collection_daily_route_runs r ON r.id = i.run_id
    JOIN collection_daily_route_stops s ON s.id = i.stop_id AND s.run_id = i.run_id
    WHERE i.id = ?
    LIMIT 1
  `).bind(cleanString(incidentId)).first();
  if (!row) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "TEST incident nebyl nalezený.",
      404,
      "collection_routes_test_incident_workflow_incident_not_found"
    );
  }
  if (!isCollectionDailyRouteStationaryFieldTest({ metadata_json: row.run_metadata_json })) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Workflow je povolený pouze pro stacionární TEST Firma test 501.",
      409,
      "collection_routes_test_incident_workflow_stationary_test_required"
    );
  }
  if (requireActiveTester) assertFieldTester(row, user);
  return row;
}

async function employeeIsAbsent(db, employee, date) {
  const row = await db.prepare(`
    SELECT id
    FROM absence_requests
    WHERE (employee_id = ? OR employee_id = ?)
      AND status IN ('approved', 'recorded')
      AND date_from <= ?
      AND date_to >= ?
    LIMIT 1
  `).bind(cleanString(employee.id), cleanString(employee.user_id), date, date).first();
  return Boolean(row);
}

async function dispatcherLoadCounts(testDb) {
  const result = await testDb.prepare(`
    SELECT dispatcher_employee_id, COUNT(*) AS assigned_count
    FROM collection_route_test_incident_workflows
    WHERE dispatcher_employee_id <> ''
      AND status IN ('prepared-test', 'processing-test')
    GROUP BY dispatcher_employee_id
  `).all();
  return new Map((result.results || []).map((row) => [cleanString(row.dispatcher_employee_id), numberValue(row.assigned_count)]));
}

export async function resolveAvailableCollectionRouteDispatcher(env, testDb, options = {}) {
  const db = productionDatabase(env, true);
  const today = pragueDate(options.now || Date.now());
  const result = await db.prepare(`
    SELECT id, user_id, first_name, last_name, email, position, department,
      employment_status, current_absence_status
    FROM employee_cards
    WHERE employment_status = 'active'
  `).all();
  const allowed = new Map(DISPATCHER_ORDER.map((name, index) => [normalizeText(name), index]));
  const candidates = (result.results || [])
    .map((row) => ({ ...row, name: cleanString(`${row.first_name || ""} ${row.last_name || ""}`) }))
    .filter((row) => allowed.has(normalizeText(row.name)));
  const counts = await dispatcherLoadCounts(testDb);
  const availability = await Promise.all(candidates.map(async (candidate) => {
    const absenceState = normalizeText(candidate.current_absence_status);
    const cardUnavailable = Boolean(absenceState && absenceState !== "v praci" && absenceState !== "v praci.");
    const absent = cardUnavailable || await employeeIsAbsent(db, candidate, today);
    return {
      id: cleanString(candidate.id || candidate.user_id),
      userId: cleanString(candidate.user_id),
      name: candidate.name,
      email: cleanString(candidate.email),
      position: cleanString(candidate.position),
      department: cleanString(candidate.department),
      absent,
      availability: absent ? "nepřítomná" : "v práci",
      assignedCount: counts.get(cleanString(candidate.id || candidate.user_id)) || 0,
      order: allowed.get(normalizeText(candidate.name)) ?? 99
    };
  }));
  const available = availability
    .filter((item) => !item.absent && item.email)
    .sort((left, right) => left.assignedCount - right.assignedCount || left.order - right.order || left.name.localeCompare(right.name, "cs"));
  return {
    selected: available[0] || null,
    candidates: availability,
    checkedDate: today,
    source: "SMART_ODPADY_DB.employee_cards + absence_requests"
  };
}

async function loadScenario(db, key) {
  const row = await db.prepare(`
    SELECT * FROM collection_route_test_incident_scenarios WHERE scenario_key = ? LIMIT 1
  `).bind(key).first();
  if (!row) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Vyber platnou řízenou TEST variantu.",
      400,
      "collection_routes_test_incident_scenario_invalid"
    );
  }
  return {
    key: cleanString(row.scenario_key),
    name: cleanString(row.name),
    description: cleanString(row.description),
    candidateWithin24h: Number(row.candidate_within_24h) === 1,
    config: parseJson(row.config_json, {})
  };
}

function deterministicRecoveryPlan(incident, scenario, now) {
  if (cleanString(incident.incident_type) !== "site_inaccessible") {
    return {
      branch: "dispatcher-only",
      scenario: null,
      candidate: null,
      recoveryStop: null,
      nextStandardPickupAt: "",
      policyReminderDueAt: "",
      testReminderDueAt: "",
      reminderStatus: "not-required",
      reason: "Přeplněná nebo poškozená nádoba se předává dispečinku; TEST sám nemění trasu."
    };
  }
  const config = scenario.config || {};
  const wasteCompatible = normalizeText(config.wasteCompatibility || incident.waste_type) === normalizeText(incident.waste_type);
  if (scenario.candidateWithin24h && wasteCompatible && cleanString(config.capacityStatus) === "test-safe") {
    const etaAt = addMinutes(now, numberValue(config.etaOffsetMinutes, 1140));
    const candidateAt = addMinutes(now, numberValue(config.candidateOffsetMinutes, 1080));
    return {
      branch: "route-within-24h",
      scenario,
      candidate: {
        source: "controlled-test-route-dataset",
        routeLabel: scenario.name,
        vehicleCode: cleanString(config.vehicleCode),
        vehicleRegistration: cleanString(config.vehicleRegistration),
        vehicleLabel: cleanString(config.vehicleLabel),
        routeDate: pragueDate(candidateAt),
        etaAt,
        distanceMeters: numberValue(config.distanceMeters),
        detourSeconds: numberValue(config.detourSeconds),
        capacityStatus: cleanString(config.capacityStatus),
        wasteCompatibility: cleanString(config.wasteCompatibility)
      },
      recoveryStop: {
        etaAt,
        freeOfCharge: true,
        routeOverlay: true
      },
      nextStandardPickupAt: "",
      policyReminderDueAt: "",
      testReminderDueAt: "",
      reminderStatus: "not-required",
      reason: "Řízený TEST kandidát splňuje limit 24 hodin, shodu odpadu a TEST kapacitní podmínku."
    };
  }
  const standardPickupAt = nextStandardPickupAt(incident, now, config);
  const policyReminderDueAt = addMinutes(standardPickupAt, -Math.abs(numberValue(config.policyReminderMinutesBefore, 30)));
  const testReminderDueAt = addMinutes(now, Math.max(1, numberValue(config.testReminderOffsetMinutes, 2)));
  return {
    branch: "next-standard-pickup",
    scenario,
    candidate: null,
    recoveryStop: null,
    nextStandardPickupAt: standardPickupAt,
    policyReminderDueAt,
    testReminderDueAt,
    reminderStatus: "scheduled-test",
    reason: "Řízený TEST dataset nemá vhodný vůz do 24 hodin; zachovává pravidelný svoz a připravuje připomínku 30 minut předem."
  };
}

async function emailGuardStatus(db) {
  const row = await db.prepare(`
    SELECT max_count, claimed_count FROM collection_route_test_incident_email_guard WHERE guard_key = ? LIMIT 1
  `).bind(EMAIL_GUARD_KEY).first();
  const max = numberValue(row?.max_count, 0);
  const claimed = numberValue(row?.claimed_count, 0);
  return { max, claimed, remaining: Math.max(0, max - claimed) };
}

function workflowIdempotency(incidentId, scenarioKey) {
  return `test-incident-workflow:${cleanString(incidentId)}:${cleanString(scenarioKey || "dispatcher-only")}`;
}

function rowToWorkflow(row, actions = [], recoveryStop = null) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    incidentId: cleanString(row.incident_id),
    runId: cleanString(row.run_id),
    stopId: cleanString(row.stop_id),
    status: cleanString(row.status),
    testScenario: cleanString(row.test_scenario),
    dispatcher: {
      employeeId: cleanString(row.dispatcher_employee_id),
      name: cleanString(row.dispatcher_name),
      email: cleanString(row.dispatcher_email),
      availability: cleanString(row.dispatcher_availability)
    },
    recoveryBranch: cleanString(row.recovery_branch),
    candidate: cleanString(row.candidate_route_label) ? {
      routeLabel: cleanString(row.candidate_route_label),
      vehicleCode: cleanString(row.candidate_vehicle_code),
      vehicleRegistration: cleanString(row.candidate_vehicle_registration),
      routeDate: cleanString(row.candidate_route_date),
      etaAt: cleanString(row.candidate_eta_at),
      distanceMeters: numberValue(row.candidate_distance_meters),
      detourSeconds: numberValue(row.candidate_detour_seconds)
    } : null,
    recoveryStop,
    nextStandardPickupAt: cleanString(row.next_standard_pickup_at),
    policyReminderDueAt: cleanString(row.policy_reminder_due_at),
    testReminderDueAt: cleanString(row.test_reminder_due_at),
    reminderStatus: cleanString(row.reminder_status),
    dispatcherEmailStatus: cleanString(row.dispatcher_email_status),
    customerEmailStatus: cleanString(row.customer_email_status),
    aiStatus: cleanString(row.ai_status),
    aiModel: cleanString(row.ai_model),
    escalationStatus: cleanString(row.escalation_status),
    messageSubject: cleanString(row.message_subject),
    messageBody: cleanString(row.message_body),
    lastError: cleanString(row.last_error),
    metadata: parseJson(row.metadata_json, {}),
    actions,
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    completedAt: cleanString(row.completed_at),
    actualRecipientLabel: "Chráněný TEST e-mail; skutečný zákazník ani dispečerka nejsou kontaktováni",
    channels: { email: "protected-test-only", sms: "disabled", rcs: "disabled" },
    changesOperationalRoute: false,
    changesVistos: false
  };
}

function rowToAction(row) {
  return {
    id: cleanString(row.id),
    type: cleanString(row.action_type),
    status: cleanString(row.status),
    logicalRecipientName: cleanString(row.logical_recipient_name),
    logicalRecipientEmail: cleanString(row.logical_recipient_email),
    provider: cleanString(row.provider),
    providerMessageId: cleanString(row.provider_message_id),
    errorMessage: cleanString(row.error_message),
    dueAt: cleanString(row.due_at),
    attempts: numberValue(row.attempts),
    sentAt: cleanString(row.sent_at),
    metadata: parseJson(row.payload_json, {})
  };
}

function rowToRecoveryStop(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    sourceStopId: cleanString(row.source_stop_id),
    routeDate: cleanString(row.route_date),
    vehicleCode: cleanString(row.vehicle_code),
    vehicleRegistration: cleanString(row.vehicle_registration),
    vehicleLabel: cleanString(row.vehicle_label),
    plannedEtaAt: cleanString(row.planned_eta_at),
    status: cleanString(row.status),
    freeOfCharge: Number(row.free_of_charge) === 1,
    routeOverlay: Number(row.route_overlay) === 1,
    metadata: parseJson(row.metadata_json, {})
  };
}

async function loadWorkflowDetail(db, workflowRow) {
  if (!workflowRow) return null;
  const [actionsResult, recoveryRow] = await Promise.all([
    db.prepare(`SELECT * FROM collection_route_test_incident_actions WHERE workflow_id = ? ORDER BY created_at`).bind(workflowRow.id).all(),
    db.prepare(`SELECT * FROM collection_route_test_recovery_stops WHERE workflow_id = ? LIMIT 1`).bind(workflowRow.id).first()
  ]);
  return rowToWorkflow(workflowRow, (actionsResult.results || []).map(rowToAction), rowToRecoveryStop(recoveryRow));
}

async function existingWorkflow(db, incidentId) {
  return db.prepare(`SELECT * FROM collection_route_test_incident_workflows WHERE incident_id = ? LIMIT 1`).bind(incidentId).first();
}

export async function previewCollectionRoutesTestIncidentWorkflow(env, user, incidentId, input = {}, options = {}) {
  try {
    assertCollectionRoutesTestManager(user);
    const db = collectionRoutesTestDatabase(env, true);
    const incident = await loadIncidentContext(db, incidentId, user);
    const stored = await existingWorkflow(db, cleanString(incidentId));
    if (stored) {
      return {
        status: "already-confirmed",
        workflow: await loadWorkflowDetail(db, stored),
        canConfirm: false,
        confirmation: CONFIRMATION
      };
    }
    const isInaccessible = cleanString(incident.incident_type) === "site_inaccessible";
    const scenarioKey = isInaccessible
      ? cleanString(input.testScenario || "route_within_24h")
      : "";
    if (isInaccessible && !ALLOWED_SCENARIOS.has(scenarioKey)) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Vyber jednu ze dvou řízených TEST variant.",
        400,
        "collection_routes_test_incident_scenario_required"
      );
    }
    const scenario = isInaccessible ? await loadScenario(db, scenarioKey) : null;
    const dispatcherResult = await resolveAvailableCollectionRouteDispatcher(env, db, { now: options.now });
    const plan = deterministicRecoveryPlan(incident, scenario, options.now || Date.now());
    const guard = await emailGuardStatus(db);
    const recipientConfigured = Boolean(protectedRecipient(env));
    const dispatcherAvailable = Boolean(dispatcherResult.selected);
    const logicalRecipient = isInaccessible
      ? { name: cleanString(incident.customer_name || "Firma test 501"), email: "" }
      : { name: cleanString(dispatcherResult.selected?.name), email: cleanString(dispatcherResult.selected?.email) };
    const fallback = collectionRouteIncidentFallbackMessage({
      audience: isInaccessible ? "customer-recovery" : "dispatcher",
      incidentType: cleanString(incident.incident_type),
      recoveryBranch: plan.branch,
      customerName: cleanString(incident.customer_name),
      stationName: cleanString(incident.station_name),
      address: cleanString(incident.address_text),
      eventAt: cleanString(incident.created_at),
      etaAt: cleanString(plan.candidate?.etaAt),
      nextStandardPickupAt: cleanString(plan.nextStandardPickupAt),
      dispatcherName: cleanString(dispatcherResult.selected?.name),
      testerName: cleanString(incident.created_by_name),
      note: cleanString(incident.note)
    });
    return {
      status: "preview",
      incident: {
        id: cleanString(incident.id),
        type: cleanString(incident.incident_type),
        customerName: cleanString(incident.customer_name),
        stationName: cleanString(incident.station_name),
        address: cleanString(incident.address_text),
        createdAt: cleanString(incident.created_at),
        testerName: cleanString(incident.created_by_name),
        photoUrl: `/api/collection-routes/test-incidents/${encodeURIComponent(cleanString(incident.id))}/photo`
      },
      testScenario: scenario,
      dispatcher: dispatcherResult.selected,
      dispatcherCandidates: dispatcherResult.candidates,
      dispatcherSource: dispatcherResult.source,
      plan,
      logicalRecipient,
      actualRecipientLabel: "Chráněný TEST e-mail; skutečný zákazník ani dispečerka nejsou kontaktováni",
      messagePreview: fallback,
      emailGuard: guard,
      aiConfigured: Boolean(cleanString(env.OPENAI_API_KEY)),
      canConfirm: recipientConfigured && dispatcherAvailable && guard.remaining >= 1,
      blockers: [
        ...(!recipientConfigured ? ["Chybí chráněný COLLECTION_ROUTES_TEST_EMAIL_TO."] : []),
        ...(!dispatcherAvailable ? ["V Kartách zaměstnanců není dostupná dispečerka s e-mailem."] : []),
        ...(guard.remaining < 1 ? ["Byl vyčerpán pevný limit šesti TEST e-mailových pokusů."] : [])
      ],
      confirmation: CONFIRMATION,
      idempotencyKey: workflowIdempotency(incidentId, scenarioKey),
      finalTapRequired: true,
      protectedTestEmailOnly: true,
      expectedEmailCount: 1,
      sms: "disabled",
      rcs: "disabled",
      changesOperationalRoute: false,
      createsTestRouteOverlay: plan.branch === "route-within-24h"
    };
  } catch (error) {
    throw workflowError(error);
  }
}

async function bytesFromR2Object(object) {
  if (!object) return new Uint8Array();
  if (typeof object.arrayBuffer === "function") return new Uint8Array(await object.arrayBuffer());
  if (object.body instanceof Uint8Array) return object.body;
  if (object.body instanceof ArrayBuffer) return new Uint8Array(object.body);
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function incidentPhotoAttachment(env, incident) {
  const object = await incidentBucket(env, true).get(cleanString(incident.photo_storage_key));
  if (!object) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Fotografie TEST incidentu nebyla v chráněném úložišti nalezená.",
      404,
      "collection_routes_test_incident_workflow_photo_not_found"
    );
  }
  const bytes = await bytesFromR2Object(object);
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) {
    throw new CollectionRoutesTestIncidentWorkflowError(
      "Fotografie TEST incidentu nemá bezpečnou velikost.",
      409,
      "collection_routes_test_incident_workflow_photo_invalid"
    );
  }
  const contentType = cleanString(incident.photo_content_type || object.httpMetadata?.contentType || "image/jpeg");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return {
    content: bytesToBase64(bytes),
    filename: `test-incident-${cleanString(incident.incident_type)}.${extension}`,
    type: contentType,
    disposition: "attachment"
  };
}

async function claimEmailGuard(db, actionId, claimToken, now) {
  const guardResult = await db.prepare(`
    UPDATE collection_route_test_incident_email_guard
    SET claimed_count = claimed_count + 1, updated_at = ?
    WHERE guard_key = ? AND claimed_count < max_count
  `).bind(now, EMAIL_GUARD_KEY).run();
  const changes = numberValue(guardResult?.meta?.changes ?? guardResult?.meta?.rows_written);
  if (changes < 1) return false;
  const actionResult = await db.prepare(`
    UPDATE collection_route_test_incident_actions
    SET status = 'sending', claim_token = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND status IN ('pending', 'scheduled')
  `).bind(claimToken, now, actionId).run();
  const actionChanges = numberValue(actionResult?.meta?.changes ?? actionResult?.meta?.rows_written);
  return actionChanges === 1;
}

async function finishEmailAction(db, actionId, result, now) {
  const status = result?.status === "sent" ? "sent" : "failed";
  await db.prepare(`
    UPDATE collection_route_test_incident_actions
    SET status = ?, provider = 'SendGrid', provider_message_id = ?, error_message = ?, sent_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    status,
    cleanString(result?.providerMessageId),
    cleanString(result?.errorMessage),
    status === "sent" ? now : null,
    now,
    actionId
  ).run();
  return status;
}

function workflowInsertStatements(db, { incident, preview, workflowId, actionId, reminderActionId, recoveryStopId, message, user, now }) {
  const plan = preview.plan;
  const dispatcher = preview.dispatcher || {};
  const scenarioKey = cleanString(preview.testScenario?.key);
  const isDispatcher = cleanString(incident.incident_type) !== "site_inaccessible";
  const statements = [
    db.prepare(`
      INSERT INTO collection_route_test_incident_workflows (
        id, incident_id, run_id, stop_id, status, test_scenario,
        dispatcher_employee_id, dispatcher_name, dispatcher_email, dispatcher_availability,
        recovery_branch, candidate_route_label, candidate_vehicle_code, candidate_vehicle_registration,
        candidate_route_date, candidate_eta_at, candidate_distance_meters, candidate_detour_seconds,
        recovery_stop_id, next_standard_pickup_at, policy_reminder_due_at, test_reminder_due_at,
        reminder_status, dispatcher_email_status, customer_email_status,
        ai_status, ai_model, escalation_status, message_subject, message_body,
        idempotency_key, created_by_user_id, created_by_name, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, 'processing-test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not-required', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      workflowId,
      cleanString(incident.id),
      cleanString(incident.run_id),
      cleanString(incident.stop_id),
      scenarioKey || null,
      cleanString(dispatcher.id),
      cleanString(dispatcher.name),
      cleanString(dispatcher.email),
      cleanString(dispatcher.availability),
      cleanString(plan.branch),
      cleanString(plan.candidate?.routeLabel),
      cleanString(plan.candidate?.vehicleCode),
      cleanString(plan.candidate?.vehicleRegistration),
      cleanString(plan.candidate?.routeDate) || null,
      cleanString(plan.candidate?.etaAt) || null,
      numberValue(plan.candidate?.distanceMeters),
      numberValue(plan.candidate?.detourSeconds),
      recoveryStopId,
      cleanString(plan.nextStandardPickupAt) || null,
      cleanString(plan.policyReminderDueAt) || null,
      cleanString(plan.testReminderDueAt) || null,
      cleanString(plan.reminderStatus),
      isDispatcher ? "pending" : "not-required",
      isDispatcher ? "not-required" : "pending",
      cleanString(message.aiStatus),
      cleanString(message.model),
      cleanString(message.subject),
      cleanString(message.body),
      workflowIdempotency(incident.id, scenarioKey),
      cleanString(user.id),
      cleanString(user.name),
      now,
      now,
      jsonString({
        dataScope: "test",
        testMode: COLLECTION_DAILY_ROUTE_TEST_MODE_STATIONARY_FIELD,
        actualRecipientProtected: true,
        noRealCustomerContact: true,
        noRealDispatcherContact: true,
        noOperationalRouteChange: true,
        noVistosWrite: true,
        planner: "deterministic-controlled-test-dataset",
        plannerReason: plan.reason,
        sms: "disabled",
        rcs: "disabled"
      })
    ),
    db.prepare(`
      INSERT INTO collection_route_test_incident_actions (
        id, workflow_id, action_type, status, dedupe_key,
        logical_recipient_name, logical_recipient_email, actual_recipient,
        due_at, created_at, updated_at, payload_json
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      actionId,
      workflowId,
      isDispatcher ? "dispatcher_email" : "customer_recovery_email",
      `${workflowId}:initial-email`,
      cleanString(preview.logicalRecipient?.name),
      cleanString(preview.logicalRecipient?.email),
      protectedRecipient({ COLLECTION_ROUTES_TEST_EMAIL_TO: preview.__protectedRecipient }, true),
      now,
      now,
      now,
      jsonString({ subject: message.subject, body: message.body, protectedTestOnly: true })
    )
  ];

  if (recoveryStopId) {
    statements.push(db.prepare(`
      INSERT INTO collection_route_test_recovery_stops (
        id, workflow_id, source_stop_id, route_date, vehicle_code, vehicle_registration,
        vehicle_label, planned_eta_at, status, free_of_charge, route_overlay,
        created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned-test', 1, 1, ?, ?, ?)
    `).bind(
      recoveryStopId,
      workflowId,
      cleanString(incident.stop_id),
      cleanString(plan.candidate.routeDate),
      cleanString(plan.candidate.vehicleCode),
      cleanString(plan.candidate.vehicleRegistration),
      cleanString(plan.candidate.vehicleLabel),
      cleanString(plan.candidate.etaAt),
      now,
      now,
      jsonString({
        dataScope: "test",
        source: "controlled-test-route-dataset",
        extraordinary: true,
        freeOfCharge: true,
        operationalRouteChanged: false
      })
    ));
  }

  if (reminderActionId) {
    statements.push(db.prepare(`
      INSERT INTO collection_route_test_incident_actions (
        id, workflow_id, action_type, status, dedupe_key,
        logical_recipient_name, logical_recipient_email, actual_recipient,
        due_at, created_at, updated_at, payload_json
      ) VALUES (?, ?, 'customer_standard_reminder', 'scheduled', ?, ?, '', ?, ?, ?, ?, ?)
    `).bind(
      reminderActionId,
      workflowId,
      `${workflowId}:standard-reminder`,
      cleanString(preview.logicalRecipient?.name),
      protectedRecipient({ COLLECTION_ROUTES_TEST_EMAIL_TO: preview.__protectedRecipient }, true),
      cleanString(plan.testReminderDueAt),
      now,
      now,
      jsonString({
        policyReminderDueAt: plan.policyReminderDueAt,
        testReminderDueAt: plan.testReminderDueAt,
        acceleratedTestClock: true,
        liveRuleMinutesBefore: 30,
        protectedTestOnly: true
      })
    ));
  }
  return statements;
}

export async function confirmCollectionRoutesTestIncidentWorkflow(env, user, incidentId, input = {}, options = {}) {
  try {
    assertCollectionRoutesTestManager(user);
    if (cleanString(input.confirmation) !== CONFIRMATION) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Finální TEST e-mail a plán vyžadují velké fyzické potvrzení člověka.",
        400,
        "collection_routes_test_incident_workflow_confirmation_required"
      );
    }
    const db = collectionRoutesTestDatabase(env, true);
    const incident = await loadIncidentContext(db, incidentId, user);
    const stored = await existingWorkflow(db, cleanString(incidentId));
    if (stored) return { workflow: await loadWorkflowDetail(db, stored), reused: true };
    const preview = await previewCollectionRoutesTestIncidentWorkflow(env, user, incidentId, input, options);
    if (!preview.canConfirm) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        preview.blockers.join(" ") || "TEST workflow nelze bezpečně potvrdit.",
        409,
        "collection_routes_test_incident_workflow_blocked"
      );
    }
    if (cleanString(input.idempotencyKey) !== cleanString(preview.idempotencyKey)) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Náhled se změnil. Otevři jej znovu a potvrď aktuální stav.",
        409,
        "collection_routes_test_incident_workflow_preview_changed"
      );
    }
    const protectedTo = protectedRecipient(env, true);
    preview.__protectedRecipient = protectedTo;
    const isDispatcher = cleanString(incident.incident_type) !== "site_inaccessible";
    const message = await composeCollectionRouteIncidentMessage(env, {
      audience: isDispatcher ? "dispatcher" : "customer-recovery",
      incidentType: cleanString(incident.incident_type),
      recoveryBranch: preview.plan.branch,
      customerName: cleanString(incident.customer_name),
      stationName: cleanString(incident.station_name),
      address: cleanString(incident.address_text),
      eventAt: cleanString(incident.created_at),
      etaAt: cleanString(preview.plan.candidate?.etaAt),
      nextStandardPickupAt: cleanString(preview.plan.nextStandardPickupAt),
      dispatcherName: cleanString(preview.dispatcher?.name),
      testerName: cleanString(incident.created_by_name),
      note: cleanString(incident.note)
    }, options);
    const currentActor = actor(user);
    const now = nowIso();
    const workflowId = randomId("collection-route-test-incident-workflow");
    const actionId = randomId("collection-route-test-incident-action");
    const recoveryStopId = preview.plan.branch === "route-within-24h"
      ? randomId("collection-route-test-recovery-stop")
      : "";
    const reminderActionId = preview.plan.branch === "next-standard-pickup"
      ? randomId("collection-route-test-incident-action")
      : "";
    await db.batch(workflowInsertStatements(db, {
      incident,
      preview,
      workflowId,
      actionId,
      reminderActionId,
      recoveryStopId,
      message,
      user: currentActor,
      now
    }));

    const claimToken = randomId("test-email-claim");
    const claimed = await claimEmailGuard(db, actionId, claimToken, now);
    if (!claimed) {
      await db.batch([
        db.prepare(`UPDATE collection_route_test_incident_actions SET status = 'skipped', error_message = 'Pevný limit šesti TEST e-mailů byl vyčerpán.', updated_at = ? WHERE id = ?`).bind(now, actionId),
        db.prepare(`UPDATE collection_route_test_incident_workflows SET status = 'blocked-test', last_error = 'Pevný limit šesti TEST e-mailů byl vyčerpán.', updated_at = ? WHERE id = ?`).bind(now, workflowId)
      ]);
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Pevný limit šesti TEST e-mailových pokusů byl vyčerpán. Nic se neodeslalo.",
        409,
        "collection_routes_test_incident_email_limit_reached"
      );
    }

    const attachment = await incidentPhotoAttachment(env, incident);
    const emailInput = {
      to: protectedTo,
      workflowId,
      subject: message.subject,
      body: message.body,
      logicalRecipientName: cleanString(preview.logicalRecipient?.name),
      logicalRecipientEmail: cleanString(preview.logicalRecipient?.email),
      incidentLabel: incidentTypeLabel(incident.incident_type),
      stationName: cleanString(incident.station_name),
      address: cleanString(incident.address_text),
      workflowLabel: preview.plan.reason,
      attachments: [attachment]
    };
    const sendDispatcher = options.sendDispatcherEmail || sendCollectionRouteIncidentDispatcherTestEmail;
    const sendCustomer = options.sendCustomerEmail || sendCollectionRouteIncidentCustomerTestEmail;
    const sendResult = isDispatcher
      ? await sendDispatcher(env, emailInput)
      : await sendCustomer(env, emailInput);
    const emailStatus = await finishEmailAction(db, actionId, sendResult, nowIso());
    const completedAt = nowIso();
    const incidentMetadata = {
      ...parseJson(incident.metadata_json, {}),
      workflowId,
      protectedTestEmailOnly: true,
      actualRecipientProtected: true,
      noRealCustomerContact: true,
      noRealDispatcherContact: true,
      noOperationalRouteChange: true,
      noVistosWrite: true
    };
    await db.batch([
      db.prepare(`
        UPDATE collection_route_test_incident_workflows
        SET status = ?, dispatcher_email_status = ?, customer_email_status = ?,
          reminder_status = ?, recovery_stop_id = ?, last_error = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        emailStatus === "sent" ? "completed-test" : "failed-test",
        isDispatcher ? emailStatus : "not-required",
        isDispatcher ? "not-required" : emailStatus,
        cleanString(preview.plan.reminderStatus),
        recoveryStopId,
        cleanString(sendResult?.errorMessage),
        completedAt,
        completedAt,
        workflowId
      ),
      db.prepare(`
        UPDATE collection_route_test_incidents
        SET status = ?, updated_at = ?, metadata_json = ?
        WHERE id = ?
      `).bind(
        emailStatus === "sent" ? "workflow-completed-test" : "workflow-failed-test",
        completedAt,
        jsonString(incidentMetadata),
        incident.id
      ),
      db.prepare(`
        INSERT INTO collection_route_test_incident_events (
          id, incident_id, run_id, stop_id, event_type, actor_user_id, actor_name, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-route-test-incident-event"),
        incident.id,
        incident.run_id,
        incident.stop_id,
        emailStatus === "sent" ? "workflow-confirmed-protected-test" : "workflow-email-failed-test",
        currentActor.id,
        currentActor.name,
        completedAt,
        jsonString({ workflowId, emailStatus, recoveryBranch: preview.plan.branch, protectedTestOnly: true })
      )
    ]);
    const row = await db.prepare(`SELECT * FROM collection_route_test_incident_workflows WHERE id = ? LIMIT 1`).bind(workflowId).first();
    return { workflow: await loadWorkflowDetail(db, row), reused: false };
  } catch (error) {
    throw workflowError(error);
  }
}

export async function getCollectionRoutesTestIncidentWorkflow(env, user, incidentId) {
  try {
    assertCollectionRoutesTestManager(user);
    const db = collectionRoutesTestDatabase(env, true);
    await loadIncidentContext(db, incidentId, user, { requireActiveTester: false });
    const row = await existingWorkflow(db, cleanString(incidentId));
    return row ? await loadWorkflowDetail(db, row) : null;
  } catch (error) {
    throw workflowError(error);
  }
}

export async function listCollectionRoutesTestIncidentWorkflows(env, user, runId) {
  try {
    assertCollectionRoutesTestManager(user);
    const db = collectionRoutesTestDatabase(env, true);
    const result = await db.prepare(`
      SELECT * FROM collection_route_test_incident_workflows WHERE run_id = ? ORDER BY created_at DESC
    `).bind(cleanString(runId)).all();
    const workflows = [];
    for (const row of result.results || []) workflows.push(await loadWorkflowDetail(db, row));
    return workflows;
  } catch (error) {
    throw workflowError(error);
  }
}

async function sendReplyAction(env, db, workflowRow, incident, message, actionType, logicalRecipient, options = {}) {
  const now = nowIso();
  const actionId = randomId("collection-route-test-incident-action");
  await db.prepare(`
    INSERT INTO collection_route_test_incident_actions (
      id, workflow_id, action_type, status, dedupe_key, logical_recipient_name,
      logical_recipient_email, actual_recipient, due_at, created_at, updated_at, payload_json
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    actionId,
    workflowRow.id,
    actionType,
    `${workflowRow.id}:${actionType}:${cleanString(options.idempotencyKey)}`,
    cleanString(logicalRecipient.name),
    cleanString(logicalRecipient.email),
    protectedRecipient(env, true),
    now,
    now,
    now,
    jsonString({ subject: message.subject, body: message.body, protectedTestOnly: true })
  ).run();
  const claimed = await claimEmailGuard(db, actionId, randomId("test-email-claim"), now);
  if (!claimed) {
    await db.prepare(`UPDATE collection_route_test_incident_actions SET status = 'skipped', error_message = 'Pevný limit šesti TEST e-mailů byl vyčerpán.', updated_at = ? WHERE id = ?`).bind(now, actionId).run();
    return { status: "skipped", errorMessage: "Pevný limit šesti TEST e-mailů byl vyčerpán.", actionId };
  }
  const common = {
    to: protectedRecipient(env, true),
    workflowId: workflowRow.id,
    subject: message.subject,
    body: message.body,
    logicalRecipientName: cleanString(logicalRecipient.name),
    logicalRecipientEmail: cleanString(logicalRecipient.email),
    incidentLabel: incidentTypeLabel(incident.incident_type),
    stationName: cleanString(incident.station_name),
    address: cleanString(incident.address_text),
    workflowLabel: actionType === "dispatcher_escalation_email" ? "Okamžité předání dispečinku" : "Serverová TEST odpověď"
  };
  const sender = actionType === "dispatcher_escalation_email"
    ? (options.sendDispatcherEmail || sendCollectionRouteIncidentDispatcherTestEmail)
    : (options.sendCustomerEmail || sendCollectionRouteIncidentCustomerTestEmail);
  const result = await sender(env, common);
  const status = await finishEmailAction(db, actionId, result, nowIso());
  return { ...result, status, actionId };
}

export async function simulateCollectionRoutesTestIncidentReply(env, user, incidentId, input = {}, options = {}) {
  try {
    assertCollectionRoutesTestManager(user);
    if (cleanString(input.confirmation) !== REPLY_CONFIRMATION) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Simulovaná odpověď a případný TEST e-mail vyžadují fyzické potvrzení člověka.",
        400,
        "collection_routes_test_incident_reply_confirmation_required"
      );
    }
    const reply = cleanString(input.reply);
    const idempotencyKey = cleanString(input.idempotencyKey);
    if (!reply || !idempotencyKey || reply.length > 1800) {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Chybí platná simulovaná odpověď nebo ochrana proti duplicitě.",
        400,
        "collection_routes_test_incident_reply_invalid"
      );
    }
    const db = collectionRoutesTestDatabase(env, true);
    const incident = await loadIncidentContext(db, incidentId, user, { requireActiveTester: false });
    const workflowRow = await existingWorkflow(db, cleanString(incidentId));
    if (!workflowRow || cleanString(workflowRow.status) !== "completed-test") {
      throw new CollectionRoutesTestIncidentWorkflowError(
        "Nejdřív dokonči chráněný TEST incidentní workflow.",
        409,
        "collection_routes_test_incident_reply_workflow_required"
      );
    }
    const existing = await db.prepare(`
      SELECT * FROM collection_route_test_incident_conversation WHERE idempotency_key = ? LIMIT 1
    `).bind(idempotencyKey).first();
    if (existing) {
      return {
        reused: true,
        classification: cleanString(existing.classification),
        escalationRequired: Number(existing.escalation_required) === 1,
        status: cleanString(existing.status)
      };
    }
    let message = await composeCollectionRouteIncidentMessage(env, {
      audience: "customer-reply",
      incidentType: cleanString(incident.incident_type),
      customerName: cleanString(incident.customer_name),
      stationName: cleanString(incident.station_name),
      address: cleanString(incident.address_text),
      dispatcherName: cleanString(workflowRow.dispatcher_name),
      customerReply: reply
    }, options);
    if (message.escalate) {
      message = {
        ...message,
        subject: `[TEST DISPEČINK] Vyhrocená komunikace · ${cleanString(incident.station_name)}`,
        body: `${cleanString(workflowRow.dispatcher_name)}, zákaznická TEST komunikace byla bezpečnostním pravidlem okamžitě zastavena a předána člověku. Stanoviště: ${cleanString(incident.station_name)}, ${cleanString(incident.address_text)}. Simulovaná zpráva zákazníka: „${reply}“ Automatická odpověď zákazníkovi nebyla odeslána. Prosíme o osobní převzetí komunikace.`
      };
    }
    const currentActor = actor(user);
    const createdAt = nowIso();
    await db.prepare(`
      INSERT INTO collection_route_test_incident_conversation (
        id, workflow_id, direction, body, classification, status, escalation_required,
        idempotency_key, created_by_user_id, created_by_name, created_at, metadata_json
      ) VALUES (?, ?, 'inbound-test', ?, ?, 'recorded-test', ?, ?, ?, ?, ?, ?)
    `).bind(
      randomId("collection-route-test-incident-message"),
      workflowRow.id,
      reply,
      cleanString(message.classification),
      message.escalate ? 1 : 0,
      idempotencyKey,
      currentActor.id,
      currentActor.name,
      createdAt,
      jsonString({ protectedTestOnly: true, aiStatus: message.aiStatus, reason: message.reason })
    ).run();
    const logicalRecipient = message.escalate
      ? { name: cleanString(workflowRow.dispatcher_name), email: cleanString(workflowRow.dispatcher_email) }
      : { name: cleanString(incident.customer_name), email: "" };
    const actionType = message.escalate ? "dispatcher_escalation_email" : "customer_auto_reply_email";
    const sendResult = await sendReplyAction(env, db, workflowRow, incident, message, actionType, logicalRecipient, {
      ...options,
      idempotencyKey
    });
    const finalStatus = sendResult.status === "sent" ? "sent-protected-test" : "failed-test";
    await db.batch([
      db.prepare(`
        INSERT INTO collection_route_test_incident_conversation (
          id, workflow_id, direction, body, classification, status, escalation_required,
          idempotency_key, created_by_user_id, created_by_name, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomId("collection-route-test-incident-message"),
        workflowRow.id,
        message.escalate ? "handoff-test" : "outbound-test",
        cleanString(message.body),
        cleanString(message.classification),
        finalStatus,
        message.escalate ? 1 : 0,
        `${idempotencyKey}:outbound`,
        currentActor.id,
        currentActor.name,
        nowIso(),
        jsonString({ actionId: sendResult.actionId, protectedTestOnly: true })
      ),
      db.prepare(`
        UPDATE collection_route_test_incident_workflows
        SET escalation_status = ?, updated_at = ?, last_error = ?
        WHERE id = ?
      `).bind(
        message.escalate ? "dispatcher-required-test" : "not-required",
        nowIso(),
        cleanString(sendResult.errorMessage),
        workflowRow.id
      )
    ]);
    return {
      reused: false,
      classification: cleanString(message.classification),
      escalationRequired: message.escalate === true,
      actionType,
      sendStatus: sendResult.status,
      dispatcherName: cleanString(workflowRow.dispatcher_name),
      aiStatus: cleanString(message.aiStatus),
      answer: sendResult.status !== "sent"
        ? `Další TEST e-mail se neodeslal: ${cleanString(sendResult.errorMessage || "ochranný limit nebo poskytovatel odeslání zablokoval")}`
        : message.escalate
          ? `Komunikace byla okamžitě předána dispečerce ${cleanString(workflowRow.dispatcher_name)}. Zákazníkovi se automaticky neodpovědělo.`
          : "Serverová AI připravila a na chráněný TEST e-mail odeslala milou odpověď.",
      protectedTestEmailOnly: true,
      sms: "disabled",
      rcs: "disabled"
    };
  } catch (error) {
    throw workflowError(error);
  }
}

export async function processDueCollectionRouteIncidentTestReminders(env, input = {}, options = {}) {
  try {
    const db = collectionRoutesTestDatabase(env, true);
    const now = cleanString(input.now || nowIso());
    const limit = Math.max(1, Math.min(numberValue(input.limit, 10), 25));
    const result = await db.prepare(`
      SELECT a.*, w.incident_id
      FROM collection_route_test_incident_actions a
      JOIN collection_route_test_incident_workflows w ON w.id = a.workflow_id
      WHERE a.action_type = 'customer_standard_reminder'
        AND a.status = 'scheduled'
        AND a.due_at <= ?
      ORDER BY a.due_at ASC
      LIMIT ?
    `).bind(now, limit).all();
    const summary = { checked: (result.results || []).length, sent: 0, failed: 0, skipped: 0, protectedTestOnly: true };
    for (const action of result.results || []) {
      const incident = await loadIncidentContext(db, action.incident_id, null, { requireActiveTester: false });
      const workflowRow = await db.prepare(`SELECT * FROM collection_route_test_incident_workflows WHERE id = ? LIMIT 1`).bind(action.workflow_id).first();
      const claimed = await claimEmailGuard(db, action.id, randomId("test-reminder-claim"), nowIso());
      if (!claimed) {
        await db.batch([
          db.prepare(`UPDATE collection_route_test_incident_actions SET status = 'skipped', error_message = 'Pevný limit šesti TEST e-mailů byl vyčerpán.', updated_at = ? WHERE id = ?`).bind(nowIso(), action.id),
          db.prepare(`UPDATE collection_route_test_incident_workflows SET reminder_status = 'skipped-limit-test', updated_at = ? WHERE id = ?`).bind(nowIso(), workflowRow.id)
        ]);
        summary.skipped += 1;
        continue;
      }
      const message = await composeCollectionRouteIncidentMessage(env, {
        audience: "customer-reminder",
        incidentType: cleanString(incident.incident_type),
        customerName: cleanString(incident.customer_name),
        stationName: cleanString(incident.station_name),
        address: cleanString(incident.address_text),
        nextStandardPickupAt: cleanString(workflowRow.next_standard_pickup_at),
        dispatcherName: cleanString(workflowRow.dispatcher_name)
      }, options);
      const sender = options.sendCustomerEmail || sendCollectionRouteIncidentCustomerTestEmail;
      const sendResult = await sender(env, {
        type: "collection_route_incident_standard_reminder_test_email",
        to: protectedRecipient(env, true),
        workflowId: workflowRow.id,
        subject: message.subject,
        body: message.body,
        logicalRecipientName: cleanString(incident.customer_name),
        logicalRecipientEmail: "",
        incidentLabel: "Připomínka přístupnosti nádob",
        stationName: cleanString(incident.station_name),
        address: cleanString(incident.address_text),
        workflowLabel: "TEST připomínka; živé pravidlo je 30 minut před standardním svozem"
      });
      const status = await finishEmailAction(db, action.id, sendResult, nowIso());
      await db.prepare(`
        UPDATE collection_route_test_incident_workflows SET reminder_status = ?, updated_at = ?, last_error = ? WHERE id = ?
      `).bind(status === "sent" ? "sent-protected-test" : "failed-test", nowIso(), cleanString(sendResult.errorMessage), workflowRow.id).run();
      if (status === "sent") summary.sent += 1;
      else summary.failed += 1;
    }
    return summary;
  } catch (error) {
    throw workflowError(error);
  }
}

export const __test = {
  ALLOWED_SCENARIOS,
  CONFIRMATION,
  DISPATCHER_ORDER,
  EMAIL_GUARD_KEY,
  REPLY_CONFIRMATION,
  deterministicRecoveryPlan,
  incidentTypeLabel,
  nextStandardPickupAt,
  normalizeText,
  pragueDate,
  rowToWorkflow,
  workflowIdempotency
};
