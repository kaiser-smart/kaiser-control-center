import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import {
  clampAiLimit,
  cleanAiString,
  sanitizeUserForAi,
  userMatchesAiQuery
} from "../../../_lib/ai-people-summary.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "users", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const query = cleanAiString(url.searchParams.get("q") || url.searchParams.get("query"));
  const limit = clampAiLimit(url.searchParams.get("limit"), 5, 8);

  if (!query) {
    return json({ error: "Zadejte jméno nebo část jména uživatele.", code: "ai_user_query_required" }, 400);
  }

  try {
    const users = (await getUsers(env))
      .filter((item) => userMatchesAiQuery(item, query))
      .slice(0, limit)
      .map((item) => sanitizeUserForAi(item));

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_user_search",
      input: { queryLength: query.length, limit },
      result: { count: users.length },
      status: "ok"
    });

    return json({
      query,
      users,
      count: users.length,
      needsDisambiguation: users.length > 1,
      apiStatus: "ready"
    });
  } catch (error) {
    console.error("ai.users.search_failed", { message: error.message });
    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_user_search",
      input: { queryLength: query.length, limit },
      result: { error: error.message },
      status: "error"
    });
    return json({ error: "Uživatele se teď nepodařilo vyhledat.", apiStatus: "waiting" }, 500);
  }
}
