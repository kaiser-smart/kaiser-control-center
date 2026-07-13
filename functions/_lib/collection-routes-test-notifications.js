import { customerMessagingStatus, sendCustomerMessage } from "./customer-messaging-service.js";
import { sendCollectionRouteTestEmail } from "./notification-service.js";
import {
  getCollectionDailyRoute,
  isCollectionDailyRouteStationaryFieldTest
} from "./collection-daily-routes-store.js";
import {
  CollectionRoutesTestStoreError,
  assertCollectionRoutesTestManager,
  collectionRoutesTestDatabase,
  collectionRoutesTestRecipient,
  getCollectionRoutesTestDataset
} from "./collection-routes-test-store.js";

const D1_MAX_BOUND_PARAMETERS = 100;
const ITEM_INSERT_BINDINGS = 7;
const ITEMS_PER_INSERT = Math.floor(D1_MAX_BOUND_PARAMETERS / ITEM_INSERT_BINDINGS);
const MAX_STOPS_PER_PROCESS = 5;

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value, fallback) {
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

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    datasetId: cleanString(row.dataset_id),
    runId: cleanString(row.run_id),
    status: cleanString(row.status),
    idempotencyKey: cleanString(row.idempotency_key),
    stopCount: numberValue(row.stop_count),
    smsCount: numberValue(row.sms_count),
    emailCount: numberValue(row.email_count),
    sentCount: numberValue(row.sent_count),
    failedCount: numberValue(row.failed_count),
    pendingCount: numberValue(row.pending_count),
    recipientPhone: cleanString(row.recipient_phone),
    recipientEmail: cleanString(row.recipient_email),
    createdByUserId: cleanString(row.created_by_user_id),
    createdByName: cleanString(row.created_by_name),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    completedAt: cleanString(row.completed_at),
    metadata: parseJson(row.metadata_json, {})
  };
}

function rowToItem(row) {
  if (!row) return null;
  return {
    id: cleanString(row.id),
    jobId: cleanString(row.job_id),
    stopId: cleanString(row.stop_id),
    routeOrder: numberValue(row.route_order),
    smsStatus: cleanString(row.sms_status),
    smsProviderId: cleanString(row.sms_provider_id),
    smsError: cleanString(row.sms_error),
    emailStatus: cleanString(row.email_status),
    emailProviderId: cleanString(row.email_provider_id),
    emailError: cleanString(row.email_error),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    payload: parseJson(row.payload_json, {})
  };
}

function retrySummary(items = []) {
  let smsFailedCount = 0;
  let emailFailedCount = 0;
  let retryableSmsCount = 0;
  let retryableEmailCount = 0;

  for (const item of items) {
    if (item.smsStatus === "failed") {
      smsFailedCount += 1;
      if (!item.smsProviderId) retryableSmsCount += 1;
    }
    if (item.emailStatus === "failed") {
      emailFailedCount += 1;
      if (!item.emailProviderId) retryableEmailCount += 1;
    }
  }

  const failedCount = smsFailedCount + emailFailedCount;
  const retryableCount = retryableSmsCount + retryableEmailCount;
  return {
    failedCount,
    smsFailedCount,
    emailFailedCount,
    retryableCount,
    retryableSmsCount,
    retryableEmailCount,
    confirmation: retryableCount
      ? `retry-test-notification-${retryableCount}-failed-channels`
      : "",
    actualExternalSend: retryableCount > 0
  };
}

async function loadJobRow(db, jobId) {
  const row = await db.prepare(`
    SELECT *
    FROM collection_route_test_notification_jobs
    WHERE id = ?
    LIMIT 1
  `).bind(cleanString(jobId)).first();
  if (!row) {
    throw new CollectionRoutesTestStoreError(
      "Testovací odesílací úloha nebyla nalezena.",
      404,
      "collection_routes_test_notification_job_not_found"
    );
  }
  return row;
}

async function loadJobItems(db, jobId, limit = 500) {
  const result = await db.prepare(`
    SELECT *
    FROM collection_route_test_notification_items
    WHERE job_id = ?
    ORDER BY route_order ASC
    LIMIT ?
  `).bind(cleanString(jobId), Math.max(1, Math.min(numberValue(limit, 500), 500))).all();
  return (result.results || []).map(rowToItem);
}

