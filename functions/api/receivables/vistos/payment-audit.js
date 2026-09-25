import { json, requireUserPermission } from "../../../_lib/auth.js";
import { auditVistosPaymentData } from "../../../_lib/receivables-vistos-payment-audit.js";

export async function onRequestGet({request, env}) {
  const {response} = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const result = await auditVistosPaymentData(env, {section:params.get("section"),entity:params.get("entity")});
  if (params.get("format") === "html") {
    const content = JSON.stringify(result, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return new Response(`<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Audit plateb Vistos</title><body><h1>Audit plateb Vistos</h1><p>Diagnostika pouze pro čtení. Faktury ani platby se nemění.</p><pre>${content}</pre></body></html>`, {
      status: result.status === "INVALID_REQUEST" ? 400 : 200,
      headers: {"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options":"nosniff"}
    });
  }
  return json(result, result.status === "INVALID_REQUEST" ? 400 : 200, {"Cache-Control":"no-store"});
}
