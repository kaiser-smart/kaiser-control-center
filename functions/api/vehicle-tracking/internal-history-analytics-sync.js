import { json } from "../../_lib/auth.js";
import { rebuildVehicleTrackingAnalytics } from "../../_lib/vehicle-tracking-analytics.js";

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
  if (!allowed) return json({ error: "Interní přepočet GPS historie není povolen." }, 401);
  if (!env.SMART_ODPADY_DB) return json({ error: "Chybí D1 binding SMART_ODPADY_DB." }, 503);

  const body = await request.json().catch(() => ({}));
  try {
    return json(await rebuildVehicleTrackingAnalytics(env.SMART_ODPADY_DB, {
      days: body.days || 2,
      now: body.scheduledAt || Date.now()
    }));
  } catch (error) {
    console.error("vehicle_tracking.analytics_sync_failed", { message: error?.message || "unknown" });
    return json({ error: "Přepočet GPS jízd se nepodařil." }, 502);
  }
}

export async function onRequestGet() {
  return json({ error: "Interní přepočet GPS historie je dostupný jen pro cloudový Worker." }, 405, { Allow: "POST" });
}
