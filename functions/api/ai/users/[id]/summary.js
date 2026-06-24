import { getUsers, json, requireUserPermission } from "../../../../_lib/auth.js";
import { recordAiAction } from "../../../../_lib/ai-action-log-store.js";
import { sanitizeUserForAi } from "../../../../_lib/ai-people-summary.js";

function routeUserId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function sameId(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "users", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const id = routeUserId(request, params);

  try {
    const users = await getUsers(env);
    const targetUser = users.find((item) => sameId(item.id, id));

    if (!targetUser) {
      return json({ error: "Uživatel nebyl nalezen.", code: "ai_user_not_found" }, 404);
    }

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_user_summary",
      input: { userId: targetUser.id },
      result: { found: true },
      status: "ok"
    });

    return json({
      user: sanitizeUserForAi(targetUser, { includePermissions: true }),
      apiStatus: "ready"
    });
  } catch (error) {
    console.error("ai.users.summary_failed", { message: error.message });
    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_user_summary",
      input: { userId: id },
      result: { error: error.message },
      status: "error"
    });
    return json({ error: "Souhrn uživatele se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
  }
}
