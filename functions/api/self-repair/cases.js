import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  SelfRepairStoreError,
  createUserReportedSelfRepairCase,
  listSelfRepairCases,
  selfRepairApiStatus
} from "../../_lib/self-repair-store.js";

function selfRepairError(error, operation = "GET /api/self-repair/cases") {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting", operation }, error.status);
  }

  console.error("self_repair.cases_failed", { operation, message: error?.message });
  return json({
    error: "Případy Samooprav se teď nepodařilo načíst nebo uložit.",
    apiStatus: "waiting",
    operation
  }, 500);
}

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "self-repair", "view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const result = await listSelfRepairCases(env, {
      status: url.searchParams.get("status"),
      riskLevel: url.searchParams.get("risk"),
      moduleKey: url.searchParams.get("module"),
      search: url.searchParams.get("search"),
      limit: url.searchParams.get("limit")
    });
    return json({ ...result, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    return selfRepairError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "create");
  if (response) return response;

  try {
    const result = await createUserReportedSelfRepairCase(env, user, await readJson(request));
    return json({
      ...result,
      apiStatus: selfRepairApiStatus(env),
      automationStarted: false,
      notificationSent: false
    }, 201);
  } catch (error) {
    return selfRepairError(error, "POST /api/self-repair/cases");
  }
}
