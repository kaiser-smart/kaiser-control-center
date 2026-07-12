import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import { processCollectionRoutesTestNotificationJob } from "../../../../_lib/collection-routes-test-notifications.js";

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status < 500 ? error.message : "Skutečné testovací zprávy se teď nepodařilo odeslat.";
  if (status >= 500) console.error("collection_routes_test_notifications.process_failed", { message: error?.message });
  return json({ error: message, code: error?.code || "collection_routes_test_notification_process_failed", apiStatus: "waiting" }, status);
}

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const body = await readJson(request);
    const result = await processCollectionRoutesTestNotificationJob(env, user, params?.jobId, {
      limit: body.limit || 1
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
