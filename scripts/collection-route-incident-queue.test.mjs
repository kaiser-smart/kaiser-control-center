import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  applyCollectionRouteIncidentAction,
  listCollectionRouteIncidents
} from "../functions/_lib/collection-route-incidents-store.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return { success: true, meta: this.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function createDatabase({ includeLegacyTest = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0017_create_collection_routes_phase1a.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0038_create_collection_daily_routes.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0049_create_collection_route_incident_queue.sql", import.meta.url), "utf8"));
  if (includeLegacyTest) {
    sqlite.exec(readFileSync(new URL("../migrations/test/0005_create_collection_route_test_incidents.sql", import.meta.url), "utf8"));
  }
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count, issue_count,
      created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES ('batch-1', 'test', 'test', 'completed', 'ready', '', 1, 0, 'seed', ?, ?, '{}')
  `).run("2026-07-21T05:00:00.000Z", "2026-07-21T05:01:00.000Z");
  sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES ('row-1', 'batch-1', 1, 'ContractRow', 'source-1', 'preview', ?, '[]', ?)
  `).run(JSON.stringify({ latitude: 49.1951, longitude: 16.6068 }), "2026-07-21T05:00:00.000Z");
  sqlite.prepare(`
    INSERT INTO collection_daily_route_runs (
      id, route_key, source_batch_id, source_mode, route_date, route_day_code, vehicle_code,
      vehicle_label, driver_user_id, driver_name, title, status, stop_count, metadata_json,
      created_by_user_id, created_by_name, created_at, updated_at
    ) VALUES ('run-1', 'route-key-1', 'batch-1', 'test', '2026-07-21', 'ÚT', 'B',
      'Vůz B · 1BP 8373', 'driver-1', 'Mirek', 'Trasa 3', 'active', 1, ?,
      'dispatcher-1', 'Jana Nováková', ?, ?)
  `).run(JSON.stringify({ dataScope: includeLegacyTest ? "test" : "production" }), "2026-07-21T05:00:00.000Z", "2026-07-21T05:00:00.000Z");
  sqlite.prepare(`
    INSERT INTO collection_daily_route_stops (
      id, run_id, route_date, source_batch_id, source_row_id, route_order, customer_name,
      address_text, station_name, waste_type, container_volume, container_count, container_type,
      status, source_summary_json, created_at, updated_at
    ) VALUES ('stop-1', 'run-1', '2026-07-21', 'batch-1', 'row-1', 1, 'PEPCO Czech Republic',
      'nám. Svornosti 2573/6, Brno', 'nám. Svornosti', 'SKO', 1100, 1, 'nádoba',
      'problem', ?, ?, ?)
  `).run(JSON.stringify({ latitude: 49.1951, longitude: 16.6068 }), "2026-07-21T05:42:00.000Z", "2026-07-21T05:42:00.000Z");
  sqlite.prepare(`
    INSERT INTO collection_daily_route_events (
      id, run_id, stop_id, event_type, before_status, after_status, reason, note,
      idempotency_key, actor_user_id, actor_name, created_at, payload_json
    ) VALUES ('incident-1', 'run-1', 'stop-1', 'problem', 'planned', 'problem',
      'Nádoba nebo firma není přístupná', 'Brána je zamčená.', 'report:1', 'driver-1', 'Mirek', ?, ?)
  `).run("2026-07-21T05:42:00.000Z", JSON.stringify({
    workflow: "driver-dispatch-report",
    reportType: "site_inaccessible",
    reportTypeLabel: "Nádoba nebo firma není přístupná",
    photos: [{ url: "/api/photo-1", contentType: "image/jpeg" }],
    dataScope: includeLegacyTest ? "test" : "production"
  }));
  return { sqlite, d1: new D1Database(sqlite) };
}

const dispatcher = {
  id: "dispatcher-1",
  name: "Jana Nováková",
  role: "dispecer",
  status: "active",
  active: true
};
const admin = {
  id: "admin-1",
  name: "Radim",
  role: "admin",
  status: "active",
  active: true
};
const readonlyUser = {
  id: "readonly-1",
  name: "Pouze čtení",
  role: "readonly",
  status: "active",
  active: true
};

const production = createDatabase();
const test = createDatabase({ includeLegacyTest: true });
const env = { SMART_ODPADY_DB: production.d1, COLLECTION_ROUTES_TEST_DB: test.d1 };

