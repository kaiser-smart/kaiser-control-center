import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxStoreErrorResponse, getDataBoxStatus } from "../../_lib/data-box-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box", "view");
  if (response) return response;

  try {
    return json(await getDataBoxStatus(env));
  } catch (error) {
    const result = dataBoxStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
