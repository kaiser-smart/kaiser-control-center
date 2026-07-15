import { json } from "../../_lib/auth.js";
import { runFleetTripJobPairing } from "../../_lib/fleet-trip-job-pairing.js";

function token(request) {
  return String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function matches(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const receivedToken = token(request);
  const allowed = matches(receivedToken, String(env.VEHICLE_TRACKING_HISTORY_SYNC_TOKEN || "").trim())
    || matches(receivedToken, String(env.DATA_BOX_PLUS_SYNC_TOKEN || "").trim());
  if (!allowed) return json({ error: "Interní párování GPS jízd není povolené." }, 401);
  if (!env.SMART_ODPADY_DB) return json({ error: "Chybí D1 binding SMART_ODPADY_DB." }, 503);

  const body = await request.json().catch(() => ({}));
  try {
    return json(await runFleetTripJobPairing(env, {
      scheduledAt: body.scheduledAt || Date.now(),
      days: body.days || 7,
      triggeredBy: body.triggeredBy || "cloudflare-cron"
    }));
  } catch (error) {
    console.error("vehicle_tracking.trip_job_pairing_sync_failed", {
      code: String(error?.code || "fleet_trip_job_pairing_failed"),
      message: String(error?.message || "unknown")
    });
    return json({
      error: "Read-only párování GPS jízd se nepodařilo.",
      code: String(error?.code || "fleet_trip_job_pairing_failed"),
      phase: "read-only-pilot",
      dashboardActivationAllowed: false
    }, Number(error?.status || 502));
  }
}

export async function onRequestGet() {
  return json({ error: "Interní párování GPS jízd je dostupné jen pro cloudový Worker." }, 405, { Allow: "POST" });
}
