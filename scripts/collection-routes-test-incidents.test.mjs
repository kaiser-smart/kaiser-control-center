import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  getCollectionRoutesTestIncidentPhoto,
  listCollectionRoutesTestIncidents,
  reportCollectionRoutesTestIncident
} from "../functions/_lib/collection-routes-test-incidents-store.js";
import {
  __test as incidentApiTest,
  detectCollectionRouteTestIncidentImageType
} from "../functions/api/collection-routes/test-incidents.js";
import {
  __test as workflowTest,
  confirmCollectionRoutesTestIncidentWorkflow,
  previewCollectionRoutesTestIncidentWorkflow,
  processDueCollectionRouteIncidentTestReminders,
  simulateCollectionRoutesTestIncidentReply
} from "../functions/_lib/collection-routes-test-incident-workflow.js";
import {
  composeCollectionRouteIncidentMessage,
  collectionRouteIncidentFallbackMessage,
  collectionRouteIncidentRequiresEscalation
} from "../functions/_lib/collection-route-incident-ai.js";
import {
  __test as notificationTest,
  sendCollectionRouteIncidentDispatcherLiveEmail,
  sendCollectionRouteIncidentDispatcherLiveSms
} from "../functions/_lib/notification-service.js";

class D1Statement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    assert.ok(values.length <= 100, `D1 statement překročil 100 parametrů: ${values.length}`);
    return new D1Statement(this.owner, this.sql, values);
  }

  async all() {
    return { results: this.owner.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.owner.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.owner.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
    this.deleted = [];
  }

  async put(key, body, options = {}) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body || []);
    this.objects.set(key, {
      body: bytes,
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {}
    });
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

function openDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql",
    "../migrations/test/0005_create_collection_route_test_incidents.sql",
    "../migrations/test/0006_create_collection_route_test_incident_workflows.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

