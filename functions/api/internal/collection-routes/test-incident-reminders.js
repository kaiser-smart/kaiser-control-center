import { json, readJson } from "../../../_lib/auth.js";
import {
  CollectionRoutesTestIncidentWorkflowError,
  processDueCollectionRouteIncidentTestReminders
} from "../../../_lib/collection-routes-test-incident-workflow.js";

function requestToken(request) {
  const authorization = String(request.headers.get("Authorization") || "").trim();
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  return String(request.headers.get("X-KSO-Runner-Token") || "").trim();
}

function safeTokenEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (!a.length || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export async function onRequestPost({ request, env }) {
  if (!safeTokenEqual(requestToken(request), env.COLLECTION_ROUTES_RUNNER_TOKEN)) {
    return json({ error: "Neautorizovaný cloudový runner." }, 401);
  }
  try {
    const input = await readJson(request);
    return json({
      apiStatus: "ready",
      ...(await processDueCollectionRouteIncidentTestReminders(env, input))
    });
  } catch (error) {
    if (error instanceof CollectionRoutesTestIncidentWorkflowError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("collection_routes_test_incident_reminder.api_failed", { message: error?.message });
    return json({ error: "Cloudové TEST připomínky se teď nepodařilo zpracovat." }, 500);
  }
}

export const __test = { requestToken, safeTokenEqual };
