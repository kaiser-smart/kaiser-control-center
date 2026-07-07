import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosSvozKaiserWatchdog,
  getLatestCollectionRoutesSvozKaiserWatchdogSnapshot
} from "../../../_lib/collection-routes-store.js";

function watchdogError(error) {
  if (error instanceof CollectionRoutesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("collection_routes.vistos_svoz_kaiser_watchdog_failed", { message: error.message });
  return json({
    error: "Hlídač Vistos Svoz Kaiser se teď nepodařilo spustit.",
    apiStatus: "waiting"
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const mode = String(url.searchParams.get("mode") || "latest").trim().toLowerCase();
    const live = mode === "live" || url.searchParams.get("live") === "1";

    if (!live) {
      const snapshot = await getLatestCollectionRoutesSvozKaiserWatchdogSnapshot(env);
      return json({
        watchdog: snapshot?.watchdog || null,
        snapshot: snapshot?.batch || null,
        latest: Boolean(snapshot?.watchdog),
        apiStatus: snapshot?.watchdog?.apiStatus || snapshot?.batch?.apiStatus || "waiting"
      });
    }

    const watchdog = await createCollectionRoutesVistosSvozKaiserWatchdog(env, {
      persist: true,
      user,
      triggeredBy: "ui-open",
      runner: "collection-routes-sites-open",
      scheduleMode: "on-open",
      message: "Živý read-only snapshot hlídače po otevření Stanovišť."
    });
    return json({
      watchdog,
      snapshot: watchdog.snapshot || null,
      latest: false,
      apiStatus: watchdog.apiStatus || "ready"
    });
  } catch (error) {
    return watchdogError(error);
  }
}
