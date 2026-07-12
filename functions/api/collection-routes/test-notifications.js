import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { createCollectionRoutesTestNotificationJob } from "../../_lib/collection-routes-test-notifications.js";

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status < 500
    ? error.message
    : "Testovací odesílací úlohu se teď nepodařilo vytvořit.";
  if (status >= 500) console.error("collection_routes_test_notifications.create_failed", { message: error?.message });
  return json({ error: message, code: error?.code || "collection_routes_test_notification_create_failed", apiStatus: "waiting" }, status);
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const result = await createCollectionRoutesTestNotificationJob(env, user, await readJson(request));
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
