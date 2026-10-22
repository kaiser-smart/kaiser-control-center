import { json, requireUserPermission } from "../../_lib/auth.js";
import { auditFleetVistosJobEvidence } from "../../_lib/fleet-vistos-job-evidence.js";
export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;
  const url = new URL(request.url);
  return json(await auditFleetVistosJobEvidence(env, { sample: url.searchParams.get("sample") === "1", start: url.searchParams.get("start") || "0" }));
}
