import { json } from "../../../_lib/auth.js";
import { runVistosLeadHubProfileSync, verifyVistosLeadHubReadAccess, prepareVistosLeadHubHistoricalImport, executeVistosLeadHubHistoricalImport } from "../../../_lib/vistos-leadhub-profile-sync.js";

function clean(value) {
  return String(value ?? "").trim();
}

function requestToken(request) {
  return clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "")
    || clean(request.headers.get("X-Vistos-Leadhub-Sync-Token"));
}

function tokenMatches(received, expected) {
  const left = clean(received);
  const right = clean(expected);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!tokenMatches(requestToken(request), env.VISTOS_LEADHUB_SYNC_TOKEN)) {
    return json({ error: "Interní Vistos → LeadHub sync není povolený.", code: "vistos_leadhub_sync_unauthorized" }, 401);
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (body.mode === "read-preflight") return json(await verifyVistosLeadHubReadAccess(env));
    if (body.mode === "prepare-import") return json(await prepareVistosLeadHubHistoricalImport(env));
    if (body.mode === "execute-import") return json(await executeVistosLeadHubHistoricalImport(env, { scheduledAt: clean(body.scheduledAt) || new Date().toISOString() }));
    if (body.mode && body.mode !== "sync") return json({ code: "vistos_leadhub_invalid_mode" }, 400);
    return json(await runVistosLeadHubProfileSync(env, {
      scheduledAt: clean(body.scheduledAt) || new Date().toISOString(),
      triggeredBy: clean(body.runner) || "cloudflare-cron"
    }));
  } catch (error) {
    console.error("vistos_leadhub_sync.failed", {
      code: clean(error?.code) || "vistos_leadhub_sync_failed",
      status: Number(error?.status) || 500,
      upstreamStatus: Number(error?.upstreamStatus) || 0
    });
    return json({
      syncStatus: "BLOCKED",
      error: clean(error?.message) || "Vistos → LeadHub sync selhal.",
      code: clean(error?.code) || "vistos_leadhub_sync_failed",
      upstreamStatus: Number(error?.upstreamStatus) || 0,
      subscriptionsChanged: 0,
      messagesSent: 0
    }, Number(error?.status) || 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Interní synchronizace je dostupná pouze přes plánovaný POST." }, 405, { Allow: "POST" });
}
