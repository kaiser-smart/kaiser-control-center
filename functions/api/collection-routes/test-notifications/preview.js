import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import { previewCollectionRoutesTestNotifications } from "../../../_lib/collection-routes-test-notifications.js";

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status < 500
    ? error.message
    : "Náhled skutečných testovacích zpráv se teď nepodařilo připravit.";
  if (status >= 500) console.error("collection_routes_test_notifications.preview_failed", { message: error?.message });
  return json({ error: message, code: error?.code || "collection_routes_test_notification_preview_failed", apiStatus: "waiting" }, status);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const preview = await previewCollectionRoutesTestNotifications(env, user, await readJson(request));
    return json({ preview, apiStatus: "ready" });
  } catch (error) {
    return errorResponse(error);
  }
}
