import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  ModuleRulesStoreError,
  createModuleRule,
  listModuleRules,
  moduleRulesApiStatus,
  normalizeModuleRuleModuleKey
} from "../../../_lib/module-rules-store.js";

function moduleKey(request, params) {
  const fallback = new URL(request.url).pathname.split("/").at(-2);
  return normalizeModuleRuleModuleKey(params?.moduleKey || fallback);
}

function moduleRulesError(error) {
  if (error instanceof ModuleRulesStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("module_rules.api_failed", { message: error.message });
  return json({ error: "Pravidla a automatizace se teď nepodařilo načíst nebo uložit.", apiStatus: "waiting" }, 500);
}

function moduleRulesReadOnlyPilotResponse(key) {
  if (key !== "collection-routes") {
    return null;
  }

  return json({
    error: "Trasy svozu jsou ve Fázi 1A pouze read-only pilot. Pravidla ani automatizace se teď nesmí měnit.",
    apiStatus: "ready"
  }, 403);
}

export async function onRequestGet({ request, env, params }) {
  let key = "";
  try {
    key = moduleKey(request, params);
  } catch (error) {
    return moduleRulesError(error);
  }

  const { response } = await requireUserPermission(env, request, key, "view");
  if (response) {
    return response;
  }

  try {
    const rules = await listModuleRules(env, key);
    return json({ rules, apiStatus: moduleRulesApiStatus(env) });
  } catch (error) {
    return moduleRulesError(error);
  }
}

export async function onRequestPost({ request, env, params }) {
  let key = "";
  try {
    key = moduleKey(request, params);
  } catch (error) {
    return moduleRulesError(error);
  }

  const { user, response } = await requireUserPermission(env, request, key, "manage");
  if (response) {
    return response;
  }

  const readOnlyPilotResponse = moduleRulesReadOnlyPilotResponse(key);
  if (readOnlyPilotResponse) {
    return readOnlyPilotResponse;
  }

  try {
    const rule = await createModuleRule(env, key, await readJson(request), user);
    return json({ rule, apiStatus: "ready" }, 201);
  } catch (error) {
    return moduleRulesError(error);
  }
}
