import { json, requireUserPermission } from "../../_lib/auth.js";
import {
  NotificationsStoreError,
  canViewCentralNotifications,
  notificationSummary
} from "../../_lib/notifications-store.js";

function notificationsSummaryError(error) {
  if (error instanceof NotificationsStoreError) {
    return json({
      error: error.message,
      apiStatus: "waiting",
      missingEndpoint: "GET /api/notifications/summary"
    }, error.status);
  }

  console.error("notifications.summary_failed", { message: error.message });
  return json({ error: "Souhrn notifikací se nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "reports", "view");

  if (response) {
    return response;
  }

  if (!canViewCentralNotifications(user)) {
    return json({ error: "Nemáte oprávnění zobrazit notifikace." }, 403);
  }

  try {
    const url = new URL(request.url);
    const result = await notificationSummary(env, url.searchParams);
    return json({ ...result, apiStatus: "ready" });
  } catch (error) {
    return notificationsSummaryError(error);
  }
}
