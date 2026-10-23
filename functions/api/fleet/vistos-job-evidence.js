import { json, requireUserPermission } from "../../_lib/auth.js";
import { auditFleetVistosJobEvidence } from "../../_lib/fleet-vistos-job-evidence.js";
export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId") || "";
  const itemId = url.searchParams.get("itemId") || "";
  if ([jobId, itemId].some(value => value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0))) return json({ error: "Neplatné zdrojové ID.", code: "invalid_source_record_id" }, 400);
  return json(await auditFleetVistosJobEvidence(env, { sample: url.searchParams.get("sample") === "1", start: url.searchParams.get("start") || "0", jobId, itemId }));
}
