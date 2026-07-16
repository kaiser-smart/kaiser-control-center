import { json } from "../../_lib/auth.js";
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
  if (!env.SMART_ODPADY_DB) return json({ error: "Chybí D1 binding SMART_ODPADY_DB." }, 503);

  const startedAt = new Date().toISOString();
  const runId = `vehicle-history-${crypto.randomUUID()}`;
  try {
    const status = await loadTcarsStatusPayload(env);
    if (status.apiStatus !== "ready") throw new Error(status.errorCode || "tcars_unavailable");
    const points = (status.locations || [])
      .map((item) => vehicleTrackingHistoryPoint(item, startedAt))
      .filter(Boolean);
    const statements = points.map((item) => env.SMART_ODPADY_DB.prepare(`
      INSERT OR IGNORE INTO vehicle_tracking_gps_points (
        id, vehicle_key, license_plate, latitude, longitude, speed_kmh, heading, address, recorded_at, received_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id, item.vehicleKey, item.licensePlate, item.latitude, item.longitude,
      item.speedKmh, item.heading, item.address, item.recordedAt, item.receivedAt, "tcars"
    ));
    const writeResults = statements.length ? await env.SMART_ODPADY_DB.batch(statements) : [];
    const fleetAliases = await upsertFleetVehicleAliasesFromTcars(
      env.SMART_ODPADY_DB,
      (status.locations || []).map(tcarsFleetAliasCandidate),
      {
      updatedAt: startedAt
      }
    );
    await env.SMART_ODPADY_DB.prepare("DELETE FROM vehicle_tracking_gps_points WHERE recorded_at < ?")
      .bind(vehicleTrackingHistoryRetentionBefore(new Date(startedAt))).run();
    const pointsWritten = writeResults.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
    await env.SMART_ODPADY_DB.prepare(`
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
    await env.SMART_ODPADY_DB.prepare(`
      UPDATE module_rules
      SET last_run_at = ?, last_run_status = 'completed', last_run_message = ?, updated_at = ?
      WHERE id = 'vehicle-tracking-fleet-master-alias-sync-phase1b'
    `).bind(
      new Date().toISOString(),
      `T-Cars master aliasy: viděno ${fleetAliases.seen}, zapsáno ${fleetAliases.written}.`,
      new Date().toISOString()
    ).run();
    return json({
      status: "ok",
      runId,
      pointsWritten,
      pointsSeen: points.length,
      fleetAliasesSeen: fleetAliases.seen,
      fleetAliasesWritten: fleetAliases.written,
      startedAt
    });
  } catch (error) {
    await env.SMART_ODPADY_DB.prepare(`INSERT INTO vehicle_tracking_history_runs (id, started_at, finished_at, status, message, error_code) VALUES (?, ?, ?, 'error', ?, ?)`)
      .bind(runId, startedAt, new Date().toISOString(), "Sběr GPS historie selhal.", String(error?.message || "unknown").slice(0, 160)).run().catch(() => {});
    await env.SMART_ODPADY_DB.prepare(`
      UPDATE module_rules
      SET last_run_at = ?, last_run_status = 'error', last_run_message = ?, updated_at = ?
      WHERE id = 'vehicle-tracking-fleet-master-alias-sync-phase1b'
    `).bind(
      new Date().toISOString(),
      "Sběr GPS historie nebo aktualizace aliasů flotily selhala.",
      new Date().toISOString()
    ).run().catch(() => {});
    return json({ error: "Sběr GPS historie se nepodařil.", runId }, 502);
  }
}

export async function onRequestGet() {
  return json({ error: "Interní sběr GPS historie je dostupný jen pro cloudový Worker." }, 405, { Allow: "POST" });
}
