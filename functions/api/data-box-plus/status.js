import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusStoreErrorResponse, getDataBoxPlusStatus } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  try {
    return json(await getDataBoxPlusStatus(env));
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
