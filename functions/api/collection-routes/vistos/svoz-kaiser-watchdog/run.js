import { json, readJson } from "../../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosSvozKaiserWatchdog
} from "../../../../_lib/collection-routes-store.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeBearer(value) {
  return cleanString(value).replace(/^Bearer\s+/i, "");
}

function constantTimeEquals(leftValue, rightValue) {
  const left = cleanString(leftValue);
  const right = cleanString(rightValue);
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function requestSecret(request) {
  return normalizeBearer(request.headers.get("Authorization"))
    || cleanString(request.headers.get("x-collection-routes-watchdog-secret"));
}

function watchdogRunError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.vistos_svoz_kaiser_watchdog_run_failed", { message: error.message });
  return json({
    error: "Cloud hlídač Vistos Svoz Kaiser se teď nepodařilo spustit.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestPost({ request, env }) {
  const configuredSecret = cleanString(env.COLLECTION_ROUTES_WATCHDOG_SECRET);
  if (!configuredSecret) {
    return json({
      error: "Cloud hlídač Vistos Svoz Kaiser čeká na interní scheduler secret.",
      code: "collection_routes_watchdog_secret_missing",
      apiStatus: "waiting"
    }, 503);
  }

  if (!constantTimeEquals(requestSecret(request), configuredSecret)) {
    return json({ error: "Nepovolený běh hlídače.", code: "collection_routes_watchdog_forbidden" }, 403);
  }

  const body = await readJson(request);
  try {
    const watchdog = await createCollectionRoutesVistosSvozKaiserWatchdog(env, {
      persist: true,
      persistSitesSnapshot: true,
      throwOnPersistError: true,
      createdByUserId: "cloudflare-cron",
      triggeredBy: cleanString(body.triggeredBy || "cloudflare-cron"),
      runner: cleanString(body.runner || "collection-routes-watchdog-runner"),
      scheduledAt: cleanString(body.scheduledAt),
      cron: cleanString(body.cron),
      scheduleMode: cleanString(body.scheduleMode),
      message: "Cloud read-only snapshot hlídače Vistos Svoz Kaiser."
    });
    return json({
      ok: true,
      watchdog,
      snapshot: watchdog.snapshot || null,
      sitesSnapshot: watchdog.sitesSnapshot || null,
      apiStatus: watchdog.apiStatus || "ready"
    });
  } catch (error) {
    return watchdogRunError(error);
  }
}
