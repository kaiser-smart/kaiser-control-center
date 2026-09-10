import { json, requireUserPermission } from "../../../_lib/auth.js";
import { auditVistosContactCleanupV4, auditVistosContacts, auditVistosContactsFull, runLeadHubDataOnlyAuditAction } from "../../../_lib/vistos-contacts-audit.js";

async function authorizedRequest(env, request) {
  return requireUserPermission(env, request, "receivables", "manage");
}

export async function onRequestGet({ request, env }) {
  const { response } = await authorizedRequest(env, request);
  if (response) return response;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("version") === "4") {
      return json(await auditVistosContactCleanupV4(env, {
        scope: url.searchParams.get("scope") || "contact",
        domainStart: url.searchParams.get("domainStart") || "0",
        domainLimit: url.searchParams.get("domainLimit") || "50",
        detailStart: url.searchParams.get("detailStart") || "0",
        detailLimit: url.searchParams.get("detailLimit") || "100",
        startPage: url.searchParams.get("startPage") || "0",
        pageCount: url.searchParams.get("pageCount") || "5"
      }));
    }
    const full = url.searchParams.get("full") === "1";
    return json(await (full
      ? auditVistosContactsFull(env, { scope: url.searchParams.get("scope") || "all" })
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

export async function onRequestPost({ request, env }) {
  const { response } = await authorizedRequest(env, request);
  if (response) return response;
  try {
    const body = await request.json();
    const result = await runLeadHubDataOnlyAuditAction(env, String(body?.action || ""), body || {});
    return json({
      version: 4,
      scope: "leadHubDataOnly",
      readOnlySources: true,
      protectedAuditWrite: true,
      writesVistos: false,
      writesLeadHub: false,
      ...result
    });
  } catch (error) {
    return json({
      status: "error", source: "vistos", readOnly: true, writesVistos: false, writesLeadHub: false,
      error: String(error?.message || "Kontaktní DATA_ONLY audit Vistos se nepodařil."),
      code: String(error?.code || "vistos_data_only_audit_failed")
    }, Number(error?.status) || 500);
  }
}
