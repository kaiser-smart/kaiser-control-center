import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import {
  AbsenceRequestStoreError,
  listPendingAbsenceRequests
} from "../../../_lib/absence-requests-store.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";

function absenceRequestError(error) {
  if (error instanceof AbsenceRequestStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("ai.absence.pending_failed", { message: error.message });
  return json({ error: "Žádosti ke schválení se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const url = new URL(request.url);
    const requests = await listPendingAbsenceRequests(env, users, user, {
      managerId: url.searchParams.get("managerId") || "",
      limit: Number(url.searchParams.get("limit") || 20)
    });

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_absence_pending",
      input: { limit: Number(url.searchParams.get("limit") || 20) },
      result: { count: requests.length },
      status: "ok"
    });

    return json({ requests, apiStatus: "ready" });
  } catch (error) {
    return absenceRequestError(error);
  }
}

