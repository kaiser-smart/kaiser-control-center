import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import { retryCollectionRoutesTestNotificationFailures } from "../../../../_lib/collection-routes-test-notifications.js";

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status < 500
    ? error.message
    : "Neúspěšné testovací zprávy se teď nepodařilo připravit k opakování.";
  if (status >= 500) console.error("collection_routes_test_notifications.retry_failed", { message: error?.message });
  return json({ error: message, code: error?.code || "collection_routes_test_notification_retry_failed", apiStatus: "waiting" }, status);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json(await retryCollectionRoutesTestNotificationFailures(
      env,
      user,
      params?.jobId,
      await readJson(request)
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
