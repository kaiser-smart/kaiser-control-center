import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  CollectionRoutesStoreError,
  createCollectionRoutesVistosSvozKaiserWatchdog
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
  const { response } = await requireUserPermission(env, request, "collection-routes", "view");
  if (response) {
    return response;
  }

  try {
    const watchdog = await createCollectionRoutesVistosSvozKaiserWatchdog(env);
    return json({ watchdog, apiStatus: watchdog.apiStatus || "ready" });
  } catch (error) {
    return watchdogError(error);
  }
}
