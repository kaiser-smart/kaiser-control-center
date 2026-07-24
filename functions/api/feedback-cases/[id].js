import { getUsers, json, readJson, requireUserPermission } from "../../_lib/auth.js";
import {
  getFeedbackCase,
  recordFeedbackEmailResult,
  updateFeedbackCase
} from "../../_lib/feedback-case-store.js";
import { SelfRepairStoreError, selfRepairApiStatus } from "../../_lib/self-repair-store.js";
import { sendFeedbackReadyForVerificationNotification } from "../../_lib/notification-service.js";

function routeCaseId(request, params) {
  return params?.id || decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-1) || "");
}

function apiError(error, operation) {
  if (error instanceof SelfRepairStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting", operation }, error.status);
  }
  console.error("feedback_case.failed", { operation, message: error?.message });
  return json({ error: "Detail hlášení se teď nepodařilo načíst nebo uložit.", apiStatus: "waiting", operation }, 500);
}

function reporterContact(users, item) {
  const reporterId = String(item?.reporterUserId || "").trim().toLowerCase();
  return users.find((candidate) => {
    const id = String(candidate?.id || "").trim().toLowerCase();
    const email = String(candidate?.email || "").trim().toLowerCase();
    return reporterId && (reporterId === id || reporterId === email);
  }) || null;
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "feedback", "view");
  if (response) return response;
  try {
    const detail = await getFeedbackCase(env, user, routeCaseId(request, params));
    return json({ ...detail, apiStatus: selfRepairApiStatus(env) });
  } catch (error) {
    return apiError(error, "GET /api/feedback-cases/:id");
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "self-repair", "manage");
  if (response) return response;
  const id = routeCaseId(request, params);
  try {
    const update = await updateFeedbackCase(env, user, id, await readJson(request));
    let emailResult = null;
    if (
      update.workflowStatusChanged &&
      update.case.workflowStatus === "ready_for_verification"
    ) {
      try {
        const users = await getUsers(env);
        const recipient = reporterContact(users, update.case);
        emailResult = await sendFeedbackReadyForVerificationNotification(env, update.case, {
          recipientEmail: recipient?.email || (
            String(update.case.reporterUserId || "").includes("@")
              ? update.case.reporterUserId
              : ""
          ),
          recipientName: recipient?.name || update.case.reporterUserName,
          resolutionMessage: update.case.publicMessage
        });
      } catch (error) {
        console.error("feedback_case.verification_email_failed", { caseId: id, message: error?.message });
        emailResult = {
          status: "failed",
          provider: "SendGrid",
          errorMessage: "E-mail se nepodařilo připravit nebo odeslat."
        };
      }
      try {
        await recordFeedbackEmailResult(env, user, id, emailResult);
      } catch (error) {
        console.error("feedback_case.verification_email_audit_failed", { caseId: id, message: error?.message });
      }
    }
    const detail = await getFeedbackCase(env, user, id);
    return json({
      ...detail,
      apiStatus: selfRepairApiStatus(env),
      email: emailResult,
      emailSent: emailResult?.status === "sent",
      automationStarted: false,
      deploymentStarted: false
    });
  } catch (error) {
    return apiError(error, "PATCH /api/feedback-cases/:id");
  }
}
