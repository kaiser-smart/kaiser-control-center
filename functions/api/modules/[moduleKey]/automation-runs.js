import { json, requireUserPermission } from "../../../_lib/auth.js";
import {
  ModuleRulesStoreError,
  listModuleAutomationRuns,
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

  console.error("module_automation_runs.api_failed", { message: error.message });
  return json({ error: "Běhy automatizací se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
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
    const runs = await listModuleAutomationRuns(env, key);
    return json({ runs, apiStatus: "ready" });
  } catch (error) {
    return moduleRulesError(error);
  }
}
