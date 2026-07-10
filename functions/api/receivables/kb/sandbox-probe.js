import { json, requireUserPermission } from "../../../_lib/auth.js";
import { receivablesKbApiSandboxProbe } from "../../../_lib/receivables-kb-api-onboarding.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  return json(receivablesKbApiSandboxProbe(env));
}