await assert.rejects(
  listCollectionRouteIncidents(env, readonlyUser, { scope: "production" }),
  (error) => error.code === "collection_route_incidents_role_forbidden"
);
await assert.rejects(
  listCollectionRouteIncidents(env, dispatcher, { scope: "test" }),
  (error) => error.code === "collection_route_incidents_test_forbidden"
);

const initial = await listCollectionRouteIncidents(env, dispatcher, { scope: "production" });
assert.equal(initial.environment, "production");
assert.equal(initial.counts.new, 1);
assert.equal(initial.counts.unresolved, 1);
assert.equal(initial.incidents[0].companyName, "PEPCO Czech Republic");
assert.deepEqual(initial.incidents[0].map, { latitude: 49.1951, longitude: 16.6068 });
assert.equal(initial.incidents[0].technicalDetails, undefined);

await applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
  scope: "production",
  action: "claim",
  idempotencyKey: "claim:1"
});
let current = await listCollectionRouteIncidents(env, dispatcher, { scope: "production" });
assert.equal(current.incidents[0].status, "claimed");
assert.equal(current.incidents[0].workflow.assignedName, "Jana Nováková");

await assert.rejects(
  applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
    scope: "production",
    action: "contact",
    channel: "email",
    message: "Test",
    idempotencyKey: "contact:production"
  }),
  (error) => error.code === "collection_route_incident_production_contact_disabled"
);

await applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
  scope: "production",
  action: "schedule_next",
  unresolvedReason: "Zákazník nereaguje",
  nextStep: "Zavolat znovu",
  responsibleName: "Jana Nováková",
  followUpAt: "2026-07-22T09:00:00+02:00",
  idempotencyKey: "schedule:1"
});
current = await listCollectionRouteIncidents(env, dispatcher, { scope: "production" });
assert.equal(current.incidents[0].status, "in_progress");
assert.equal(current.incidents[0].workflow.nextStep, "Zavolat znovu");

await assert.rejects(
  applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
    scope: "production",
    action: "resolve",
    customerInformed: "no",
    idempotencyKey: "resolve:missing"
  }),
  (error) => error.code === "collection_route_incident_resolution_required"
);

await applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
  scope: "production",
  action: "resolve",
  resolutionCode: "resolved_on_site",
  customerInformed: "not_needed",
  note: "Brána byla otevřena.",
  idempotencyKey: "resolve:1"
});
current = await listCollectionRouteIncidents(env, dispatcher, { scope: "production" });
assert.equal(current.counts.resolved, 1);
assert.equal(current.counts.unresolved, 0);

await assert.rejects(
  applyCollectionRouteIncidentAction(env, dispatcher, "incident-1", {
    scope: "production",
    action: "reopen",
    reason: "Nové skutečnosti",
    idempotencyKey: "reopen:dispatcher"
  }),
  (error) => error.code === "collection_route_incident_reopen_forbidden"
);

await applyCollectionRouteIncidentAction(env, admin, "incident-1", {
  scope: "production",
  action: "reopen",
  reason: "Zákazník problém znovu nahlásil",
  idempotencyKey: "reopen:admin"
});
current = await listCollectionRouteIncidents(env, admin, { scope: "production" });
assert.equal(current.incidents[0].status, "in_progress");
assert.equal(current.incidents[0].technicalDetails.incidentId, "incident-1");

await applyCollectionRouteIncidentAction(env, admin, "incident-1", {
  scope: "test",
  action: "claim",
  idempotencyKey: "test:claim"
});
await applyCollectionRouteIncidentAction(env, admin, "incident-1", {
  scope: "test",
  action: "contact",
  channel: "email_sms",
  message: "TEST zpráva bez kontaktu skutečného zákazníka.",
  idempotencyKey: "test:contact"
});
const testResult = await listCollectionRouteIncidents(env, admin, { scope: "test" });
assert.equal(testResult.externalSendingEnabled, false);
assert.equal(testResult.testAdapter, "simulated-provider");
assert.equal(testResult.incidents[0].status, "in_progress");
assert.equal(testResult.incidents[0].email.status, "accepted");
assert.equal(testResult.incidents[0].sms.status, "accepted");
assert.equal(testResult.incidents[0].email.status === "delivered", false);
assert.equal(test.sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_incident_communications").get().count, 2);

console.log("collection route incident queue tests passed");
