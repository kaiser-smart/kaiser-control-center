import { json, requireUserPermission } from "../../_lib/auth.js";
import { getCommunicationInfrastructureStatus } from "../../_lib/communication-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "settings", "view");
  if (response) return response;

  const status = await getCommunicationInfrastructureStatus(env);
  return json(status, status.error ? 503 : 200);
}