function selectedStops(detail, stopIds = []) {
  const allStops = Array.isArray(detail?.stops) ? detail.stops : [];
  const requested = [...new Set((Array.isArray(stopIds) ? stopIds : []).map(cleanString).filter(Boolean))].slice(0, 500);
  if (!requested.length) return allStops;
  const requestedSet = new Set(requested);
  const stops = allStops.filter((stop) => requestedSet.has(cleanString(stop.id)));
  if (stops.length !== requested.length) {
    throw new CollectionRoutesTestStoreError(
      "Některé vybrané zastávky do testovací trasy nepatří.",
      400,
      "collection_routes_test_notification_stop_invalid"
    );
  }
  return stops;
}

export async function previewCollectionRoutesTestNotifications(env, user, {
  runId,
  stopIds = []
} = {}) {
  assertCollectionRoutesTestManager(user);
  const detail = await getCollectionDailyRoute(env, user, runId, { scope: "test" });
  if (isCollectionDailyRouteStationaryFieldTest(detail.run)) {
    throw new CollectionRoutesTestStoreError(
      "Stacionární terénní TEST nesmí odesílat SMS ani e-maily.",
      409,
      "collection_routes_test_notification_stationary_field_forbidden"
    );
  }
  const stops = selectedStops(detail, stopIds);
  if (!stops.length) {
    throw new CollectionRoutesTestStoreError(
      "Testovací trasa nemá žádnou zastávku pro odeslání.",
      409,
      "collection_routes_test_notification_empty"
    );
  }
  const recipient = collectionRoutesTestRecipient(env);
  return {
    runId: detail.run.id,
    routeTitle: detail.run.title,
    stopIds: stops.map((stop) => stop.id),
    stopCount: stops.length,
    smsCount: stops.length,
    emailCount: stops.length,
    messageCount: stops.length * 2,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    confirmation: `send-test-route-${stops.length}-stops`,
    actualExternalSend: true,
    automatic: false
  };
}

function itemInsertStatements(db, jobId, stops, createdAt) {
  const values = stops.map((stop) => [
    randomId("collection-route-test-notification-item"),
    jobId,
    stop.id,
    numberValue(stop.routeOrder),
    createdAt,
    createdAt,
    jsonString({ customerName: stop.customerName, stationName: stop.stationName, addressText: stop.addressText })
  ]);
  return chunks(values, ITEMS_PER_INSERT).map((chunk) => db.prepare(`
    INSERT INTO collection_route_test_notification_items (
      id, job_id, stop_id, route_order, created_at, updated_at, payload_json
    ) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}
  `).bind(...chunk.flat()));
}

