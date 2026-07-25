import { json } from "../../_lib/auth.js";
import { getModuleDatabase } from "../../_lib/databases.js";
import {
  beginCrossDatabaseWorkflow,
  recordWorkflowAttempt,
  updateCrossDatabaseWorkflow
} from "../../_lib/cross-database-workflows.js";
import { loadTcarsStatusPayload } from "../../_lib/tcars-client.js";
import {
  vehicleTrackingHistoryPoint,
  vehicleTrackingHistoryRetentionBefore
} from "../../_lib/vehicle-tracking-history.js";
import {
  tcarsFleetAliasCandidate,
  upsertFleetVehicleAliasesFromTcars
} from "../../_lib/fleet-vehicle-aliases.js";

function token(request) {
  const value = request.headers.get("Authorization") || "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

function matches(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const receivedToken = token(request);
  const isDedicatedHistoryRunner = matches(receivedToken, String(env.VEHICLE_TRACKING_HISTORY_SYNC_TOKEN || "").trim());
  const isExistingCloudRunner = matches(receivedToken, String(env.DATA_BOX_PLUS_SYNC_TOKEN || "").trim());
  if (!isDedicatedHistoryRunner && !isExistingCloudRunner) {
    return json({ error: "Interní sběr GPS historie není povolen." }, 401);
  }
  const db = getModuleDatabase(env, {
    moduleName: "vehicle-tracking-history-sync",
    allowedDomains: ["archive", "core", "audit"],
    defaultDomain: "archive",
    required: false
  });
  if (!db) return json({ error: "Chybí DB_ARCHIVE, DB_CORE nebo DB_AUDIT." }, 503);

  const startedAt = new Date().toISOString();
  const runId = `vehicle-history-${crypto.randomUUID()}`;
  const workflow = await beginCrossDatabaseWorkflow(env, {
    workflowType: "vehicle-tracking-history-sync",
    idempotencyKey: `vehicle-tracking-history:${startedAt.slice(0, 16)}`,
    payload: { runId, startedAt },
    compensation: {
      strategy: "retain_core_and_archive_then_retry_missing_audit",
      archiveOperation: "insert_or_ignore_gps_points",
      coreOperation: "upsert_fleet_aliases"
    }
  });
  if (workflow.status === "completed") {
    return json({ status: "ok", runId: workflow.id, idempotentReplay: true, startedAt });
  }
  try {
    const status = await loadTcarsStatusPayload(env);
    if (status.apiStatus !== "ready") throw new Error(status.errorCode || "tcars_unavailable");
    const points = (status.locations || [])
      .map((item) => vehicleTrackingHistoryPoint(item, startedAt))
      .filter(Boolean);
    const statements = points.map((item) => db.prepare(`
      INSERT OR IGNORE INTO vehicle_tracking_gps_points (
        id, vehicle_key, license_plate, latitude, longitude, speed_kmh, heading, address, recorded_at, received_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id, item.vehicleKey, item.licensePlate, item.latitude, item.longitude,
      item.speedKmh, item.heading, item.address, item.recordedAt, item.receivedAt, "tcars"
    ));
    const writeResults = statements.length ? await db.batch(statements) : [];
    const fleetAliases = await upsertFleetVehicleAliasesFromTcars(
      db,
      (status.locations || []).map(tcarsFleetAliasCandidate),
      {
      updatedAt: startedAt
      }
    );
    await db.prepare("DELETE FROM vehicle_tracking_gps_points WHERE recorded_at < ?")
      .bind(vehicleTrackingHistoryRetentionBefore(new Date(startedAt))).run();
    const pointsWritten = writeResults.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
    await db.prepare(`
      UPDATE module_rules
      SET last_run_at = ?, last_run_status = 'completed', last_run_message = ?, updated_at = ?
      WHERE id = 'vehicle-tracking-fleet-master-alias-sync-phase1b'
    `).bind(
      new Date().toISOString(),
      `T-Cars master aliasy: viděno ${fleetAliases.seen}, zapsáno ${fleetAliases.written}.`,
      new Date().toISOString()
    ).run();
    let auditDeferred = false;
    try {
      await db.prepare(`
        INSERT INTO vehicle_tracking_history_runs (
          id, started_at, finished_at, status, points_written, fleet_aliases_seen, fleet_aliases_written, message
        ) VALUES (?, ?, ?, 'ok', ?, ?, ?, ?)
      `).bind(
        runId,
        startedAt,
        new Date().toISOString(),
        pointsWritten,
        fleetAliases.seen,
        fleetAliases.written,
        "Aktuální GPS body a read-only master aliasy flotily byly uloženy z T-Cars."
      ).run();
      await recordWorkflowAttempt(env, {
        workflowId: workflow.id,
        databaseDomain: "audit",
        operationName: "record_vehicle_history_run",
        status: "completed",
        finishedAt: new Date().toISOString()
      });
      await updateCrossDatabaseWorkflow(env, workflow.id, { status: "completed" });
    } catch (auditError) {
      auditDeferred = true;
      await updateCrossDatabaseWorkflow(env, workflow.id, {
        status: "failed",
        lastError: String(auditError?.message || "audit_unavailable").slice(0, 500),
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      });
    }
    return json({
      status: auditDeferred ? "partial" : "ok",
      runId,
      pointsWritten,
      pointsSeen: points.length,
      fleetAliasesSeen: fleetAliases.seen,
      fleetAliasesWritten: fleetAliases.written,
      startedAt,
      auditDeferred
    });
  } catch (error) {
    await db.prepare(`INSERT INTO vehicle_tracking_history_runs (id, started_at, finished_at, status, message, error_code) VALUES (?, ?, ?, 'error', ?, ?)`)
      .bind(runId, startedAt, new Date().toISOString(), "Sběr GPS historie selhal.", String(error?.message || "unknown").slice(0, 160)).run().catch(() => {});
    await db.prepare(`
      UPDATE module_rules
      SET last_run_at = ?, last_run_status = 'error', last_run_message = ?, updated_at = ?
      WHERE id = 'vehicle-tracking-fleet-master-alias-sync-phase1b'
    `).bind(
      new Date().toISOString(),
      "Sběr GPS historie nebo aktualizace aliasů flotily selhala.",
      new Date().toISOString()
    ).run().catch(() => {});
    await updateCrossDatabaseWorkflow(env, workflow.id, {
      status: "failed",
      lastError: String(error?.message || "unknown").slice(0, 500),
      nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }).catch(() => {});
    return json({ error: "Sběr GPS historie se nepodařil.", runId }, 502);
  }
}

export async function onRequestGet() {
  return json({ error: "Interní sběr GPS historie je dostupný jen pro cloudový Worker." }, 405, { Allow: "POST" });
}
