import { json, requireUserPermission } from "../../../../_lib/auth.js";
import {
  SelfRepairStoreError,
  listSelfRepairCaseAudit,
  selfRepairApiStatus
} from "../../../../_lib/self-repair-store.js";

function caseId(request, params) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return params?.id || parts.at(-2) || "";
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "self-repair", "view");
  if (response) return response;

  try {
    const audit = await listSelfRepairCaseAudit(env, caseId(request, params));
    return json({ audit, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    if (error instanceof SelfRepairStoreError) {
      return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
    }
    console.error("self_repair.audit_failed", { message: error?.message });
    return json({ error: "Audit případu se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
  }
}
