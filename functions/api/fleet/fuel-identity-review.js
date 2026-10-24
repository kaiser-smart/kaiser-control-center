import { json, requireUserPermission } from "../../_lib/auth.js";
import { loadFuelIdentityReview } from "../../_lib/fleet-fuel-identity-review.js";
export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const offsetText = params.get("offset") || "0", limitText = params.get("limit") || "100";
  const offset = Number(offsetText), limit = Number(limitText), cohort = params.get("cohort") || "all";
  if (!/^\d+$/.test(offsetText) || !/^\d+$/.test(limitText) || !Number.isSafeInteger(offset) || offset < 0 || offset > 20000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !["all", "original"].includes(cohort)) return json({ error: "Neplatné stránkování kontroly identit.", code: "invalid_identity_review_query" }, 400);
  try { return json(await loadFuelIdentityReview(env, { offset, limit, cohort })); }
  catch (error) { return json({ apiStatus: "waiting", completeScan: false, error: "Kontrolu identit se nepodařilo úplně načíst.", code: error.code || "identity_review_failed" }, error.status || 503); }
}
