import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  createCollectionRoutesTestNotificationJob,
  getLatestCollectionRoutesTestNotificationJob
} from "../../_lib/collection-routes-test-notifications.js";

function errorResponse(error, operation = "create") {
  const status = Number(error?.status) || 500;
  const message = status < 500
    ? error.message
    : operation === "load"
      ? "Poslední testovací odesílací úlohu se teď nepodařilo načíst."
      : "Testovací odesílací úlohu se teď nepodařilo vytvořit.";
  if (status >= 500) console.error(`collection_routes_test_notifications.${operation}_failed`, { message: error?.message });
  return json({
    error: message,
    code: error?.code || `collection_routes_test_notification_${operation}_failed`,
    apiStatus: "waiting"
  }, status);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "collection-routes", "manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    return json(await getLatestCollectionRoutesTestNotificationJob(env, user, url.searchParams.get("runId")));
  } catch (error) {
    return errorResponse(error, "load");
  }
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
