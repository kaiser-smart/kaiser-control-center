import { currentUser, json } from "../../../_lib/auth.js";
import { driverReportContextForUser } from "../../../_lib/driver-report-context.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  const url = new URL(request.url);
  const { status, payload } = await driverReportContextForUser(env, user, {
    transcriptIntent: cleanString(url.searchParams.get("transcriptIntent") || url.searchParams.get("intent")),
    sessionId: cleanString(url.searchParams.get("sessionId") || url.searchParams.get("conversationId")),
    currentModule: cleanString(url.searchParams.get("currentModule"))
  });

  return json(payload, status);
}
