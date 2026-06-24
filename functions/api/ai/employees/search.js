import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import { recordAiAction } from "../../../_lib/ai-action-log-store.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  listEmployeeCards
} from "../../../_lib/employees-store.js";
import {
  clampAiLimit,
  cleanAiString,
  employeeMatchesAiQuery,
  sanitizeEmployeeForAi
} from "../../../_lib/ai-people-summary.js";

function employeeSearchError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("ai.employees.search_failed", { message: error.message });
  return json({ error: "Zaměstnance se teď nepodařilo vyhledat.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const query = cleanAiString(url.searchParams.get("q") || url.searchParams.get("query"));
  const limit = clampAiLimit(url.searchParams.get("limit"), 5, 8);

  if (!query) {
    return json({ error: "Zadejte jméno nebo část jména zaměstnance.", code: "ai_employee_query_required" }, 400);
  }

  try {
    const users = await getUsers(env);
    const employees = (await listEmployeeCards(env, users, user))
      .filter((employee) => employeeMatchesAiQuery(employee, query))
      .slice(0, limit)
      .map(sanitizeEmployeeForAi);

    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_employee_search",
      input: { queryLength: query.length, limit },
      result: { count: employees.length },
      status: "ok"
    });

    return json({
      query,
      employees,
      count: employees.length,
      needsDisambiguation: employees.length > 1,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    await recordAiAction(env, user, {
      assistantId: url.searchParams.get("assistant") || "",
      assistantName: url.searchParams.get("assistantName") || "",
      actionType: "read",
      toolName: "ai_employee_search",
      input: { queryLength: query.length, limit },
      result: { error: error.message },
      status: "error"
    });
    return employeeSearchError(error);
  }
}
