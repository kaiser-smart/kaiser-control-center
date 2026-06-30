import { json, requireUserPermission } from "../_lib/auth.js";
import { loadFleetVehiclesWithAssignments } from "../_lib/fleet-vehicles-store.js";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "fleet", "view");

  if (response) {
    return response;
  }

  return json(await loadFleetVehiclesWithAssignments(env, user));
}
