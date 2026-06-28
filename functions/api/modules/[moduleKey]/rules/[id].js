import { json, readJson, requireUserPermission } from "../../../../_lib/auth.js";
import {
  ModuleRulesStoreError,
  getModuleRule,
  normalizeModuleRuleModuleKey,
  updateModuleRule
} from "../../../../_lib/module-rules-store.js";

function routeParams(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return {
    moduleKey: normalizeModuleRuleModuleKey(params?.moduleKey || parts.at(-3)),
    id: decodeURIComponent(String(params?.id || parts.at(-1) || "")).trim()
  };
}

function moduleRulesError(error) {
  if (error instanceof ModuleRulesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("module_rules.detail_api_failed", { message: error.message });
  return json({ error: "Pravidlo nebo automatizace se teď nepodařilo načíst nebo uložit.", apiStatus: "waiting" }, 500);
}

function moduleRulesReadOnlyPilotResponse(route) {
  if (route.moduleKey !== "collection-routes") {
    return null;
  }

  return json({
    error: "Trasy svozu jsou ve Fázi 1A pouze read-only pilot. Pravidla ani automatizace se teď nesmí měnit.",
    apiStatus: "ready"
  }, 403);
}

export async function onRequestGet({ request, env, params }) {
  let route = null;
  try {
    route = routeParams(request, params);
  } catch (error) {
    return moduleRulesError(error);
  }

  const { response } = await requireUserPermission(env, request, route.moduleKey, "view");
  if (response) {
    return response;
  }

  try {
    const rule = await getModuleRule(env, route.moduleKey, route.id);
    return json({ rule, apiStatus: "ready" });
  } catch (error) {
    return moduleRulesError(error);
  }
}

export async function onRequestPatch({ request, env, params }) {
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
    const rule = await updateModuleRule(env, route.moduleKey, route.id, await readJson(request), user);
    return json({ rule, apiStatus: "ready" });
  } catch (error) {
    return moduleRulesError(error);
  }
}