function seedRoute(sqlite) {
  const summary = JSON.stringify({
    customerName: "Firma test 501",
    stationName: "Firma test 501 · stanoviště Trnkova",
    addressPlaceRaw: "Trnkova 3052/137, 628 00 Brno"
  });
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count,
      issue_count, created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES ('batch-test', 'synthetic-test', 'synthetic-brno-test', 'preview', 'ready', '', 1, 0, 'manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '{}')
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES ('row-test', 'batch-test', 501, 'SyntheticSite', 'test-field-site-501', 'preview', ?, '[]', CURRENT_TIMESTAMP)
  `).run(summary);
  sqlite.prepare(`
    INSERT INTO collection_daily_route_runs (
      id, route_key, source_batch_id, source_mode, route_date, route_day_code,
      route_week_mode, vehicle_code, vehicle_registration, vehicle_label,
      driver_user_id, driver_name, title, status, stop_count, metadata_json
    ) VALUES (
      'run-test', '2026-07-15|FIELD|stationary-field-test', 'batch-test', 'synthetic-brno-test', '2026-07-15', 'ST',
      'odd-even', 'FIELD', '', 'Stacionární TEST tabletu',
      '', '', 'Stacionární TEST incidentů', 'active', 1,
      '{"dataScope":"test","testMode":"stationary-field-test","fieldTesterUserId":"manager-test","fieldTesterName":"Tomáš Gáži","sendsNotifications":false}'
    )
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order,
      customer_name, address_text, station_name, status, source_summary_json
    ) VALUES (
      'stop-test', 'run-test', '2026-07-15', 'batch-test', 'row-test', 1,
      'Firma test 501', 'Trnkova 3052/137, 628 00 Brno', 'Firma test 501 · stanoviště Trnkova', 'planned', ?
    )
  `).run(summary);
  sqlite.prepare("UPDATE collection_daily_route_stops SET waste_type = 'SKO', waste_code = '200301', container_volume = 120, container_count = 1, frequency = '1x7', pickup_days_text = 'středa lichá, středa sudá' WHERE id = 'stop-test'").run();
}

function openProductionDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_create_users.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0004_create_employee_cards.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0006_create_absence_requests.sql", import.meta.url), "utf8"));
  for (const [id, firstName, lastName, email, phone, status = "v práci"] of [
    ["employee-lenka", "Lenka", "Kouřilová", "lenka@example.invalid", "+420601000001"],
    ["employee-ulyana", "Ulyana", "Bartošová", "ulyana@example.invalid", "+420601000002"],
    ["employee-simona", "Simona", "Šefčíková", "simona@example.invalid", "+420601000003", "dovolená"]
  ]) {
    sqlite.prepare(`
      INSERT INTO users (
        id, name, email, phone, role, status, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'management', 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(`${id}-user`, `${firstName} ${lastName}`, email, phone);
    sqlite.prepare(`
      INSERT INTO employee_cards (
        id, user_id, first_name, last_name, email, role, department, position,
        employment_status, current_absence_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'management', 'Provoz', 'Dispečerka', 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, `${id}-user`, firstName, lastName, email, status);
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

const manager = {
  id: "manager-test",
  name: "Manager Test",
  email: "manager@example.invalid",
  role: "management",
  status: "active",
  active: true
};

const otherManager = {
  id: "other-manager",
  name: "Jiný Manager",
  role: "management",
  status: "active",
  active: true
};

const driver = {
  id: "driver-test",
  name: "Řidič Test",
  role: "ridic",
  status: "active",
  active: true
};

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

assert.equal(detectCollectionRouteTestIncidentImageType(jpeg), "image/jpeg");
assert.equal(detectCollectionRouteTestIncidentImageType(png), "image/png");
assert.equal(detectCollectionRouteTestIncidentImageType(webp), "image/webp");
assert.equal(detectCollectionRouteTestIncidentImageType(new Uint8Array([1, 2, 3])), "");
assert.equal(incidentApiTest.MAX_PHOTO_SIZE_BYTES, 6 * 1024 * 1024);

{
  const { sqlite, d1 } = openDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  const env = { COLLECTION_ROUTES_TEST_DB: d1, SMART_ODPADY_DOCUMENTS: bucket };

  await assert.rejects(
    reportCollectionRoutesTestIncident(env, driver, {}, {}),
    (error) => error?.code === "collection_routes_test_forbidden" && error?.status === 403
  );
  await assert.rejects(
    reportCollectionRoutesTestIncident(env, otherManager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "overfilled_container",
      idempotencyKey: "wrong-tester"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_field_tester_mismatch"
  );

  const saved = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "overfilled_container",
    note: "Přeplněná nádoba vedle vjezdu.",
    idempotencyKey: "incident-one"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });

  assert.equal(saved.reused, false);
  assert.equal(saved.incident.type, "overfilled_container");
  assert.equal(saved.incident.typeLabel, "Přeplněná nádoba");
  assert.equal(saved.incident.status, "recorded-test");
  assert.equal(saved.incident.createdByUserId, manager.id);
  assert.equal(saved.incident.createdByName, "Tomáš Gáži", "Oznamovatel se musí převzít z uzamčeného terénního TESTU, ne z názvu aktuální session.");
  assert.equal(saved.incident.metadata.reporterSource, "stationary-field-test-run");
  assert.equal(saved.incident.metadata.noNotifications, true);
  assert.equal(saved.incident.metadata.noCustomerContact, true);
  assert.equal(saved.incident.metadata.noRouteChange, true);
  assert.match(saved.incident.photoUrl, /^\/api\/collection-routes\/test-incidents\/.+\/photo$/);
  assert.equal(bucket.objects.size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incidents").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incident_events").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events WHERE event_type = 'test_incident_reported'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT status FROM collection_daily_route_stops WHERE id = 'stop-test'").get().status, "planned");

  const repeated = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "overfilled_container",
    idempotencyKey: "incident-one"
  });
  assert.equal(repeated.reused, true);
  assert.equal(bucket.objects.size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incidents").get().count, 1);

  await assert.rejects(
    reportCollectionRoutesTestIncident(env, manager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "damaged_container",
      idempotencyKey: "incident-one"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_idempotency_conflict"
  );

  const list = await listCollectionRoutesTestIncidents(env, manager, { runId: "run-test" });
  assert.equal(list.incidents.length, 1);
  assert.equal(list.sendsNotifications, false);
  assert.equal(list.changesRoute, false);

  const photo = await getCollectionRoutesTestIncidentPhoto(env, manager, saved.incident.id);
  assert.equal(photo.contentType, "image/jpeg");
  assert.deepEqual(Array.from(photo.body), Array.from(jpeg));
}

{
  const { sqlite, d1 } = openDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  d1.batch = async () => {
    throw new Error("forced D1 failure");
  };
  const env = { COLLECTION_ROUTES_TEST_DB: d1, SMART_ODPADY_DOCUMENTS: bucket };
  await assert.rejects(
    reportCollectionRoutesTestIncident(env, manager, {
      runId: "run-test",
      stopId: "stop-test",
      type: "site_inaccessible",
      idempotencyKey: "incident-cleanup"
    }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length }),
    (error) => error?.code === "collection_routes_test_incident_store_failed"
  );
  assert.equal(bucket.objects.size, 0, "R2 fotografie se při chybě D1 musí odstranit.");
  assert.equal(bucket.deleted.length, 1);
}

assert.equal(collectionRouteIncidentRequiresEscalation("Předám to právníkovi a médiím."), true);
assert.equal(collectionRouteIncidentRequiresEscalation("Děkuji, nádoby budou přístupné."), false);
assert.equal(
  notificationTest.protectedCollectionRouteIncidentRecipient(
    { COLLECTION_ROUTES_TEST_EMAIL_TO: "protected@example.invalid" },
    "customer@example.invalid"
  ).ok,
  false,
  "Incidentní e-mail nesmí přijmout jiného než chráněného TEST příjemce."
);
assert.equal(
  notificationTest.protectedCollectionRouteIncidentRecipient(
    { COLLECTION_ROUTES_TEST_EMAIL_TO: "protected@example.invalid" },
    "protected@example.invalid"
  ).ok,
  true
);
const dispatcherSms = notificationTest.collectionRouteIncidentLiveDispatcherSmsBody({
  incidentLabel: "Poškozená nádoba",
  stationName: "Firma test 501",
  address: "Trnkova 3052/137, Brno",
  testerName: "Tomáš Gáži"
});
assert.match(dispatcherSms, /^KSO: Poskozena nadoba, Firma test 501\. Hlasi Tomas Gazi\./);
assert.match(dispatcherSms, /Foto\/detail v e-mailu/);
assert.match(dispatcherSms, /Bez kontaktu zakaznika; trasa\/Vistos beze zmen\.$/);
assert.equal(dispatcherSms.length <= 160, true, "Interní SMS musí zůstat v jediném 160znakovém segmentu.");
assert.doesNotMatch(dispatcherSms, /[^\x20-\x7e]/, "Interní SMS musí být bez Unicode znaků prodražujících segmentaci.");
const dispatcherEmailHtml = notificationTest.collectionRouteIncidentLiveDispatcherEmailHtml({
  subject: "[OVĚŘOVACÍ TEST KSO] Poškozená nádoba",
  body: "Lenka Kouřilová, poškozená nádoba na stanovišti Firma test 501. Nahlásil: Tomáš Gáži. Fotografie je přiložená.",
  recipientName: "Lenka Kouřilová",
  incidentLabel: "Poškozená nádoba",
  stationName: "Firma test 501 · stanoviště Trnkova",
  address: "Trnkova 3052/137, 628 00 Brno",
  testerName: "Tomáš Gáži",
  workflowLabel: "Předání dispečinku"
});
assert.match(dispatcherEmailHtml, /kaiser\./, "Incidentní e-mail musí používat schválenou značku Kaiser.");
assert.match(dispatcherEmailHtml, /font-family:'Quicksand',Arial,Helvetica,sans-serif/, "Incidentní e-mail musí používat schválenou typografii.");
assert.match(dispatcherEmailHtml, /max-width:640px/, "Incidentní e-mail musí používat schválenou šířku karty.");
assert.match(dispatcherEmailHtml, /@media only screen and \(max-width:520px\)/, "Incidentní e-mail musí mít mobilní pravidla.");
assert.match(dispatcherEmailHtml, /table-layout:fixed/, "Incidentní e-mail se na úzkém displeji nesmí roztáhnout mimo kartu.");
assert.match(dispatcherEmailHtml, /background:#75bd25/, "Incidentní e-mail musí používat schválenou zelenou značku.");
assert.match(dispatcherEmailHtml, /Nahlásil<\/td>[\s\S]*Tomáš Gáži/, "Incidentní e-mail musí uvést skutečného terénního testera.");
assert.doesNotMatch(dispatcherEmailHtml, /border:2px solid/, "Provizorní incidentní grafika se nesmí vrátit.");
assert.doesNotMatch(dispatcherEmailHtml, /font-family:Arial,sans-serif/, "Provizorní systémová typografie se nesmí vrátit.");
const protectedEmailHtml = notificationTest.collectionRouteIncidentEmailHtml({
  subject: "[TEST SVOZ] Nepřístupné nádoby",
  body: "Dobrý den, toto je chráněný TEST.",
  logicalRecipientName: "Firma test 501",
  incidentLabel: "Nepřístupné nádoby",
  stationName: "Firma test 501 · stanoviště Trnkova",
  address: "Trnkova 3052/137, 628 00 Brno",
  workflowLabel: "Bez kontaktu zákazníka"
});
assert.match(protectedEmailHtml, /kaiser\./);
assert.match(protectedEmailHtml, /CHRÁNĚNÝ TEST · BEZ KONTAKTU ZÁKAZNÍKA/);
assert.doesNotMatch(protectedEmailHtml, /border:2px solid/);
assert.equal(
  (await sendCollectionRouteIncidentDispatcherLiveEmail({}, {
    to: "lenka@example.invalid",
    ksoRecipientVerified: false
  })).status,
  "skipped",
  "Ostrý interní e-mail nesmí přijmout příjemce neověřeného backendem KSO."
);
assert.equal(
  (await sendCollectionRouteIncidentDispatcherLiveSms({}, {
    to: "+420601000001",
    ksoRecipientVerified: false
  })).status,
  "skipped",
  "Ostrá interní SMS nesmí přijmout příjemce neověřeného backendem KSO."
);
assert.match(
  collectionRouteIncidentFallbackMessage({
    audience: "customer-recovery",
    recoveryBranch: "route-within-24h",
    stationName: "Trnkova",
    eventAt: "2026-07-15T08:00:00.000Z",
    etaAt: "2026-07-16T07:00:00.000Z"
  }).body,
  /mimořádný bezplatný svoz/i
);

{
  let requestBody = null;
  const generated = await composeCollectionRouteIncidentMessage({ OPENAI_API_KEY: "server-test-key" }, {
    audience: "customer-recovery",
    incidentType: "site_inaccessible",
    recoveryBranch: "route-within-24h",
    stationName: "Firma test 501",
    eventAt: "2026-07-15T08:00:00.000Z",
    etaAt: "2026-07-16T07:00:00.000Z"
  }, {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          subject: "[TEST SVOZ] Náhradní svoz",
          body: "Dobrý den, zítra přijedeme v potvrzeném TEST čase.",
          classification: "normal",
          escalate: false,
          reason: "friendly-copy"
        })
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(generated.aiStatus, "generated");
  assert.equal(generated.escalate, false);
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.match(requestBody.instructions, /Nikdy neměň zadaný výsledek plánování/);
}

{
  let called = false;
  const escalated = await composeCollectionRouteIncidentMessage({ OPENAI_API_KEY: "server-test-key" }, {
    audience: "customer-reply",
    customerReply: "Předám to právníkovi a médiím."
  }, {
    fetchImpl: async () => {
      called = true;
      throw new Error("must not call");
    }
  });
  assert.equal(called, false, "Deterministická eskalace musí mít před AI přednost.");
  assert.equal(escalated.escalate, true);
  assert.equal(escalated.aiStatus, "skipped-safety-escalation");
}

{
  const { sqlite, d1 } = openDatabase();
  const production = openProductionDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  const sent = [];
  const sentSms = [];
  const mockSend = async (_env, input) => {
    sent.push(input);
    return { status: "sent", providerMessageId: `sendgrid-test-${sent.length}` };
  };
  const mockSms = async (_env, input) => {
    sentSms.push(input);
    return { status: "sent", providerMessageId: `twilio-test-${sentSms.length}`, providerStatus: "accepted" };
  };
  const env = {
    COLLECTION_ROUTES_TEST_DB: d1,
    SMART_ODPADY_DB: production.d1,
    SMART_ODPADY_DOCUMENTS: bucket,
    COLLECTION_ROUTES_TEST_EMAIL_TO: "protected-test@example.invalid",
    APP_ENV: "production",
    COLLECTION_ROUTES_INCIDENT_DISPATCH_MODE: workflowTest.LIVE_DISPATCH_MODE
  };
  const fixedNow = "2026-07-15T10:00:00.000Z";
  const options = {
    now: fixedNow,
    sendDispatcherEmail: mockSend,
    sendDispatcherSms: mockSms,
    sendCustomerEmail: mockSend
  };

  const damaged = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "damaged_container",
    note: "Prasklé víko.",
    idempotencyKey: "workflow-damaged"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });
  const damagedPreview = await previewCollectionRoutesTestIncidentWorkflow(env, manager, damaged.incident.id, {}, options);
  assert.equal(damagedPreview.dispatcher.name, "Lenka Kouřilová");
  assert.equal(damagedPreview.plan.branch, "dispatcher-only");
  assert.equal(damagedPreview.canConfirm, true);
  assert.equal(damagedPreview.finalTapRequired, true);
  assert.equal(damagedPreview.liveDispatcherNotification, true);
  assert.equal(damagedPreview.protectedTestEmailOnly, false);
  assert.equal(damagedPreview.sms, "live-internal");
  assert.equal(damagedPreview.expectedSmsCount, 1);
  assert.equal(damagedPreview.rcs, "disabled");
  assert.match(damagedPreview.actualRecipientLabel, /Skutečný interní e-mail a SMS.*Lenka Kouřilová/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incident_workflows").get().count, 0, "Preview nesmí zapisovat workflow.");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incident_email_guard WHERE guard_key = ?").get(workflowTest.LIVE_DISPATCH_GUARD_KEY).count, 0, "Preview nesmí zapisovat ostrý guard.");

  await assert.rejects(
    confirmCollectionRoutesTestIncidentWorkflow(env, manager, damaged.incident.id, {
      confirmation: "wrong",
      idempotencyKey: damagedPreview.idempotencyKey
    }, options),
    (error) => error?.code === "collection_routes_test_incident_workflow_confirmation_required"
  );

  const damagedResult = await confirmCollectionRoutesTestIncidentWorkflow(env, manager, damaged.incident.id, {
    confirmation: workflowTest.CONFIRMATION,
    idempotencyKey: damagedPreview.idempotencyKey
  }, options);
  assert.equal(damagedResult.workflow.status, "completed-live-internal");
  assert.equal(damagedResult.workflow.dispatcherEmailStatus, "sent");
  assert.equal(damagedResult.workflow.dispatcherSmsStatus, "sent");
  assert.equal(damagedResult.workflow.liveDispatcherNotification, true);
  assert.equal(damagedResult.workflow.changesOperationalRoute, false);
  assert.equal(sent.length, 1);
  assert.equal(sentSms.length, 1);
  assert.equal(sent[0].to, "lenka@example.invalid");
  assert.equal(sentSms[0].to, "+420601000001");
  assert.equal(sent[0].ksoRecipientVerified, true);
  assert.equal(sentSms[0].ksoRecipientVerified, true);
  assert.equal(sent[0].logicalRecipientName, "Lenka Kouřilová");
  assert.equal(sent[0].attachments.length, 1);
  assert.equal(sqlite.prepare("SELECT claimed_count FROM collection_route_test_incident_email_guard WHERE guard_key = ?").get(workflowTest.LIVE_DISPATCH_GUARD_KEY).claimed_count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_incident_actions WHERE workflow_id = ?").get(damagedResult.workflow.id).count, 2);

  const damagedRepeated = await confirmCollectionRoutesTestIncidentWorkflow(env, manager, damaged.incident.id, {
    confirmation: workflowTest.CONFIRMATION,
    idempotencyKey: damagedPreview.idempotencyKey
  }, options);
  assert.equal(damagedRepeated.reused, true);
  assert.equal(sent.length, 1, "Opakované potvrzení nesmí poslat druhý e-mail.");
  assert.equal(sentSms.length, 1, "Opakované potvrzení nesmí poslat druhou SMS.");

  const inaccessibleRoute = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "site_inaccessible",
    note: "Před nádobami stojí auto.",
    idempotencyKey: "workflow-inaccessible-route"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });
  const routePreview = await previewCollectionRoutesTestIncidentWorkflow(env, manager, inaccessibleRoute.incident.id, {
    testScenario: "route_within_24h"
  }, options);
  assert.equal(routePreview.plan.branch, "route-within-24h");
  assert.equal(routePreview.liveDispatcherNotification, false);
  assert.equal(routePreview.protectedTestEmailOnly, true);
  assert.equal(routePreview.sms, "disabled");
  assert.equal(routePreview.createsTestRouteOverlay, true);
  assert.equal(routePreview.plan.candidate.vehicleRegistration, "1BP 8373");
  const routeResult = await confirmCollectionRoutesTestIncidentWorkflow(env, manager, inaccessibleRoute.incident.id, {
    testScenario: "route_within_24h",
    confirmation: workflowTest.CONFIRMATION,
    idempotencyKey: routePreview.idempotencyKey
  }, options);
  assert.equal(routeResult.workflow.recoveryStop.freeOfCharge, true);
  assert.equal(routeResult.workflow.recoveryStop.routeOverlay, true);
  assert.equal(routeResult.workflow.customerEmailStatus, "sent");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_recovery_stops").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_stops").get().count, 1, "TEST overlay nesmí přepsat skutečnou denní trasu.");

  const inaccessibleStandard = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "site_inaccessible",
    note: "Brána je zamčená.",
    idempotencyKey: "workflow-inaccessible-standard"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });
  const standardPreview = await previewCollectionRoutesTestIncidentWorkflow(env, manager, inaccessibleStandard.incident.id, {
    testScenario: "next_standard_pickup"
  }, options);
  assert.equal(standardPreview.plan.branch, "next-standard-pickup");
  assert.equal(
    new Date(standardPreview.plan.nextStandardPickupAt).getTime() - new Date(standardPreview.plan.policyReminderDueAt).getTime(),
    30 * 60 * 1000
  );
  const standardResult = await confirmCollectionRoutesTestIncidentWorkflow(env, manager, inaccessibleStandard.incident.id, {
    testScenario: "next_standard_pickup",
    confirmation: workflowTest.CONFIRMATION,
    idempotencyKey: standardPreview.idempotencyKey
  }, options);
  assert.equal(standardResult.workflow.reminderStatus, "scheduled-test");
  assert.equal(sent.length, 3);

  const reminderSummary = await processDueCollectionRouteIncidentTestReminders(env, {
    now: new Date(new Date(standardResult.workflow.testReminderDueAt).getTime() + 1000).toISOString()
  }, options);
  assert.deepEqual(
    { checked: reminderSummary.checked, sent: reminderSummary.sent, failed: reminderSummary.failed, skipped: reminderSummary.skipped },
    { checked: 1, sent: 1, failed: 0, skipped: 0 }
  );
  assert.equal(sent.length, 4);

  const calmReply = await simulateCollectionRoutesTestIncidentReply(env, manager, inaccessibleStandard.incident.id, {
    reply: "Děkuji, nádoby budou přístupné.",
    confirmation: workflowTest.REPLY_CONFIRMATION,
    idempotencyKey: "reply-calm"
  }, options);
  assert.equal(calmReply.escalationRequired, false);
  assert.equal(calmReply.actionType, "customer_auto_reply_email");
  assert.equal(calmReply.sendStatus, "sent");

  const heatedReply = await simulateCollectionRoutesTestIncidentReply(env, manager, inaccessibleStandard.incident.id, {
    reply: "Podám stížnost, předám to právníkovi a médiím.",
    confirmation: workflowTest.REPLY_CONFIRMATION,
    idempotencyKey: "reply-heated"
  }, options);
  assert.equal(heatedReply.escalationRequired, true);
  assert.equal(heatedReply.actionType, "dispatcher_escalation_email");
  assert.equal(heatedReply.sendStatus, "sent");
  assert.match(heatedReply.answer, /předána dispečerce/i);
  assert.equal(sent.length, 6);
  assert.equal(sqlite.prepare("SELECT claimed_count FROM collection_route_test_incident_email_guard WHERE guard_key = ?").get(workflowTest.EMAIL_GUARD_KEY).claimed_count, 5);

  const finalAllowedReply = await simulateCollectionRoutesTestIncidentReply(env, manager, inaccessibleStandard.incident.id, {
    reply: "Děkuji za další vysvětlení.",
    confirmation: workflowTest.REPLY_CONFIRMATION,
    idempotencyKey: "reply-final-allowed"
  }, options);
  assert.equal(finalAllowedReply.sendStatus, "sent");
  assert.equal(sent.length, 7);
  assert.equal(sqlite.prepare("SELECT claimed_count FROM collection_route_test_incident_email_guard WHERE guard_key = ?").get(workflowTest.EMAIL_GUARD_KEY).claimed_count, 6);

  const limitedReply = await simulateCollectionRoutesTestIncidentReply(env, manager, inaccessibleStandard.incident.id, {
    reply: "Ještě jednou děkuji.",
    confirmation: workflowTest.REPLY_CONFIRMATION,
    idempotencyKey: "reply-over-limit"
  }, options);
  assert.equal(limitedReply.sendStatus, "skipped");
  assert.equal(sent.length, 7, "Ochranný limit nesmí pustit sedmý chráněný TEST e-mail.");
  assert.equal(sentSms.length, 1, "Chráněná zákaznická větev nesmí poslat SMS.");
}

{
  const { sqlite, d1 } = openDatabase();
  const production = openProductionDatabase();
  seedRoute(sqlite);
  const bucket = new FakeR2Bucket();
  const env = {
    COLLECTION_ROUTES_TEST_DB: d1,
    SMART_ODPADY_DB: production.d1,
    SMART_ODPADY_DOCUMENTS: bucket,
    APP_ENV: "production"
  };
  const incident = await reportCollectionRoutesTestIncident(env, manager, {
    runId: "run-test",
    stopId: "stop-test",
    type: "overfilled_container",
    idempotencyKey: "workflow-live-mode-and-partial"
  }, { body: jpeg, contentType: "image/jpeg", sizeBytes: jpeg.length });
  const blockedPreview = await previewCollectionRoutesTestIncidentWorkflow(env, manager, incident.incident.id, {});
  assert.equal(blockedPreview.canConfirm, false);
  assert.match(blockedPreview.blockers.join(" "), /pilot e-mailu a SMS není.*povolený/i);

  env.COLLECTION_ROUTES_INCIDENT_DISPATCH_MODE = workflowTest.LIVE_DISPATCH_MODE;
  const preview = await previewCollectionRoutesTestIncidentWorkflow(env, manager, incident.incident.id, {});
  const result = await confirmCollectionRoutesTestIncidentWorkflow(env, manager, incident.incident.id, {
    confirmation: workflowTest.CONFIRMATION,
    idempotencyKey: preview.idempotencyKey
  }, {
    sendDispatcherEmail: async () => ({ status: "sent", providerMessageId: "sendgrid-partial" }),
    sendDispatcherSms: async () => ({ status: "failed", errorMessage: "Twilio test failure" })
  });
  assert.equal(result.workflow.status, "partial-live-internal");
  assert.equal(result.workflow.dispatcherEmailStatus, "sent");
  assert.equal(result.workflow.dispatcherSmsStatus, "failed");
  assert.match(result.workflow.lastError, /Twilio test failure/);
}

console.log("collection routes TEST incident tests: ok");
