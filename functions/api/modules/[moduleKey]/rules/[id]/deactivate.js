import { json, requireUserPermission } from "../../../../../_lib/auth.js";
import {
  ModuleRulesStoreError,
  normalizeModuleRuleModuleKey,
  setModuleRuleStatus
} from "../../../../../_lib/module-rules-store.js";

function routeParams(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return {
    moduleKey: normalizeModuleRuleModuleKey(params?.moduleKey || parts.at(-4)),
    id: decodeURIComponent(String(params?.id || parts.at(-2) || "")).trim()
  };
}

function moduleRulesError(error) {
  if (error instanceof ModuleRulesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("module_rules.deactivate_failed", { message: error.message });
  return json({ error: "Pravidlo nebo automatizace se teď nepodařilo deaktivovat.", apiStatus: "waiting" }, 500);
}

function moduleRulesReadOnlyPilotResponse(route) {
  if (route.moduleKey !== "collection-routes") {
    return null;
  }

  return json({
    error: "Trasy svozu jsou ve Fázi 1A pouze read-only pilot. Pravidla ani automatizace se teď nesmí deaktivovat.",
    apiStatus: "ready"
  }, 403);
}

export async function onRequestPost({ request, env, params }) {
  let route = null;
  try {
    route = routeParams(request, params);
  } catch (error) {
    return moduleRulesError(error);
  }

  const { user, response } = await requireUserPermission(env, request, route.moduleKey, "manage");
  if (response) {
    return response;
  }

  const readOnlyPilotResponse = moduleRulesReadOnlyPilotResponse(route);
  if (readOnlyPilotResponse) {
    return readOnlyPilotResponse;
  }

  try {
    const rule = await setModuleRuleStatus(env, route.moduleKey, route.id, "inactive", user);
    return json({ rule, apiStatus: "ready" });
  } catch (error) {
    return moduleRulesError(error);
  }
}
