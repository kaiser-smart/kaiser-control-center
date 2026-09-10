import { json, requireUserPermission } from "../../../_lib/auth.js";
import { readVistosLeadHubProfileSyncStatus } from "../../../_lib/vistos-leadhub-profile-sync.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "manage");
  if (response) return response;
  try {
    return json(await readVistosLeadHubProfileSyncStatus(env));
  } catch (error) {
    return json({ syncStatus: "BLOCKED", error: String(error?.message || "Stav synchronizace nelze načíst.") }, Number(error?.status) || 500);
  }
}
