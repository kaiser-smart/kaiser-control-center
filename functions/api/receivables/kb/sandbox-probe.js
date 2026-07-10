import { json } from "../../../_lib/http.js";
import { receivablesKbApiSandboxProbe } from "../../../_lib/receivables-kb-api-onboarding.js";
import { requireUserPermission } from "../../../_lib/session.js";

export async function onRequestGet({ env, request }) {
  await requireUserPermission(request, env, "receivables", "view");
  return json(receivablesKbApiSandboxProbe(env));
}
