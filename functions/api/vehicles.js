import { json, requireUserPermission } from "../_lib/auth.js";
import { loadFleetVehiclesPayload } from "../_lib/tcars-client.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "fleet", "view");

  if (response) {
    return response;
  }

  return json(await loadFleetVehiclesPayload(env));
}
