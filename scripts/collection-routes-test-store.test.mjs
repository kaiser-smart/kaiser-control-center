import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  CollectionRoutesTestStoreError,
  ensureCollectionRoutesTestDataset,
  getCollectionRoutesTestDataset,
  getCollectionRoutesTestSnapshot
} from "../functions/_lib/collection-routes-test-store.js";
import {
  createCollectionDailyRouteDraft,
  listCollectionDailyRoutes,
  previewCollectionDailyRoute
} from "../functions/_lib/collection-daily-routes-store.js";
import {
  createCollectionRoutesTestNotificationJob,
  previewCollectionRoutesTestNotifications,
  processCollectionRoutesTestNotificationJob
} from "../functions/_lib/collection-routes-test-notifications.js";

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
    this.owner.statementExecutions += 1;
    return { results: this.owner.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    this.owner.statementExecutions += 1;
    return this.owner.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    this.owner.statementExecutions += 1;
    return { success: true, meta: this.owner.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
    this.statementExecutions = 0;
    this.batchSizes = [];
    this.failBatchStatement = 0;
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  async batch(statements) {
    this.batchSizes.push(statements.length);
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (this.failBatchStatement === index + 1) {
          throw new Error("forced-test-dataset-batch-failure");
        }
        results.push(await statements[index].run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function openDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

function environment(d1) {
  return {
    COLLECTION_ROUTES_TEST_DB: d1,
    COLLECTION_ROUTES_TEST_SMS_TO: "+420600000000",
    COLLECTION_ROUTES_TEST_EMAIL_TO: "route-test@example.invalid"
  };
}

const manager = {
  id: "manager-test",
  name: "Manager Test",
  email: "manager@example.invalid",
  role: "management",
  status: "active",
  active: true
};

{
  const { sqlite, d1 } = openDatabase();
  const { sqlite: productionSqlite, d1: productionD1 } = openDatabase();
  const env = { ...environment(d1), SMART_ODPADY_DB: productionD1 };
  const created = await ensureCollectionRoutesTestDataset(env, manager, {
    confirmation: "create-test-brno-500"
  });
  assert.equal(created.created, true);
  assert.equal(created.dataset.siteCount, 500);
  assert.equal(created.dataset.companyCount, 100);
  assert.equal(created.rows.length, 500);
  assert.ok(d1.batchSizes[0] < 60, `Založení použilo příliš mnoho D1 operací: ${d1.batchSizes[0]}`);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_batches").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 500);

  const preview = await previewCollectionDailyRoute(env, manager, {
    scope: "test",
    routeDate: "2026-07-13",
    vehicleCode: "A"
  });
  assert.equal(preview.scope, "test");
  assert.equal(preview.selectedCount, 500);
  assert.ok(preview.eligibleCount > 0 && preview.eligibleCount < 500);
  const route = await createCollectionDailyRouteDraft(env, manager, {
    scope: "test",
    routeDate: "2026-07-13",
    vehicleCode: "A",
    sourceBatchId: preview.sourceBatchId
  });
  assert.equal(route.run.scope, "test");
  assert.equal(route.stops.length, preview.eligibleCount);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 1);
  assert.equal(productionSqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 0);
  assert.equal((await listCollectionDailyRoutes(env, { scope: "test" }, manager)).length, 1);
  assert.equal((await listCollectionDailyRoutes(env, {}, manager)).length, 0);

  const notificationPreview = await previewCollectionRoutesTestNotifications(env, manager, {
    runId: route.run.id,
    stopIds: [route.stops[0].id]
  });
  assert.equal(notificationPreview.stopCount, 1);
  assert.equal(notificationPreview.messageCount, 2);
  assert.equal(notificationPreview.recipientPhone, env.COLLECTION_ROUTES_TEST_SMS_TO);
  assert.equal(notificationPreview.recipientEmail, env.COLLECTION_ROUTES_TEST_EMAIL_TO);

  await assert.rejects(
    createCollectionRoutesTestNotificationJob(env, manager, {
      runId: route.run.id,
      stopIds: [route.stops[0].id],
      confirmation: "wrong",
      expectedStopCount: 1,
      expectedMessageCount: 2,
      idempotencyKey: "test-job-one"
    }),
    (error) => error?.code === "collection_routes_test_notification_confirmation_required"
  );

  const jobResult = await createCollectionRoutesTestNotificationJob(env, manager, {
    runId: route.run.id,
    stopIds: [route.stops[0].id],
    confirmation: notificationPreview.confirmation,
    expectedStopCount: notificationPreview.stopCount,
    expectedMessageCount: notificationPreview.messageCount,
    idempotencyKey: "test-job-one"
  });
  assert.equal(jobResult.job.pendingCount, 2);
  assert.equal(jobResult.items.length, 1);
  const repeatedJobResult = await createCollectionRoutesTestNotificationJob(env, manager, {
    runId: route.run.id,
    stopIds: [route.stops[0].id],
    confirmation: notificationPreview.confirmation,
    expectedStopCount: notificationPreview.stopCount,
    expectedMessageCount: notificationPreview.messageCount,
    idempotencyKey: "test-job-one"
  });
  assert.equal(repeatedJobResult.job.id, jobResult.job.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_notification_jobs").get().count, 1);
  let smsCalls = 0;
  let emailCalls = 0;
  const processed = await processCollectionRoutesTestNotificationJob(env, manager, jobResult.job.id, {
    limit: 1,
    senders: {
      sms: async (_env, context) => {
        smsCalls += 1;
        assert.equal(context.recipient.phone, env.COLLECTION_ROUTES_TEST_SMS_TO);
        assert.equal(context.stop.id, route.stops[0].id);
        return { sent: true, status: "accepted", twilioMessageSid: "SM-TEST-ONE" };
      },
      email: async (_env, context) => {
        emailCalls += 1;
        assert.equal(context.recipient.email, env.COLLECTION_ROUTES_TEST_EMAIL_TO);
        assert.equal(context.stop.id, route.stops[0].id);
        return { status: "sent", providerMessageId: "SG-TEST-ONE" };
      }
    }
  });
  assert.equal(processed.job.status, "completed");
  assert.equal(processed.job.sentCount, 2);
  assert.equal(processed.job.failedCount, 0);
  assert.equal(processed.items[0].smsProviderId, "SM-TEST-ONE");
  assert.equal(processed.items[0].emailProviderId, "SG-TEST-ONE");
  assert.equal(smsCalls, 1);
  assert.equal(emailCalls, 1);

  await processCollectionRoutesTestNotificationJob(env, manager, jobResult.job.id, {
    limit: 1,
    senders: {
      sms: async () => { smsCalls += 1; return { sent: true }; },
      email: async () => { emailCalls += 1; return { status: "sent" }; }
    }
  });
  assert.equal(smsCalls, 1, "Dokončená úloha nesmí SMS odeslat znovu.");
  assert.equal(emailCalls, 1, "Dokončená úloha nesmí e-mail odeslat znovu.");
  assert.equal(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM collection_import_rows
    WHERE json_extract(summary_json, '$.wasteType') = 'SKO'
  `).get().count, 350);
  assert.equal(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM collection_import_rows
    WHERE CAST(json_extract(summary_json, '$.containerVolume') AS INTEGER) NOT IN (120, 240, 1100)
  `).get().count, 0);

  const loaded = await getCollectionRoutesTestDataset(env, manager);
  assert.equal(loaded.apiStatus, "ready");
  assert.equal(loaded.rows[0].summary.phone, env.COLLECTION_ROUTES_TEST_SMS_TO);
  assert.equal(loaded.rows[0].summary.email, env.COLLECTION_ROUTES_TEST_EMAIL_TO);

  const snapshot = await getCollectionRoutesTestSnapshot(env, manager);
  assert.equal(snapshot.sourceMode, "synthetic-brno-test");
  assert.equal(snapshot.rowCount, 500);
  assert.ok(snapshot.rows.every((row) => row.summary.dataScope === "test"));

  const repeated = await ensureCollectionRoutesTestDataset(env, manager, {
    confirmation: "create-test-brno-500"
  });
  assert.equal(repeated.created, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 500);
}

{
  const { sqlite, d1 } = openDatabase();
  d1.failBatchStatement = 5;
  await assert.rejects(
    ensureCollectionRoutesTestDataset(environment(d1), manager, {
      confirmation: "create-test-brno-500"
    }),
    (error) => error instanceof CollectionRoutesTestStoreError && error.code === "collection_routes_test_store_failed"
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_batches").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 0);
}

await assert.rejects(
  getCollectionRoutesTestDataset(environment(openDatabase().d1), { ...manager, role: "dispecer" }),
  (error) => error instanceof CollectionRoutesTestStoreError && error.status === 403
);

await assert.rejects(
  previewCollectionDailyRoute(environment(openDatabase().d1), { ...manager, role: "dispecer" }, {
    scope: "test",
    routeDate: "2026-07-13",
    vehicleCode: "A"
  }),
  (error) => error?.code === "collection_daily_route_test_forbidden"
);

await assert.rejects(
  ensureCollectionRoutesTestDataset({ ...environment(openDatabase().d1), COLLECTION_ROUTES_TEST_SMS_TO: "" }, manager, {
    confirmation: "create-test-brno-500"
  }),
  (error) => error instanceof CollectionRoutesTestStoreError && error.code === "collection_routes_test_recipient_missing"
);

console.log("Collection routes TEST Brno 500 store tests passed.");
