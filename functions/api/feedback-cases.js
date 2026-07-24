import { json, requireUserPermission } from "../_lib/auth.js";
import {
  SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES,
  SelfRepairStoreError,
  createUserReportedSelfRepairCase,
  selfRepairApiStatus
} from "../_lib/self-repair-store.js";
import { getFeedbackCase, listFeedbackCases } from "../_lib/feedback-case-store.js";

function apiError(error, operation) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting", operation }, error.status);
  }
  console.error("feedback_cases.failed", { operation, message: error?.message });
  return json({ error: "Hlášení se teď nepodařilo načíst nebo uložit.", apiStatus: "waiting", operation }, 500);
}

async function reportInput(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    throw new SelfRepairStoreError(
      "Hlášení musí být odesláno jako formulář.",
      415,
      "feedback_case_content_type_invalid"
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > SELF_REPAIR_ATTACHMENT_MAX_SIZE_BYTES + (256 * 1024)) {
    throw new SelfRepairStoreError("Příloha může mít nejvýše 10 MB.", 413, "feedback_case_attachment_too_large");
  }
  const form = await request.formData();
  const input = {};
  for (const key of [
    "caseType",
    "moduleKey",
    "title",
    "description",
    "expectedBehavior",
    "sourceRoute",
    "buildVersion",
    "buildCommit",
    "browserInfo",
    "screenInfo",
    "technicalContext",
    "clientRequestId"
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
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const result = await listFeedbackCases(env, user, {
      own: url.searchParams.get("own"),
      status: url.searchParams.get("status"),
      priority: url.searchParams.get("priority"),
      moduleKey: url.searchParams.get("module"),
      author: url.searchParams.get("author"),
      assignee: url.searchParams.get("assignee"),
      search: url.searchParams.get("search"),
      limit: url.searchParams.get("limit")
    });
    return json({ ...result, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    return apiError(error, "GET /api/feedback-cases");
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "create");
  if (response) return response;
  try {
    const { input, attachment } = await reportInput(request);
    const created = await createUserReportedSelfRepairCase(env, user, input, { attachment });
    const detail = await getFeedbackCase(env, user, created.case.id);
    return json({
      ...detail,
      apiStatus: selfRepairApiStatus(env),
      automationStarted: false,
      deploymentStarted: false,
      notificationSent: false
    }, 201);
  } catch (error) {
    return apiError(error, "POST /api/feedback-cases");
  }
}