export async function createCollectionRoutesTestNotificationJob(env, user, input = {}) {
  assertCollectionRoutesTestManager(user);
  const preview = await previewCollectionRoutesTestNotifications(env, user, input);
  if (cleanString(input.confirmation) !== preview.confirmation) {
    throw new CollectionRoutesTestStoreError(
      `Skutečné odeslání vyžaduje potvrzení ${preview.confirmation}.`,
      400,
      "collection_routes_test_notification_confirmation_required"
    );
  }
  if (numberValue(input.expectedStopCount, -1) !== preview.stopCount || numberValue(input.expectedMessageCount, -1) !== preview.messageCount) {
    throw new CollectionRoutesTestStoreError(
      "Počet testovacích zpráv se změnil. Nejdřív znovu načti náhled odeslání.",
      409,
      "collection_routes_test_notification_count_changed"
    );
  }
  const idempotencyKey = cleanString(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new CollectionRoutesTestStoreError(
      "Odesílací úloha vyžaduje idempotency klíč.",
      400,
      "collection_routes_test_notification_idempotency_required"
    );
  }
  const db = collectionRoutesTestDatabase(env, true);
  const existing = await db.prepare(`
    SELECT * FROM collection_route_test_notification_jobs WHERE idempotency_key = ? LIMIT 1
  `).bind(idempotencyKey).first();
  if (existing) {
    return getCollectionRoutesTestNotificationJob(env, user, existing.id);
  }
  const datasetResult = await getCollectionRoutesTestDataset(env, user, { includeRows: false });
  if (!datasetResult.dataset) {
    throw new CollectionRoutesTestStoreError(
      "Testovací sada Brno 501 není založená.",
      409,
      "collection_routes_test_dataset_missing"
    );
  }
  const detail = await getCollectionDailyRoute(env, user, preview.runId, { scope: "test" });
  const stops = selectedStops(detail, preview.stopIds);
  const jobId = randomId("collection-route-test-notification-job");
  const createdAt = nowIso();
  const actorId = cleanString(user?.id);
  const actorName = cleanString(user?.name || user?.email || user?.phone);
  await db.batch([
    db.prepare(`
      INSERT INTO collection_route_test_notification_jobs (
        id, dataset_id, run_id, status, idempotency_key, stop_count, sms_count,
        email_count, sent_count, failed_count, pending_count, recipient_phone,
        recipient_email, created_by_user_id, created_by_name, created_at, updated_at,
        metadata_json
      ) VALUES (?, ?, ?, 'prepared', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      jobId,
      datasetResult.dataset.id,
      preview.runId,
      idempotencyKey,
      preview.stopCount,
      preview.smsCount,
      preview.emailCount,
      preview.messageCount,
      preview.recipientPhone,
      preview.recipientEmail,
      actorId,
      actorName,
      createdAt,
      createdAt,
      jsonString({ routeTitle: preview.routeTitle, actualExternalSend: true, automatic: false })
    ),
    ...itemInsertStatements(db, jobId, stops, createdAt)
  ]);
  return getCollectionRoutesTestNotificationJob(env, user, jobId);
}

export async function getCollectionRoutesTestNotificationJob(env, user, jobId) {
  assertCollectionRoutesTestManager(user);
  const db = collectionRoutesTestDatabase(env, true);
  const job = rowToJob(await loadJobRow(db, jobId));
  const items = await loadJobItems(db, job.id, 500);
  return {
    job,
    items,
    retry: retrySummary(items),
    apiStatus: "ready"
  };
}

export async function getLatestCollectionRoutesTestNotificationJob(env, user, runId) {
  assertCollectionRoutesTestManager(user);
  const normalizedRunId = cleanString(runId);
  if (!normalizedRunId) {
    throw new CollectionRoutesTestStoreError(
      "Chybí ID testovací trasy.",
      400,
      "collection_routes_test_notification_run_required"
    );
  }
  await getCollectionDailyRoute(env, user, normalizedRunId, { scope: "test" });
  const db = collectionRoutesTestDatabase(env, true);
  const row = await db.prepare(`
    SELECT *
    FROM collection_route_test_notification_jobs
    WHERE run_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).bind(normalizedRunId).first();
  if (!row) {
    return { job: null, items: [], retry: retrySummary([]), apiStatus: "ready" };
  }
  return getCollectionRoutesTestNotificationJob(env, user, row.id);
}

function retryHistoryEntry(user, summary, retryableItems, retriedAt) {
  const priorErrors = [];
  for (const item of retryableItems) {
    if (item.smsStatus === "failed" && !item.smsProviderId) {
      priorErrors.push({ itemId: item.id, channel: "sms", error: cleanString(item.smsError).slice(0, 500) });
    }
    if (item.emailStatus === "failed" && !item.emailProviderId) {
      priorErrors.push({ itemId: item.id, channel: "email", error: cleanString(item.emailError).slice(0, 500) });
    }
  }
  return {
    retriedAt,
    actorUserId: cleanString(user?.id),
    actorName: cleanString(user?.name || user?.email || user?.phone),
    smsCount: summary.retryableSmsCount,
    emailCount: summary.retryableEmailCount,
    priorErrors: priorErrors.slice(0, 20)
  };
}

function retryChannelStatements(db, jobId, channel, itemIds, updatedAt) {
  const statusColumn = channel === "sms" ? "sms_status" : "email_status";
  const tokenColumn = channel === "sms" ? "sms_claim_token" : "email_claim_token";
  const providerColumn = channel === "sms" ? "sms_provider_id" : "email_provider_id";
  const errorColumn = channel === "sms" ? "sms_error" : "email_error";
  return chunks(itemIds, D1_MAX_BOUND_PARAMETERS - 2).map((itemIdChunk) => db.prepare(`
    UPDATE collection_route_test_notification_items
    SET ${statusColumn} = 'pending', ${tokenColumn} = '', ${errorColumn} = '', updated_at = ?
    WHERE job_id = ?
      AND ${statusColumn} = 'failed'
      AND ${providerColumn} = ''
      AND id IN (${itemIdChunk.map(() => "?").join(", ")})
  `).bind(updatedAt, jobId, ...itemIdChunk));
}

export async function retryCollectionRoutesTestNotificationFailures(env, user, jobId, input = {}) {
  assertCollectionRoutesTestManager(user);
  const db = collectionRoutesTestDatabase(env, true);
  const jobRow = await loadJobRow(db, jobId);
  const job = rowToJob(jobRow);
  const items = await loadJobItems(db, job.id, 500);
  const summary = retrySummary(items);

  if (job.pendingCount > 0) {
    throw new CollectionRoutesTestStoreError(
      "Odesílací úloha ještě obsahuje čekající zprávy. Nejdřív dokonči aktuální zpracování.",
      409,
      "collection_routes_test_notification_retry_in_progress"
    );
  }
  if (!summary.retryableCount) {
    throw new CollectionRoutesTestStoreError(
      "Úloha nemá žádný bezpečně opakovatelný neúspěšný kanál.",
      409,
      "collection_routes_test_notification_retry_empty"
    );
  }
  if (cleanString(input.confirmation) !== summary.confirmation) {
    throw new CollectionRoutesTestStoreError(
      `Opakování vyžaduje potvrzení ${summary.confirmation}.`,
      400,
      "collection_routes_test_notification_retry_confirmation_required"
    );
  }
  if (
    numberValue(input.expectedFailedCount, -1) !== summary.failedCount ||
    numberValue(input.expectedRetryableCount, -1) !== summary.retryableCount
  ) {
    throw new CollectionRoutesTestStoreError(
      "Počet neúspěšných zpráv se změnil. Nejdřív znovu načti stav úlohy.",
      409,
      "collection_routes_test_notification_retry_count_changed"
    );
  }
  if (cleanString(input.expectedJobUpdatedAt) !== job.updatedAt) {
    throw new CollectionRoutesTestStoreError(
      "Stav odesílací úlohy se změnil. Nejdřív ho znovu načti.",
      409,
      "collection_routes_test_notification_retry_stale"
    );
  }

  if (summary.retryableSmsCount > 0) {
    const messagingStatus = customerMessagingStatus(env);
    if (messagingStatus.mode !== "live" || !messagingStatus.twilioConfigured) {
      throw new CollectionRoutesTestStoreError(
        "Opakování SMS je zablokované: zákaznické SMS musí mít režim live a kompletní Twilio ENV.",
        409,
        "collection_routes_test_notification_sms_not_live"
      );
    }
  }

  const retryableItems = items.filter((item) =>
    (item.smsStatus === "failed" && !item.smsProviderId) ||
    (item.emailStatus === "failed" && !item.emailProviderId)
  );
  const smsItemIds = retryableItems
    .filter((item) => item.smsStatus === "failed" && !item.smsProviderId)
    .map((item) => item.id);
  const emailItemIds = retryableItems
    .filter((item) => item.emailStatus === "failed" && !item.emailProviderId)
    .map((item) => item.id);
  const updatedAt = nowIso();
  const metadata = parseJson(jobRow.metadata_json, {});
  const retryHistory = Array.isArray(metadata.retryHistory) ? metadata.retryHistory.slice(-19) : [];
  retryHistory.push(retryHistoryEntry(user, summary, retryableItems, updatedAt));

  await db.batch([
    ...retryChannelStatements(db, job.id, "sms", smsItemIds, updatedAt),
    ...retryChannelStatements(db, job.id, "email", emailItemIds, updatedAt),
    db.prepare(`
      UPDATE collection_route_test_notification_jobs
      SET status = 'running',
          sent_count = (
            SELECT SUM(CASE WHEN sms_status = 'sent' THEN 1 ELSE 0 END) +
                   SUM(CASE WHEN email_status = 'sent' THEN 1 ELSE 0 END)
            FROM collection_route_test_notification_items WHERE job_id = ?
          ),
          failed_count = (
            SELECT SUM(CASE WHEN sms_status = 'failed' THEN 1 ELSE 0 END) +
                   SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END)
            FROM collection_route_test_notification_items WHERE job_id = ?
          ),
          pending_count = (
            SELECT SUM(CASE WHEN sms_status IN ('pending', 'sending') THEN 1 ELSE 0 END) +
                   SUM(CASE WHEN email_status IN ('pending', 'sending') THEN 1 ELSE 0 END)
            FROM collection_route_test_notification_items WHERE job_id = ?
          ),
          metadata_json = ?, updated_at = ?, completed_at = NULL
      WHERE id = ?
    `).bind(job.id, job.id, job.id, jsonString({ ...metadata, retryHistory }), updatedAt, job.id)
  ]);

  return getCollectionRoutesTestNotificationJob(env, user, job.id);
}

async function claimChannel(db, itemId, channel) {
  const statusColumn = channel === "sms" ? "sms_status" : "email_status";
  const tokenColumn = channel === "sms" ? "sms_claim_token" : "email_claim_token";
  const token = randomId(`${channel}-claim`);
  const updatedAt = nowIso();
  await db.prepare(`
    UPDATE collection_route_test_notification_items
    SET ${statusColumn} = 'sending', ${tokenColumn} = ?, updated_at = ?
    WHERE id = ? AND ${statusColumn} = 'pending'
  `).bind(token, updatedAt, itemId).run();
  const row = await db.prepare(`
    SELECT * FROM collection_route_test_notification_items WHERE id = ? LIMIT 1
  `).bind(itemId).first();
  return cleanString(row?.[tokenColumn]) === token ? { token, row } : null;
}

async function finishChannel(db, itemId, channel, token, result = {}) {
  const statusColumn = channel === "sms" ? "sms_status" : "email_status";
  const tokenColumn = channel === "sms" ? "sms_claim_token" : "email_claim_token";
  const providerColumn = channel === "sms" ? "sms_provider_id" : "email_provider_id";
  const errorColumn = channel === "sms" ? "sms_error" : "email_error";
  const sent = result.sent === true || result.status === "sent";
  const status = sent ? "sent" : "failed";
  const providerId = cleanString(result.twilioMessageSid || result.providerMessageId);
  const errorMessage = sent ? "" : cleanString(result.errorMessage || `Skutečné ${channel} odeslání nebylo potvrzené.`);
  await db.prepare(`
    UPDATE collection_route_test_notification_items
    SET ${statusColumn} = ?, ${providerColumn} = ?, ${errorColumn} = ?, updated_at = ?
    WHERE id = ? AND ${tokenColumn} = ? AND ${statusColumn} = 'sending'
  `).bind(status, providerId, errorMessage, nowIso(), itemId, token).run();
  return { sent, status, providerId, errorMessage };
}

function smsVariables(run, stop) {
  return {
    company: cleanString(stop.customerName || "Testovací firma"),
    station: cleanString(stop.stationName || stop.addressText || `zastávka ${stop.routeOrder}`),
    date: cleanString(run.routeDate || "bez data"),
    waste: cleanString(stop.wasteType || "odpad"),
    container: stop.containerVolume
      ? `${numberValue(stop.containerCount, 1)}×${numberValue(stop.containerVolume)}l`
      : "nádoba"
  };
}

async function defaultSmsSender(env, { recipient, run, stop, item }) {
  return sendCustomerMessage(env, {
    phone: recipient.phone,
    channelPreference: "sms",
    template: "collection_route_test",
    variables: smsVariables(run, stop),
    consent: true,
    legalBasis: "Výslovný souhlas testovacího příjemce.",
    reason: "provozní test svozové trasy",
    customerId: cleanString(stop.sourceSummary?.sourceCustomerId),
    relatedEntityType: "collection_route_test_notification",
    relatedEntityId: item.id,
    dedupeWindowSeconds: 86400
  });
}

async function defaultEmailSender(env, { recipient, run, stop, item }) {
  return sendCollectionRouteTestEmail(env, {
    to: recipient.email,
    run,
    stop,
    dispatchItemId: item.id
  });
}

async function recalculateJob(db, jobId) {
  const counts = await db.prepare(`
    SELECT
      SUM(CASE WHEN sms_status = 'sent' THEN 1 ELSE 0 END) +
        SUM(CASE WHEN email_status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN sms_status = 'failed' THEN 1 ELSE 0 END) +
        SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN sms_status IN ('pending', 'sending') THEN 1 ELSE 0 END) +
        SUM(CASE WHEN email_status IN ('pending', 'sending') THEN 1 ELSE 0 END) AS pending_count
    FROM collection_route_test_notification_items
    WHERE job_id = ?
  `).bind(jobId).first();
  const sentCount = numberValue(counts?.sent_count);
  const failedCount = numberValue(counts?.failed_count);
  const pendingCount = numberValue(counts?.pending_count);
  const status = pendingCount > 0 ? "running" : failedCount > 0 ? "partial" : "completed";
  const updatedAt = nowIso();
  await db.prepare(`
    UPDATE collection_route_test_notification_jobs
    SET status = ?, sent_count = ?, failed_count = ?, pending_count = ?,
        updated_at = ?, completed_at = ?
    WHERE id = ?
  `).bind(status, sentCount, failedCount, pendingCount, updatedAt, pendingCount ? null : updatedAt, jobId).run();
}

export async function processCollectionRoutesTestNotificationJob(env, user, jobId, {
  limit = 1,
  senders = {}
} = {}) {
  assertCollectionRoutesTestManager(user);
  const db = collectionRoutesTestDatabase(env, true);
  const job = rowToJob(await loadJobRow(db, jobId));
  if (["completed", "partial"].includes(job.status) && job.pendingCount === 0) {
    return getCollectionRoutesTestNotificationJob(env, user, job.id);
  }
  const detail = await getCollectionDailyRoute(env, user, job.runId, { scope: "test" });
  const stopById = new Map((detail.stops || []).map((stop) => [cleanString(stop.id), stop]));
  const pendingResult = await db.prepare(`
    SELECT *
    FROM collection_route_test_notification_items
    WHERE job_id = ?
      AND (sms_status = 'pending' OR email_status = 'pending')
    ORDER BY route_order ASC
    LIMIT ?
  `).bind(job.id, Math.max(1, Math.min(numberValue(limit, 1), MAX_STOPS_PER_PROCESS))).all();
  const pendingItems = (pendingResult.results || []).map(rowToItem);
  const recipient = collectionRoutesTestRecipient(env);
  const smsSender = typeof senders.sms === "function" ? senders.sms : defaultSmsSender;
  const emailSender = typeof senders.email === "function" ? senders.email : defaultEmailSender;

  for (const item of pendingItems) {
    const stop = stopById.get(item.stopId);
    if (!stop) {
      throw new CollectionRoutesTestStoreError(
        "Zastávka odesílací úlohy už v testovací trase neexistuje.",
        409,
        "collection_routes_test_notification_stop_missing"
      );
    }
    if (item.smsStatus === "pending") {
      const claim = await claimChannel(db, item.id, "sms");
      if (claim) {
        let result;
        try {
          result = await smsSender(env, { recipient, run: detail.run, stop, item });
        } catch (error) {
          result = { sent: false, errorMessage: cleanString(error?.message) || "SMS odeslání selhalo." };
        }
        await finishChannel(db, item.id, "sms", claim.token, result);
      }
    }
    if (item.emailStatus === "pending") {
      const claim = await claimChannel(db, item.id, "email");
      if (claim) {
        let result;
        try {
          result = await emailSender(env, { recipient, run: detail.run, stop, item });
        } catch (error) {
          result = { status: "failed", errorMessage: cleanString(error?.message) || "E-mailové odeslání selhalo." };
        }
        await finishChannel(db, item.id, "email", claim.token, result);
      }
    }
  }

  await recalculateJob(db, job.id);
  return getCollectionRoutesTestNotificationJob(env, user, job.id);
}

export const __test = {
  ITEMS_PER_INSERT,
  MAX_STOPS_PER_PROCESS,
  selectedStops,
  smsVariables,
  retrySummary,
  rowToJob,
  rowToItem,
  itemInsertStatements
};
