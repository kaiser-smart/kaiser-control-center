import { json, requireUserPermission } from "../../../_lib/auth.js";
import { auditVistosPaymentData } from "../../../_lib/receivables-vistos-payment-audit.js";

export async function onRequestGet({request, env}) {
  const {response} = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const result = await auditVistosPaymentData(env, {section:params.get("section"),entity:params.get("entity")});
  return json(result, result.status === "INVALID_REQUEST" ? 400 : 200, {"Cache-Control":"no-store"});
}
