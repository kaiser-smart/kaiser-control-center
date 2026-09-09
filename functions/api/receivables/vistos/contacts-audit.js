import { json, requireUserPermission } from "../../../_lib/auth.js";
import { auditVistosContacts, auditVistosContactsFull } from "../../../_lib/vistos-contacts-audit.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  const url = new URL(request.url);
  try {
    const full = url.searchParams.get("full") === "1";
    return json(await (full
      ? auditVistosContactsFull(env)
      : auditVistosContacts(env, {
          sampleSize: Math.max(1, Math.min(Number(url.searchParams.get("sampleSize")) || 25, 100)),
          knownContactId: url.searchParams.get("knownContactId") || ""
        })));
  } catch (error) {
    return json({
      status: "error", source: "vistos", readOnly: true, writesVistos: false, writesD1: false,
      error: String(error?.message || "Kontaktní audit Vistos se nepodařil."),
      code: String(error?.code || "vistos_contacts_audit_failed"),
      upstreamStatus: Number(error?.upstreamStatus) || 0
    }, Number(error?.status) || 500);
  }
}
