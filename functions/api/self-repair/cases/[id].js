import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  SelfRepairStoreError,
  getSelfRepairCase,
  selfRepairApiStatus,
  updateSelfRepairCase
} from "../../../_lib/self-repair-store.js";

function caseId(request, params) {
  return params?.id || new URL(request.url).pathname.split("/").at(-1) || "";
}

function selfRepairError(error, operation) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting", operation }, error.status);
  }

  console.error("self_repair.case_failed", { operation, message: error?.message });
  return json({ error: "Případ Samooprav se teď nepodařilo načíst nebo uložit.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { response } = await requireUserPermission(env, request, "self-repair", "view");
  if (response) return response;

  try {
    const detail = await getSelfRepairCase(env, caseId(request, params));
    return json({ ...detail, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    return selfRepairError(error, "GET /api/self-repair/cases/:id");
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "self-repair", "manage");
  if (response) return response;

  try {
    const updatedCase = await updateSelfRepairCase(
      env,
      user,
      caseId(request, params),
      await readJson(request)
    );
    return json({
      case: updatedCase,
      apiStatus: selfRepairApiStatus(env),
      automationStarted: false,
      notificationSent: false
    });
  } catch (error) {
    return selfRepairError(error, "PATCH /api/self-repair/cases/:id");
  }
}
