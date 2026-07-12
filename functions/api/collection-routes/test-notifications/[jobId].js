import { json, requireUserPermission } from "../../../_lib/auth.js";
import { getCollectionRoutesTestNotificationJob } from "../../../_lib/collection-routes-test-notifications.js";

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status < 500 ? error.message : "Stav testovacího odesílání se teď nepodařilo načíst.";
  if (status >= 500) console.error("collection_routes_test_notifications.detail_failed", { message: error?.message });
  return json({ error: message, code: error?.code || "collection_routes_test_notification_detail_failed", apiStatus: "waiting" }, status);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    return json(await getCollectionRoutesTestNotificationJob(env, user, params?.jobId));
  } catch (error) {
    return errorResponse(error);
  }
}
