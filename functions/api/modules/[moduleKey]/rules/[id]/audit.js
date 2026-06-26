import { json, requireUserPermission } from "../../../../../_lib/auth.js";
import {
  ModuleRulesStoreError,
  listModuleRuleAuditLog,
  normalizeModuleRuleModuleKey
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

  console.error("module_rules.audit_failed", { message: error.message });
  return json({ error: "Audit log pravidla se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
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
    const auditLog = await listModuleRuleAuditLog(env, route.moduleKey, route.id);
    return json({ auditLog, apiStatus: "ready" });
  } catch (error) {
    return moduleRulesError(error);
  }
}
