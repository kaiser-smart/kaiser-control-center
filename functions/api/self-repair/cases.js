import { json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  SelfRepairStoreError,
  SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES,
  createUserReportedSelfRepairCase,
  listSelfRepairCases,
  selfRepairApiStatus
} from "../../_lib/self-repair-store.js";
import { canCreateCentralModuleFeedback } from "../../_lib/module-feedback-store.js";

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

async function selfRepairReportInput(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return { input: await readJson(request), attachment: null };
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES + (128 * 1024)) {
    throw new SelfRepairStoreError(
      "Příloha může mít nejvýše 10 MB.",
      413,
      "self_repair_attachment_too_large"
    );
  }

  const form = await request.formData();
  const input = {};
  for (const key of [
    "caseType",
    "moduleId",
    "moduleKey",
    "title",
    "description",
    "actualBehavior",
    "expectedBehavior",
    "reproductionSteps",
    "priority",
    "sourceRoute",
    "buildVersion",
    "buildCommit",
    "browserInfo"
  ]) {
    const value = form.get(key);
    if (typeof value === "string") input[key] = value;
  }
  const attachment = form.get("attachment");
  return {
    input,
    attachment: attachment && typeof attachment.arrayBuffer === "function" && (attachment.name || attachment.size)
      ? attachment
      : null
  };
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
  if (!canCreateCentralModuleFeedback(user)) {
    return json({ error: "Nemáte oprávnění vložit managerskou připomínku." }, 403);
  }

  try {
    const { input, attachment } = await selfRepairReportInput(request);
    const result = await createUserReportedSelfRepairCase(env, user, input, { attachment });
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
