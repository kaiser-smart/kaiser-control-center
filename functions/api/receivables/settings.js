import { json, requireUserPermission } from "../../_lib/auth.js";
import { getReceivablesSettings } from "../../_lib/receivables-store.js";
import { receivablesErrorResponse } from "./_error.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  try {
    return json(await getReceivablesSettings(env));
  } catch (error) {
    return receivablesErrorResponse(error, "GET /api/receivables/settings");
  }
}
