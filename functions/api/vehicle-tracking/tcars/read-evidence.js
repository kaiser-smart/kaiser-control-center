import { json, requireUserPermission } from "../../../_lib/auth.js";
import { auditTcarsReadEvidence } from "../../../_lib/tcars-client.js";
export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  return json(await auditTcarsReadEvidence(env));
}
