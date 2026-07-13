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
  getLatestCollectionRoutesTestNotificationJob,
  previewCollectionRoutesTestNotifications,
  processCollectionRoutesTestNotificationJob,
  retryCollectionRoutesTestNotificationFailures
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
    "../migrations/test/0001_create_collection_routes_test_control.sql",
    "../migrations/test/0004_add_collection_route_field_test_site_501.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  return { sqlite, d1: new D1Database(sqlite) };
}

function environment(d1) {
  return {
    COLLECTION_ROUTES_TEST_DB: d1,
    COLLECTION_ROUTES_TEST_SMS_TO: "+420600000000",
    COLLECTION_ROUTES_TEST_EMAIL_TO: "route-test@example.invalid",
    KSO_CUSTOMER_MESSAGING_MODE: "live",
    TWILIO_ACCOUNT_SID: "AC-TEST",
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_MESSAGING_SERVICE_SID: "MG-TEST"
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
  assert.equal(created.dataset.siteCount, 501);
  assert.equal(created.dataset.companyCount, 101);
  assert.equal(created.rows.length, 501);
  assert.equal(created.rows[0].summary.customerName, "Firma test 501");
  assert.equal(created.rows[0].summary.addressPlaceRaw, "Trnkova 3052/137, 628 00 Brno");
  assert.ok(d1.batchSizes[0] < 60, `Založení použilo příliš mnoho D1 operací: ${d1.batchSizes[0]}`);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_batches").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 501);

  const preview = await previewCollectionDailyRoute(env, manager, {
    scope: "test",
    routeDate: "2026-07-13",
    vehicleCode: "A"
  });
  assert.equal(preview.scope, "test");
  assert.equal(preview.sourceBatchId, "collection-import-batch-test-brno-500-v2");
  assert.equal(preview.selectedCount, 501);
  assert.ok(preview.eligibleCount > 0 && preview.eligibleCount < 501);
  const route = await createCollectionDailyRouteDraft(env, manager, {
    scope: "test",
    routeDate: "2026-07-13",
    vehicleCode: "A",
    sourceBatchId: preview.sourceBatchId
  });
  assert.equal(route.run.scope, "test");
  assert.equal(route.run.sourceBatchId, "collection-import-batch-test-brno-500-v2");
  assert.equal(route.stops.length, preview.eligibleCount);
  assert.ok(route.stops.every((stop) => stop.sourceBatchId === "collection-import-batch-test-brno-500-v2"));
  assert.ok(route.stops.every((stop) => stop.frequency && stop.pickupDaysText && stop.contractNumber));
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
  const latestJobResult = await getLatestCollectionRoutesTestNotificationJob(env, manager, route.run.id);
  assert.equal(latestJobResult.job.id, jobResult.job.id, "Reload trasy musí obnovit poslední odesílací úlohu.");
  let smsCalls = 0;
  let emailCalls = 0;
  const firstProcessed = await processCollectionRoutesTestNotificationJob(env, manager, jobResult.job.id, {
    limit: 1,
    senders: {
      sms: async (_env, context) => {
        smsCalls += 1;
        assert.equal(context.recipient.phone, env.COLLECTION_ROUTES_TEST_SMS_TO);
        assert.equal(context.stop.id, route.stops[0].id);
        return { sent: false, status: "failed", errorMessage: "Twilio prerequisite missing" };
      },
      email: async (_env, context) => {
        emailCalls += 1;
        assert.equal(context.recipient.email, env.COLLECTION_ROUTES_TEST_EMAIL_TO);
        assert.equal(context.stop.id, route.stops[0].id);
        return { status: "sent", providerMessageId: "SG-TEST-ONE" };
      }
    }
  });
  assert.equal(firstProcessed.job.status, "partial");
  assert.equal(firstProcessed.job.sentCount, 1);
  assert.equal(firstProcessed.job.failedCount, 1);
  assert.equal(firstProcessed.job.pendingCount, 0);
  assert.equal(firstProcessed.items[0].smsProviderId, "");
  assert.equal(firstProcessed.items[0].smsStatus, "failed");
  assert.equal(firstProcessed.items[0].emailProviderId, "SG-TEST-ONE");
  assert.equal(firstProcessed.items[0].emailStatus, "sent");
  assert.equal(firstProcessed.retry.smsFailedCount, 1);
  assert.equal(firstProcessed.retry.emailFailedCount, 0);
  assert.equal(firstProcessed.retry.retryableSmsCount, 1);
  assert.equal(firstProcessed.retry.retryableCount, 1);
  assert.equal(smsCalls, 1);
  assert.equal(emailCalls, 1);

  await assert.rejects(
    retryCollectionRoutesTestNotificationFailures(env, manager, jobResult.job.id, {
      confirmation: "wrong",
      expectedFailedCount: 1,
      expectedRetryableCount: 1,
      expectedJobUpdatedAt: firstProcessed.job.updatedAt
    }),
    (error) => error?.code === "collection_routes_test_notification_retry_confirmation_required"
  );
  await assert.rejects(
    retryCollectionRoutesTestNotificationFailures(
      { ...env, KSO_CUSTOMER_MESSAGING_MODE: "off" },
      manager,
      jobResult.job.id,
      {
        confirmation: firstProcessed.retry.confirmation,
        expectedFailedCount: firstProcessed.retry.failedCount,
        expectedRetryableCount: firstProcessed.retry.retryableCount,
        expectedJobUpdatedAt: firstProcessed.job.updatedAt
      }
    ),
    (error) => error?.code === "collection_routes_test_notification_sms_not_live"
  );

  const retryPrepared = await retryCollectionRoutesTestNotificationFailures(env, manager, jobResult.job.id, {
    confirmation: firstProcessed.retry.confirmation,
    expectedFailedCount: firstProcessed.retry.failedCount,
    expectedRetryableCount: firstProcessed.retry.retryableCount,
    expectedJobUpdatedAt: firstProcessed.job.updatedAt
  });
  assert.equal(retryPrepared.job.status, "running");
  assert.equal(retryPrepared.job.sentCount, 1);
  assert.equal(retryPrepared.job.failedCount, 0);
  assert.equal(retryPrepared.job.pendingCount, 1);
  assert.equal(retryPrepared.items[0].smsStatus, "pending");
  assert.equal(retryPrepared.items[0].emailStatus, "sent");
  assert.equal(retryPrepared.items[0].emailProviderId, "SG-TEST-ONE");
  assert.equal(retryPrepared.job.metadata.retryHistory.length, 1);
  assert.equal(retryPrepared.job.metadata.retryHistory[0].smsCount, 1);
  assert.equal(retryPrepared.job.metadata.retryHistory[0].emailCount, 0);
  assert.equal(retryPrepared.job.metadata.retryHistory[0].priorErrors[0].error, "Twilio prerequisite missing");

  const processed = await processCollectionRoutesTestNotificationJob(env, manager, jobResult.job.id, {
    limit: 1,
    senders: {
      sms: async () => {
        smsCalls += 1;
        return { sent: true, status: "accepted", twilioMessageSid: "SM-TEST-ONE" };
      },
      email: async () => {
        emailCalls += 1;
        return { status: "sent", providerMessageId: "SHOULD-NOT-SEND" };
      }
    }
  });
  assert.equal(processed.job.status, "completed");
  assert.equal(processed.job.sentCount, 2);
  assert.equal(processed.job.failedCount, 0);
  assert.equal(processed.job.pendingCount, 0);
  assert.equal(processed.items[0].smsProviderId, "SM-TEST-ONE");
  assert.equal(processed.items[0].emailProviderId, "SG-TEST-ONE", "Odeslaný e-mail musí zachovat původní provider ID.");
  assert.equal(smsCalls, 2, "Neúspěšná SMS se smí zopakovat právě jednou.");
  assert.equal(emailCalls, 1, "Odeslaný e-mail se při opakování SMS nesmí zavolat znovu.");

  await processCollectionRoutesTestNotificationJob(env, manager, jobResult.job.id, {
    limit: 1,
    senders: {
      sms: async () => { smsCalls += 1; return { sent: true }; },
      email: async () => { emailCalls += 1; return { status: "sent" }; }
    }
  });
  assert.equal(smsCalls, 2, "Dokončená úloha nesmí SMS odeslat znovu.");
  assert.equal(emailCalls, 1, "Dokončená úloha nesmí e-mail odeslat znovu.");
  await assert.rejects(
    retryCollectionRoutesTestNotificationFailures(env, manager, jobResult.job.id, {
      confirmation: firstProcessed.retry.confirmation,
      expectedFailedCount: 1,
      expectedRetryableCount: 1,
      expectedJobUpdatedAt: firstProcessed.job.updatedAt
    }),
    (error) => error?.code === "collection_routes_test_notification_retry_empty"
  );
  assert.equal(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM collection_import_rows
    WHERE json_extract(summary_json, '$.wasteType') = 'SKO'
  `).get().count, 351);
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
  assert.equal(snapshot.rowCount, 501);
  assert.ok(snapshot.rows.every((row) => row.summary.dataScope === "test"));

  const repeated = await ensureCollectionRoutesTestDataset(env, manager, {
    confirmation: "create-test-brno-500"
  });
  assert.equal(repeated.created, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 501);
}

{
  const { sqlite, d1 } = openDatabase();
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count,
      issue_count, created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES (
      'collection-import-batch-test-brno-500-v1', 'synthetic-test', 'synthetic-brno-test',
      'preview', 'ready', 'Původní TEST sada.', 0, 0, 'manager-test',
      '2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z', '{}'
    )
  `).run();
  sqlite.prepare(`
    INSERT INTO collection_route_test_datasets (
      id, dataset_key, name, status, source_batch_id, seed, company_count,
      site_count, address_source, metadata_json, created_by_user_id,
      created_by_name, created_at, updated_at
    ) VALUES (
      'collection-route-test-dataset-brno-500-v1', 'brno-500-v1', 'TEST Brno 500 v1',
      'ready', 'collection-import-batch-test-brno-500-v1', 1, 100, 500,
      'historic-test', '{}', 'manager-test', 'Manager Test',
      '2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z'
    )
  `).run();

  const created = await ensureCollectionRoutesTestDataset(environment(d1), manager, {
    confirmation: "create-test-brno-500"
  });
  assert.equal(created.created, true);
  assert.equal(created.dataset.key, "brno-500-v2");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_batches").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows").get().count, 501);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v1'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_route_test_datasets WHERE dataset_key = 'brno-500-v2'").get().count, 1);
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

