import { json } from "../../../_lib/auth.js";
import { runVistosLeadHubProfileSync } from "../../../_lib/vistos-leadhub-profile-sync.js";

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
    return json(await runVistosLeadHubProfileSync(env, {
      scheduledAt: clean(body.scheduledAt) || new Date().toISOString(),
      triggeredBy: clean(body.runner) || "cloudflare-cron"
    }));
  } catch (error) {
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