{
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql",
    "../migrations/test/0001_create_collection_routes_test_control.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }
  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count,
      issue_count, created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
  `).run(
    "collection-import-batch-test-brno-500-v2",
    "synthetic-test",
    "synthetic-brno-test",
    "preview",
    "ready",
    "Původní sada 500",
    500,
    0,
    "manager-test",
    JSON.stringify({ summary: { siteCount: 500, wasteCounts: { SKO: 350 } } })
  );
  sqlite.prepare(`
    INSERT INTO collection_route_test_datasets (
      id, dataset_key, name, status, source_batch_id, seed, company_count, site_count,
      address_source, metadata_json, created_by_user_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    "collection-route-test-dataset-brno-500-v2",
    "brno-500-v2",
    "TEST Brno 500",
    "ready",
    "collection-import-batch-test-brno-500-v2",
    20260712,
    100,
    500,
    "gis-brno-open-data",
    JSON.stringify({
      recipientPhone: "+420600000000",
      recipientEmail: "route-test@example.invalid",
      summary: { siteCount: 500, wasteCounts: { SKO: 350 } }
    }),
    "manager-test",
    "Manager Test"
  );
  const migration = readFileSync(
    new URL("../migrations/test/0004_add_collection_route_field_test_site_501.sql", import.meta.url),
    "utf8"
  );
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_import_rows WHERE source_id = ?").get("test-field-site-501").count, 1);
  const fieldRow = JSON.parse(sqlite.prepare("SELECT summary_json FROM collection_import_rows WHERE source_id = ?").get("test-field-site-501").summary_json);
  assert.equal(fieldRow.customerName, "Firma test 501");
  assert.equal(fieldRow.phone, "+420600000000");
  assert.equal(fieldRow.pickupDaysText, "středa lichá, středa sudá");
  const migratedDataset = sqlite.prepare("SELECT name, company_count, site_count, metadata_json FROM collection_route_test_datasets WHERE dataset_key = ?").get("brno-500-v2");
  assert.equal(migratedDataset.name, "TEST Brno 501");
  assert.equal(migratedDataset.company_count, 101);
  assert.equal(migratedDataset.site_count, 501);
  assert.equal(JSON.parse(migratedDataset.metadata_json).summary.wasteCounts.SKO, 351);
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

console.log("Collection routes TEST Brno 501 store tests passed.");
